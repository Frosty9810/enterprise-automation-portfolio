import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer, openStore } from './server.mjs';

test('GTM loopback API gates a local effect and replays the same receipt', async (t) => {
  const db = openStore(':memory:');
  const server = createLabServer(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = async (operation, input, headers = {}, api = 'gtm') => {
    const response = await fetch(base + '/api/' + api + '/' + operation, {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'X-Demo-Client':'local-showcase', ...headers},
      body: JSON.stringify(input),
    });
    return {status:response.status, body:await response.json()};
  };

  const catalog = await fetch(base + '/api/gtm/catalog').then(result => result.json());
  assert.equal(catalog.scenarios.length, 2);
  const input = {scenarioId:'supplier-signal', runId:'n8n-synthetic-demo'};
  assert.equal((await post('plan', input, {Origin:'https://outside.invalid'})).status, 403);
  assert.equal((await post('plan', input, {'X-Demo-Client':''})).status, 403);

  const fixtures = await fetch(base + '/api/trustgate/catalog').then(result => result.json());
  const proposal = fixtures.scenarios.find(fixture => fixture.id === 'reviewed-task').proposal;
  const tryGeneric = (operation, body) => post(operation, {tenant:'acme', ...body}, {}, 'trustgate');
  assert.equal((await tryGeneric('prepare', {...proposal, commandId:'gtm-demo.supplier-signal.n8n-synthetic-demo'})).status, 403);
  assert.equal((await tryGeneric('prepare', {...proposal, commandId:'ordinary-trustgate-run'})).status, 200);

  const plan = await post('plan', input);
  assert.equal(plan.status, 200);
  assert.equal(plan.body.receipt.status, 'pending_review');
  assert.equal(plan.body.audit.effectCount, 0);
  const lookup = {receiptId:plan.body.receipt.id};
  assert.equal((await post('execute', lookup)).status, 400);
  assert.equal((await post('review', {...lookup, decision:'approve', expectedHash:'f'.repeat(64)})).status, 400);
  const approved = await post('review', {...lookup, decision:'approve', expectedHash:plan.body.receipt.proposalHash});
  assert.equal(approved.body.receipt.status, 'ready');
  assert.equal(approved.body.audit.effectCount, 0);
  assert.equal((await tryGeneric('review', {
    ...lookup, reviewer:'acme-reviewer', decision:'approve', note:'Generic fixture review',
    expectedHash:plan.body.receipt.proposalHash,
  })).status, 403);
  assert.equal((await tryGeneric('execute', lookup)).status, 403);
  const executed = await post('execute', lookup);
  assert.equal(executed.body.receipt.status, 'executed');
  assert.equal(executed.body.audit.effectCount, 1);
  const retry = await post('execute', lookup);
  assert.equal(retry.body.receipt.replayed, true);
  assert.equal(retry.body.audit.eventCount, executed.body.audit.eventCount);
  assert.deepEqual(retry.body.receipt.effect, executed.body.receipt.effect);
  assert.equal(retry.body.audit.valid, true);

  const blocked = await post('plan', {scenarioId:'marked-instruction',runId:'http-denied'});
  assert.equal(blocked.body.receipt.status, 'blocked');
  assert.equal(blocked.body.audit.effectCount, 0);
  assert.equal((await post('execute', {receiptId:blocked.body.receipt.id})).status, 400);
});
