import assert from 'node:assert/strict';
import test from 'node:test';
import { runSalesforceFaultDrill } from './salesforce-fault-drill.mjs';
import { salesforceSourceHash } from './salesforce-core.mjs';

test('Salesforce fault drill verifies persisted recovery, stale approvals and audit rollback', () => {
  const report = runSalesforceFaultDrill();
  assert.equal(report.sourceHash, salesforceSourceHash());
  assert.equal(report.passed, true);
  assert.equal(report.externalActions, 0);
  assert.deepEqual(report.scenarios.map(({id, status, attempts, effects}) => [id, status, attempts, effects]), [
    ['review-then-success-restart', 'completed', 1, 1],
    ['confirmed-no-write-restart', 'completed', 2, 1],
    ['retry-cap-restart', 'stopped', 2, 0],
    ['lost-acknowledgement-restart', 'completed', 1, 1],
    ['intervening-change-restart', 'reviewed', 0, 0],
    ['simulated-policy-drift-restart', 'reviewed', 0, 0],
    ['audit-failure-rollback', 'completed', 1, 1],
  ]);
  assert.ok(report.scenarios.every(row => row.checks.length >= 2));
  assert.match(report.scope, /trusted callback/);
  assert.doesNotMatch(JSON.stringify(report), /Northstar|Avery|OwnerId|NextStep|48000|runId|receiptId/);
});

test('fault drill reruns independently with the same sanitized evidence', () => {
  assert.deepEqual(runSalesforceFaultDrill(), runSalesforceFaultDrill());
});
