import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('./n8n.mjs', import.meta.url));
const workflow = fileURLToPath(new URL('./salesforce-revenueos-n8n.json', import.meta.url));
const options = { timeout: 120_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true };
let step = 'import';
try {
  await execute(process.execPath, [cli, 'import:workflow', '--input=' + workflow], options);
  step = 'native execution';
  const { stdout } = await execute(process.execPath, [cli, 'execute', '--id=PortfolioSf0027', '--rawOutput'], options);
  const output = stdout.match(/^\{\r?\n\s+"data": [\s\S]*?^\}/m)?.[0];
  assert.ok(output);
  const execution = JSON.parse(output);
  assert.equal(execution.status, 'success');
  assert.equal(execution.finished, true);
  const run = execution.data.resultData.runData['Verify proposal replay'][0];
  assert.equal(run.executionStatus, 'success');
  const rows = run.data.main[0].map(item => item.json);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(row => row.runId)).size, 1);
  assert.equal(new Set(rows.map(row => row.receiptId)).size, 3);
  assert.equal(new Set(rows.map(row => row.recordId)).size, 3);
  assert.deepEqual(rows.map(row => row.object).sort(), ['Case', 'Lead', 'Opportunity']);
  for (const row of rows) {
    assert.equal(row.status, 'pending_review');
    assert.equal(row.localEffects, 0);
    assert.equal(row.attempts, 0);
    assert.equal(row.sameReceipt, true);
    assert.equal(row.reviewRequired, true);
  }
  assert.deepEqual(rows.find(row => row.object === 'Lead').patch, { OwnerId: '005000000000002' });
  assert.deepEqual(rows.find(row => row.object === 'Opportunity').patch, {
    NextStep: 'Schedule expansion review; confirm decision owner and next milestone.',
  });
  assert.deepEqual(rows.find(row => row.object === 'Case').patch, { Priority: 'High', OwnerId: '005000000000003' });
  step = 'persisted state';
  const response = await fetch('http://127.0.0.1:5680/api/salesforce/state?run=' + encodeURIComponent(rows[0].runId), {
    signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.receipts.length, 3);
  assert.equal(state.runId, rows[0].runId);
  for (const row of rows) {
    const saved = state.receipts.find(receipt => receipt.receiptId === row.receiptId);
    assert.ok(saved);
    assert.equal(saved.status, 'pending_review');
    assert.equal(saved.localEffects, 0);
    assert.equal(saved.attempts, 0);
    assert.equal(saved.reviewer, null);
    assert.equal(saved.history.length, 1);
    assert.deepEqual(saved.patch, row.patch);
  }
  console.log(JSON.stringify({
    fixture: 'synthetic local RevenueOS',
    engine: 'native n8n',
    proposals: rows.map(({ object, status, localEffects, attempts, sameReceipt, reviewRequired }) => ({
      object, status, localEffects, attempts, sameReceipt, reviewRequired,
    })),
    persistedProposals: 3,
    externalActions: 0,
    scope: 'Fresh local run per invocation; the same event is replayed within its run. No review or execution call.',
  }, null, 2));
} catch {
  console.error('Salesforce n8n acceptance failed at ' + step + '.');
  process.exitCode = 1;
}
