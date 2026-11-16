import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { verifyReliabilityReceipt } from './ops-receipt-integrity.mjs';
import { reliabilityDesk } from './reliability.mjs';

const projectId = 'OPS-01';

function submit(desk) {
  return desk.submit(projectId, {
    projectId, eventId: 'integrity-check', storageConsent: true,
    contact: { email: 'integrity-fixture@example.test' },
  }).receiptId;
}

function setup(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  return { db, desk: reliabilityDesk(db), verify: id => verifyReliabilityReceipt(db, id) };
}

function codes(report) {
  return report.findings.map(finding => finding.code);
}

test('read-only receipt verification sees one recovered effect across restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ops-integrity-test-'));
  const file = join(directory, 'receipts.sqlite');
  let writer;
  let reader;
  try {
    writer = new DatabaseSync(file);
    let desk = reliabilityDesk(writer);
    const id = submit(desk);
    assert.equal(verifyReliabilityReceipt(writer, id).history.inferredAttempts, 0);
    desk.review(id, 'Operator A');
    desk.execute(id, 'timeout_after');
    writer.close();

    reader = new DatabaseSync(file, { readOnly: true });
    const uncertain = verifyReliabilityReceipt(reader, id);
    assert.equal(uncertain.valid, true);
    assert.equal(uncertain.status, 'uncertain');
    assert.equal(uncertain.history.inferredAttempts, 1);
    assert.equal(uncertain.effect.status, 'matches_receipt');
    assert.equal(reader.isTransaction, false);
    assert.equal(JSON.stringify(uncertain).includes('@example.test'), false);
    reader.close();

    writer = new DatabaseSync(file);
    desk = reliabilityDesk(writer);
    assert.equal(desk.reconcile(id).status, 'completed');
    assert.equal(desk.execute(id, 'success').replayed, true);
    writer.close();

    reader = new DatabaseSync(file, { readOnly: true });
    const recovered = verifyReliabilityReceipt(reader, id);
    assert.equal(recovered.valid, true);
    assert.equal(recovered.history.eventCount, uncertain.history.eventCount + 1);
    assert.equal(recovered.history.inferredAttempts, 1);
    assert.equal(recovered.effect.status, 'matches_receipt');
    assert.equal(reader.prepare('SELECT COUNT(*) AS count FROM reliability_effects').get().count, 1);
  } finally {
    if (reader?.isOpen) reader.close();
    if (writer?.isOpen) writer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('trace accepts a bounded stopped receipt and flags an unexpected effect', t => {
  const { db, desk, verify } = setup(t);
  const id = submit(desk);
  desk.review(id, 'Operator A');
  desk.execute(id, 'timeout_before');
  assert.equal(verify(id).history.inferredStatus, 'retryable');
  desk.execute(id, 'timeout_before');
  const stopped = verify(id);
  assert.equal(stopped.valid, true);
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.history.inferredAttempts, 2);
  assert.deepEqual(stopped.effect, {
    expected: false, present: false, payloadMatches: null, status: 'not_expected',
  });

  db.prepare('INSERT INTO reliability_effects SELECT id, payload FROM reliability_intents WHERE id = ?').run(id);
  const unexpected = verify(id);
  assert.equal(unexpected.valid, false);
  assert.equal(unexpected.effect.status, 'unexpected');
  assert.deepEqual(codes(unexpected), ['effect_unexpected']);
});

test('missing and altered effects produce distinct findings for uncertain receipts', t => {
  const { db, desk, verify } = setup(t);
  const id = submit(desk);
  desk.review(id, 'Operator A');
  desk.execute(id, 'timeout_after');
  db.prepare("UPDATE reliability_effects SET payload = '{}' WHERE intent_id = ?").run(id);
  assert.deepEqual(codes(verify(id)), ['effect_payload_mismatch']);
  db.prepare('DELETE FROM reliability_effects WHERE intent_id = ?').run(id);
  desk.reconcile(id);
  const missing = verify(id);
  assert.equal(missing.valid, false);
  assert.equal(missing.status, 'uncertain');
  assert.equal(missing.history.valid, true);
  assert.equal(missing.history.unresolvedReconciliations, 1);
  assert.equal(missing.effect.status, 'missing');
  assert.deepEqual(codes(missing), ['effect_missing']);
});

test('trace rejects malformed events, changed counters and missing history', t => {
  const { db, desk, verify } = setup(t);
  const id = submit(desk);
  desk.review(id, 'Operator A');
  desk.execute(id, 'success');
  db.prepare("UPDATE reliability_intents SET status = 'uncertain', attempts = 3, reviewer = 'Operator B' WHERE id = ?").run(id);
  assert.deepEqual(codes(verify(id)), [
    'history_status_mismatch', 'history_reviewer_mismatch', 'history_attempts_mismatch',
  ]);
  db.prepare("UPDATE reliability_events SET detail = '[' WHERE intent_id = ? AND kind = 'reviewed'").run(id);
  const malformed = verify(id);
  assert.equal(malformed.effect.status, 'expectation_unknown');
  assert.deepEqual(malformed.findings, [{ code: 'invalid_history_event', eventIndex: 1 }]);
  db.prepare("UPDATE reliability_events SET detail = ? WHERE intent_id = ? AND kind = 'reviewed'")
    .run('{"reviewer":"Other operator","reviewer":"Operator A"}', id);
  assert.deepEqual(verify(id).findings, [{ code: 'invalid_history_event', eventIndex: 1 }]);
  db.prepare('DELETE FROM reliability_events WHERE intent_id = ?').run(id);
  assert.deepEqual(codes(verify(id)), ['missing_history']);
});

test('receipt payload and identity checks are independent and retain an outer transaction', t => {
  const { db, desk, verify } = setup(t);
  const id = submit(desk);
  assert.throws(() => verify('not-a-receipt'), /Expected a local reliability receipt ID/);
  assert.throws(() => verify('0'.repeat(64)), /Unknown local reliability receipt/);

  db.exec('BEGIN');
  try {
    db.prepare("UPDATE reliability_intents SET payload = '{}', project = 'RE-01' WHERE id = ?").run(id);
    const report = verify(id);
    assert.equal(report.valid, false);
    assert.deepEqual(report.receipt, { payloadHashMatches: false, identityMatches: false });
    assert.deepEqual(codes(report), ['receipt_payload_integrity', 'receipt_identity_mismatch']);
    assert.equal(db.isTransaction, true);
  } finally {
    db.exec('ROLLBACK');
  }
  assert.equal(verify(id).valid, true);
});
