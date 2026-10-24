import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { salesforceDesk } from './salesforce-core.mjs';
import { createLabServer } from './server.mjs';
test('nonqualifying records produce no-change decisions without approval or local effects', () => {
    const { db, desk } = setup();
    const batch = desk.start();
    for (const rec of batch.records) {
        const data = { ...rec.data };
        if (rec.object === 'Lead')
            data.Score = 20;
        if (rec.object === 'Opportunity')
            data.DaysWithoutNextStep = 2;
        if (rec.object === 'Case')
            data.Severity = 'Routine';
        db.prepare('UPDATE sf_records SET data=? WHERE run=? AND id=?').run(JSON.stringify(data), batch.runId, rec.id);
        const result = desk.submit(batch.runId, desk.event(batch.runId, rec.id));
        assert.equal(result.status, 'no_change');
        assert.deepEqual(result.patch, {});
        assert.equal(result.localEffects, 0);
        assert.throws(() => desk.review(result.receiptId, 'revops-reviewer'), /cannot be approved/);
    }
    db.close();
});
const setup = () => { const db = new DatabaseSync(':memory:'); return { db, desk: salesforceDesk(db) }; };
const prepare = (desk, scenario = 'normal', object = 'Lead') => { const run = desk.start(scenario), record = run.records.find(r => r.object === object), event = desk.event(run.runId, record.id), receipt = desk.submit(run.runId, event); return { run, record, event, receipt }; };
test('full RevenueOps run changes three authoritative records and recovers the case acknowledgement', () => {
    const { db, desk } = setup();
    const result = desk.fullRun();
    assert.equal(result.passed, true);
    assert.equal(result.results.length, 3);
    for (const r of result.results) {
        assert.equal(r.status, 'completed');
        assert.equal(r.localEffects, 1);
        assert.equal(r.currentRecord.revision, 2);
        assert.equal(r.externalActions, 0);
    }
    const lead = result.records.find(r => r.object === 'Lead').data;
    assert.equal(lead.OwnerId, '005000000000002');
    const opp = result.records.find(r => r.object === 'Opportunity').data;
    assert.equal(opp.StageName, 'Proposal');
    assert.equal(opp.Amount, 48000);
    assert.match(opp.NextStep, /Schedule expansion/);
    const c = result.results.find(r => r.before.object === 'Case');
    assert.equal(c.currentRecord.data.Priority, 'High');
    assert.ok(c.history.some(e => e.kind === 'acknowledgement_lost'));
    assert.equal(c.history.at(-1).kind, 'existing_update_reconciled');
    db.close();
});
test('duplicate business identity is independent of opaque replay cursor', () => { const { db, desk } = setup(); const { run, event, receipt } = prepare(desk); const initial = desk.state(run.runId).cursor; desk.review(receipt.receiptId, 'revops-reviewer'); desk.execute(receipt.receiptId); const repeat = desk.submit(run.runId, { ...event, replayId: 'opaque-other-position' }); assert.equal(repeat.receiptId, receipt.receiptId); assert.equal(repeat.localEffects, 1); assert.equal(desk.state(run.runId).cursor, initial); assert.throws(() => desk.submit(run.runId, { ...event, expectedRevision: 2 }), /Conflicting duplicate/); db.close(); });
test('separate records in one transaction are not conflated', () => { const { db, desk } = setup(); const run = desk.start(); const one = desk.event(run.runId, run.records[0].id), two = desk.event(run.runId, run.records[1].id); two.transactionKey = one.transactionKey; two.sequenceNumber = one.sequenceNumber; assert.notEqual(desk.submit(run.runId, one).receiptId, desk.submit(run.runId, two).receiptId); db.close(); });
test('tenant, object, unsupported fields and malformed event shapes reject before persistence', () => {
    const { db, desk } = setup();
    const run = desk.start(), event = desk.event(run.runId, run.records[0].id);
    for (const input of [{ ...event, orgId: 'foreign' }, { ...event, entityName: 'Foreign' }, { ...event, fields: { OwnerId: 'injected' } }, { ...event, sequenceNumber: true }, { ...event, expectedRevision: 0 }, { ...event, changeType: 'DELETE' }, null, []])
        assert.throws(() => desk.submit(run.runId, input));
    assert.equal(desk.state(run.runId).receipts.length, 0);
    assert.equal(desk.state(run.runId).cursor, null);
    db.close();
});
test('consent, field write permissions and stale record evidence hold changes', () => {
    const { db, desk } = setup();
    for (const [scenario, reason] of [['consent_hold', 'storage_consent_required'], ['field_denied', 'field_write_permission_denied'], ['stale_event', 'stale_record_evidence']]) {
        const { receipt } = prepare(desk, scenario);
        assert.equal(receipt.status, 'held');
        assert.ok(receipt.reasons.includes(reason));
        assert.throws(() => desk.review(receipt.receiptId, 'revops-reviewer'));
        assert.throws(() => desk.execute(receipt.receiptId));
        assert.equal(receipt.localEffects, 0);
    }
    db.close();
});
test('read-only profile cannot approve; updates cannot precede review', () => { const { db, desk } = setup(); const { receipt } = prepare(desk); assert.throws(() => desk.review(receipt.receiptId, 'analyst-readonly'), /cannot approve/); assert.throws(() => desk.execute(receipt.receiptId), /Review required/); desk.review(receipt.receiptId, 'revops-reviewer'); assert.equal(desk.review(receipt.receiptId, 'revops-reviewer').replayed, true); assert.equal(desk.execute(receipt.receiptId).status, 'completed'); db.close(); });
test('intervening record changes invalidate reviewed writes without overwriting the new owner', () => { const { db, desk } = setup(); const { run, record, receipt } = prepare(desk); desk.review(receipt.receiptId, 'revops-reviewer'); desk.simulateChange(run.runId, record.id); assert.throws(() => desk.execute(receipt.receiptId), /Record changed/); assert.equal(desk.state(run.runId).records.find(r => r.id === record.id).data.OwnerId, '005000000000004'); assert.equal(desk.state(run.runId).receipts[0].localEffects, 0); const next = desk.submit(run.runId, desk.event(run.runId, record.id)); assert.equal(next.expectedRevision, 2); db.close(); });
test('two certain failures stop retries; uncertainty cannot be retried or exported', () => { const { db, desk } = setup(); let { receipt } = prepare(desk); desk.review(receipt.receiptId, 'revops-reviewer'); assert.equal(desk.execute(receipt.receiptId, 'timeout_before').status, 'retryable'); assert.equal(desk.execute(receipt.receiptId, 'timeout_before').status, 'stopped'); assert.throws(() => desk.execute(receipt.receiptId)); assert.equal(desk.state(receipt.runId).receipts[0].localEffects, 0); ({ receipt } = prepare(desk)); desk.review(receipt.receiptId, 'revops-reviewer'); desk.execute(receipt.receiptId, 'timeout_after'); assert.throws(() => desk.execute(receipt.receiptId), /reconciliation/); assert.throws(() => desk.export(receipt.receiptId), /completion/); assert.equal(desk.reconcile(receipt.receiptId).localEffects, 1); assert.equal(desk.execute(receipt.receiptId).localEffects, 1); db.close(); });
test('source changes invalidate review, execute, replay, reconcile and export', () => {
    const db = new DatabaseSync(':memory:');
    let policy = 'v1';
    const desk = salesforceDesk(db, () => policy);
    const { run, event, receipt } = prepare(desk);
    desk.review(receipt.receiptId, 'revops-reviewer');
    desk.execute(receipt.receiptId, 'timeout_after');
    policy = 'v2';
    for (const action of [() => desk.review(receipt.receiptId, 'revops-reviewer'), () => desk.execute(receipt.receiptId), () => desk.submit(run.runId, event), () => desk.reconcile(receipt.receiptId), () => desk.export(receipt.receiptId)])
        assert.throws(action, /Policy changed/);
    db.close();
});
test('reconciliation cannot fabricate a missing effect or confirm an overwritten record', () => { const { db, desk } = setup(); const { run, record, receipt } = prepare(desk); desk.review(receipt.receiptId, 'revops-reviewer'); desk.execute(receipt.receiptId, 'timeout_after'); desk.simulateChange(run.runId, record.id); assert.equal(desk.reconcile(receipt.receiptId).status, 'uncertain'); db.prepare('DELETE FROM sf_effects WHERE intent=?').run(receipt.receiptId); assert.equal(desk.reconcile(receipt.receiptId).localEffects, 0); assert.equal(desk.state(run.runId).records.find(r => r.id === record.id).revision, 3); db.close(); });
test('durable restart retains review, uncertain write and event identity', () => {
    const dir = mkdtempSync(join(tmpdir(), 'salesforce-desk-'));
    try {
        const file = join(dir, 'desk.sqlite');
        let db = new DatabaseSync(file), desk = salesforceDesk(db);
        const { run, event, receipt } = prepare(desk);
        desk.review(receipt.receiptId, 'revops-reviewer');
        desk.execute(receipt.receiptId, 'timeout_after');
        db.close();
        db = new DatabaseSync(file);
        desk = salesforceDesk(db);
        assert.equal(desk.submit(run.runId, event).status, 'uncertain');
        assert.equal(desk.reconcile(receipt.receiptId).localEffects, 1);
        assert.equal(desk.export(receipt.receiptId).authority, 'local_simulation_only');
        db.close();
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('HTTP full run and local access boundaries', async () => {
    const db = new DatabaseSync(':memory:'), server = createLabServer(db);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
        const page = await fetch(base + '/salesforce');
        assert.equal(page.status, 200);
        assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
        assert.equal((await fetch(base + '/api/salesforce/full-run', { method: 'POST', body: '{}' })).status, 403);
        assert.equal((await fetch(base + '/api/salesforce/config', { headers: { Origin: 'https://foreign.test' } })).status, 403);
        const result = await (await fetch(base + '/api/salesforce/full-run', { method: 'POST', headers: { 'X-Demo-Client': 'local-showcase' }, body: '{}' })).json();
        assert.equal(result.passed, true);
        assert.equal(result.results.length, 3);
        assert.equal(result.externalActions, 0);
        assert.equal((await (await fetch(base + '/api/salesforce/state?run=' + result.runId)).json()).receipts.length, 3);
    }
    finally {
        await new Promise(r => server.close(r));
        db.close();
    }
});
