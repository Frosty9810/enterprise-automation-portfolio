import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openVeilRag, veilRag } from './veilrag-core.mjs';
import { veilRagScenarios } from './veilrag-fixtures.mjs';

const example = () => structuredClone(veilRagScenarios()[0].input);
const receiptInput = (receipt) => ({ tenant: receipt.tenant, receiptId: receipt.id });
const key = () => randomBytes(32);
function harness(t, options) { const store = openVeilRag(':memory:', options); t.after(() => store.close()); return store; }

test('VeilRAG replaces declared literals consistently across every supplied transport surface', async (t) => {
  const { api } = harness(t); const input = example(); const receipt = api.protect(input);
  assert.equal(receipt.status, 'protected');
  const transport = JSON.stringify(receipt.sanitized);
  for (const entity of input.entities) assert.equal(transport.includes(entity.value), false);
  assert.equal(new Set(transport.match(/\[\[VR:[^\]]+\]\]/gu)).size, 3);
  assert.ok(receipt.sanitized.frames.context[0].includes(receipt.sanitized.frames.tools[0].args.account));
  assert.ok(receipt.sanitized.frames.history[0].text.includes(receipt.sanitized.frames.tools[0].args.contact));
  const generated = await api.generate(receiptInput(receipt)); assert.equal(generated.status, 'generated');
  const restored = api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' });
  for (const entity of input.entities) assert.ok(restored.output.includes(entity.value));
  const audit = JSON.stringify(api.audit({ tenant: 'acme' })); const history = JSON.stringify(api.history({ tenant: 'acme' }));
  for (const entity of input.entities) { assert.ok(!audit.includes(entity.value)); assert.ok(!history.includes(entity.value)); }
  assert.deepEqual(api.verifyAudit({ tenant: 'acme' }), { valid: true, eventCount: 4 });
});

test('VeilRAG literal selection is longest-first and restoration is one pass', async (t) => {
  const { api } = harness(t); const input = example(); input.entities = [{ id: 'short', value: 'Ann' }, { id: 'long', value: 'Anna' }]; input.frames = { query: 'Anna knows Ann. Anna.', context: [], history: [], tools: [] };
  const receipt = api.protect(input); assert.equal((receipt.sanitized.frames.query.match(/:e02\]\]/gu) ?? []).length, 2); assert.equal((receipt.sanitized.frames.query.match(/:e01\]\]/gu) ?? []).length, 1);
  await api.generate(receiptInput(receipt)); assert.ok(api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' }).output.includes('Anna knows Ann. Anna.'));
});

test('VeilRAG retains exact alias replacement and rejects remaining case/Unicode variants before persistence', (t) => {
  const { api, db } = harness(t); const input = example(); input.entities = [{ id: 'person', value: 'Élodie Example' }]; input.frames.query = 'Élodie Example / E\u0301lodie Example / élodie example';
  assert.throws(() => api.protect(input), { code: 'declared_literal_variant_leak' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM veilrag_sessions').get().n, 0); assert.equal(db.prepare('SELECT count(*) AS n FROM veilrag_events').get().n, 0);
});

for (const [name, mutate] of [
  ['unknown property', (value) => { value.key = 'not accepted'; }],
  ['duplicate entity ID', (value) => { value.entities[1].id = value.entities[0].id; }],
  ['duplicate literal', (value) => { value.entities[1].value = value.entities[0].value; }],
  ['reserved input alias', (value) => { value.frames.context.push('[[VR:forged:e01]]'); }],
  ['protected object key', (value) => { value.entities = [{ id: 'account', value: 'sensitiveKey' }]; value.frames.tools[0].args = { sensitiveKey: 'unprotected text' }; }],
  ['protected tool name', (value) => { value.entities = [{ id: 'tool', value: 'lookup_delivery' }]; }],
  ['protected tenant label', (value) => { value.entities = [{ id: 'tenant', value: 'acme' }]; }],
  ['protected transport profile key', (value) => { value.entities = [{ id: 'label', value: 'profile' }]; value.frames = { query: 'Read profile', context: [], history: [], tools: [] }; }],
  ['protected transport frames key', (value) => { value.entities = [{ id: 'label', value: 'frames' }]; value.frames = { query: 'Read frames', context: [], history: [], tools: [] }; }],
  ['prototype key', (value) => { value.frames.tools[0].args = JSON.parse('{"__proto__":"bad"}'); }],
  ['too deep', (value) => { value.frames.tools[0].args = { a: { b: { c: { d: { e: { f: { g: 'value' } } } } } } }; }],
  ['non-finite value', (value) => { value.frames.tools[0].args.count = NaN; }],
  ['oversized bytes', (value) => { value.frames.context = Array(16).fill('😀'.repeat(900)); }],
  ['invalid profile', (value) => { value.profile = 'external-provider'; }],
  ['unknown tenant', (value) => { value.tenant = 'arbitrary'; }],
]) test(`VeilRAG rejects ${name} before creating a vault`, (t) => { const { api, db } = harness(t); const input = example(); mutate(input); assert.throws(() => api.protect(input)); assert.equal(db.prepare('SELECT count(*) AS n FROM veilrag_sessions').get().n, 0); });

test('VeilRAG protects and generates idempotently and refuses changed command input', async (t) => {
  const { api } = harness(t); const input = example(); const first = api.protect(input); assert.deepEqual(api.protect(input), first); const generated = await api.generate(receiptInput(first)); assert.deepEqual(await api.generate(receiptInput(first)), generated);
  const restored = api.restore({ ...receiptInput(first), recipient: 'acme-reviewer' }); assert.deepEqual(api.restore({ ...receiptInput(first), recipient: 'acme-reviewer' }), restored); assert.equal(api.audit({ tenant: 'acme' }).events.length, 4);
  input.frames.query += ' changed'; assert.throws(() => api.protect(input), { code: 'replay_conflict' });
});

test('VeilRAG simultaneous generation permits one claimed fixture execution', async (t) => {
  const { api } = harness(t); const receipt = api.protect(example()); const pending = api.generate(receiptInput(receipt)); await assert.rejects(api.generate(receiptInput(receipt)), { code: 'in_progress' }); assert.equal((await pending).status, 'generated'); assert.equal(api.audit({ tenant: 'acme' }).events.filter((event) => event.kind === 'generating').length, 1);
});

for (const [profile, reason] of [['leak', 'declared_literal_leak'], ['variant-leak', 'declared_literal_variant_leak'], ['foreign-alias', 'unknown_alias']]) test(`VeilRAG blocks ${profile} output without persisting the rejected text`, async (t) => {
  const { api, db } = harness(t); const input = example(); input.profile = profile; const receipt = api.protect(input); const generated = await api.generate(receiptInput(receipt)); assert.equal(generated.status, 'blocked'); assert.equal(generated.reason, reason); assert.equal(generated.sanitizedOutput, undefined); assert.throws(() => api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' }), { code: 'not_generated' }); const rows = JSON.stringify(db.prepare('SELECT * FROM veilrag_events').all()); assert.ok(!rows.includes('Ada Example')); assert.ok(!rows.includes('ada example')); assert.ok(!rows.includes('foreign-session')); assert.deepEqual(api.receipt(receiptInput(receipt)), generated); assert.deepEqual(await api.generate(receiptInput(receipt)), generated);
});

test('VeilRAG rejects unauthorized and cross-tenant restoration and receipt access', async (t) => {
  const { api } = harness(t); const receipt = api.protect(example()); await api.generate(receiptInput(receipt)); assert.throws(() => api.restore({ ...receiptInput(receipt), recipient: 'beta-reviewer' }), { code: 'recipient_denied' }); assert.throws(() => api.receipt({ tenant: 'beta', receiptId: receipt.id }), { code: 'not_found' }); assert.equal(api.history({ tenant: 'beta' }).receipts.length, 0);
});

test('VeilRAG expiration uses the factory clock, fails closed on replay, and purges ciphertext once', async (t) => {
  let clock = 10000; const { api, db } = harness(t, { clock: () => clock, ttlMs: 1000 }); const input = example(); const receipt = api.protect(input); await api.generate(receiptInput(receipt)); clock += 1000;
  const expired = api.receipt(receiptInput(receipt)); assert.equal(expired.status, 'expired'); assert.equal(expired.sanitized, undefined); assert.equal(api.protect(input).status, 'expired'); assert.throws(() => api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' }), { code: 'expired' }); assert.deepEqual(api.purge({ tenant: 'acme' }), { purged: 1, receiptIds: [receipt.id] }); assert.equal(db.prepare('SELECT vault FROM veilrag_sessions').get().vault, null); assert.deepEqual(api.purge({ tenant: 'acme' }), { purged: 0, receiptIds: [] }); assert.equal(api.verifyAudit({ tenant: 'acme' }).valid, true);
});

test('VeilRAG does not purge a live vault and rejects caller clock/key/grant controls', (t) => {
  const { api } = harness(t); const receipt = api.protect(example()); assert.equal(api.purge({ tenant: 'acme' }).purged, 0); assert.throws(() => api.purge({ tenant: 'acme', now: Infinity })); assert.throws(() => api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer', allow: true })); assert.throws(() => api.protect({ ...example(), key: 'caller-key' }));
});

test('VeilRAG SQLite persistence contains encrypted declared values and survives same-key process restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'veilrag-test-')); const path = join(dir, 'vault.sqlite'); const shared = key(); const first = openVeilRag(path, { key: shared }); const input = example(); const receipt = first.api.protect(input); await first.api.generate(receiptInput(receipt)); first.close();
  const bytes = readFileSync(path); for (const entity of input.entities) assert.equal(bytes.includes(Buffer.from(entity.value)), false);
  const source = `import {openVeilRag} from ${JSON.stringify(new URL('./veilrag-core.mjs', import.meta.url).href)}; let raw=''; for await(const chunk of process.stdin) raw+=chunk; const input=JSON.parse(raw); const store=openVeilRag(input.path,{key:Buffer.from(input.key,'hex')}); try {const result=store.api.restore(input.request); process.stdout.write(JSON.stringify({matched:result.output.includes('Ada Example'),audit:store.api.verifyAudit({tenant:'acme'})}));}finally{store.close();}`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { input: JSON.stringify({ path, key: shared.toString('hex'), request: { ...receiptInput(receipt), recipient: 'acme-reviewer' } }), encoding: 'utf8', env: {}, windowsHide: true });
  t.after(() => rmSync(dir, { recursive: true, force: true })); assert.equal(child.status, 0); const result = JSON.parse(child.stdout); assert.equal(result.matched, true); assert.equal(result.audit.valid, true);
});

test('VeilRAG fresh default key after reopen cannot decrypt old sessions', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'veilrag-keyloss-')); const path = join(dir, 'vault.sqlite'); const first = openVeilRag(path); const receipt = first.api.protect(example()); await first.api.generate(receiptInput(receipt)); first.close(); const second = openVeilRag(path); t.after(() => { second.close(); rmSync(dir, { recursive: true, force: true }); }); assert.throws(() => second.api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' }), { code: 'key_unavailable' }); assert.throws(() => second.api.protect(example()), { code: 'key_unavailable' });
});

for (const [name, mutate] of [
  ['vault ciphertext', (db) => db.exec("UPDATE veilrag_sessions SET vault=replace(vault,'ciphertext','cipherbad')")],
  ['receipt metadata', (db) => db.exec("UPDATE veilrag_sessions SET command_id='changed'")],
  ['audit event', (db) => db.exec("UPDATE veilrag_events SET payload='{}' WHERE seq=1")],
  ['audit tail deletion', (db) => db.exec('DELETE FROM veilrag_events WHERE seq=(SELECT MAX(seq) FROM veilrag_events)')],
  ['invalid stored JSON', (db) => db.exec("UPDATE veilrag_sessions SET record='invalid json'")],
  ['missing receipt', (db) => db.exec('DELETE FROM veilrag_sessions')],
]) test(`VeilRAG detects ${name} tampering and refuses restoration`, async (t) => {
  const { api, db } = harness(t); const receipt = api.protect(example()); await api.generate(receiptInput(receipt)); mutate(db); assert.equal(api.verifyAudit({ tenant: 'acme' }).valid, false); assert.throws(() => api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' }), { code: 'integrity_failed' });
});

test('VeilRAG failed SQL writes roll back a new vault and audit event', (t) => {
  const { api, db } = harness(t); db.exec("CREATE TRIGGER reject_veilrag_event BEFORE INSERT ON veilrag_events BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;"); assert.throws(() => api.protect(example())); assert.equal(db.prepare('SELECT count(*) AS n FROM veilrag_sessions').get().n, 0); assert.equal(db.prepare('SELECT count(*) AS n FROM veilrag_events').get().n, 0);
});

test('VeilRAG closed child transport accepts only sanitized DTO with no mapping or key', (t) => {
  const { api } = harness(t); const input = example(); const receipt = api.protect(input); const dto = { profile: 'echo', frames: receipt.sanitized.frames }; const transport = JSON.stringify(dto); for (const entity of input.entities) assert.ok(!transport.includes(entity.value)); assert.ok(!transport.includes('ciphertext')); assert.ok(!transport.includes('keyId'));
  const generator = fileURLToPath(new URL('./veilrag-generator.mjs', import.meta.url)); const child = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${generator}`, generator], { input: transport, encoding: 'utf8', env: {}, windowsHide: true }); assert.equal(child.status, 0); const output = JSON.parse(child.stdout).output; for (const entity of input.entities) assert.ok(!output.includes(entity.value));
});

test('VeilRAG factory controls validate before use', (t) => {
  const { db } = harness(t); assert.throws(() => veilRag(db, { key: Buffer.alloc(16) })); assert.throws(() => veilRag(db, { ttlMs: 0 })); assert.throws(() => veilRag(db, { clock: 'bad' })); const api = veilRag(db, { clock: () => NaN }); assert.throws(() => api.protect(example()));
});

test('VeilRAG source drift hides prior transport and prevents restoration before and after restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'veilrag-source-')); for (const name of ['veilrag-core.mjs', 'veilrag-generator.mjs', 'veilrag-fixtures.mjs']) copyFileSync(new URL(name, import.meta.url), join(dir, name));
  const url = pathToFileURL(join(dir, 'veilrag-core.mjs')).href; const loaded = await import(url); const shared = key(); const dbPath = join(dir, 'vault.sqlite'); const first = loaded.openVeilRag(dbPath, { key: shared });
  try {
    const receipt = first.api.protect(example()); await first.api.generate(receiptInput(receipt));
    writeFileSync(join(dir, 'veilrag-generator.mjs'), `${readFileSync(join(dir, 'veilrag-generator.mjs'), 'utf8')}\n// Synthetic source drift\n`);
    const stale = first.api.receipt(receiptInput(receipt)); assert.equal(stale.status, 'stale'); assert.equal(stale.sanitized, undefined); assert.equal(stale.sanitizedOutput, undefined);
    assert.throws(() => first.api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' })); assert.throws(() => first.api.protect({ ...example(), commandId: 'new-command' }), { code: 'restart_required' });
    first.close(); const reloaded = await import(`${url}?reload=1`); const second = reloaded.openVeilRag(dbPath, { key: shared }); try { assert.equal(second.api.receipt(receiptInput(receipt)).status, 'stale'); await assert.rejects(second.api.generate(receiptInput(receipt)), { code: 'stale_implementation' }); } finally { second.close(); }
  } finally { try { first.close(); } catch {} rmSync(dir, { recursive: true, force: true }); }
});

for (const tamper of ['ciphertext', 'expiry', 'transport']) test(`VeilRAG AES-GCM rejects rewritten ${tamper} even if an administrator recomputes the unkeyed ledger`, async (t) => {
  let clock = 10000; const { api, db } = harness(t, { clock: () => clock, ttlMs: 1000 }); const receipt = api.protect(example()); await api.generate(receiptInput(receipt));
  const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
  const hash = (value) => createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
  const row = db.prepare('SELECT * FROM veilrag_sessions').get(); const vault = JSON.parse(row.vault); const record = JSON.parse(row.record);
  if (tamper === 'ciphertext') { vault.ciphertext = `${vault.ciphertext[0] === '0' ? '1' : '0'}${vault.ciphertext.slice(1)}`; record.vaultDigest = hash(vault); }
  if (tamper === 'expiry') { clock += 2000; record.expiresAtMs += 10000; }
  if (tamper === 'transport') record.sanitized.frames.query = 'Attacker-controlled transport';
  db.prepare('UPDATE veilrag_sessions SET record=?,vault=? WHERE id=?').run(JSON.stringify(record), JSON.stringify(vault), receipt.id);
  let previous = '0'.repeat(64); const rows = db.prepare('SELECT * FROM veilrag_events ORDER BY seq').all();
  for (const event of rows) { const payload = event.kind === 'protected' ? record : JSON.parse(event.payload); const next = hash({ previous, seq: event.seq, tenant: event.tenant, receiptId: event.receipt_id, kind: event.kind, payload }); db.prepare('UPDATE veilrag_events SET payload=?,previous_hash=?,hash=? WHERE seq=?').run(JSON.stringify(payload), previous, next, event.seq); previous = next; }
  db.prepare('UPDATE veilrag_head SET hash=?').run(previous); assert.equal(api.verifyAudit({ tenant: 'acme' }).valid, true); assert.throws(() => api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' }), { code: 'integrity_failed' });
});


test('VeilRAG two processes can initialize one vault and claim one generation', { timeout: 15000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'veilrag-concurrent-'));
  const path = join(dir, 'vault.sqlite'); const shared = key();
  const workerSource = `import {createInterface} from 'node:readline'; import {openVeilRag} from ${JSON.stringify(new URL('./veilrag-core.mjs', import.meta.url).href)};
    let config; const lines=createInterface({input:process.stdin});
    for await(const line of lines) { if(!config){config=JSON.parse(line);process.stdout.write('ready\\n');}else if(line==='go')break; }
    let store; try {store=openVeilRag(config.path,{key:Buffer.from(config.key,'hex')});const receipt=store.api.protect(config.input);try {const result=await store.api.generate({tenant:'acme',receiptId:receipt.id});process.stdout.write(JSON.stringify({status:result.status,receiptId:receipt.id}));}catch(error){if(error.code!=='in_progress')throw error;process.stdout.write(JSON.stringify({status:error.code,receiptId:receipt.id}));}}finally{store?.close();}`;
  const workers = Array.from({ length: 2 }, () => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', workerSource], { env: {}, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let errors = ''; let resolveReady; let rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Concurrent fixture timed out.')); }, 10000);
      child.stdout.on('data', (part) => { output += part; if (output.startsWith('ready\n')) resolveReady(); });
      child.stderr.on('data', (part) => { errors += part; });
      child.on('error', (error) => { clearTimeout(timer); rejectReady(error); reject(error); });
      child.on('close', (code) => { clearTimeout(timer); if (code !== 0) { const error = new Error(`Concurrent fixture failed: ${errors}`); rejectReady(error); reject(error); } else { try { resolve(JSON.parse(output.slice('ready\n'.length))); } catch (error) { reject(error); } } });
    });
    result.catch(() => {});
    child.stdin.write(`${JSON.stringify({ path, key: shared.toString('hex'), input: example() })}\n`);
    return { child, ready, result };
  });
  try {
    await Promise.all(workers.map((worker) => worker.ready));
    workers.forEach((worker) => worker.child.stdin.end('go\n'));
    const settled = await Promise.allSettled(workers.map((worker) => worker.result));
    assert.ok(settled.every((item) => item.status === 'fulfilled'), 'Both concurrent factories must initialize successfully.');
    const results = settled.map((item) => item.value);
    assert.ok(results.every((item) => ['generated', 'in_progress'].includes(item.status)));
    assert.equal(new Set(results.map((item) => item.receiptId)).size, 1);
    const store = openVeilRag(path, { key: shared }); try { const events = store.api.audit({ tenant: 'acme' }).events; assert.equal(events.filter((item) => item.kind === 'protected').length, 1); assert.equal(events.filter((item) => item.kind === 'generating').length, 1); assert.equal(events.filter((item) => item.kind === 'generated').length, 1); assert.equal(store.api.verifyAudit({ tenant: 'acme' }).valid, true); assert.equal(store.db.prepare('PRAGMA busy_timeout').get().timeout, 5000); } finally { store.close(); }
  } finally { workers.forEach((worker) => { worker.child.stdin.destroy(); if (worker.child.exitCode === null) worker.child.kill(); }); await Promise.allSettled(workers.map((worker) => worker.result)); rmSync(dir, { recursive: true, force: true }); }
});

test('VeilRAG open wrapper closes its new database when initialization fails', () => {
  const original = DatabaseSync.prototype.close; let closes = 0;
  DatabaseSync.prototype.close = function () { closes += 1; return original.call(this); };
  try { assert.throws(() => openVeilRag(':memory:', { key: Buffer.alloc(16) })); assert.equal(closes, 1); }
  finally { DatabaseSync.prototype.close = original; }
});


for (const firstObservation of ['receipt', 'rejected-restore']) test(`VeilRAG ${firstObservation} permanently records expiry across clock rollback and reopen`, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'veilrag-permanent-expiry-')); const path = join(dir, 'vault.sqlite'); const shared = key(); let clock = 1000;
  let store = openVeilRag(path, { key: shared, clock: () => clock, ttlMs: 100 });
  try {
    const receipt = store.api.protect(example()); await store.api.generate(receiptInput(receipt)); const restoreInput = { ...receiptInput(receipt), recipient: 'acme-reviewer' }; clock = 1100;
    if (firstObservation === 'receipt') assert.equal(store.api.receipt(receiptInput(receipt)).status, 'expired');
    else assert.throws(() => store.api.restore(restoreInput), { code: 'expired' });
    // Read the database directly: a failed restore must already have committed
    // this observation, before another public method can observe expiry again.
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM veilrag_events WHERE kind='expired'").get().n, 1);
    clock = 1099; assert.equal(store.api.receipt(receiptInput(receipt)).status, 'expired'); assert.throws(() => store.api.restore(restoreInput), { code: 'expired' });
    store.close(); store = openVeilRag(path, { key: shared, clock: () => clock, ttlMs: 100 });
    const persisted = store.api.receipt(receiptInput(receipt)); assert.equal(persisted.status, 'expired'); assert.equal(persisted.sanitized, undefined); assert.equal(persisted.sanitizedOutput, undefined);
    assert.throws(() => store.api.restore(restoreInput), { code: 'expired' }); assert.equal((await store.api.generate(receiptInput(receipt))).status, 'expired');
    assert.deepEqual(store.api.purge({ tenant: 'acme' }), { purged: 1, receiptIds: [receipt.id] }); assert.equal(store.db.prepare('SELECT vault FROM veilrag_sessions').get().vault, null);
    assert.equal(store.api.audit({ tenant: 'acme' }).events.filter((event) => event.kind === 'expired').length, 1); assert.equal(store.api.verifyAudit({ tenant: 'acme' }).valid, true);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

const minimalInput = (literal, query) => ({ tenant: 'acme', commandId: 'variant-guard-command', profile: 'echo', entities: [{ id: 'declared', value: literal }], frames: { query, context: [], history: [], tools: [] } });
for (const [name, literal, mutate] of [
  ['lowercase query', 'Ada Example', input => { input.frames.query = 'ada example'; }],
  ['uppercase context', 'Ada Example', input => { input.frames.context = ['ADA EXAMPLE']; }],
  ['canonical-equivalent history', 'Élodie Example', input => { input.frames.history = [{ role: 'user', text: 'E\u0301lodie Example' }]; }],
  ['compatibility-equivalent nested argument', 'Ada Example', input => { input.frames.tools = [{ name: 'lookup', args: { data: [{ contact: 'Ａｄａ　Ｅｘａｍｐｌｅ' }] } }]; }],
  ['ligature-equivalent query', 'office', input => { input.frames.query = 'oﬃce'; }],
  ['reverse canonical normalization', 'E\u0301lodie Example', input => { input.frames.context = ['Élodie Example']; }],
  ['quoted raw value despite JSON escaping', 'Ada "Example"', input => { input.frames.query = 'ada "example"'; }],
  ['backslash raw value despite JSON escaping', 'Path\\Secret', input => { input.frames.query = 'path\\secret'; }],
  ['newline raw value despite JSON escaping', 'Ada\nExample', input => { input.frames.query = 'ada\nexample'; }],
  ['case-equivalent argument key', 'SensitiveKey', input => { input.frames.tools = [{ name: 'lookup', args: { sensitivekey: 'ordinary' } }]; }],
  ['case-equivalent tool label', 'LOOKUP', input => { input.frames.tools = [{ name: 'lookup', args: {} }]; }],
  ['case-equivalent fixed transport key', 'CONTEXT', input => {}],
  ['case-equivalent tenant label', 'ACME', input => {}],
  ['case-equivalent command label', 'VARIANT-GUARD', input => {}],
  ['case-equivalent generator profile', 'ECHO', input => {}],
  ['short declared literal colliding with protocol', 'Q', input => {}],
]) test('VeilRAG conservatively rejects '+name+' without creating a session or audit event', t => {
  const { api, db } = harness(t); const input = minimalInput(literal, 'ordinary payload'); mutate(input);
  let error; try { api.protect(input); } catch (caught) { error = caught; }
  assert.equal(error?.code, 'declared_literal_variant_leak'); assert.ok(!error.message.includes(literal));
  assert.equal(db.prepare('SELECT count(*) AS n FROM veilrag_sessions').get().n, 0); assert.equal(db.prepare('SELECT count(*) AS n FROM veilrag_events').get().n, 0);
});

test('VeilRAG exact quoted and decomposed declared values still restore their original code units', async t => {
  const { api } = harness(t); const literal = 'E\u0301lodie "Example"'; const input = minimalInput(literal, literal+' / '+literal); const receipt = api.protect(input);
  assert.equal(receipt.status, 'protected'); assert.ok(!receipt.sanitized.frames.query.includes(literal)); await api.generate(receiptInput(receipt));
  const restored = api.restore({ ...receiptInput(receipt), recipient: 'acme-reviewer' }); assert.ok(restored.output.includes(input.frames.query)); assert.ok(restored.output.includes('E\u0301lodie')); assert.ok(!restored.output.includes('Élodie'));
});

test('VeilRAG does not silently broaden the guard into decoding or full Unicode case folding', t => {
  const { api } = harness(t); const cases = [ ['Ada Example', 'Ada%20Example'], ['Ada Example', 'QWRhIEV4YW1wbGU='], ['Ada Example', 'Ada\u200b Example'], ['Ada Example', 'Аda Example'], ['Straße Example', 'STRASSE EXAMPLE'] ];
  for (const [at,[literal,variant]] of cases.entries()) { const input = minimalInput(literal,variant); input.commandId+='-'+at; const receipt=api.protect(input); assert.equal(receipt.status,'protected'); assert.equal(receipt.sanitized.frames.query,variant); }
});

for (const name of ['veilrag-core.mjs','veilrag-fixtures.mjs']) test('VeilRAG '+name+' drift hides prior evidence and blocks execution and restoration', async t => {
  const dir=mkdtempSync(join(tmpdir(),'veilrag-guard-source-'));for(const file of ['veilrag-core.mjs','veilrag-generator.mjs','veilrag-fixtures.mjs'])copyFileSync(new URL(file,import.meta.url),join(dir,file));const imported=await import(pathToFileURL(join(dir,'veilrag-core.mjs')).href);const store=imported.openVeilRag(':memory:',{key:key()});
  try{const receipt=store.api.protect(example());await store.api.generate(receiptInput(receipt));writeFileSync(join(dir,name),readFileSync(join(dir,name),'utf8')+'\n// source drift\n');const stale=store.api.receipt(receiptInput(receipt));assert.equal(stale.status,'stale');assert.equal(stale.sanitized,undefined);assert.equal(stale.sanitizedOutput,undefined);assert.throws(()=>store.api.restore({...receiptInput(receipt),recipient:'acme-reviewer'}),{code:'not_generated'});assert.throws(()=>store.api.protect({...example(),commandId:'new-after-drift'}),{code:'restart_required'});await assert.rejects(()=>store.api.generate(receiptInput(receipt)),{code:'stale_implementation'});}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

for(const [name,literal,output]of [['compatibility','Ada Example','Ａｄａ　Ｅｘａｍｐｌｅ'],['canonical','Élodie Example','E\u0301lodie Example']])test('VeilRAG rejects '+name+' variant from an actual pinned child process before persistence',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'veilrag-guard-child-'));for(const file of ['veilrag-core.mjs','veilrag-generator.mjs','veilrag-fixtures.mjs'])copyFileSync(new URL(file,import.meta.url),join(dir,file));const generator=join(dir,'veilrag-generator.mjs'),source=readFileSync(generator,'utf8');assert.ok(source.includes("output: 'ada example'"));writeFileSync(generator,source.replace("output: 'ada example'",'output: '+JSON.stringify(output)));const imported=await import(pathToFileURL(join(dir,'veilrag-core.mjs')).href),store=imported.openVeilRag(':memory:',{key:key()});
 try{const input=minimalInput(literal,literal);input.profile='variant-leak';const receipt=store.api.protect(input),blocked=await store.api.generate(receiptInput(receipt));assert.equal(blocked.status,'blocked');assert.equal(blocked.reason,'declared_literal_variant_leak');assert.equal(blocked.sanitizedOutput,undefined);assert.throws(()=>store.api.restore({...receiptInput(receipt),recipient:'acme-reviewer'}),{code:'not_generated'});const persisted=JSON.stringify(store.db.prepare('SELECT * FROM veilrag_events').all());assert.ok(!persisted.includes(output));assert.ok(!persisted.includes(literal));assert.equal(store.api.verifyAudit({tenant:'acme'}).valid,true);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});