import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { salesforceDesk, salesforceSourceHash } from './salesforce-core.mjs';

/** Exercise real local lifecycle methods and fail if any asserted recovery invariant breaks. */
export function runSalesforceFaultDrill() {
  const directory = mkdtempSync(join(tmpdir(), 'salesforce-faults-'));
  const file = join(directory, 'revenueos.sqlite');
  const sourceHash = salesforceSourceHash();
  const scenarios = [];
  let db;
  let desk;

  function reopen(hash) {
    if (db?.isOpen) db.close();
    db = new DatabaseSync(file);
    desk = salesforceDesk(db, hash);
  }
  function prepare(object) {
    const run = desk.start();
    const record = run.records.find(row => row.object === object);
    const event = desk.event(run.runId, record.id);
    const receipt = desk.submit(run.runId, event);
    return { run, record, event, receipt };
  }
  function inspect(receipt) {
    return desk.state(receipt.runId).receipts.find(row => row.receiptId === receipt.receiptId);
  }
  function checkRows(receipt, effects, attempts, status) {
    const current = inspect(receipt);
    assert.equal(current.localEffects, effects);
    assert.equal(current.attempts, attempts);
    assert.equal(current.status, status);
    return current;
  }
  function result(id, receipt, checks) {
    const row = inspect(receipt);
    scenarios.push({ id, object: row.before.object, status: row.status, attempts: row.attempts, effects: row.localEffects, checks });
  }

  try {
    reopen();
    {
      const { run, event, receipt } = prepare('Lead');
      assert.throws(() => desk.execute(receipt.receiptId), /Review required/);
      assert.throws(() => desk.review(receipt.receiptId, 'analyst-readonly'), /cannot approve/);
      checkRows(receipt, 0, 0, 'pending_review');
      desk.review(receipt.receiptId, 'revops-reviewer');
      const completed = desk.execute(receipt.receiptId);
      assert.equal(completed.currentRecord.data.OwnerId, '005000000000002');
      reopen();
      const replay = desk.submit(run.runId, { ...event, replayId: 'opaque-replayed-position' });
      assert.equal(replay.receiptId, receipt.receiptId);
      assert.equal(replay.replayed, true);
      assert.equal(desk.execute(receipt.receiptId).replayed, true);
      checkRows(receipt, 1, 1, 'completed');
      result('review-then-success-restart', receipt, ['unapproved execution rejected', 'read-only review rejected', 'lead owner applied', 'reopened business identity replay retained one effect']);
    }
    {
      const { receipt } = prepare('Opportunity');
      desk.review(receipt.receiptId, 'revops-reviewer');
      desk.execute(receipt.receiptId, 'timeout_before');
      reopen();
      checkRows(receipt, 0, 1, 'retryable');
      const completed = desk.execute(receipt.receiptId);
      assert.equal(completed.currentRecord.data.Amount, 48000);
      assert.equal(completed.currentRecord.data.StageName, 'Proposal');
      assert.match(completed.currentRecord.data.NextStep, /Schedule expansion review/);
      checkRows(receipt, 1, 2, 'completed');
      result('confirmed-no-write-restart', receipt, ['pre-write failure retained zero effects across restart', 'one permitted retry applied next step', 'amount and stage preserved']);
    }
    {
      const { receipt } = prepare('Lead');
      desk.review(receipt.receiptId, 'revops-reviewer');
      desk.execute(receipt.receiptId, 'timeout_before');
      desk.execute(receipt.receiptId, 'timeout_before');
      reopen();
      const before = inspect(receipt);
      assert.throws(() => desk.execute(receipt.receiptId), /Review required|Attempt limit/);
      assert.deepEqual(inspect(receipt), before);
      checkRows(receipt, 0, 2, 'stopped');
      result('retry-cap-restart', receipt, ['two confirmed failures exhausted attempts', 'restart did not re-enable execution', 'rejected retry did not change history']);
    }
    {
      const { run, event, receipt } = prepare('Case');
      const initialCursor = desk.state(run.runId).cursor;
      desk.review(receipt.receiptId, 'revops-reviewer');
      desk.execute(receipt.receiptId, 'timeout_after');
      reopen();
      const pending = desk.submit(run.runId, { ...event, replayId: 'another-opaque-position' });
      assert.equal(pending.receiptId, receipt.receiptId);
      assert.equal(desk.state(run.runId).cursor, initialCursor);
      assert.throws(() => desk.execute(receipt.receiptId), /reconciliation/);
      assert.throws(() => desk.export(receipt.receiptId), /completion/);
      checkRows(receipt, 1, 1, 'uncertain');
      const recovered = desk.reconcile(receipt.receiptId);
      assert.equal(recovered.currentRecord.data.Priority, 'High');
      assert.equal(recovered.currentRecord.data.OwnerId, '005000000000003');
      const auditCount = recovered.history.length;
      assert.equal(desk.reconcile(receipt.receiptId).history.length, auditCount);
      assert.equal(desk.execute(receipt.receiptId).history.length, auditCount);
      checkRows(receipt, 1, 1, 'completed');
      result('lost-acknowledgement-restart', receipt, ['uncertain write persisted one effect', 'replay did not advance opaque cursor', 'retry and export blocked until reconciliation', 'reconciliation and execution replay added no effect or audit event']);
    }
    {
      const { run, record, receipt } = prepare('Lead');
      desk.review(receipt.receiptId, 'revops-reviewer');
      desk.simulateChange(run.runId, record.id);
      reopen();
      const before = inspect(receipt);
      assert.throws(() => desk.execute(receipt.receiptId), /Record changed/);
      assert.deepEqual(inspect(receipt), before);
      assert.equal(before.currentRecord.data.OwnerId, '005000000000004');
      checkRows(receipt, 0, 0, 'reviewed');
      result('intervening-change-restart', receipt, ['stale approval rejected after restart', 'new operator owner preserved', 'rejected update left no effect']);
    }
    {
      // This isolated probe supplies a trusted source-hash callback to simulate code drift.
      let policy = sourceHash;
      reopen(() => policy);
      const { receipt } = prepare('Opportunity');
      desk.review(receipt.receiptId, 'revops-reviewer');
      policy = '0'.repeat(64);
      reopen(() => policy);
      const before = inspect(receipt);
      assert.throws(() => desk.execute(receipt.receiptId), /Policy changed/);
      assert.deepEqual(inspect(receipt), before);
      checkRows(receipt, 0, 0, 'reviewed');
      result('simulated-policy-drift-restart', receipt, ['trusted callback simulated source drift', 'old approval rejected with zero effects']);
      reopen();
    }
    {
      const { receipt } = prepare('Case');
      desk.review(receipt.receiptId, 'revops-reviewer');
      const before = inspect(receipt);
      db.exec("CREATE TEMP TRIGGER fail_fault_drill_audit BEFORE INSERT ON sf_audit WHEN NEW.kind='local_update_confirmed' BEGIN SELECT RAISE(ABORT, 'fault drill audit failure'); END");
      assert.throws(() => desk.execute(receipt.receiptId), /fault drill audit failure/);
      assert.deepEqual(inspect(receipt), before);
      reopen();
      checkRows(receipt, 0, 0, 'reviewed');
      assert.equal(inspect(receipt).currentRecord.revision, 1);
      desk.execute(receipt.receiptId);
      checkRows(receipt, 1, 1, 'completed');
      result('audit-failure-rollback', receipt, ['failed audit rolled back record effect attempt and history', 'reopened unchanged revision', 'explicit retry applied once']);
    }
    return {
      format: 'salesforce-fault-drill/v1',
      sourceHash,
      passed: true,
      scenarios,
      externalActions: 0,
      scope: 'Synthetic local SQLite restart and fault acceptance. Source drift uses an explicit trusted callback. No Salesforce org, authenticated reviewer, provider acceptance or production recovery result.',
    };
  } finally {
    if (db?.isOpen) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
