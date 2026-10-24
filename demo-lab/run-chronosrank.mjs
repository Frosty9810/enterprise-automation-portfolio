import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openChronosRank } from './chronosrank-core.mjs';
import { chronosExample } from './chronosrank-fixtures.mjs';

// Authored synthetic examples, not held-out model evaluation or a latency benchmark.
const dir = mkdtempSync(join(tmpdir(), 'chronosrank-acceptance-')), path = join(dir, 'memory.sqlite');
let engine = openChronosRank(path);
try {
  for (const event of chronosExample.events) engine.append(event);
  const results = chronosExample.queries.map((scenario) => {
    const receipt = engine.retrieve(scenario.request);
    assert.equal(receipt.status, scenario.expected.status); assert.deepEqual(receipt.selected.map((memory) => memory.memoryId), scenario.expected.memoryIds);
    return { scenario: scenario.id, status: receipt.status, selected: receipt.selected.map((memory) => memory.memoryId), excluded: receipt.excluded, receiptId: receipt.id };
  });
  engine.feedback({ commandId: 'fixture-feedback', tenant: 'acme', receiptId: chronosExample.queries[0].request.requestId, outcome: 'useful', note: 'Scripted review confirms the exact authored fixture expectation.' });
  const first = engine.receipt({ tenant: 'acme', receiptId: chronosExample.queries[0].request.requestId }), before = engine.verifyAudit({ tenant: 'acme' });
  engine.close(); engine = openChronosRank(path);
  assert.deepEqual(engine.receipt({ tenant: 'acme', receiptId: first.id }), first); assert.deepEqual(engine.verifyAudit({ tenant: 'acme' }), before);
  assert.equal(engine.append(chronosExample.events[0]).replayed, true);
  console.log(JSON.stringify({ passed: true, scenarios: results.length, results, restart: true, acmeAudit: before, betaAudit: engine.verifyAudit({ tenant: 'beta' }),
    scope: 'Seven scripted synthetic expectations in file-backed SQLite, followed by close/reopen receipt verification and command replay. Deterministic token overlap only; no trained reranker, model benchmark, calibrated confidence, authenticated tenancy or production latency measurement.' }, null, 2));
} finally { engine.close(); rmSync(dir, { recursive: true, force: true }); }
