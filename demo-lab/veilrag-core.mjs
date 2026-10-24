import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { veilRagScenarios, veilRagScope } from './veilrag-fixtures.mjs';

const copy = (value) => JSON.parse(JSON.stringify(value));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const json = (value) => JSON.stringify(canonical(value));
const digest = (value) => createHash('sha256').update(json(value)).digest('hex');
const GENESIS = '0'.repeat(64);
const PREFIX = '[[VR:';
const PROFILES = ['echo', 'leak', 'foreign-alias'];
const RECIPIENTS = [{ id: 'acme-reviewer', tenant: 'acme', description: 'Configured synthetic acme reviewer; selector, not authentication.' }, { id: 'beta-reviewer', tenant: 'beta', description: 'Configured synthetic beta reviewer; selector, not authentication.' }];
const generatorPath = fileURLToPath(new URL('./veilrag-generator.mjs', import.meta.url));
const loadedGeneratorSource = readFileSync(generatorPath, 'utf8');
const implementationHash = digest([readFileSync(new URL(import.meta.url), 'utf8'), loadedGeneratorSource]);
const currentImplementation = () => digest([readFileSync(new URL(import.meta.url), 'utf8'), readFileSync(generatorPath, 'utf8')]);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

export class VeilRagError extends Error {
  constructor(message, code = 'invalid_input') { super(message); this.name = 'VeilRagError'; this.code = code; this.status = code === 'not_found' ? 404 : ['integrity_failed', 'replay_conflict', 'key_unavailable', 'in_progress'].includes(code) ? 409 : 400; }
}
const fail = (message, code) => { throw new VeilRagError(message, code); };
function stored(value) { try { return JSON.parse(value); } catch { fail('Stored local JSON is invalid.', 'integrity_failed'); } }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function object(value, fields, optional = []) { if (!plain(value) || Object.keys(value).some((key) => !fields.includes(key) && !optional.includes(key)) || fields.some((key) => !Object.hasOwn(value, key))) fail('Unexpected or missing input fields.'); }
function bounded(value, max = 24000) { if (Buffer.byteLength(json(value)) > max) fail('Input exceeds the local byte limit.'); }
function text(value, max = 2000, empty = false) { if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail('Invalid text value.'); return value; }
function identifier(value) { text(value, 80); if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) fail('Invalid identifier.'); return value; }
function surface(value, transform, depth = 0) {
  if (depth > 6) fail('Tool arguments are too deeply nested.');
  if (typeof value === 'string') return transform(text(value, 2000, true));
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) { if (value.length > 24) fail('Too many array values.'); return value.map((item) => surface(item, transform, depth + 1)); }
  if (!plain(value) || Object.keys(value).length > 24) fail('Tool arguments must contain bounded JSON values.');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => { identifier(key); if (forbidden.has(key)) fail('Prototype-related keys are forbidden.'); transform(key, true); return [key, surface(item, transform, depth + 1)]; }));
}
function validateProtect(value) {
  object(value, ['tenant', 'commandId', 'entities', 'frames', 'profile']); bounded(value, 16000); identifier(value.tenant); identifier(value.commandId);
  if (!['acme', 'beta'].includes(value.tenant) || !PROFILES.includes(value.profile)) fail('Unknown local tenant or fixture profile.');
  if (!Array.isArray(value.entities) || value.entities.length < 1 || value.entities.length > 24) fail('Supply between one and 24 declared literals.');
  const ids = new Set(); const values = new Set();
  for (const entity of value.entities) { object(entity, ['id', 'value']); identifier(entity.id); text(entity.value, 256); if (entity.value.includes(PREFIX) || ids.has(entity.id) || values.has(entity.value)) fail('Declared literals must be unique and cannot use the alias namespace.'); ids.add(entity.id); values.add(entity.value); }
  object(value.frames, ['query', 'context', 'history', 'tools']); text(value.frames.query);
  if (!Array.isArray(value.frames.context) || value.frames.context.length > 16 || !Array.isArray(value.frames.history) || value.frames.history.length > 16 || !Array.isArray(value.frames.tools) || value.frames.tools.length > 8) fail('Too many frame values.');
  value.frames.context.forEach((item) => text(item));
  value.frames.history.forEach((item) => { object(item, ['role', 'text']); if (!['user', 'assistant'].includes(item.role)) fail('Unknown history role.'); text(item.text); });
  value.frames.tools.forEach((item) => { object(item, ['name', 'args']); identifier(item.name); if (!plain(item.args)) fail('Tool arguments must be an object.'); surface(item.args, (part) => part); });
  const protectedValues = [...values];
  // Structural labels cannot be rewritten without changing their protocol meaning.
  const labels = [value.tenant, value.commandId, value.profile, ...Object.keys(value.frames), ...value.frames.history.flatMap((item) => ['role', 'text', item.role]), ...value.frames.tools.flatMap((item) => ['name', 'args', item.name])];
  if (labels.some((label) => protectedValues.some((literal) => label.includes(literal)))) fail('A declared literal occurs in a structural label; use an opaque local label.');
  return value;
}
function transformFrames(frames, transform) {
  return { query: transform(frames.query), context: frames.context.map((part) => transform(part)), history: frames.history.map((item) => ({ role: item.role, text: transform(item.text) })), tools: frames.tools.map((item) => ({ name: item.name, args: surface(item.args, transform) })) };
}
function encrypt(key, mapping, aad) { const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(Buffer.from(json(aad))); const ciphertext = Buffer.concat([cipher.update(json(mapping), 'utf8'), cipher.final()]); return { nonce: nonce.toString('hex'), ciphertext: ciphertext.toString('hex'), tag: cipher.getAuthTag().toString('hex') }; }
function decrypt(key, vault, aad) { try { const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(vault.nonce, 'hex')); decipher.setAAD(Buffer.from(json(aad))); decipher.setAuthTag(Buffer.from(vault.tag, 'hex')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(vault.ciphertext, 'hex')), decipher.final()]).toString('utf8')); } catch { fail('The local alias vault cannot be authenticated.', 'integrity_failed'); } }
function runGenerator(dto) {
  return new Promise((resolve, reject) => {
    // Execute the reviewed in-memory fixture snapshot; no live file can replace it
    // between a source-hash check and process startup. This public source has no key.
    const child = spawn(process.execPath, ['--permission', '--input-type=module', '--eval', loadedGeneratorSource], { env: {}, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let ended = false;
    const finish = (error, value) => { if (ended) return; ended = true; clearTimeout(timer); if (error) { child.kill(); reject(error); } else resolve(value); };
    const timer = setTimeout(() => finish(new Error('generator_failed')), 2500);
    child.stdout.on('data', (part) => { output += part; if (Buffer.byteLength(output) > 24000) finish(new Error('generator_failed')); });
    child.stderr.on('data', () => {});
    child.on('error', () => finish(new Error('generator_failed')));
    child.stdin.on('error', () => finish(new Error('generator_failed')));
    child.on('close', (code) => { if (code !== 0) return finish(new Error('generator_failed')); try { const parsed = JSON.parse(output); object(parsed, ['output']); text(parsed.output, 20000); finish(null, parsed.output); } catch { finish(new Error('generator_failed')); } });
    child.stdin.end(json(dto));
  });
}

/** Built-in local fixture only. Tenant/recipient labels do not authenticate people. */
export function veilRag(db, options = {}) {
  object(options, [], ['key', 'clock', 'ttlMs']);
  if (options.key !== undefined && (!Buffer.isBuffer(options.key) || options.key.length !== 32)) fail('The vault key must be a 32-byte Buffer.');
  if (options.clock !== undefined && typeof options.clock !== 'function') fail('The internal clock must be a function.');
  const key = Buffer.from(options.key ?? randomBytes(32)); const keyId = createHmac('sha256', key).update('veilrag-local-key-id-v1').digest('hex');
  const clock = options.clock ?? Date.now; const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 100 || ttlMs > 24 * 60 * 60 * 1000) fail('Invalid local vault lifetime.');
  let operationTime = null;
  function now() { const result = operationTime ?? clock(); if (!Number.isSafeInteger(result) || result < 0 || result > 8_000_000_000_000_000) fail('Invalid trusted clock.'); return result; }
  const hmac = (value) => createHmac('sha256', key).update(json(value)).digest('hex');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('CREATE TABLE IF NOT EXISTS veilrag_sessions (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, command_id TEXT NOT NULL, record TEXT NOT NULL, vault TEXT, UNIQUE(tenant,command_id)); CREATE TABLE IF NOT EXISTS veilrag_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL, receipt_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS veilrag_head (id INTEGER PRIMARY KEY CHECK(id=1), event_count INTEGER NOT NULL, hash TEXT NOT NULL);');
  db.prepare('INSERT OR IGNORE INTO veilrag_head(id,event_count,hash) VALUES(1,0,?)').run(GENESIS);
  function event(tenant, receiptId, kind, payload) { const head = db.prepare('SELECT * FROM veilrag_head WHERE id=1').get(); const previous = head.hash; const seq = head.event_count + 1; const data = { seq, tenant, receiptId, kind, payload }; const hash = digest({ previous, ...data }); db.prepare('INSERT INTO veilrag_events(seq,tenant,receipt_id,kind,payload,previous_hash,hash) VALUES(?,?,?,?,?,?,?)').run(seq, tenant, receiptId, kind, json(payload), previous, hash); db.prepare('UPDATE veilrag_head SET event_count=?,hash=? WHERE id=1').run(seq, hash); }
  function events() { return db.prepare('SELECT * FROM veilrag_events ORDER BY seq').all().map((row) => ({ seq: row.seq, tenant: row.tenant, receiptId: row.receipt_id, kind: row.kind, payload: stored(row.payload), previousHash: row.previous_hash, hash: row.hash })); }
  function verify() {
    let previous = GENESIS; const rows = events(); let seq = 0;
    for (const row of rows) { if (row.seq !== ++seq || row.previousHash !== previous || row.hash !== digest({ previous, seq: row.seq, tenant: row.tenant, receiptId: row.receiptId, kind: row.kind, payload: row.payload })) fail('Local audit integrity failed.', 'integrity_failed'); previous = row.hash; }
    const head = db.prepare('SELECT * FROM veilrag_head WHERE id=1').get(); if (!head || head.event_count !== seq || head.hash !== previous || db.prepare('SELECT count(*) AS count FROM veilrag_head').get().count !== 1) fail('Local audit head integrity failed.', 'integrity_failed');
    const sessions = db.prepare('SELECT * FROM veilrag_sessions').all();
    if (sessions.length !== rows.filter((row) => row.kind === 'protected').length) fail('Local session inventory integrity failed.', 'integrity_failed');
    for (const session of sessions) { const record = stored(session.record); const linked = rows.filter((row) => row.receiptId === session.id); const created = linked[0]; if (!created || created.kind !== 'protected' || created.tenant !== session.tenant || json(created.payload) !== json(record) || record.id !== session.id || record.tenant !== session.tenant || record.commandId !== session.command_id || linked.some((row) => row.tenant !== session.tenant)) fail('Local session metadata integrity failed.', 'integrity_failed'); const purged = linked.some((row) => row.kind === 'purged'); if (purged ? session.vault !== null : session.vault === null || digest(stored(session.vault)) !== record.vaultDigest) fail('Local vault integrity failed.', 'integrity_failed'); }
    if (rows.some((row) => !sessions.some((session) => session.id === row.receiptId))) fail('Orphan local audit event.', 'integrity_failed');
    return rows;
  }
  function checked(fn) { db.exec('BEGIN IMMEDIATE'); try { verify(); const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
  function observeExpiry() {
    // Expiry is a permanent local observation. Commit it separately so a later
    // rejected restore cannot roll back the observation and revive the session.
    return checked(() => {
      const observedAtMs = now(); const alreadyExpired = new Set(events().filter((row) => ['expired', 'purged'].includes(row.kind)).map((row) => row.receiptId));
      for (const row of db.prepare('SELECT id,tenant,record FROM veilrag_sessions').all()) {
        const record = stored(row.record);
        if (observedAtMs >= record.expiresAtMs && !alreadyExpired.has(row.id)) event(row.tenant, row.id, 'expired', { observedAt: new Date(observedAtMs).toISOString() });
      }
      return observedAtMs;
    });
  }
  function transaction(fn) { const observedAtMs = observeExpiry(); return checked(() => { operationTime = observedAtMs; try { return fn(); } finally { operationTime = null; } }); }
  function request(value, fields) { object(value, fields); bounded(value, 1000); identifier(value.tenant); if (!['acme', 'beta'].includes(value.tenant)) fail('Unknown local tenant.'); if (fields.includes('receiptId')) identifier(value.receiptId); }
  function sessionFor(value) { const session = db.prepare('SELECT * FROM veilrag_sessions WHERE id=? AND tenant=?').get(value.receiptId, value.tenant); if (!session) fail('Local receipt not found.', 'not_found'); return { ...session, record: JSON.parse(session.record) }; }
  function state(session) { const rows = events().filter((row) => row.receiptId === session.id); const generated = rows.find((row) => row.kind === 'generated'); const blocked = rows.find((row) => row.kind === 'blocked'); const generating = rows.some((row) => row.kind === 'generating'); const expired = now() >= session.record.expiresAtMs || rows.some((row) => ['expired', 'purged'].includes(row.kind)); const stale = session.record.implementationHash !== implementationHash || currentImplementation() !== implementationHash; return { id: session.id, tenant: session.tenant, commandId: session.command_id, createdAt: session.record.createdAt, expiresAt: session.record.expiresAt, status: expired ? 'expired' : stale ? 'stale' : blocked ? 'blocked' : generated ? 'generated' : generating ? 'generating' : 'protected', ...(blocked ? { reason: blocked.payload.reason } : {}), ...(!expired && !stale ? { sanitized: copy(session.record.sanitized), ...(generated ? { sanitizedOutput: generated.payload.output } : {}) } : {}), eventCount: rows.length }; }
  function mappingFor(session) { if (now() >= session.record.expiresAtMs || !session.vault || events().some((row) => row.receiptId === session.id && row.kind === 'expired')) fail('The local alias session expired.', 'expired'); if (session.record.implementationHash !== implementationHash || currentImplementation() !== implementationHash) fail('The fixture implementation changed; create a new session.', 'stale_implementation'); if (session.record.keyId !== keyId) fail('The original in-memory vault key is unavailable.', 'key_unavailable'); const { vaultDigest: _digest, ...authenticatedMetadata } = session.record; return decrypt(key, JSON.parse(session.vault), authenticatedMetadata); }
  function safeOutput(output, mapping) { if (mapping.some((item) => output.includes(item.value))) return 'declared_literal_leak'; let stripped = output; for (const item of mapping) stripped = stripped.split(item.alias).join(''); if (stripped.includes(PREFIX)) return 'unknown_alias'; return null; }
  function checkTransport(dto, mapping, code = 'invalid_input') { bounded(dto); if (mapping.some((item) => json(dto).includes(item.value))) fail('A declared literal remains in the full sanitized transport, including structural keys.', code); }
  function receipt(value) { request(value, ['tenant', 'receiptId']); return transaction(() => state(sessionFor(value))); }
  return {
    catalog() { return { scope: veilRagScope, limits: { ttlMs, entityLimit: 24, inputByteLimit: 16000, matching: 'exact, case-sensitive Unicode code units; no normalization or encoded-value detection' }, scenarios: veilRagScenarios(), recipients: copy(RECIPIENTS) }; },
    protect(value) {
      validateProtect(value);
      if (currentImplementation() !== implementationHash) fail('Loaded source changed. Restart before creating a new session.', 'restart_required');
      return transaction(() => {
        const prior = db.prepare('SELECT * FROM veilrag_sessions WHERE tenant=? AND command_id=?').get(value.tenant, value.commandId);
        if (prior) { const session = { ...prior, record: JSON.parse(prior.record) }; if (session.record.keyId !== keyId) fail('The original in-memory vault key is unavailable.', 'key_unavailable'); if (session.record.intentHmac !== hmac(value)) fail('The local command was reused with different input.', 'replay_conflict'); return state(session); }
        const id = randomBytes(16).toString('hex'); const created = now(); const expires = created + ttlMs;
        const mapping = value.entities.map((entity, index) => ({ ...entity, alias: `${PREFIX}${id}:e${String(index + 1).padStart(2, '0')}]]` }));
        const longest = [...mapping].sort((a, b) => b.value.length - a.value.length);
        const transform = (part, label = false) => { if (part.includes(PREFIX)) fail('Input uses the reserved alias namespace.'); if (label && mapping.some((item) => part.includes(item.value))) fail('A declared literal occurs in an argument key.'); if (label) return part; let result = ''; for (let offset = 0; offset < part.length;) { const match = longest.find((item) => part.startsWith(item.value, offset)); if (match) { result += match.alias; offset += match.value.length; } else result += part[offset++]; } return result; };
        const sanitized = { frames: transformFrames(value.frames, transform) }; const transport = { profile: value.profile, frames: sanitized.frames }; checkTransport(transport, mapping);
        const record = { id, tenant: value.tenant, commandId: value.commandId, intentHmac: hmac(value), keyId, createdAt: new Date(created).toISOString(), expiresAt: new Date(expires).toISOString(), expiresAtMs: expires, profile: value.profile, implementationHash, sanitized };
        const vault = encrypt(key, mapping, record); record.vaultDigest = digest(vault);
        db.prepare('INSERT INTO veilrag_sessions(id,tenant,command_id,record,vault) VALUES(?,?,?,?,?)').run(id, record.tenant, record.commandId, json(record), json(vault)); event(record.tenant, id, 'protected', record);
        return state(sessionFor({ tenant: record.tenant, receiptId: id }));
      });
    },
    async generate(value) {
      request(value, ['tenant', 'receiptId']);
      const dto = transaction(() => { const session = sessionFor(value); const current = state(session); if (['generated', 'blocked', 'expired'].includes(current.status)) return { done: current }; if (current.status === 'generating') fail('Generation was already claimed; no automatic retry is permitted.', 'in_progress'); const mapping = mappingFor(session); const transport = { profile: session.record.profile, frames: session.record.sanitized.frames }; checkTransport(transport, mapping, 'integrity_failed'); event(value.tenant, session.id, 'generating', {}); return transport; });
      if (dto.done) return dto.done;
      let output; let failed = false; try { output = await runGenerator(dto); } catch { failed = true; }
      return transaction(() => { const session = sessionFor(value); const current = state(session); if (current.status === 'expired') { event(value.tenant, session.id, 'blocked', { reason: 'expired_during_generation' }); return state(session); } const mapping = mappingFor(session); const reason = failed ? 'generator_failed' : safeOutput(output, mapping); if (reason) event(value.tenant, session.id, 'blocked', { reason }); else event(value.tenant, session.id, 'generated', { output }); return state(session); });
    },
    restore(value) {
      request(value, ['tenant', 'receiptId', 'recipient']); identifier(value.recipient);
      return transaction(() => { if (!RECIPIENTS.some((item) => item.tenant === value.tenant && item.id === value.recipient)) fail('The configured recipient has no local restoration grant.', 'recipient_denied'); const session = sessionFor(value); const current = state(session); if (current.status !== 'generated') fail('Only a generated, unexpired session can be restored.', current.status === 'expired' ? 'expired' : 'not_generated'); const mapping = mappingFor(session); const reason = safeOutput(current.sanitizedOutput, mapping); if (reason) fail('Stored output failed its local boundary scan.', 'integrity_failed'); const escaped = mapping.map((item) => item.alias.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|'); const byAlias = new Map(mapping.map((item) => [item.alias, item.value])); const output = current.sanitizedOutput.replace(new RegExp(escaped, 'gu'), (alias) => byAlias.get(alias)); if (!events().some((row) => row.receiptId === session.id && row.kind === 'restored' && row.payload.recipient === value.recipient)) event(value.tenant, session.id, 'restored', { recipient: value.recipient }); return { receiptId: session.id, status: 'restored', recipient: value.recipient, output }; });
    },
    receipt,
    history(value) { request(value, ['tenant']); return transaction(() => ({ receipts: db.prepare('SELECT * FROM veilrag_sessions WHERE tenant=? ORDER BY rowid DESC').all(value.tenant).map((row) => state({ ...row, record: JSON.parse(row.record) })) })); },
    audit(value) { request(value, ['tenant']); return transaction(() => ({ events: events().filter((row) => row.tenant === value.tenant) })); },
    verifyAudit(value) { request(value, ['tenant']); try { const rows = transaction(() => verify()); return { valid: true, eventCount: rows.filter((row) => row.tenant === value.tenant).length }; } catch (error) { if (error.code === 'integrity_failed') return { valid: false, eventCount: 0 }; throw error; } },
    purge(value) { request(value, ['tenant']); return transaction(() => { const receiptIds = []; for (const row of db.prepare('SELECT * FROM veilrag_sessions WHERE tenant=? AND vault IS NOT NULL').all(value.tenant)) { const session = { ...row, record: JSON.parse(row.record) }; if (now() < session.record.expiresAtMs && !events().some((event) => event.receiptId === row.id && event.kind === 'expired')) continue; db.prepare('UPDATE veilrag_sessions SET vault=NULL WHERE id=?').run(row.id); event(value.tenant, row.id, 'purged', {}); receiptIds.push(row.id); } return { purged: receiptIds.length, receiptIds }; }); },
  };
}
export function openVeilRag(path = ':memory:', options = {}) { const db = new DatabaseSync(path); try { const api = veilRag(db, options); return { db, api, close: () => db.close() }; } catch (error) { db.close(); throw error; } }
