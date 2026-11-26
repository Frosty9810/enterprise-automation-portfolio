import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { salesforceDesk } from './salesforce-core.mjs';
import { projectSalesforceQueue } from './salesforce-queue.mjs';

function setup(t, source) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  return { db, desk: salesforceDesk(db, source) };
}
function propose(desk, run, object) {
  const record = run.records.find(row => row.object === object);
  return desk.submit(run.runId, desk.event(run.runId, record.id));
}

test('queue projects actual review, execution and uncertain work without business fields', t => {
  const { desk } = setup(t);
  const run = desk.start();
  const lead = propose(desk, run, 'Lead');
  const opportunity = propose(desk, run, 'Opportunity');
  const service = propose(desk, run, 'Case');
  desk.review(opportunity.receiptId, 'revops-reviewer');
  desk.review(service.receiptId, 'revops-reviewer');
  desk.execute(service.receiptId, 'timeout_after');
  const state = desk.state(run.runId);
  const before = structuredClone(state);
  const queue = projectSalesforceQueue(state);
  assert.deepEqual(state, before);
  assert.deepEqual(queue.rows.map(row => [row.object, row.action]), [
    ['Case', 'reconcile'], ['Lead', 'review'], ['Opportunity', 'execute'],
  ]);
  assert.equal(queue.rows[0].staleEvidence, false);
  assert.equal(queue.rows[0].localEffects, 1);
  assert.equal(queue.rows[1].receiptId, lead.receiptId);
  assert.equal(queue.counts.total, 3);
  assert.equal(queue.counts.reconcile, 1);
  assert.deepEqual(projectSalesforceQueue({ ...state, receipts: [...state.receipts].reverse(), records: [...state.records].reverse() }), queue);
  assert.doesNotMatch(JSON.stringify(queue), /Northstar|Avery|48000|NextStep|OwnerId|payload|before/);
});

test('stale active evidence reevaluates while completed history survives later record edits', t => {
  let source = 'source-v1';
  const { desk } = setup(t, () => source);
  const run = desk.start();
  const lead = propose(desk, run, 'Lead');
  const opportunity = propose(desk, run, 'Opportunity');
  desk.review(lead.receiptId, 'revops-reviewer');
  desk.review(opportunity.receiptId, 'revops-reviewer');
  desk.execute(opportunity.receiptId);
  desk.simulateChange(run.runId, lead.recordId);
  desk.simulateChange(run.runId, opportunity.recordId);
  let queue = projectSalesforceQueue(desk.state(run.runId));
  assert.equal(queue.rows.find(row => row.receiptId === lead.receiptId).action, 'reevaluate');
  const historical = queue.rows.find(row => row.receiptId === opportunity.receiptId);
  assert.equal(historical.action, 'none');
  assert.equal(historical.historical, true);
  source = 'source-v2';
  queue = projectSalesforceQueue(desk.state(run.runId));
  assert.ok(queue.rows.every(row => row.staleEvidence));
  assert.equal(queue.rows.find(row => row.receiptId === opportunity.receiptId).action, 'none');
});

test('confirmed failures allow one retry then stop; policy drift never retries an uncertain effect', t => {
  let source = 'source-v1';
  const { desk } = setup(t, () => source);
  const run = desk.start();
  const lead = propose(desk, run, 'Lead');
  desk.review(lead.receiptId, 'revops-reviewer');
  desk.execute(lead.receiptId, 'timeout_before');
  assert.equal(projectSalesforceQueue(desk.state(run.runId)).rows[0].action, 'retry');
  desk.execute(lead.receiptId, 'timeout_before');
  assert.equal(projectSalesforceQueue(desk.state(run.runId)).rows[0].action, 'stop');
  const service = propose(desk, run, 'Case');
  desk.review(service.receiptId, 'revops-reviewer');
  desk.execute(service.receiptId, 'timeout_after');
  source = 'source-v2';
  const row = projectSalesforceQueue(desk.state(run.runId)).rows.find(item => item.receiptId === service.receiptId);
  assert.equal(row.action, 'stop');
  assert.equal(row.localEffects, 1);
  assert.ok(row.reasonCodes.includes('write_outcome_requires_reconciliation'));
});

test('held fixtures and no-change results stay distinct and malformed state is rejected', t => {
  const { desk, db } = setup(t);
  for (const scenario of ['consent_hold', 'field_denied', 'stale_event']) {
    const run = desk.start(scenario);
    propose(desk, run, 'Lead');
    assert.equal(projectSalesforceQueue(desk.state(run.runId)).rows[0].action, 'reevaluate');
  }
  const run = desk.start();
  const record = run.records.find(row => row.object === 'Lead');
  db.prepare('UPDATE sf_records SET data=? WHERE run=? AND id=?').run(JSON.stringify({ ...record.data, Score: 1 }), run.runId, record.id);
  propose(desk, run, 'Lead');
  const state = desk.state(run.runId);
  assert.equal(projectSalesforceQueue(state).rows[0].action, 'none');
  assert.equal(projectSalesforceQueue(state).rows[0].status, 'no_change');
  assert.throws(() => projectSalesforceQueue({ ...state, receipts: [...state.receipts, ...state.receipts] }), /Duplicate/);
  assert.throws(() => projectSalesforceQueue({ ...state, records: [] }), /receipt/);
  assert.throws(() => projectSalesforceQueue({ ...state, receipts: [{ ...state.receipts[0], status: 'pretend' }] }), /receipt/);
  assert.equal(projectSalesforceQueue(desk.start()).counts.total, 0);
});
