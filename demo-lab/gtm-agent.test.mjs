import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGtmAgent } from './gtm-agent.mjs';
import { openTrustGate } from './trustgate-core.mjs';

function setup(t) {
  const gateway = openTrustGate();
  t.after(() => gateway.close());
  return { gateway, agent: createGtmAgent(gateway) };
}

const safePlan = { scenarioId: 'supplier-signal', runId: 'fixture-run' };

test('a planned signal requires exact independent review and can only create one local task', t => {
  const { gateway, agent } = setup(t);
  const planned = agent.plan(safePlan);
  const { id: receiptId, proposalHash: expectedHash } = planned.receipt;
  const lookup = { receiptId };
  assert.equal(planned.receipt.status, 'pending_review');
  assert.equal(planned.scenario.signal, planned.receipt.arguments.summary);
  assert.equal(planned.receipt.provenance.summary.trust, 'untrusted-document');
  assert.equal(planned.receipt.provenance.caseId.trust, 'trusted-user');
  assert.deepEqual(planned.audit.events.map(event => event.type), ['prepared']);
  assert.equal(planned.audit.effectCount, 0);
  assert.equal(agent.plan(safePlan).receipt.id, receiptId);
  assert.throws(() => agent.execute(lookup), { code: 'not_ready' });
  assert.throws(() => agent.review({ ...lookup, expectedHash: '0'.repeat(64), decision: 'approve' }), { code: 'hash_mismatch' });
  const reviewed = agent.review({ ...lookup, expectedHash, decision: 'approve' });
  assert.equal(reviewed.receipt.status, 'ready');
  assert.notEqual(reviewed.receipt.review.reviewer, reviewed.receipt.actor);
  assert.equal(reviewed.audit.effectCount, 0);
  const executed = agent.execute(lookup);
  assert.equal(executed.receipt.status, 'executed');
  assert.equal(executed.receipt.effect.kind, 'internal-draft');
  assert.equal(executed.audit.valid, true);
  assert.equal(executed.audit.effectCount, 1);
  assert.deepEqual(executed.audit.events.map(event => event.type), ['prepared', 'reviewed', 'executed']);
  const replay = agent.execute(lookup);
  assert.equal(replay.receipt.replayed, true);
  assert.deepEqual(replay.receipt.effect, executed.receipt.effect);
  assert.deepEqual(agent.inspect(lookup).audit, executed.audit);
  assert.equal(replay.audit.eventCount, 3);
  assert.equal(gateway.state({ tenant: 'acme' }).tasks.length, 1);
  assert.equal(gateway.state({ tenant: 'acme' }).publicNotes.length, 0);
});

test('instruction-marked signals stay blocked and a reviewer cannot bypass policy', t => {
  const { gateway, agent } = setup(t);
  const planned = agent.plan({ scenarioId: 'marked-instruction', runId: 'fixture-run' });
  const { id: receiptId, proposalHash: expectedHash } = planned.receipt;
  assert.equal(planned.receipt.status, 'blocked');
  assert.match(planned.receipt.reasons.join(' '), /instruction-marked/);
  assert.throws(() => agent.review({ receiptId, expectedHash, decision: 'approve' }), { code: 'policy_blocked' });
  assert.throws(() => agent.execute({ receiptId }), { code: 'policy_blocked' });
  assert.equal(agent.inspect({ receiptId }).audit.eventCount, 1);
  assert.equal(gateway.state({ tenant: 'acme' }).tasks.length, 0);
});

test('a rejected proposal stays inspectable without creating a task', t => {
  const { agent } = setup(t);
  const { id: receiptId, proposalHash: expectedHash } = agent.plan(safePlan).receipt;
  const rejected = agent.review({ receiptId, expectedHash, decision: 'reject' });
  assert.equal(rejected.receipt.status, 'rejected');
  assert.throws(() => agent.execute({ receiptId }), { code: 'not_ready' });
  assert.equal(agent.inspect({ receiptId }).audit.effectCount, 0);
});

test('only the fixed scenario source and tool can enter the GTM workflow', t => {
  const { agent, gateway } = setup(t);
  assert.equal(agent.catalog().scenarios.length, 2);
  for (const extra of ['sourceId', 'summary', 'bindings', 'actor', 'tenant', 'tool', 'decision']) {
    assert.throws(() => agent.plan({ ...safePlan, [extra]: 'injected' }), { code: 'invalid_input' });
  }
  assert.throws(() => agent.plan({ ...safePlan, runId: 'bad.dot' }), { code: 'invalid_input' });
  assert.throws(() => agent.plan({ ...safePlan, scenarioId: 'unknown' }), { code: 'invalid_input' });
  const unrelated = gateway.prepare(gateway.catalog().scenarios.find(entry => entry.id === 'public-note').proposal);
  assert.throws(() => agent.inspect({ receiptId: unrelated.id }), { code: 'not_found' });
  const impostor = gateway.prepare({
    ...gateway.catalog().scenarios.find(entry => entry.id === 'public-note').proposal,
    commandId: 'gtm-demo.supplier-signal.forged',
  });
  assert.throws(() => agent.execute({ receiptId: impostor.id }), { code: 'not_found' });
  const receipt = agent.plan(safePlan).receipt;
  assert.throws(() => agent.review({ receiptId: receipt.id, expectedHash: receipt.proposalHash, decision: 'approve', reviewer: 'acme-operator' }), { code: 'invalid_input' });
});

test('the same run and executed receipt replay after reopening the SQLite ledger', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-ledger-'));
  let gateway;
  try {
    const path = join(dir, 'demo.sqlite');
    gateway = openTrustGate(path);
    let agent = createGtmAgent(gateway);
    const { id: receiptId, proposalHash: expectedHash } = agent.plan(safePlan).receipt;
    agent.review({ receiptId, expectedHash, decision: 'approve' });
    const effect = agent.execute({ receiptId }).receipt.effect;
    gateway.close();
    gateway = undefined;
    gateway = openTrustGate(path);
    agent = createGtmAgent(gateway);
    const replay = agent.plan(safePlan);
    assert.equal(replay.receipt.id, receiptId);
    assert.equal(replay.receipt.replayed, true);
    assert.equal(replay.audit.eventCount, 3);
    assert.deepEqual(agent.execute({ receiptId }).receipt.effect, effect);
    assert.equal(gateway.state({ tenant: 'acme' }).tasks.length, 1);
  } finally {
    gateway?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
