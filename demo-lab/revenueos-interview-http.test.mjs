import assert from 'node:assert/strict';
import test from 'node:test';
import {createLabServer, openStore} from './server.mjs';

test('interview route serves local assets and uses the existing guarded Salesforce workflow', async t => {
  const db = openStore(':memory:');
  const server = createLabServer(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const page = await fetch(base + '/revenueos-interview');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  const html = await page.text();
  assert.match(html, /revenueos-interview-ui.mjs/);
  for (const path of ['/revenueos-interview.css','/revenueos-interview-ui.mjs']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 100);
  }
  const post = async (kind, body, headers = {}) => {
    const res = await fetch(base + '/api/salesforce/' + kind, {
      method:'POST', headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...headers},
      body:JSON.stringify(body),
    });
    return {status:res.status, body:await res.json()};
  };
  assert.equal((await post('start',{scenario:'normal'},{Origin:'https://elsewhere.invalid'})).status,403);
  const run = (await post('start',{scenario:'normal'})).body;
  const record = run.records.find(row => row.object === 'Case');
  const receipt = (await post('evaluate',{runId:run.runId,recordId:record.id})).body;
  assert.equal(receipt.status,'pending_review');
  assert.equal((await post('execute',{receiptId:receipt.receiptId,outcome:'success'})).status,400);
  await post('review',{receiptId:receipt.receiptId,profile:'revops-reviewer'});
  const uncertain = (await post('execute',{receiptId:receipt.receiptId,outcome:'timeout_after'})).body;
  assert.equal(uncertain.status,'uncertain');
  assert.equal(uncertain.localEffects,1);
  const done = (await post('reconcile',{receiptId:receipt.receiptId})).body;
  const replay = (await post('execute',{receiptId:receipt.receiptId,outcome:'success'})).body;
  assert.equal(done.status,'completed');
  assert.equal(replay.localEffects,1);
  assert.equal(replay.receiptId,done.receiptId);
});
