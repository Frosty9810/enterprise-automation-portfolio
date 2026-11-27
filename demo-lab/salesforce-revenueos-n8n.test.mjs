import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { salesforceDesk } from './salesforce-core.mjs';

const workflow = JSON.parse(readFileSync(new URL('./salesforce-revenueos-n8n.json', import.meta.url), 'utf8'));
function code(name, input, prior = {}) {
  const node = workflow.nodes.find(item => item.name === name);
  const execute = new Function('$input', '$', node.parameters.jsCode);
  return execute({first:() => input[0], all:() => input}, name => ({all:() => prior[name]}));
}
function setup(t, scenario = 'normal') {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const desk = salesforceDesk(db);
  const state = desk.start(scenario);
  const requests = code('Build normalized events', [{json:state}]);
  return {db, desk, state, requests};
}
function prepare(desk, requests) {
  return requests.map(item => ({json:desk.submit(item.json.request.runId, item.json.request.event)}));
}

test('native Salesforce workflow normalizes current records and replays three zero-effect proposals', t => {
  const {db, desk, state, requests} = setup(t);
  const before = structuredClone(state);
  const first = prepare(desk, requests);
  const retained = code('Keep replay evidence', first, {'Build normalized events':requests});
  const replay = prepare(desk, requests);
  const result = code('Verify proposal replay', replay, {'Keep replay evidence':retained});
  assert.deepEqual(state, before);
  assert.deepEqual(result.map(item => item.json.object).sort(), ['Case','Lead','Opportunity']);
  for (const item of result) {
    assert.equal(item.json.status, 'pending_review');
    assert.equal(item.json.sameReceipt, true);
    assert.equal(item.json.localEffects, 0);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sf_intents').get().n, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sf_effects').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sf_audit').get().n, 3);
});

test('workflow rejects incompatible records, held evidence and mismatched first receipts', t => {
  const {desk, state, requests} = setup(t);
  assert.throws(() => code('Build normalized events', [{json:{...state, records:state.records.slice(1)}}]), /Unexpected/);
  const duplicate = {...state, records:[state.records[0],state.records[0],state.records[2]]};
  assert.throws(() => code('Build normalized events', [{json:duplicate}]), /three Salesforce objects/);
  const first = prepare(desk, requests);
  const forged = structuredClone(first);
  forged[0].json.recordId = 'foreign-record';
  assert.throws(() => code('Keep replay evidence', forged, {'Build normalized events':requests}), /does not match/);
  const held = setup(t, 'consent_hold');
  assert.throws(() => code('Keep replay evidence', prepare(held.desk,held.requests), {'Build normalized events':held.requests}), /does not match/);
});

test('workflow verification rejects changed receipt state, evidence and replay identity', t => {
  const {desk, requests} = setup(t);
  const first = prepare(desk, requests);
  const retained = code('Keep replay evidence', first, {'Build normalized events':requests});
  const replay = prepare(desk, requests);
  for (const patch of [
    {receiptId:'different'}, {localEffects:1}, {attempts:1}, {reviewer:'revops-reviewer'},
    {replayed:false}, {patch:{OwnerId:'foreign'}}, {history:[]},
  ]) {
    const mutated = structuredClone(replay);
    Object.assign(mutated[0].json, patch);
    assert.throws(() => code('Verify proposal replay', mutated, {'Keep replay evidence':retained}), /Replay changed/);
  }
});

test('workflow transports are bounded to local start and evaluate operations without credential nodes', () => {
  const http = workflow.nodes.filter(node => node.type === 'n8n-nodes-base.httpRequest');
  assert.deepEqual(http.map(node => node.parameters.url), [
    'http://127.0.0.1:5680/api/salesforce/start',
    'http://127.0.0.1:5680/api/salesforce/evaluate',
    'http://127.0.0.1:5680/api/salesforce/evaluate',
  ]);
  for (const node of workflow.nodes) assert.equal(Object.hasOwn(node,'credentials'), false);
  for (const node of http) {
    assert.equal(node.parameters.method, 'POST');
    assert.equal(node.parameters.options.timeout, 5000);
    assert.deepEqual(node.parameters.options.redirect, {redirect:{followRedirects:false}});
    assert.deepEqual(node.parameters.headerParameters.parameters, [{name:'X-Demo-Client',value:'local-showcase'}]);
  }
});
