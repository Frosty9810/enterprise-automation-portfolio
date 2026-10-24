import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { chronosExample } from './chronosrank-fixtures.mjs';

const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const digest = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const copy = (value) => JSON.parse(JSON.stringify(value));
const implementationHash = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const GENESIS = '0'.repeat(64);
const VERSION = 'chronosrank-lexical-v1';
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const appendFields = ['commandId', 'tenant', 'kind', 'memoryId', 'entity', 'text', 'provenance', 'recordedAt', 'validFrom', 'expiresAt'];

export class ChronosRankError extends Error {
  constructor(message, code = 'invalid_input') { super(message); this.name = 'ChronosRankError'; this.code = code; this.status = code === 'not_found' ? 404 : code === 'integrity_failed' || code === 'replay_conflict' ? 409 : 400; }
}
const fail = (message, code) => { throw new ChronosRankError(message, code); };
function safe(value, depth = 0) {
  if (depth > 4) fail('Input is too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Only plain JSON objects are accepted.');
  for (const [key, item] of Object.entries(value)) { if (forbidden.has(key)) fail('Prototype-related keys are forbidden.'); safe(item, depth + 1); }
}
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key)) || fields.some((key) => !Object.hasOwn(value, key))) fail(`Expected exactly these fields: ${fields.join(', ')}.`);
}
function input(value, fields) { safe(value); object(value, fields); if (Buffer.byteLength(JSON.stringify(value)) > 16000) fail('Input exceeds 16000 bytes.'); }
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`${label} must be a nonempty string up to ${max} characters.`);
  return value;
}
function id(value, label = 'Identifier') { text(value, label, 80); if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) fail(`${label} is invalid.`); return value; }
function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label} must be a real canonical UTC millisecond timestamp.`);
  return value;
}
function validateAppend(value) {
  const fields = value?.kind === 'expire' ? ['commandId', 'tenant', 'kind', 'memoryId', 'recordedAt'] : value?.kind === 'supersede' ? [...appendFields, 'supersedes'] : appendFields;
  input(value, fields); id(value.commandId); id(value.tenant, 'Tenant'); id(value.memoryId, 'Memory ID'); date(value.recordedAt, 'recordedAt');
  if (!['remember', 'supersede', 'expire'].includes(value.kind)) fail('Unknown memory event kind.');
  if (value.kind === 'expire') return;
  id(value.entity, 'Entity'); text(value.text, 'Memory text', 2000); date(value.validFrom, 'validFrom');
  if (value.expiresAt !== null && date(value.expiresAt, 'expiresAt') <= value.validFrom) fail('expiresAt must be strictly after validFrom.');
  object(value.provenance, ['sourceId', 'quote']); id(value.provenance.sourceId, 'Source ID'); text(value.provenance.quote, 'Exact source quote', 6000);
  if (!value.provenance.quote.includes(value.text)) fail('Memory text must occur exactly inside the supplied source quote.');
  if (value.kind === 'supersede') id(value.supersedes, 'Superseded memory ID');
}
const tokens = (value) => [...new Set(value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
function validateRetrieve(value) {
  input(value, ['requestId', 'tenant', 'entity', 'query', 'asOf', 'threshold', 'limit']); id(value.requestId); id(value.tenant, 'Tenant'); id(value.entity, 'Entity'); text(value.query, 'Query', 500); date(value.asOf, 'asOf');
  if (!tokens(value.query).length || tokens(value.query).length > 32) fail('Query needs between 1 and 32 distinct word tokens.');
  if (!Number.isInteger(value.threshold) || value.threshold < 1 || value.threshold > 100) fail('threshold must be an integer from 1 to 100.');
  if (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 10) fail('limit must be an integer from 1 to 10.');
}
function validateFeedback(value) {
  input(value, ['commandId', 'tenant', 'receiptId', 'outcome', 'note']); id(value.commandId); id(value.tenant, 'Tenant'); id(value.receiptId);
  if (!['useful', 'not-useful'].includes(value.outcome)) fail('Unknown feedback outcome.'); text(value.note, 'Feedback note', 1000);
}
function validateLookup(value, fields = ['tenant']) { input(value, fields); for (const field of fields) id(value[field], field); }
function initialState() { return { events: [], receipts: new Map(), feedback: [], commands: new Map(), memories: new Map(), expirations: new Map(), successors: new Map(), memoryHead: GENESIS, head: GENESIS, count: 0, watermark: '' }; }
function applyMemory(state, event) {
  if (event.recordedAt < state.watermark) fail('recordedAt cannot precede the tenant knowledge watermark.');
  if (event.kind === 'expire') {
    if (!state.memories.has(event.memoryId)) fail('Memory to expire does not exist in this tenant.', 'not_found');
    if (state.expirations.has(event.memoryId)) fail('Memory already has an explicit expiration.');
    state.expirations.set(event.memoryId, event.recordedAt);
  } else {
    if (state.memories.has(event.memoryId)) fail('Memory ID is immutable and already exists.');
    if (event.kind === 'supersede') {
      const target = state.memories.get(event.supersedes);
      if (!target) fail('Superseded memory does not exist in this tenant.', 'not_found');
      if (target.entity !== event.entity) fail('Supersession must remain in the same entity.');
      if (event.validFrom < target.validFrom) fail('Successor validFrom cannot precede its predecessor validFrom.');
      if (state.successors.has(event.supersedes)) fail('Memory already has an immutable successor.');
      if (event.memoryId === event.supersedes) fail('Memory cannot supersede itself.');
      state.successors.set(event.supersedes, event);
    }
    state.memories.set(event.memoryId, event);
  }
  state.events.push(event); state.watermark = event.recordedAt;
}
function evaluate(state, request) {
  const queryTokens = tokens(request.query), ranked = [], excluded = [];
  for (const memory of state.memories.values()) {
    if (memory.entity !== request.entity) continue;
    let reason;
    const successor = state.successors.get(memory.memoryId), explicitExpiry = state.expirations.get(memory.memoryId);
    if (memory.recordedAt > request.asOf) reason = 'not-yet-recorded';
    else if (memory.validFrom > request.asOf) reason = 'not-yet-valid';
    else if (successor && successor.recordedAt <= request.asOf && successor.validFrom <= request.asOf) reason = 'superseded';
    else if (memory.expiresAt !== null && memory.expiresAt <= request.asOf || explicitExpiry && explicitExpiry <= request.asOf) reason = 'expired';
    if (reason) { excluded.push({ memoryId: memory.memoryId, reason }); continue; }
    const words = new Set(tokens(memory.text));
    const score = Math.floor(100 * queryTokens.filter((word) => words.has(word)).length / queryTokens.length);
    if (score < request.threshold) { excluded.push({ memoryId: memory.memoryId, reason: 'below-threshold', score }); continue; }
    ranked.push({ memoryId: memory.memoryId, entity: memory.entity, text: memory.text, provenance: memory.provenance, recordedAt: memory.recordedAt, validFrom: memory.validFrom, expiresAt: memory.expiresAt, score });
  }
  const byId = (a, b) => a.memoryId < b.memoryId ? -1 : a.memoryId > b.memoryId ? 1 : 0;
  ranked.sort((a, b) => b.score - a.score || byId(a, b));
  const top = ranked.filter((memory) => memory.score === ranked[0]?.score);
  const ambiguous = new Set(top.map((memory) => memory.text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim())).size > 1;
  const selected = ambiguous ? [] : ranked.slice(0, request.limit);
  for (const memory of ranked) if (!selected.includes(memory)) excluded.push({ memoryId: memory.memoryId, reason: ambiguous ? 'ambiguous-top-score' : 'selection-limit', score: memory.score });
  excluded.sort(byId);
  return { id: request.requestId, tenant: request.tenant, entity: request.entity, query: request.query, asOf: request.asOf, threshold: request.threshold, limit: request.limit,
    status: selected.length ? 'retrieved' : 'abstained', selected, excluded,
    explanation: ambiguous ? 'Distinct memory texts share the top lexical score. Retrieval abstained.' : selected.length ? 'Selected temporally eligible exact source text using integer query-token overlap. This score is not a probability.' : 'No temporally eligible memory meets the lexical threshold.',
    ledgerHead: state.memoryHead, implementationHash, algorithmVersion: VERSION, snapshot: true };
}

/** Caller-selected tenant labels and timestamps are local inputs, not authentication or trusted wall time. */
export function chronosRank(db) {
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS chronosrank_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL, entry_key TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, input TEXT NOT NULL, body TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL, UNIQUE(tenant,entry_key));
    CREATE TABLE IF NOT EXISTS chronosrank_heads (tenant TEXT PRIMARY KEY, head TEXT NOT NULL, count INTEGER NOT NULL);`);
  const insert = db.prepare('INSERT INTO chronosrank_log (tenant,entry_key,operation,request_hash,input,body,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?)');
  function checkedSource() { if (createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex') !== implementationHash) fail('Implementation changed after module load. Restart before using the ledger.', 'restart_required'); }
  function load(tenant) {
    const state = initialState();
    try {
      for (const row of db.prepare('SELECT * FROM chronosrank_log WHERE tenant=? ORDER BY seq').all(tenant)) {
        const request = JSON.parse(row.input), body = JSON.parse(row.body);
        const signed = { tenant: row.tenant, key: row.entry_key, operation: row.operation, requestHash: row.request_hash, input: request, body, prevHash: row.prev_hash };
        if (row.tenant !== tenant || request.tenant !== tenant || row.prev_hash !== state.head || row.hash !== digest(signed) || row.request_hash !== digest(request) || row.input !== JSON.stringify(canonical(request)) || row.body !== JSON.stringify(canonical(body))) fail('Ledger hash or canonical serialization does not match.');
        const commandKey = row.operation === 'retrieve' ? `request:${request.requestId}` : `command:${request.commandId}`;
        if (row.entry_key !== commandKey || state.commands.has(commandKey)) fail('Ledger command identity does not match.');
        if (row.operation === 'append') {
          validateAppend(request); applyMemory(state, request);
          if (digest(body) !== digest({ accepted: true, event: request })) fail('Stored memory response does not match its event.');
          state.memoryHead = row.hash;
        } else if (row.operation === 'retrieve') {
          validateRetrieve(request);
          if (body.algorithmVersion !== VERSION || !/^[a-f0-9]{64}$/u.test(body.implementationHash)) fail('Unknown receipt implementation.');
          const expected = { ...evaluate(state, request), implementationHash: body.implementationHash };
          if (digest(body) !== digest(expected)) fail('Stored retrieval does not match its exact ledger snapshot.');
          state.receipts.set(request.requestId, body); state.watermark = state.watermark > request.asOf ? state.watermark : request.asOf;
        } else if (row.operation === 'feedback') {
          validateFeedback(request);
          if (!state.receipts.has(request.receiptId) || digest(body) !== digest({ accepted: true, feedback: request })) fail('Feedback does not reference a preceding receipt in this tenant.');
          state.feedback.push(request);
        } else fail('Unknown ledger operation.');
        state.commands.set(commandKey, { operation: row.operation, hash: row.request_hash, body }); state.head = row.hash; state.count += 1;
      }
      const head = db.prepare('SELECT head,count FROM chronosrank_heads WHERE tenant=?').get(tenant);
      if (head ? head.head !== state.head || head.count !== state.count : state.count !== 0) fail('Ledger head or entry count does not match.');
      return state;
    } catch (error) { fail(`Ledger integrity verification failed: ${error.message}`, 'integrity_failed'); }
  }
  function write(state, tenant, key, operation, request, body) {
    const hash = digest({ tenant, key, operation, requestHash: digest(request), input: request, body, prevHash: state.head });
    insert.run(tenant, key, operation, digest(request), JSON.stringify(canonical(request)), JSON.stringify(canonical(body)), state.head, hash);
    db.prepare('INSERT INTO chronosrank_heads (tenant,head,count) VALUES (?,?,?) ON CONFLICT(tenant) DO UPDATE SET head=excluded.head,count=excluded.count').run(tenant, hash, state.count + 1);
    return hash;
  }
  function transact(tenant, callback, writable = true) {
    checkedSource(); db.exec(writable ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try { const value = callback(load(tenant)); db.exec('COMMIT'); return copy(value); } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function replay(state, key, operation, request) {
    const existing = state.commands.get(key);
    if (existing && (existing.operation !== operation || existing.hash !== digest(request))) fail('This command ID is immutable and was used with different input.', 'replay_conflict');
    return existing?.body;
  }
  const decorate = (state, receipt, replayed = false) => ({ ...receipt, stale: receipt.ledgerHead !== state.memoryHead || receipt.implementationHash !== implementationHash, currentLedgerHead: state.memoryHead, currentImplementationHash: implementationHash, replayed });
  return {
    catalog() { return { scope: 'Local deterministic temporal memory ledger with exact supplied source quotes. No trained reranker, vector search, calibrated confidence, authenticated tenancy, model benchmark or provider integration.', tenants: ['acme', 'beta'], example: copy(chronosExample) }; },
    append(value) {
      validateAppend(value);
      return transact(value.tenant, (state) => {
        const key = `command:${value.commandId}`, old = replay(state, key, 'append', value);
        if (old) return { ...old, replayed: true };
        applyMemory(state, value); const body = { accepted: true, event: value }; write(state, value.tenant, key, 'append', value, body); return { ...body, replayed: false };
      });
    },
    retrieve(value) {
      validateRetrieve(value);
      return transact(value.tenant, (state) => {
        const key = `request:${value.requestId}`, old = replay(state, key, 'retrieve', value);
        if (old) return decorate(state, old, true);
        const receipt = evaluate(state, value); write(state, value.tenant, key, 'retrieve', value, receipt); return decorate(state, receipt);
      });
    },
    receipt(value) {
      validateLookup(value, ['tenant', 'receiptId']);
      return transact(value.tenant, (state) => { const receipt = state.receipts.get(value.receiptId); if (!receipt) fail('Receipt not found in this tenant.', 'not_found'); return decorate(state, receipt, true); }, false);
    },
    feedback(value) {
      validateFeedback(value);
      return transact(value.tenant, (state) => {
        const key = `command:${value.commandId}`, old = replay(state, key, 'feedback', value);
        if (old) return { ...old, replayed: true };
        if (!state.receipts.has(value.receiptId)) fail('Feedback requires a receipt in the same tenant.', 'not_found');
        const body = { accepted: true, feedback: value }; write(state, value.tenant, key, 'feedback', value, body); return { ...body, replayed: false };
      });
    },
    history(value) {
      validateLookup(value);
      return transact(value.tenant, (state) => ({ tenant: value.tenant, events: state.events, receipts: [...state.receipts.values()].map((receipt) => decorate(state, receipt, true)), feedback: state.feedback, knowledgeWatermark: state.watermark || null }), false);
    },
    audit(value) {
      validateLookup(value);
      return transact(value.tenant, (state) => ({ tenant: value.tenant, valid: true, eventCount: state.events.length, entryCount: state.count, head: state.head, knowledgeWatermark: state.watermark || null }), false);
    },
    verifyAudit(value) {
      validateLookup(value);
      try { return transact(value.tenant, (state) => ({ tenant: value.tenant, valid: true, eventCount: state.events.length, entryCount: state.count, head: state.head, knowledgeWatermark: state.watermark || null }), false); }
      catch (error) { if (error.code !== 'integrity_failed') throw error; return { tenant: value.tenant, valid: false, reason: error.message }; }
    },
  };
}

export function openChronosRank(path = ':memory:') {
  const db = new DatabaseSync(path);
  try { db.exec('PRAGMA busy_timeout=5000'); if (path !== ':memory:') db.exec('PRAGMA journal_mode=WAL'); return { ...chronosRank(db), close: () => db.close() }; }
  catch (error) { db.close(); throw error; }
}
