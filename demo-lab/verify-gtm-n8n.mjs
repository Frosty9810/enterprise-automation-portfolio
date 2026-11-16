import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./n8n.mjs', import.meta.url));
const workflow = fileURLToPath(new URL('./gtm-agent-n8n.json', import.meta.url));
const nodeArgs = { timeout: 120_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true };
const runN8n = promisify(execFile);
const base = 'http://127.0.0.1:5680/api/gtm/';

async function executeWorkflow() {
  const { stdout } = await runN8n(process.execPath, [cli, 'execute', '--id=PortfolioGtm0011', '--rawOutput'], nodeArgs);
  // The pinned n8n CLI writes diagnostics before its formatted JSON document.
  const json = stdout.match(/^\{\r?\n\s+"data": [\s\S]*?^\}/m)?.[0];
  assert.ok(json);
  const execution = JSON.parse(json);
  assert.equal(execution.status, 'success');
  assert.equal(execution.finished, true);
  const run = execution.data.resultData.runData['Prepare reviewed CRM action'][0];
  assert.equal(run.executionStatus, 'success');
  assert.equal(run.data.main[0].length, 1);
  return run.data.main[0][0].json;
}

async function request(operation, input, status = 200) {
  const response = await fetch(base + operation, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Client': 'local-showcase' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, status);
  return response.json();
}

function verifyResult(result, status, effects, events) {
  assert.equal(result.receipt.status, status);
  assert.equal(result.audit.valid, true);
  assert.equal(result.audit.effectCount, effects);
  assert.equal(result.audit.eventCount, events.length);
  assert.deepEqual(result.audit.events.map(event => event.type), events);
}

let step = 'import workflow';
try {
  await runN8n(process.execPath, [cli, 'import:workflow', '--input=' + workflow], nodeArgs);

  step = 'prepare a fresh proposal in n8n (requires a fresh GTM demo run)';
  const proposal = await executeWorkflow();
  verifyResult(proposal, 'pending_review', 0, ['prepared']);
  assert.equal(proposal.scenario.id, 'supplier-signal');
  assert.equal(proposal.receipt.replayed, false);
  const { id: receiptId, proposalHash: expectedHash } = proposal.receipt;
  assert.ok(receiptId);
  assert.match(expectedHash, /^[a-f0-9]{64}$/);
  const lookup = { receiptId };

  step = 'replay the pending proposal in n8n';
  const pending = await executeWorkflow();
  verifyResult(pending, 'pending_review', 0, ['prepared']);
  assert.deepEqual(pending.receipt, { ...proposal.receipt, replayed: true });
  assert.deepEqual(pending.audit, proposal.audit);

  step = 'enforce preapproval and exact-hash guards';
  const early = await request('execute', lookup, 400);
  assert.match(early.error, /awaiting independent review/);
  const wrongHash = (expectedHash[0] === '0' ? '1' : '0') + expectedHash.slice(1);
  const incorrect = await request('review', { ...lookup, expectedHash: wrongHash, decision: 'approve' }, 400);
  assert.match(incorrect.error, /exact immutable proposal hash/);
  assert.deepEqual(await request('inspect', lookup), proposal);

  step = 'approve the exact proposal without creating a task';
  const approved = await request('review', { ...lookup, expectedHash, decision: 'approve' });
  verifyResult(approved, 'ready', 0, ['prepared', 'reviewed']);
  assert.equal(approved.receipt.id, receiptId);
  assert.equal(approved.receipt.review.proposalHash, expectedHash);
  assert.notEqual(approved.receipt.review.reviewer, proposal.receipt.actor);

  step = 'execute the approved action and replay its stored task';
  const executed = await request('execute', lookup);
  const executedEvents = ['prepared', 'reviewed', 'executed'];
  verifyResult(executed, 'executed', 1, executedEvents);
  assert.equal(executed.receipt.id, receiptId);
  assert.equal(executed.receipt.effect.kind, 'internal-draft');
  assert.ok(executed.receipt.effect.id);
  const replay = await request('execute', lookup);
  assert.deepEqual(replay.receipt, { ...executed.receipt, replayed: true });
  assert.deepEqual(replay.audit, executed.audit);

  step = 'reload the executed receipt through n8n';
  const reloaded = await executeWorkflow();
  assert.deepEqual(reloaded, replay);

  step = 'refuse an instruction-marked source without writing a task';
  const blocked = await request('plan', { scenarioId: 'marked-instruction', runId: randomUUID() });
  verifyResult(blocked, 'blocked', 0, ['prepared']);
  assert.match(blocked.receipt.reasons.join(' '), /instruction-marked source is blocked/);
  const blockedLookup = { receiptId: blocked.receipt.id };
  await request('review', { ...blockedLookup, expectedHash: blocked.receipt.proposalHash, decision: 'approve' }, 400);
  await request('execute', blockedLookup, 400);
  assert.deepEqual(await request('inspect', blockedLookup), blocked);

  console.log(JSON.stringify({
    fixture: 'synthetic local GTM',
    initialProposal: { status: 'pending_review', effects: 0 },
    pendingReplay: { sameReceipt: true, effects: 0 },
    prematureExecutionRejected: true,
    wrongProposalHashRejected: true,
    approval: { effects: 0 },
    execution: { effects: 1, auditEvents: executedEvents },
    executionReplay: { sameTask: true, effects: 1 },
    nativeReload: { sameReceipt: true, sameTask: true },
    instructionFixture: { status: 'blocked', effects: 0 },
  }, null, 2));
} catch {
  // Raw n8n execution output can include runtime metadata, including resume tokens.
  console.error('GTM native acceptance failed at step: ' + step + '.');
  process.exitCode = 1;
}
