import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reliabilityDesk } from './reliability.mjs';
import { projectPassports } from './project-passports.mjs';
import { createLabServer } from './server.mjs';
const fixture = (id = 'RE-01', eventId = 'test-1') => ({ projectId: id, eventId, storageConsent: true, contact: { email: ' TEST@example.test ', notes: 'discarded' } });
function setup() { const db = new DatabaseSync(':memory:'); return { db, desk: reliabilityDesk(db) }; }
test('all 27 projects carry source evidence and pass independent shared boundary cases', () => {
    const passports = projectPassports();
    assert.equal(passports.length, 27);
    for (const p of passports) {
        assert.equal(p.handoff.passed, 7);
        assert.equal(p.handoff.total, 7);
        assert.match(p.sourceSnapshot.hash, /^[a-f0-9]{64}$/);
        assert.ok(p.failure && p.acceptance);
        assert.equal(p.production.status, 'not_established');
        const { db, desk } = setup();
        const r = desk.submit(p.id, fixture(p.id));
        assert.equal(r.status, 'pending_review');
        assert.equal(r.externalActions, 0);
        db.close();
    }
});
test('uncertain outcome blocks retry and reconciliation confirms exactly one local effect', () => { const { db, desk } = setup(); const r = desk.submit('RE-01', fixture()); assert.throws(() => desk.execute(r.receiptId, 'success'), /reviewed/); desk.review(r.receiptId, 'A'); const lost = desk.execute(r.receiptId, 'timeout_after'); assert.equal(lost.status, 'uncertain'); assert.equal(lost.localEffects, 1); assert.throws(() => desk.execute(r.receiptId, 'success'), /reconcile/); assert.throws(() => desk.export(r.receiptId), /completion/); const done = desk.reconcile(r.receiptId); assert.equal(done.status, 'completed'); assert.equal(desk.execute(r.receiptId, 'success').localEffects, 1); assert.equal(desk.export(r.receiptId).externalActions, 0); db.close(); });
test('changed replay conflicts, minimized fields never persist, labels cannot overwrite approval', () => { const { db, desk } = setup(); const r = desk.submit('RE-01', fixture()); assert.equal(r.payload.email, 'test@example.test'); assert.ok(!('notes' in r.payload)); assert.equal(desk.submit('RE-01', fixture()).receiptId, r.receiptId); assert.throws(() => desk.submit('RE-01', { ...fixture(), contact: { email: 'changed@example.test' } }), /identity conflict/); desk.review(r.receiptId, 'Original'); assert.throws(() => desk.review(r.receiptId, 'Other'), /Original reviewer/); db.close(); });
test('invalid boundaries do not persist and retries stop after two confirmed failures', () => { const { db, desk } = setup(); for (const event of [{ ...fixture(), storageConsent: 'true' }, { ...fixture(), locationId: 'OTHER' }, { ...fixture(), sensitive: true }])
    assert.equal(desk.submit('RE-01', event).stored, false); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reliability_intents').get().n, 0); const r = desk.submit('RE-01', fixture()); desk.review(r.receiptId, 'A'); assert.equal(desk.execute(r.receiptId, 'timeout_before').status, 'retryable'); const stopped = desk.execute(r.receiptId, 'timeout_before'); assert.equal(stopped.status, 'stopped'); assert.equal(stopped.attempts, 2); assert.equal(stopped.localEffects, 0); assert.throws(() => desk.execute(r.receiptId, 'success')); db.close(); });
test('source changes invalidate review, replay, execution, reconciliation and export', () => { const db = new DatabaseSync(':memory:'); let hash = 'first'; const desk = reliabilityDesk(db, () => ({ hash })); const r = desk.submit('RE-01', fixture()); desk.review(r.receiptId, 'A'); desk.execute(r.receiptId, 'timeout_after'); hash = 'second'; for (const fn of [() => desk.review(r.receiptId, 'A'), () => desk.submit('RE-01', fixture()), () => desk.execute(r.receiptId, 'success'), () => desk.reconcile(r.receiptId), () => desk.export(r.receiptId)])
    assert.throws(fn, /Source changed/); assert.equal(desk.inspect(r.receiptId).status, 'uncertain'); db.close(); });
test('missing effect is not fabricated during reconciliation', () => { const { db, desk } = setup(); const r = desk.submit('RE-01', fixture()); desk.review(r.receiptId, 'A'); desk.execute(r.receiptId, 'timeout_after'); db.prepare('DELETE FROM reliability_effects WHERE intent_id=?').run(r.receiptId); const unresolved = desk.reconcile(r.receiptId); assert.equal(unresolved.status, 'uncertain'); assert.equal(unresolved.localEffects, 0); assert.equal(unresolved.events.at(-1).kind, 'reconciliation_unresolved'); db.close(); });
test('restart preserves uncertainty and duplicate protection', () => { const dir = mkdtempSync(join(tmpdir(), 'portfolio-reliability-')); const file = join(dir, 'desk.sqlite'); try {
    let db = new DatabaseSync(file);
    let desk = reliabilityDesk(db);
    const r = desk.submit('RE-01', fixture());
    desk.review(r.receiptId, 'A');
    desk.execute(r.receiptId, 'timeout_after');
    db.close();
    db = new DatabaseSync(file);
    desk = reliabilityDesk(db);
    assert.equal(desk.submit('RE-01', fixture()).status, 'uncertain');
    assert.equal(desk.reconcile(r.receiptId).localEffects, 1);
    assert.equal(desk.inspect(r.receiptId).attempts, 1);
    db.close();
}
finally {
    rmSync(dir, { recursive: true, force: true });
} });
test('HTTP workshop requires local boundary and exposes all passports', async () => { const db = new DatabaseSync(':memory:'); const server = createLabServer(db); await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port; try {
    assert.equal((await (await fetch(base + '/api/workshop/projects')).json()).projects.length, 27);
    const page = await fetch(base + '/workshop');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal((await fetch(base + '/api/workshop/submit', { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/api/workshop/projects', { headers: { Origin: 'https://other.test' } })).status, 403);
    const result = await fetch(base + '/api/workshop/submit', { method: 'POST', headers: { 'X-Demo-Client': 'local-showcase' }, body: JSON.stringify({ projectId: 'ACC-01', event: fixture('ACC-01') }) });
    assert.equal((await result.json()).status, 'pending_review');
}
finally {
    await new Promise(r => server.close(r));
    db.close();
} });
