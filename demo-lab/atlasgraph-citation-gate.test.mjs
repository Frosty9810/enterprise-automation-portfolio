import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { evaluateCitationCases, prepareCitationCases } from './atlasgraph-citation-cases.mjs';
import { gradeCandidate } from './atlasgraph-citation-gate.mjs';

function database(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  return db;
}

test('the synthetic cases match the expected answer, abstention and denial behavior', t => {
  const report = evaluateCitationCases(database(t));
  assert.equal(report.total, 12);
  assert.equal(report.passed, report.total, JSON.stringify(report.cases, null, 2));
  assert.equal(report.cases.filter(item => item.accepted).length, 2);
});

test('the gate rejects duplicate, unexpected and unstructured claims', t => {
  const { desk, answer, supported } = prepareCitationCases(database(t));
  const duplicated = { ...supported, claims: [...supported.claims, supported.claims[0]] };
  assert.equal(gradeCandidate(desk, answer, duplicated).reason, 'duplicate_claim');
  const extra = { ...supported, claims: [...supported.claims, { ...supported.claims[0], key: 'other' }] };
  assert.equal(gradeCandidate(desk, answer, extra).reason, 'unexpected_claim');
  assert.equal(gradeCandidate(desk, answer, { ...supported, summary: 'Unverified prose' }).reason, 'invalid_candidate');
  assert.equal(gradeCandidate(desk, answer, { ...supported, status: 'abstained' }).reason, 'abstention_contains_claims');
});

test('the gate rejects a stored citation whose quoted page differs from the approved snapshot', t => {
  const db = database(t);
  const { desk, answer, supported } = prepareCitationCases(db);
  const receipt = desk.receipt({ tenant: answer.tenant, id: answer.receiptId });
  receipt.citations.find(item => item.pageId === 'shipment').text = 'Sample shipment uses Incoterm DAP.';
  db.prepare('UPDATE atlas_receipts SET body=? WHERE tenant=? AND id=?')
    .run(JSON.stringify(receipt), answer.tenant, answer.receiptId);
  assert.equal(gradeCandidate(desk, answer, supported).reason, 'evidence_mismatch');
});

test('a malformed stored receipt cannot authorize an empty supported answer or an inconsistent abstention', t => {
  const db = database(t);
  const { desk, answer } = prepareCitationCases(db);
  const receipt = desk.receipt({ tenant: answer.tenant, id: answer.receiptId });
  const store = db.prepare('UPDATE atlas_receipts SET body=? WHERE tenant=? AND id=?');
  const emptyAnswer = { status: 'supported', claims: [] };
  store.run(JSON.stringify({ ...receipt, requiredClaims: [], claims: [] }), answer.tenant, answer.receiptId);
  assert.equal(gradeCandidate(desk, answer, emptyAnswer).reason, 'invalid_receipt');

  const abstention = { status: 'abstained', claims: [] };
  store.run(JSON.stringify({ ...receipt, status: 'abstained' }), answer.tenant, answer.receiptId);
  assert.equal(gradeCandidate(desk, answer, abstention).reason, 'invalid_receipt');
});
