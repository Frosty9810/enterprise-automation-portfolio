import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createLabServer, openStore } from './server.mjs';
import { flagshipSuite } from './flagship-suite.mjs';
test('review evidence survives restart and retains its original reviewer', async () => { const dir = mkdtempSync(join(tmpdir(), 'flagship-')), path = join(dir, 'analysis.sqlite'); let db = new DatabaseSync(path); try {
    let suite = flagshipSuite(db);
    const r = await suite.evaluate('F12', { candidate: 'reconstructed' });
    suite.review(r.receiptId, 'Original analyst');
    db.close();
    db = new DatabaseSync(path);
    suite = flagshipSuite(db);
    assert.equal(suite.export(r.receiptId).review.actor, 'Original analyst');
    assert.throws(() => suite.review(r.receiptId, 'Other analyst'), /retained/);
    assert.equal((await suite.evaluate('F12', { candidate: 'reconstructed' })).replayed, true);
    assert.equal(suite.history()[0].evaluations, 1);
}
finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
} });
test('HTTP source links resolve for all twelve and mutations reject foreign origins and missing intent', async (t) => { const db = openStore(':memory:'), server = createLabServer(db); await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(async () => { await new Promise(r => server.close(r)); db.close(); }); const base = 'http://127.0.0.1:' + server.address().port; const catalog = await (await fetch(base + '/api/flagships/catalog')).json(); assert.equal(catalog.projects.length, 12); for (const p of catalog.projects)
    for (const source of p.sources) {
        const response = await fetch(base + source.url);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.ok((await response.text()).length > 10);
    } assert.equal((await fetch(base + '/api/flagships/source/private/0')).status, 404); assert.equal((await fetch(base + '/api/flagships/source/F05/99')).status, 404); const body = JSON.stringify({ toolId: 'F12', input: { candidate: 'reconstructed' } }), url = base + '/api/flagships/evaluate'; assert.equal((await fetch(url, { method: 'POST', body })).status, 403); assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://foreign.test', 'X-Demo-Client': 'local-showcase' }, body })).status, 403); const post = (route, value) => fetch(base + '/api/flagships/' + route, { method: 'POST', headers: { 'X-Demo-Client': 'local-showcase', 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); const receipt = await (await post('evaluate', JSON.parse(body))).json(); assert.ok(receipt.receiptId); assert.equal((await post('export', { receiptId: receipt.receiptId })).status, 400); assert.equal((await post('review', { receiptId: receipt.receiptId, actor: 'HTTP analyst' })).status, 200); assert.equal((await (await post('export', { receiptId: receipt.receiptId })).json()).authority, 'reviewed_local_analysis_only'); assert.equal((await post('evaluate', { toolId: 'F12', input: { candidate: 'arbitrary' } })).status, 400); assert.match((await fetch(base + '/flagships')).headers.get('content-security-policy'), /script-src 'self'/); });
