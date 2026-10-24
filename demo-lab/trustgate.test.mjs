import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openTrustGate, trustGate } from './trustgate-core.mjs';
import { runTrustGateFixtures } from './trustgate-fixtures.mjs';

const scope = { tenant: 'acme' };
const scenario = (gateway, name = 'reviewed-task', commandId) => {
  const proposal = structuredClone(gateway.catalog().scenarios.find((item) => item.id === name).proposal);
  if (commandId) proposal.commandId = commandId; return proposal;
};
const ref = (record) => ({ tenant: record.tenant, receiptId: record.id });
const approve = (gateway, record, changes = {}) => gateway.review({ ...ref(record), reviewer: 'acme-reviewer', decision: 'approve', note: 'Synthetic local review.', expectedHash: record.proposalHash, ...changes });
const fails = (fn, code) => assert.throws(fn, (error) => error.code === code, `Expected ${code}`);
const withGateway = (name, fn) => test(name, () => { const gateway = openTrustGate(); try { fn(gateway); } finally { gateway.close(); } });
const mutate = (gateway, record, edit) => { const stored = JSON.parse(gateway.db.prepare('SELECT body FROM trustgate_receipts WHERE tenant=? AND id=?').get(record.tenant, record.id).body); edit(stored); gateway.db.prepare('UPDATE trustgate_receipts SET body=? WHERE tenant=? AND id=?').run(JSON.stringify(stored), record.tenant, record.id); };
const temp = () => mkdtempSync(join(tmpdir(), 'trustgate-'));
function child(code) {
  return new Promise((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    process.stdout.on('data', (data) => { stdout += data; }); process.stderr.on('data', (data) => { stderr += data; });
    process.once('error', reject); process.once('exit', (code) => { if (code) reject(new Error(`Child failed (${code}): ${stderr}`)); else resolve(stdout.trim()); });
  });
}

withGateway('TrustGate catalog is synthetic, server owned and restricted to three local tools', (g) => {
  const catalog = g.catalog(); assert.deepEqual(catalog.tools.map((tool) => tool.id), ['read-public-policy', 'create-review-task', 'stage-public-note']);
  catalog.sources[0].classification = 'public-forged'; catalog.actors[0].grants.push('shell'); catalog.tools[0].args.url = {};
  assert.equal(g.catalog().sources[0].classification, 'public'); assert.equal(g.catalog().actors[0].grants.includes('shell'), false); assert.equal(g.catalog().tools[0].args.url, undefined);
  assert.match(catalog.scope, /not authentication/u);
});
withGateway('TrustGate performs a real SQL public policy read without mutation review', (g) => {
  const record = g.prepare(scenario(g, 'public-read')); assert.equal(record.status, 'ready'); assert.equal(record.review, null);
  const result = g.execute(ref(record)); assert.equal(result.status, 'executed'); assert.equal(result.effect.kind, 'policy-read'); assert.match(result.effect.policy.text, /public data/u);
  assert.deepEqual(g.state(scope), { tasks: [], publicNotes: [] }); assert.equal(g.verifyAudit(scope).valid, true);
});
withGateway('TrustGate resolves source provenance and creates a real internal draft after independent review', (g) => {
  const record = g.prepare(scenario(g)); assert.equal(record.status, 'pending_review'); assert.equal(record.provenance.summary.trust, 'untrusted-document'); assert.match(record.arguments.summary, /Friday/u);
  fails(() => g.execute(ref(record)), 'not_ready'); const reviewed = approve(g, record); assert.equal(reviewed.status, 'ready');
  const result = g.execute(ref(record)); assert.equal(result.effect.kind, 'internal-draft'); assert.equal(g.state(scope).tasks[0].summary, record.arguments.summary); assert.equal(g.verifyAudit(scope).valid, true);
});
withGateway('TrustGate public staging is local only, reviewed and public-classified', (g) => {
  const record = g.prepare(scenario(g, 'public-note')); approve(g, record); const result = g.execute(ref(record));
  assert.equal(result.effect.kind, 'public-outbox'); assert.equal(g.state(scope).publicNotes.length, 1); assert.equal(g.state(scope).tasks.length, 0); assert.equal(g.verifyAudit(scope).valid, true);
});
withGateway('TrustGate classification, instruction and target-identity violations cannot be approved or executed', (g) => {
  for (const name of ['blocked-private', 'blocked-injection', 'blocked-identity']) {
    const record = g.prepare(scenario(g, name)); assert.equal(record.status, 'blocked'); assert.ok(record.reasons.length);
    fails(() => approve(g, record), 'policy_blocked'); fails(() => g.execute(ref(record)), 'policy_blocked');
  }
  assert.deepEqual(g.state(scope), { tasks: [], publicNotes: [] }); assert.equal(g.verifyAudit(scope).valid, true);
});
withGateway('TrustGate safe untrusted summary is internal-only and cannot supply title or public body', (g) => {
  for (const [name, field] of [['reviewed-task', 'title'], ['public-note', 'body']]) {
    const proposal = scenario(g, name, `untrusted-${field}`); proposal.bindings[field] = { sourceId: 'supplier-email', key: field };
    assert.equal(g.prepare(proposal).status, 'blocked');
  }
  assert.equal(g.state(scope).publicNotes.length, 0);
});
withGateway('TrustGate permits internal-classified content only in the reviewed internal draft', (g) => {
  const proposal = scenario(g); proposal.bindings.summary = { sourceId: 'internal-price', key: 'summary' };
  const record = g.prepare(proposal); assert.equal(record.status, 'pending_review'); approve(g, record); g.execute(ref(record));
  assert.match(g.state(scope).tasks[0].summary, /Internal review only/u); assert.equal(g.state(scope).publicNotes.length, 0);
});
withGateway('TrustGate actor scopes are enforced before review', (g) => {
  const proposal = scenario(g); proposal.actor = 'acme-reader'; const record = g.prepare(proposal);
  assert.equal(record.status, 'blocked'); assert.match(record.reasons.join(' '), /scope/u); fails(() => approve(g, record), 'policy_blocked');
});
withGateway('TrustGate rejects unknown tools, free arguments, labels, malformed or incomplete bindings before writes', (g) => {
  const proposals = [];
  const a = scenario(g); a.tool = 'send-email'; proposals.push(a);
  const b = scenario(g); b.arguments = { summary: 'forged' }; proposals.push(b);
  const c = scenario(g); c.bindings.summary.trust = 'trusted-user'; proposals.push(c);
  const d = scenario(g); delete d.bindings.summary; proposals.push(d);
  const e = scenario(g); e.bindings.extra = { sourceId: 'intent-public', key: 'body' }; proposals.push(e);
  const f = scenario(g); f.bindings.summary.sourceId = 'missing'; proposals.push(f);
  const h = scenario(g); h.bindings.summary.key = 'missing'; proposals.push(h);
  const i = scenario(g); i.actor = 'unknown'; proposals.push(i);
  const j = scenario(g); j.bindings = null; proposals.push(j);
  for (const proposal of proposals) fails(() => g.prepare(proposal), 'invalid_input');
  assert.equal(g.history(scope).receipts.length, 0); assert.equal(g.audit(scope).events.length, 0);
});
withGateway('TrustGate prototype payloads, oversized identifiers and non-JSON inputs fail before writes', (g) => {
  const proposal = scenario(g); proposal.commandId = 'x'.repeat(81); fails(() => g.prepare(proposal), 'invalid_input');
  fails(() => g.prepare(JSON.parse('{"__proto__":{"polluted":true}}')), 'invalid_input');
  const forged = scenario(g); forged.bindings.summary = Object.create({ sourceId: 'supplier-email', key: 'summary' }); fails(() => g.prepare(forged), 'invalid_input');
  const array = scenario(g); array.bindings.summary = []; fails(() => g.prepare(array), 'invalid_input');
  assert.equal(g.history(scope).receipts.length, 0); assert.equal({}.polluted, undefined);
});
withGateway('TrustGate tenants isolate actors, source bindings, receipts, state and reviewer roles', (g) => {
  const crossActor = scenario(g); crossActor.actor = 'beta-operator'; fails(() => g.prepare(crossActor), 'tenant_mismatch');
  const crossSource = scenario(g); crossSource.bindings.summary.sourceId = 'beta-supplier-email'; fails(() => g.prepare(crossSource), 'tenant_mismatch');
  const record = g.prepare(scenario(g)); fails(() => g.receipt({ tenant: 'beta', receiptId: record.id }), 'not_found');
  fails(() => approve(g, record, { reviewer: 'beta-reviewer' }), 'reviewer_forbidden');
  assert.deepEqual(g.history({ tenant: 'beta' }), { receipts: [] }); assert.deepEqual(g.state({ tenant: 'beta' }), { tasks: [], publicNotes: [] });
});
withGateway('TrustGate review requires exact hash, independent configured reviewer and bounded note', (g) => {
  const proposal = scenario(g); proposal.actor = 'acme-dual-role'; const record = g.prepare(proposal);
  fails(() => approve(g, record, { reviewer: proposal.actor }), 'reviewer_forbidden');
  fails(() => approve(g, record, { reviewer: 'acme-operator' }), 'reviewer_forbidden');
  fails(() => approve(g, record, { expectedHash: 'f'.repeat(64) }), 'hash_mismatch');
  fails(() => approve(g, record, { note: 'x'.repeat(501) }), 'invalid_input');
  assert.equal(g.receipt(ref(record)).status, 'pending_review'); assert.equal(g.audit(scope).events.length, 1);
});
withGateway('TrustGate rejection is terminal and approval cannot be rewritten', (g) => {
  const record = g.prepare(scenario(g)); const rejected = approve(g, record, { decision: 'reject' }); assert.equal(rejected.status, 'rejected');
  fails(() => g.execute(ref(record)), 'not_ready'); fails(() => approve(g, record), 'invalid_transition');
  const second = g.prepare(scenario(g, 'public-note')); approve(g, second); fails(() => approve(g, second, { decision: 'reject' }), 'invalid_transition');
});
withGateway('TrustGate command identity and effect replay are exactly once', (g) => {
  const proposal = scenario(g); const record = g.prepare(proposal); assert.equal(g.prepare(proposal).replayed, true);
  approve(g, record); const executed = g.execute(ref(record)); const replay = g.execute(ref(record));
  assert.equal(replay.replayed, true); assert.deepEqual(replay.effect, executed.effect); assert.equal(g.state(scope).tasks.length, 1); assert.equal(g.audit(scope).events.length, 3);
  const changed = structuredClone(proposal); changed.bindings.summary = { sourceId: 'intent-public', key: 'summary' }; fails(() => g.prepare(changed), 'command_conflict');
  assert.equal(g.prepare(proposal).status, 'executed'); assert.equal(g.verifyAudit(scope).valid, true);
});

for (const [name, edit] of [
  ['arguments', (record) => { record.arguments.summary = 'SQL-injected argument'; }],
  ['bindings', (record) => { record.bindings.summary = { sourceId: 'internal-price', key: 'summary' }; }],
  ['tool', (record) => { record.tool = 'stage-public-note'; }],
  ['provenance', (record) => { record.provenance.summary.trust = 'trusted-user'; }],
  ['approval', (record) => { record.review.reviewer = 'acme-operator'; }],
  ['status', (record) => { record.status = 'executed'; }],
]) withGateway(`TrustGate detects persisted ${name} tampering before any effect`, (g) => {
  const record = g.prepare(scenario(g)); approve(g, record); mutate(g, record, edit);
  assert.equal(g.verifyAudit(scope).valid, false); fails(() => g.execute(ref(record)), 'integrity_failed');
  fails(() => g.state(scope), 'integrity_failed'); fails(() => g.history(scope), 'integrity_failed'); fails(() => g.receipt(ref(record)), 'integrity_failed');
  assert.equal(g.db.prepare('SELECT COUNT(*) AS count FROM trustgate_tasks WHERE tenant=?').get('acme').count, 0);
});
withGateway('TrustGate detects altered command envelope and malformed receipt bodies', (g) => {
  const record = g.prepare(scenario(g)); g.db.prepare('UPDATE trustgate_receipts SET command_id=? WHERE id=?').run('forged', record.id);
  assert.equal(g.verifyAudit(scope).valid, false); fails(() => g.prepare(scenario(g, 'public-note')), 'integrity_failed');
  g.db.prepare('UPDATE trustgate_receipts SET body=? WHERE id=?').run('null', record.id); assert.equal(g.verifyAudit(scope).valid, false);
});
withGateway('TrustGate detects altered audit events, malformed events and removed chain tail', (g) => {
  const record = g.prepare(scenario(g)); approve(g, record);
  const row = g.db.prepare('SELECT body FROM trustgate_audit WHERE tenant=? AND seq=1').get('acme'); const original = row.body; const event = JSON.parse(original); event.type = 'forged';
  g.db.prepare('UPDATE trustgate_audit SET body=? WHERE tenant=? AND seq=1').run(JSON.stringify(event), 'acme'); assert.equal(g.verifyAudit(scope).valid, false); fails(() => g.execute(ref(record)), 'integrity_failed');
  g.db.prepare('UPDATE trustgate_audit SET body=? WHERE tenant=? AND seq=1').run('null', 'acme'); assert.equal(g.verifyAudit(scope).valid, false);
  g.db.prepare('UPDATE trustgate_audit SET body=? WHERE tenant=? AND seq=1').run(original, 'acme'); g.db.prepare('DELETE FROM trustgate_audit WHERE tenant=? AND seq=2').run('acme'); assert.equal(g.verifyAudit(scope).valid, false);
});
withGateway('TrustGate detects altered or unrecorded local effects', (g) => {
  const record = g.prepare(scenario(g)); approve(g, record); g.execute(ref(record));
  const row = g.db.prepare('SELECT body FROM trustgate_tasks WHERE tenant=?').get('acme'); const effect = JSON.parse(row.body); effect.summary = 'tampered';
  g.db.prepare('UPDATE trustgate_tasks SET body=? WHERE tenant=?').run(JSON.stringify(effect), 'acme'); assert.equal(g.verifyAudit(scope).valid, false); fails(() => g.execute(ref(record)), 'integrity_failed');
  g.db.prepare('UPDATE trustgate_tasks SET body=? WHERE tenant=?').run(row.body, 'acme'); assert.equal(g.verifyAudit(scope).valid, true);
  g.db.prepare('INSERT INTO trustgate_public_notes VALUES (?,?,?,?)').run('acme', 'forged-note', 'forged-receipt', JSON.stringify({ id: 'forged-note', tenant: 'acme', receiptId: 'forged-receipt', kind: 'public-outbox', body: 'forged' })); assert.equal(g.verifyAudit(scope).valid, false);
});
withGateway('TrustGate fixed SQL policy cannot drift behind the source snapshot', (g) => {
  const record = g.prepare(scenario(g, 'public-read'));
  g.db.prepare('UPDATE trustgate_policies SET body=? WHERE tenant=?').run(JSON.stringify({ id: 'public-policy', text: 'SQL altered policy' }), 'acme');
  assert.equal(g.verifyAudit(scope).valid, false); fails(() => g.execute(ref(record)), 'integrity_failed');
});
withGateway('TrustGate receipt, SQL effect and audit append roll back atomically', (g) => {
  const record = g.prepare(scenario(g)); approve(g, record);
  g.db.exec("CREATE TRIGGER trustgate_test_abort BEFORE INSERT ON trustgate_audit WHEN NEW.seq=3 BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END;");
  assert.throws(() => g.execute(ref(record)), /simulated audit failure/u); assert.equal(g.state(scope).tasks.length, 0); assert.equal(g.receipt(ref(record)).status, 'ready'); assert.equal(g.audit(scope).events.length, 2); assert.equal(g.verifyAudit(scope).valid, true);
  g.db.exec('DROP TRIGGER trustgate_test_abort'); g.execute(ref(record)); assert.equal(g.state(scope).tasks.length, 1); assert.equal(g.verifyAudit(scope).valid, true);
});
test('TrustGate policy and source revisions invalidate prepared approvals across independent connections', () => {
  for (const options of [{ policyVersion: 'trustgate-local-v2' }, { fixtureRevision: 'v2' }]) {
    const directory = temp(); const path = join(directory, 'gateway.sqlite'); const original = openTrustGate(path); let changed;
    try {
      const record = original.prepare(scenario(original)); approve(original, record); changed = openTrustGate(path, options);
      assert.equal(original.receipt(ref(record)).stale, true); assert.equal(changed.receipt(ref(record)).stale, true);
      fails(() => original.execute(ref(record)), 'stale_receipt'); fails(() => changed.execute(ref(record)), 'stale_receipt');
      assert.equal(changed.state(scope).tasks.length, 0); assert.equal(changed.verifyAudit(scope).valid, true);
      const fresh = changed.prepare(scenario(changed, 'reviewed-task', 'new-config-command')); approve(changed, fresh); assert.equal(changed.execute(ref(fresh)).status, 'executed');
    } finally { changed?.close(); original.close(); rmSync(directory, { recursive: true, force: true }); }
  }
});
test('TrustGate persisted review, effects and replay survive a real file close and restart', () => {
  const directory = temp(); const path = join(directory, 'gateway.sqlite'); let gateway = openTrustGate(path);
  try {
    const record = gateway.prepare(scenario(gateway)); approve(gateway, record); gateway.close(); gateway = openTrustGate(path);
    assert.equal(gateway.receipt(ref(record)).review.reviewer, 'acme-reviewer'); const executed = gateway.execute(ref(record)); gateway.close(); gateway = openTrustGate(path);
    const replay = gateway.execute(ref(record)); assert.equal(replay.replayed, true); assert.deepEqual(replay.effect, executed.effect); assert.equal(gateway.state(scope).tasks.length, 1); assert.equal(gateway.audit(scope).events.length, 3); assert.equal(gateway.verifyAudit(scope).valid, true);
  } finally { gateway.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('TrustGate concurrent independent processes execute one approved SQL effect exactly once', async () => {
  const directory = temp(); const path = join(directory, 'gateway.sqlite'); const gateway = openTrustGate(path);
  try {
    const record = gateway.prepare(scenario(gateway)); approve(gateway, record);
    const moduleUrl = new URL('./trustgate-core.mjs', import.meta.url).href;
    const code = `import {openTrustGate} from ${JSON.stringify(moduleUrl)};const gateway=openTrustGate(${JSON.stringify(path)});try{console.log(JSON.stringify(gateway.execute(${JSON.stringify(ref(record))})));}finally{gateway.close();}`;
    const outputs = await Promise.all([child(code), child(code)]); const receipts = outputs.map((output) => JSON.parse(output));
    assert.equal(receipts.filter((result) => result.replayed).length, 1); assert.equal(receipts[0].effect.id, receipts[1].effect.id); assert.equal(gateway.state(scope).tasks.length, 1); assert.equal(gateway.audit(scope).events.length, 3); assert.equal(gateway.verifyAudit(scope).valid, true);
  } finally { gateway.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('TrustGate source drift after module load blocks old code and requires a real restart', async () => {
  const directory = temp(); const modulePath = join(directory, 'core.mjs'); const path = join(directory, 'gateway.sqlite');
  const source = readFileSync(new URL('./trustgate-core.mjs', import.meta.url), 'utf8'); writeFileSync(modulePath, source);
  try {
    const moduleUrl = pathToFileURL(modulePath).href;
    const code = `import {appendFileSync} from 'node:fs';import {openTrustGate,trustGate} from ${JSON.stringify(moduleUrl)};import{DatabaseSync}from'node:sqlite';const g=openTrustGate(${JSON.stringify(path)});const r=g.prepare(g.catalog().scenarios[0].proposal);appendFileSync(${JSON.stringify(modulePath)},${JSON.stringify('\n// changed implementation\n')});let blocked=false;try{g.execute({tenant:'acme',receiptId:r.id})}catch(e){blocked=e.code==='stale_receipt'}let factoryBlocked=false;const db=new DatabaseSync(':memory:');try{trustGate(db)}catch(e){factoryBlocked=e.code==='restart_required'}finally{db.close();g.close()}console.log(JSON.stringify({blocked,factoryBlocked,receiptId:r.id}));`;
    const result = JSON.parse(await child(code)); assert.equal(result.blocked, true); assert.equal(result.factoryBlocked, true);
    const restart = `import{openTrustGate}from ${JSON.stringify(moduleUrl)};const g=openTrustGate(${JSON.stringify(path)});try{console.log(JSON.stringify({stale:g.receipt({tenant:'acme',receiptId:${JSON.stringify(result.receiptId)}}).stale,fresh:g.prepare({...g.catalog().scenarios[0].proposal,commandId:'after-restart'}).status}));}finally{g.close()}`;
    assert.deepEqual(JSON.parse(await child(restart)), { stale: true, fresh: 'ready' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('TrustGate supplied database remains caller-owned and malformed options are rejected', () => {
  const db = new DatabaseSync(':memory:'); try { const gateway = trustGate(db); assert.equal(gateway.close, undefined); assert.equal(gateway.verifyAudit(scope).valid, true); assert.equal(db.prepare('SELECT 1 AS ok').get().ok, 1); } finally { db.close(); }
  assert.throws(() => openTrustGate(':memory:', { sources: [] }), /plain JSON|Expected fields/u); assert.throws(() => openTrustGate(':memory:', { fixtureRevision: 'v999' }), /fixture revision/u); assert.throws(() => openTrustGate(':memory:', { policyVersion: 'x'.repeat(81) }), /Policy version/u);
});
test('TrustGate fixtures exercise legitimate read/write and all three policy blocks', () => {
  const result = runTrustGateFixtures(); assert.equal(result.passed, true); assert.equal(result.results.length, 6); assert.equal(result.taskCount, 1); assert.equal(result.publicNoteCount, 1); assert.equal(result.audit.valid, true);
});
