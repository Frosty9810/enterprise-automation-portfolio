import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { chronosRank, openChronosRank } from './chronosrank-core.mjs';
import { chronosExample } from './chronosrank-fixtures.mjs';

const at = (day = 20, hour = '09') => `2026-10-${day}T${hour}:00:00.000Z`;
const memory = (extra = {}) => ({ commandId: 'remember-1', tenant: 'acme', kind: 'remember', memoryId: 'm-1', entity: 'policy', text: 'Synthetic delivery arrives Tuesday.', provenance: { sourceId: 'source-1', quote: 'Synthetic delivery arrives Tuesday.' }, recordedAt: at(), validFrom: at(), expiresAt: null, ...extra });
const query = (extra = {}) => ({ requestId: 'query-1', tenant: 'acme', entity: 'policy', query: 'delivery arrives', asOf: at(21), threshold: 100, limit: 3, ...extra });
const feedback = (extra = {}) => ({ commandId: 'feedback-1', tenant: 'acme', receiptId: 'query-1', outcome: 'useful', note: 'Synthetic fixture review only.', ...extra });
const withEngine = (run) => { const engine = openChronosRank(); try { return run(engine); } finally { engine.close(); } };
const seeded = (engine) => { for (const event of chronosExample.events) engine.append(event); };

test('all seven authored scenarios exercise exact temporal, tie and tenant outcomes', () => withEngine((engine) => {
  seeded(engine);
  for (const scenario of chronosExample.queries) {
    const result = engine.retrieve(scenario.request);
    assert.equal(result.status, scenario.expected.status, scenario.id);
    assert.deepEqual(result.selected.map((item) => item.memoryId), scenario.expected.memoryIds, scenario.id);
    assert.equal(result.snapshot, true); assert.equal(result.stale, false); assert.match(result.implementationHash, /^[a-f0-9]{64}$/u);
  }
  assert.equal(engine.verifyAudit({ tenant: 'acme' }).eventCount, 5);
  assert.equal(engine.verifyAudit({ tenant: 'beta' }).eventCount, 1);
}));

test('retrieval returns exact supplied quote and rejects invented provenance', () => withEngine((engine) => {
  const source = memory({ provenance: { sourceId: 'source-1', quote: 'Header: Synthetic delivery arrives Tuesday. Footer.' } });
  engine.append(source); const result = engine.retrieve(query());
  assert.equal(result.selected[0].text, source.text); assert.deepEqual(result.selected[0].provenance, source.provenance);
  assert.throws(() => engine.append(memory({ commandId: 'bad-quote', memoryId: 'm-2', provenance: { sourceId: 'source-2', quote: 'Delivery is Wednesday.' } })), /occur exactly/u);
}));

test('future-recorded and future-valid memories cannot be selected', () => withEngine((engine) => {
  engine.append(memory({ recordedAt: at(22), validFrom: at(23) }));
  assert.equal(engine.retrieve(query()).selected.length, 0);
  assert.equal(engine.retrieve(query({ requestId: 'known', asOf: at(22) })).excluded[0].reason, 'not-yet-valid');
  assert.equal(engine.retrieve(query({ requestId: 'valid', asOf: at(23) })).selected.length, 1);
}));

test('configured expiration is exclusive at exact millisecond boundary', () => withEngine((engine) => {
  engine.append(memory({ expiresAt: at(21) }));
  assert.equal(engine.retrieve(query({ requestId: 'before', asOf: '2026-10-21T08:59:59.999Z' })).status, 'retrieved');
  const result = engine.retrieve(query()); assert.equal(result.status, 'abstained'); assert.equal(result.excluded[0].reason, 'expired');
}));

test('explicit expiration is audited without deleting old memory or historical retrieval', () => withEngine((engine) => {
  engine.append(memory()); engine.append({ tenant: 'acme', commandId: 'expire', kind: 'expire', memoryId: 'm-1', recordedAt: at(21) });
  assert.equal(engine.retrieve(query({ requestId: 'before', asOf: at(20) })).status, 'retrieved');
  assert.equal(engine.retrieve(query()).excluded[0].reason, 'expired');
  assert.equal(engine.history({ tenant: 'acme' }).events.length, 2);
  assert.throws(() => engine.append({ tenant: 'acme', commandId: 'expire-again', kind: 'expire', memoryId: 'm-1', recordedAt: at(21) }), /already has/u);
}));

test('future-valid successor replaces at equality and never revives expired predecessor', () => withEngine((engine) => {
  engine.append(memory());
  engine.append(memory({ commandId: 'replace', kind: 'supersede', memoryId: 'm-2', supersedes: 'm-1', recordedAt: at(21), validFrom: at(22), expiresAt: at(23) }));
  assert.deepEqual(engine.retrieve(query()).selected.map((item) => item.memoryId), ['m-1']);
  assert.deepEqual(engine.retrieve(query({ requestId: 'replacement', asOf: at(22) })).selected.map((item) => item.memoryId), ['m-2']);
  const expired = engine.retrieve(query({ requestId: 'expired-successor', asOf: at(23) }));
  assert.equal(expired.status, 'abstained'); assert.equal(expired.excluded.find((item) => item.memoryId === 'm-1').reason, 'superseded');
}));

test('explicitly expired successor cannot revive predecessor and supersession chains remain closed', () => withEngine((engine) => {
  engine.append(memory()); engine.append(memory({ commandId: 's2', kind: 'supersede', memoryId: 'm-2', supersedes: 'm-1', recordedAt: at(21), validFrom: at(21) }));
  engine.append(memory({ commandId: 's3', kind: 'supersede', memoryId: 'm-3', supersedes: 'm-2', recordedAt: at(22), validFrom: at(22) }));
  engine.append({ commandId: 'e3', tenant: 'acme', kind: 'expire', memoryId: 'm-3', recordedAt: at(23) });
  assert.equal(engine.retrieve(query({ asOf: at(23) })).status, 'abstained');
}));

test('inverted future-valid supersession chains are rejected before any state change', () => withEngine((engine) => {
  engine.append(memory());
  engine.append(memory({ commandId: 'future', kind: 'supersede', memoryId: 'm-2', supersedes: 'm-1', recordedAt: at(21), validFrom: at(25) }));
  const before = engine.verifyAudit({ tenant: 'acme' });
  assert.throws(() => engine.append(memory({ commandId: 'inverted', kind: 'supersede', memoryId: 'm-3', supersedes: 'm-2', recordedAt: at(22), validFrom: at(23) })), /cannot precede/u);
  assert.deepEqual(engine.verifyAudit({ tenant: 'acme' }), before);
  assert.deepEqual(engine.retrieve(query({ asOf: at(23) })).selected.map((item) => item.memoryId), ['m-1']);
}));

test('supersession cannot cross tenant or entity, fork an existing successor, or reuse immutable IDs', () => withEngine((engine) => {
  engine.append(memory());
  const replacement = memory({ commandId: 'replace', kind: 'supersede', memoryId: 'm-2', supersedes: 'm-1', recordedAt: at(21), validFrom: at(21) });
  assert.throws(() => engine.append({ ...replacement, tenant: 'beta' }), /does not exist/u);
  assert.throws(() => engine.append({ ...replacement, entity: 'different' }), /same entity/u);
  engine.append(replacement);
  assert.throws(() => engine.append({ ...replacement, commandId: 'fork', memoryId: 'm-3' }), /successor/u);
  assert.throws(() => engine.append(memory({ commandId: 'duplicate', recordedAt: at(21) })), /already exists/u);
}));

test('memory ids and commands are independent across tenant ledgers with no history leakage', () => withEngine((engine) => {
  engine.append(memory()); engine.append(memory({ tenant: 'beta' })); engine.retrieve(query());
  assert.equal(engine.history({ tenant: 'beta' }).events.length, 1); assert.equal(engine.history({ tenant: 'beta' }).receipts.length, 0);
  assert.throws(() => engine.receipt({ tenant: 'beta', receiptId: 'query-1' }), /not found/u);
  assert.throws(() => engine.feedback(feedback({ tenant: 'beta' })), /same tenant/u);
  engine.append({ tenant: 'beta', commandId: 'expire', kind: 'expire', memoryId: 'm-1', recordedAt: at(21) });
  assert.equal(engine.retrieve(query({ requestId: 'acme-safe' })).status, 'retrieved');
}));

test('same tenant different entities do not mix candidates or disclose excluded IDs', () => withEngine((engine) => {
  engine.append(memory()); const result = engine.retrieve(query({ entity: 'other-policy' }));
  assert.deepEqual(result.selected, []); assert.deepEqual(result.excluded, []);
}));

test('equal top scores with distinct text abstain but duplicated exact text keeps deterministic citations', () => withEngine((engine) => {
  engine.append(memory()); engine.append(memory({ commandId: 'remember-2', memoryId: 'm-2' }));
  assert.deepEqual(engine.retrieve(query({ requestId: 'duplicate-text', limit: 1 })).selected.map((item) => item.memoryId), ['m-1']);
  const text = 'Synthetic delivery arrives Thursday.';
  engine.append(memory({ commandId: 'remember-3', memoryId: 'm-3', recordedAt: at(21), text, provenance: { sourceId: 'source-3', quote: text } }));
  const result = engine.retrieve(query()); assert.equal(result.status, 'abstained'); assert.match(result.explanation, /Distinct/u);
}));

test('integer lexical overlap is deterministic, bounded, and threshold inclusive', () => withEngine((engine) => {
  engine.append(memory());
  const result = engine.retrieve(query({ query: 'delivery arrives parcel', threshold: 66 }));
  assert.equal(result.selected[0].score, 66); assert.match(result.explanation, /not a probability/u);
  assert.equal(engine.retrieve(query({ requestId: 'strict', query: 'delivery arrives parcel', threshold: 67 })).status, 'abstained');
  assert.equal(engine.retrieve(query({ requestId: 'repeated', query: 'DELIVERY delivery arrives' })).selected[0].score, 100);
}));

test('canonical UTC input rejects rollovers, missing milliseconds, offsets and non-real dates', () => withEngine((engine) => {
  for (const invalid of ['2026-02-30T09:00:00.000Z', '2026-10-20T24:00:00.000Z', '2026-10-20T09:00:00Z', '2026-10-20T09:00:00.000+00:00', '2026-13-01T00:00:00.000Z', '2026-12-32T00:00:00.000Z']) {
    assert.throws(() => engine.append(memory({ recordedAt: invalid })), /canonical UTC/u, invalid);
    assert.throws(() => engine.retrieve(query({ asOf: invalid })), /canonical UTC/u, invalid);
  }
  assert.throws(() => engine.append(memory({ expiresAt: at() })), /strictly after/u);
}));

test('strict input validation rejects unknown fields, dangerous keys, malformed IDs and invalid thresholds', () => withEngine((engine) => {
  assert.throws(() => engine.append({ ...memory(), authority: 'trusted' }), /exactly/u);
  assert.throws(() => engine.append(JSON.parse(JSON.stringify(memory()).replace('"tenant":"acme"', '"tenant":"acme","__proto__":{}'))), /Prototype/u);
  assert.throws(() => engine.append(memory({ tenant: '../beta' })), /invalid/u);
  assert.throws(() => engine.append(memory({ provenance: { sourceId: 's', quote: 'Synthetic delivery arrives Tuesday.', verified: true } })), /exactly/u);
  for (const threshold of [0, 101, 50.5, '100', NaN]) assert.throws(() => engine.retrieve(query({ threshold })));
  for (const limit of [0, 11, 1.2, '3']) assert.throws(() => engine.retrieve(query({ limit })));
  for (const invalidQuery of ['!!!', '', 'word '.repeat(200), Array(33).fill(0).map((_, n) => `q${n}`).join(' ')]) assert.throws(() => engine.retrieve(query({ query: invalidQuery })));
}));

test('immutable append/retrieval/feedback replays preserve their exact result and reject changed input', () => withEngine((engine) => {
  assert.equal(engine.append(memory()).replayed, false); assert.equal(engine.append(memory()).replayed, true);
  assert.throws(() => engine.append(memory({ entity: 'other' })), /immutable/u);
  const first = engine.retrieve(query()), replay = engine.retrieve(query()); assert.equal(replay.replayed, true); assert.deepEqual(replay.selected, first.selected);
  assert.throws(() => engine.retrieve(query({ query: 'different' })), /immutable/u);
  assert.equal(engine.feedback(feedback()).replayed, false); assert.equal(engine.feedback(feedback()).replayed, true);
  assert.throws(() => engine.feedback(feedback({ outcome: 'not-useful' })), /immutable/u);
  assert.throws(() => engine.feedback(feedback({ commandId: 'remember-1' })), /immutable/u);
  assert.equal(engine.verifyAudit({ tenant: 'acme' }).entryCount, 3);
}));

test('receipt replay remains an explicitly stale historical snapshot after memory append', () => withEngine((engine) => {
  engine.append(memory()); const first = engine.retrieve(query());
  engine.append({ commandId: 'expire', tenant: 'acme', kind: 'expire', memoryId: 'm-1', recordedAt: at(21) });
  const old = engine.retrieve(query()); assert.equal(old.stale, true); assert.equal(old.snapshot, true); assert.equal(old.status, 'retrieved'); assert.deepEqual(old.selected, first.selected);
  assert.equal(engine.receipt({ tenant: 'acme', receiptId: 'query-1' }).stale, true);
  assert.equal(engine.history({ tenant: 'acme' }).receipts[0].stale, true);
  assert.equal(engine.retrieve(query({ requestId: 'new-window' })).status, 'abstained');
}));

test('receipts and feedback do not falsely mark an unchanged memory snapshot stale', () => withEngine((engine) => {
  engine.append(memory()); engine.retrieve(query()); engine.feedback(feedback()); engine.retrieve(query({ requestId: 'second' }));
  assert.equal(engine.receipt({ tenant: 'acme', receiptId: 'query-1' }).stale, false);
}));

test('knowledge watermark blocks late backdating across both memory and observed retrieval windows', () => withEngine((engine) => {
  engine.append(memory());
  assert.throws(() => engine.append(memory({ commandId: 'earlier', memoryId: 'm-2', recordedAt: at(19) })), /watermark/u);
  engine.retrieve(query({ asOf: at(23) }));
  assert.throws(() => engine.append(memory({ commandId: 'late', memoryId: 'm-2', recordedAt: at(22) })), /watermark/u);
  engine.append(memory({ commandId: 'equal', memoryId: 'm-2', recordedAt: at(23) }));
  assert.equal(engine.history({ tenant: 'acme' }).knowledgeWatermark, at(23));
}));

test('feedback is append-only input, not a trained ranking update', () => withEngine((engine) => {
  engine.append(memory()); const before = engine.retrieve(query()); engine.feedback(feedback({ outcome: 'not-useful' }));
  const after = engine.retrieve(query({ requestId: 'after' })); assert.deepEqual(after.selected, before.selected);
  const rows = engine.history({ tenant: 'acme' }).feedback; assert.equal(rows.length, 1); assert.equal(rows[0].outcome, 'not-useful');
  assert.throws(() => engine.feedback(feedback({ commandId: 'invalid', outcome: 'approved' })), /Unknown/u);
  assert.throws(() => engine.feedback(feedback({ commandId: 'empty', note: ' ' })), /nonempty/u);
}));

test('returned objects and fixture catalog cannot mutate persisted state', () => withEngine((engine) => {
  const event = memory(); engine.append(event); event.text = 'Changed caller text';
  const first = engine.retrieve(query()); first.selected[0].text = 'Changed returned text';
  const history = engine.history({ tenant: 'acme' }); history.events[0].text = 'Changed history';
  const catalog = engine.catalog(); catalog.example.events[0].tenant = 'changed';
  assert.equal(engine.receipt({ tenant: 'acme', receiptId: 'query-1' }).selected[0].text, 'Synthetic delivery arrives Tuesday.');
  assert.equal(engine.catalog().example.events[0].tenant, 'acme'); assert.equal(engine.verifyAudit({ tenant: 'acme' }).valid, true);
}));

test('failed event or receipt insertion rolls back ledger, head, watermark and retry identity', () => {
  const db = new DatabaseSync(':memory:'), engine = chronosRank(db);
  try {
    db.exec("CREATE TRIGGER reject_head BEFORE INSERT ON chronosrank_heads BEGIN SELECT RAISE(ABORT, 'injected head failure'); END");
    assert.throws(() => engine.append(memory()), /injected head failure/u); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chronosrank_log').get().n, 0);
    db.exec('DROP TRIGGER reject_head'); engine.append(memory());
    db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON chronosrank_log WHEN NEW.operation='retrieve' BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END");
    assert.throws(() => engine.retrieve(query({ asOf: at(25) })), /injected receipt failure/u);
    assert.equal(engine.history({ tenant: 'acme' }).knowledgeWatermark, at()); assert.equal(engine.history({ tenant: 'acme' }).receipts.length, 0);
    db.exec('DROP TRIGGER reject_receipt'); assert.equal(engine.retrieve(query()).status, 'retrieved');
  } finally { db.close(); }
});

test('corrupt event data, receipts, input hashes, ordering links and truncated tails fail closed', () => {
  const mutations = [
    "UPDATE chronosrank_log SET body='{}' WHERE operation='append'",
    "UPDATE chronosrank_log SET body='{}' WHERE operation='retrieve'",
    "UPDATE chronosrank_log SET request_hash='bad' WHERE operation='append'",
    "UPDATE chronosrank_log SET prev_hash='bad' WHERE operation='retrieve'",
    "DELETE FROM chronosrank_log WHERE operation='retrieve'",
    "UPDATE chronosrank_heads SET count=count+1",
  ];
  for (const sql of mutations) {
    const db = new DatabaseSync(':memory:'), engine = chronosRank(db);
    try {
      engine.append(memory()); engine.retrieve(query()); db.exec(sql);
      assert.equal(engine.verifyAudit({ tenant: 'acme' }).valid, false, sql);
      assert.throws(() => engine.history({ tenant: 'acme' }), /integrity/u, sql);
      assert.throws(() => engine.retrieve(query({ requestId: 'new' })), /integrity/u, sql);
      assert.throws(() => engine.feedback(feedback()), /integrity/u, sql);
      assert.throws(() => engine.append(memory({ commandId: 'next', memoryId: 'm-2', recordedAt: at(21) })), /integrity/u, sql);
      assert.throws(() => engine.receipt({ tenant: 'acme', receiptId: 'query-1' }), /integrity/u, sql);
    } finally { db.close(); }
  }
});

test('reopening the same SQLite file preserves immutable source, receipt, feedback and head', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chronosrank-restart-')), path = join(dir, 'memory.sqlite'); let engine = openChronosRank(path);
  try {
    engine.append(memory()); const first = engine.retrieve(query()); engine.feedback(feedback()); const audit = engine.verifyAudit({ tenant: 'acme' }); engine.close(); engine = openChronosRank(path);
    assert.deepEqual(engine.receipt({ tenant: 'acme', receiptId: 'query-1' }).selected, first.selected); assert.deepEqual(engine.verifyAudit({ tenant: 'acme' }), audit);
    assert.equal(engine.append(memory()).replayed, true); assert.equal(engine.feedback(feedback()).replayed, true);
  } finally { engine.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('separate-process restart reads the same durable receipt and command replay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chronosrank-process-')), path = join(dir, 'memory.sqlite');
  try {
    const engine = openChronosRank(path); engine.append(memory()); engine.retrieve(query()); engine.close();
    const code = `import {openChronosRank} from ${JSON.stringify(new URL('./chronosrank-core.mjs', import.meta.url).href)}; const e=openChronosRank(process.argv[1]); try { console.log(JSON.stringify({receipt:e.receipt({tenant:'acme',receiptId:'query-1'}),append:e.append(${JSON.stringify(memory())}),audit:e.verifyAudit({tenant:'acme'})})); } finally {e.close();}`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, path], { encoding: 'utf8' }); assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout); assert.equal(result.receipt.status, 'retrieved'); assert.equal(result.append.replayed, true); assert.equal(result.audit.valid, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('independent connections see committed changes and exact duplicate replays', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chronosrank-connections-')), path = join(dir, 'memory.sqlite'); const a = openChronosRank(path), b = openChronosRank(path);
  try { a.append(memory()); assert.equal(b.append(memory()).replayed, true); a.retrieve(query()); assert.equal(b.receipt({ tenant: 'acme', receiptId: 'query-1' }).status, 'retrieved'); assert.equal(b.verifyAudit({ tenant: 'acme' }).entryCount, 2); }
  finally { a.close(); b.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('receipt source hash drift after restart is stale while the original snapshot remains inspectable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chronosrank-source-drift-')), path = join(dir, 'memory.sqlite');
  try {
    const original = openChronosRank(path); original.append(memory()); const first = original.retrieve(query()); original.close();
    const modifiedModule = join(dir, 'chronosrank-core.mjs');
    writeFileSync(modifiedModule, `${readFileSync(new URL('./chronosrank-core.mjs', import.meta.url), 'utf8')}\n// Synthetic code-byte change for restart evidence.\n`);
    writeFileSync(join(dir, 'chronosrank-fixtures.mjs'), readFileSync(new URL('./chronosrank-fixtures.mjs', import.meta.url)));
    const code = `import {openChronosRank} from ${JSON.stringify(pathToFileURL(modifiedModule).href)}; const e=openChronosRank(process.argv[1]); try { console.log(JSON.stringify(e.receipt({tenant:'acme',receiptId:'query-1'}))); } finally {e.close();}`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, path], { encoding: 'utf8' }); assert.equal(child.status, 0, child.stderr);
    const saved = JSON.parse(child.stdout); assert.equal(saved.stale, true); assert.equal(saved.implementationHash, first.implementationHash); assert.notEqual(saved.currentImplementationHash, saved.implementationHash); assert.deepEqual(saved.selected, first.selected);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('running process rejects ledger operations if its implementation bytes change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chronosrank-live-drift-')), path = join(dir, 'memory.sqlite');
  try {
    const modulePath = join(dir, 'chronosrank-core.mjs');
    writeFileSync(modulePath, readFileSync(new URL('./chronosrank-core.mjs', import.meta.url))); writeFileSync(join(dir, 'chronosrank-fixtures.mjs'), readFileSync(new URL('./chronosrank-fixtures.mjs', import.meta.url)));
    const code = `import {openChronosRank} from ${JSON.stringify(pathToFileURL(modulePath).href)}; import {appendFileSync} from 'node:fs'; const e=openChronosRank(process.argv[1]); try {e.append(${JSON.stringify(memory())}); appendFileSync(${JSON.stringify(modulePath)}, '\\n// live source change\\n'); try {e.history({tenant:'acme'}); process.exitCode=2;} catch(error) { console.log(JSON.stringify({code:error.code,message:error.message})); }} finally {e.close();}`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, path], { encoding: 'utf8' }); assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).code, 'restart_required');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('simultaneous process writers serialize duplicate commands to one committed effect', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chronosrank-concurrent-')), path = join(dir, 'memory.sqlite'); const initializer = openChronosRank(path); initializer.close();
  const children = [];
  try {
    const code = `import {openChronosRank} from ${JSON.stringify(new URL('./chronosrank-core.mjs', import.meta.url).href)}; const e=openChronosRank(process.argv[1]); console.log('ready'); process.stdin.once('data',()=>{try { const result=e.append(${JSON.stringify(memory())}); console.log(JSON.stringify(result)); } finally {e.close();process.stdin.destroy();}});`;
    const start = () => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, path], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
      let output = '', errors = '', ready;
      const readyPromise = new Promise((resolve, reject) => { ready = resolve; child.once('error', reject); });
      child.stdout.on('data', (chunk) => { output += chunk; if (output.includes('ready\n') || output.includes('ready\r\n')) ready(); }); child.stderr.on('data', (chunk) => { errors += chunk; });
      const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (status) => { if (status === 0) resolve(JSON.parse(output.trim().split(/\r?\n/u).at(-1))); else reject(new Error(errors || `Child exit ${status}`)); }); });
      return { child, ready: readyPromise, done };
    };
    const a = start(), b = start(); await Promise.all([a.ready, b.ready]); a.child.stdin.write('go'); b.child.stdin.write('go');
    const results = await Promise.all([a.done, b.done]); assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
    const engine = openChronosRank(path); try { assert.equal(engine.verifyAudit({ tenant: 'acme' }).entryCount, 1); assert.equal(engine.history({ tenant: 'acme' }).events.length, 1); } finally { engine.close(); }
  } finally { for (const child of children) if (child.exitCode === null) child.kill(); rmSync(dir, { recursive: true, force: true }); }
});
