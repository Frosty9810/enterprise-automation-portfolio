import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { docksideScenarios, docksideScope } from './dockside-fixtures.mjs';

const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const hash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const codeHash = () => hash(['dockside-core.mjs', 'dockside-fixtures.mjs'].map((name) => readFileSync(new URL(name, import.meta.url), 'utf8')));
const loadedCodeHash = codeHash();
const GENESIS = '0'.repeat(64);
const clone = (value) => JSON.parse(JSON.stringify(value));
const REGISTRY = { acme: { vendors: ['vendor-acme'], items: ['item-widget', 'item-bolt'], currency: 'USD' }, beta: { vendors: ['vendor-beta'], items: ['item-widget', 'item-bolt'], currency: 'USD' } };

export class DocksideError extends Error {
  constructor(message, code = 'invalid_input') { super(message); this.name = 'DocksideError'; this.code = code; this.status = code === 'not_found' ? 404 : ['integrity_failed', 'stale'].includes(code) ? 409 : 400; }
}
const fail = (message, code) => { throw new DocksideError(message, code); };
function safe(value, depth = 0) {
  if (depth > 10) fail('Input exceeds the nesting limit.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) fail('Only finite JSON values are accepted.');
  for (const [key, item] of Object.entries(value)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Prototype-related keys are forbidden.'); safe(item, depth + 1); }
}
function object(value, fields, required = fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) fail(`Expected fields: ${fields.join(', ')}.`);
}
function input(value, fields, required = fields) { safe(value); if (Buffer.byteLength(JSON.stringify(value)) > 24000) fail('Input exceeds 24000 bytes.'); object(value, fields, required); }
function text(value, label, max = 160) { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail(`${label} must be a nonempty bounded string.`); return value; }
function id(value) { text(value, 'Identifier', 80); if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) fail('Identifier contains unsupported characters.'); return value; }
function tenantId(value) { if (!Object.hasOwn(REGISTRY, value)) fail('Unknown tenant.'); return value; }
function actor(value, tenant, role) { id(value); const labels = [`${tenant}-${role}`, `${tenant}-dual-role`, ...(role === 'reviewer' ? [`${tenant}-reviewer-two`] : [])]; if (!labels.includes(value)) fail(`Select a configured ${role} label for this tenant.`); }
function date(value) { try { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && value >= '2000-01-01' && value <= '2099-12-31' && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; } catch { return false; } }
const integer = (value, maximum) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;

function validate(extraction, tenant) {
  const reasons = [], add = (message) => reasons.push(message);
  try { object(extraction, ['kind', 'vendorId', 'reference', 'issuedOn', 'currency', 'lines', 'totalMinor']); } catch (error) { return { valid: false, reasons: [error.message] }; }
  if (!['invoice', 'packing-list'].includes(extraction.kind)) add('kind must be invoice or packing-list.');
  if (!REGISTRY[tenant].vendors.includes(extraction.vendorId)) add('Vendor is not registered for this tenant.');
  try { id(extraction.reference); } catch { add('reference must be a bounded identifier.'); }
  if (!date(extraction.issuedOn)) add('issuedOn must be a real date from 2000 through 2099.');
  if (extraction.currency !== REGISTRY[tenant].currency) add('currency must match the registered USD currency.');
  if (!integer(extraction.totalMinor, 1_000_000_000_000)) add('totalMinor must be a bounded integer in minor currency units.');
  if (!Array.isArray(extraction.lines) || !extraction.lines.length || extraction.lines.length > 50) add('lines must contain 1 through 50 entries.');
  else {
    let sum = 0n; const seen = new Set();
    extraction.lines.forEach((line, index) => {
      try { object(line, ['itemId', 'quantity', 'unitPriceMinor', 'lineTotalMinor']); } catch { add(`Line ${index + 1} has an invalid schema.`); return; }
      if (!REGISTRY[tenant].items.includes(line.itemId)) add(`Line ${index + 1} item is not registered.`);
      if (seen.has(line.itemId)) add(`Line ${index + 1} repeats an item.`); seen.add(line.itemId);
      if (!integer(line.quantity, 1_000_000) || line.quantity === 0) add(`Line ${index + 1} quantity must be a positive bounded integer.`);
      if (!integer(line.unitPriceMinor, 1_000_000_000) || !integer(line.lineTotalMinor, 1_000_000_000_000)) add(`Line ${index + 1} prices must be bounded integer minor units.`);
      if (integer(line.quantity, 1_000_000) && integer(line.unitPriceMinor, 1_000_000_000) && integer(line.lineTotalMinor, 1_000_000_000_000)) {
        if (BigInt(line.quantity) * BigInt(line.unitPriceMinor) !== BigInt(line.lineTotalMinor)) add(`Line ${index + 1} quantity times unit price differs from line total.`);
        sum += BigInt(line.lineTotalMinor);
      }
      if (extraction.kind === 'packing-list' && (line.unitPriceMinor !== 0 || line.lineTotalMinor !== 0)) add('Packing-list monetary fields must be zero; this receiver does not infer invoice values.');
    });
    if (integer(extraction.totalMinor, 1_000_000_000_000) && sum !== BigInt(extraction.totalMinor)) add('Sum of line totals differs from totalMinor.');
  }
  return { valid: reasons.length === 0, reasons };
}

export function dockside(db, options = {}) {
  object(options, ['registryRevision'], []);
  const revision = options.registryRevision ?? 'v1'; text(revision, 'Registry revision');
  const configHash = hash({ revision, registry: REGISTRY }), implementationHash = loadedCodeHash;
  db.exec(`CREATE TABLE IF NOT EXISTS dockside_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL, receipt_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dockside_receiver (record_id TEXT PRIMARY KEY, tenant TEXT NOT NULL, business_key TEXT NOT NULL, receipt_id TEXT NOT NULL, content_hash TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(tenant,business_key));
    CREATE TABLE IF NOT EXISTS dockside_head (id INTEGER PRIMARY KEY CHECK(id=1), event_count INTEGER NOT NULL, head_hash TEXT NOT NULL);
    INSERT OR IGNORE INTO dockside_head(id,event_count,head_hash) VALUES(1,0,'${GENESIS}');`);
  const events = () => db.prepare('SELECT * FROM dockside_events ORDER BY seq').all();
  const records = () => db.prepare('SELECT * FROM dockside_receiver ORDER BY record_id').all();
  const businessKey = (job) => hash({ kind: job.extraction.kind, vendorId: job.extraction.vendorId, reference: job.extraction.reference });
  function reduce(rows) {
    const jobs = new Map();
    for (const row of rows) {
      const payload = JSON.parse(row.payload);
      if (row.kind === 'submitted') jobs.set(row.receipt_id, { ...payload, receiptId: row.receipt_id, tenant: row.tenant, review: null, delivery: { attempts: 0, receiverRecordId: null } });
      else {
        const job = jobs.get(row.receipt_id); if (!job) fail('Audit references a missing job.', 'integrity_failed');
        if (row.kind === 'reviewed') { job.review = payload; job.status = payload.decision === 'approve' ? 'ready' : 'review-rejected'; }
        else if (row.kind === 'superseded') job.status = 'superseded';
        else if (row.kind === 'synced') { job.status = payload.status; job.delivery = { attempts: job.delivery.attempts + 1, receiverRecordId: payload.receiverRecordId }; }
        else if (row.kind === 'reconciled') { job.status = 'delivered'; job.delivery.receiverRecordId = payload.receiverRecordId; }
        else fail('Audit contains an unknown event.', 'integrity_failed');
      }
    }
    return jobs;
  }
  function integrity() {
    try {
      const rows = events(); let previous = GENESIS, lastSeq = 0;
      const expected = new Map();
      for (const row of rows) {
        if (row.seq !== lastSeq + 1 || row.prev_hash !== previous || row.hash !== hash({ seq: row.seq, tenant: row.tenant, receiptId: row.receipt_id, kind: row.kind, payload: JSON.parse(row.payload), previous })) fail('Audit chain differs from stored source.', 'integrity_failed');
        previous = row.hash; lastSeq = row.seq;
        if (row.kind === 'synced') { const payload = JSON.parse(row.payload); if (payload.record) expected.set(payload.record.record_id, payload.record); }
      }
      const head = db.prepare('SELECT event_count,head_hash FROM dockside_head WHERE id=1').get();
      if (!head || head.event_count !== rows.length || head.head_hash !== previous) fail('Durable audit head/count differs from stored events.', 'integrity_failed');
      const jobs = reduce(rows), stored = records();
      if (stored.length !== expected.size || stored.some((record) => hash({ ...record }) !== hash(expected.get(record.record_id)))) fail('Local receiver differs from the audited delivery effects.', 'integrity_failed');
      for (const job of jobs.values()) if (job.contentHash !== hash({ document: job.document, extraction: job.extraction, sourceHash: job.sourceHash, configHash: job.configHash, implementationHash: job.implementationHash })) fail('Submitted content hash differs.', 'integrity_failed');
      return { rows, jobs, stored, valid: true, eventCount: rows.length, receiverRecordCount: stored.length };
    } catch (error) { if (error.code === 'integrity_failed') throw error; fail('Stored Dockside state cannot be verified.', 'integrity_failed'); }
  }
  function transaction(work) { db.exec('BEGIN IMMEDIATE'); try { const state = integrity(); const result = work(state); integrity(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
  function read(work) { db.exec('BEGIN'); try { const result = work(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
  function append(tenant, receiptId, kind, payload) {
    const last = db.prepare('SELECT seq,hash FROM dockside_events ORDER BY seq DESC LIMIT 1').get(), seq = (last?.seq ?? 0) + 1, previous = last?.hash ?? GENESIS;
    const eventHash = hash({ seq, tenant, receiptId, kind, payload, previous });
    db.prepare('INSERT INTO dockside_events(seq,tenant,receipt_id,kind,payload,prev_hash,hash) VALUES(?,?,?,?,?,?,?)').run(seq, tenant, receiptId, kind, JSON.stringify(payload), previous, eventHash);
    db.prepare('UPDATE dockside_head SET event_count=?,head_hash=? WHERE id=1').run(seq, eventHash);
  }
  const stale = (job) => job.configHash !== configHash || job.implementationHash !== implementationHash || codeHash() !== loadedCodeHash;
  const dto = (job) => ({ ...clone(job), stale: stale(job), scope: docksideScope });
  function lookup(state, tenant, receiptId) { const job = state.jobs.get(receiptId); if (!job || job.tenant !== tenant) fail('Receipt not found in this tenant.', 'not_found'); return job; }
  function current(job) { if (stale(job)) fail('Stored source/configuration is stale; resubmit and review a new revision.', 'stale'); if (job.status === 'superseded') fail('A newer document revision superseded this receipt.'); }
  function params(value, extra = [], required = ['tenant', 'receiptId']) { input(value, ['tenant', 'receiptId', ...extra], required); tenantId(value.tenant); id(value.receiptId); }
  const result = (tenant, receiptId) => dto(lookup(integrity(), tenant, receiptId));
  const api = {
    catalog() { return { scope: docksideScope, scenarios: docksideScenarios(), tenants: ['acme', 'beta'], reviewerLabels: ['acme-reviewer', 'acme-reviewer-two', 'beta-reviewer'], receiverProfiles: [{ id: 'online', description: 'Local SQL receiver returns its stored record.' }, { id: 'offline', description: 'No receiver write; queue remains retryable.' }, { id: 'lose-response', description: 'Receiver commits but the caller sees an uncertain response.' }] }; },
    submit(value) {
      input(value, ['commandId', 'tenant', 'actor', 'document', 'extraction']); tenantId(value.tenant); id(value.commandId); actor(value.actor, value.tenant, 'operator');
      object(value.document, ['id', 'version', 'text']); id(value.document.id); text(value.document.text, 'Source document', 10000);
      if (!Number.isSafeInteger(value.document.version) || value.document.version < 1 || value.document.version > 1000000) fail('Document version must be a positive bounded integer.');
      return transaction((state) => {
        const replay = [...state.jobs.values()].find((job) => job.tenant === value.tenant && job.commandId === value.commandId);
        if (replay) { if (replay.inputHash !== hash(value)) fail('Command ID was already used for different input.'); return dto(replay); }
        const previous = [...state.jobs.values()].filter((job) => job.tenant === value.tenant && job.document.id === value.document.id);
        if (previous.some((job) => job.document.version >= value.document.version)) fail('A document revision must increase its version; use exact command replay for duplicates.');
        if (previous.some((job) => ['delivered', 'uncertain'].includes(job.status))) fail('This document already reached the receiver; correction requires an explicit ERP correction workflow.');
        const validation = validate(value.extraction, value.tenant), sourceHash = hash(value.document.text), contentHash = hash({ document: value.document, extraction: value.extraction, sourceHash, configHash, implementationHash });
        const receiptId = `dock-${randomUUID()}`;
        for (const job of previous) if (job.status !== 'superseded') append(value.tenant, job.receiptId, 'superseded', { supersededBy: receiptId });
        append(value.tenant, receiptId, 'submitted', { commandId: value.commandId, actor: value.actor, document: clone(value.document), extraction: clone(value.extraction), inputHash: hash(value), sourceHash, contentHash, configHash, implementationHash, validation, status: validation.valid ? 'awaiting-review' : 'rejected' });
        return result(value.tenant, receiptId);
      });
    },
    review(value) {
      params(value, ['reviewer', 'expectedHash', 'decision', 'note'], ['tenant', 'receiptId', 'reviewer', 'expectedHash', 'decision', 'note']);
      actor(value.reviewer, value.tenant, 'reviewer'); text(value.note, 'Review note', 1000); if (!['approve', 'reject'].includes(value.decision)) fail('Review decision must be approve or reject.');
      return transaction((state) => {
        const job = lookup(state, value.tenant, value.receiptId); current(job);
        if (job.actor === value.reviewer) fail('A different configured reviewer must review this job.');
        if (value.expectedHash !== job.contentHash) fail('Review must bind the exact current content hash.');
        const review = { reviewer: value.reviewer, decision: value.decision, note: value.note, expectedHash: value.expectedHash };
        if (job.review) { if (hash(job.review) !== hash(review)) fail('This immutable review already has a different decision.'); return dto(job); }
        if (!job.validation.valid || job.status !== 'awaiting-review') fail('Only validated jobs awaiting review can be reviewed.');
        append(value.tenant, value.receiptId, 'reviewed', review); return result(value.tenant, value.receiptId);
      });
    },
    sync(value) {
      params(value, ['receiverProfileId']); const profile = value.receiverProfileId ?? 'online'; if (!['online', 'offline', 'lose-response'].includes(profile)) fail('Unknown fixed local receiver scenario.');
      return transaction((state) => {
        const job = lookup(state, value.tenant, value.receiptId); current(job);
        if (job.status === 'delivered') return dto(job);
        if (job.status === 'uncertain') fail('Uncertain delivery must reconcile before retry.');
        if (!['ready', 'offline'].includes(job.status) || !job.validation.valid || job.review?.decision !== 'approve') fail('Delivery requires validated content and independent approval.');
        let record = null, status = 'offline';
        if (profile !== 'offline') {
          const key = businessKey(job), existing = db.prepare('SELECT * FROM dockside_receiver WHERE tenant=? AND business_key=?').get(value.tenant, key);
          if (existing && (existing.receipt_id !== job.receiptId || existing.content_hash !== job.contentHash)) fail('Receiver already contains this business document; no second posting is allowed.');
          record = existing ?? { record_id: `erp-${randomUUID()}`, tenant: value.tenant, business_key: key, receipt_id: job.receiptId, content_hash: job.contentHash, body: JSON.stringify(job.extraction) };
          if (!existing) db.prepare('INSERT INTO dockside_receiver(record_id,tenant,business_key,receipt_id,content_hash,body) VALUES(?,?,?,?,?,?)').run(record.record_id, record.tenant, record.business_key, record.receipt_id, record.content_hash, record.body);
          status = profile === 'lose-response' ? 'uncertain' : 'delivered';
        }
        append(value.tenant, value.receiptId, 'synced', { status, receiverProfileId: profile, receiverRecordId: status === 'delivered' ? record.record_id : null, record });
        return result(value.tenant, value.receiptId);
      });
    },
    reconcile(value) {
      params(value); return transaction((state) => {
        const job = lookup(state, value.tenant, value.receiptId); current(job); if (job.status === 'delivered') return dto(job);
        if (job.status !== 'uncertain') fail('Only an uncertain delivery needs reconciliation.');
        const record = db.prepare('SELECT * FROM dockside_receiver WHERE tenant=? AND business_key=?').get(value.tenant, businessKey(job));
        if (!record || record.receipt_id !== job.receiptId || record.content_hash !== job.contentHash) fail('Receiver has no matching authoritative delivery.', 'integrity_failed');
        append(value.tenant, value.receiptId, 'reconciled', { receiverRecordId: record.record_id }); return result(value.tenant, value.receiptId);
      });
    },
    receipt(value) { params(value); return read(() => result(value.tenant, value.receiptId)); },
    history(value) { input(value, ['tenant']); tenantId(value.tenant); return read(() => ({ receipts: [...integrity().jobs.values()].filter((job) => job.tenant === value.tenant).map(dto) })); },
    state(value) { input(value, ['tenant']); tenantId(value.tenant); return read(() => { const state = integrity(), jobs = [...state.jobs.values()].filter((job) => job.tenant === value.tenant).map(dto), erpRecords = state.stored.filter((record) => record.tenant === value.tenant).map((record) => ({ recordId: record.record_id, receiptId: record.receipt_id, contentHash: record.content_hash, extraction: JSON.parse(record.body) })); return { jobs, erpRecords, summary: { jobs: jobs.length, delivered: jobs.filter((job) => job.status === 'delivered').length, receiverRecords: erpRecords.length } }; }); },
    audit(value) { input(value, ['tenant']); tenantId(value.tenant); return read(() => { let verification; try { integrity(); verification = { valid: true }; } catch (error) { verification = { valid: false, reason: error.message }; } return { verification, events: events().filter((row) => row.tenant === value.tenant).map((row) => ({ seq: row.seq, receiptId: row.receipt_id, kind: row.kind, hash: row.hash, previousHash: row.prev_hash, payload: (() => { try { return JSON.parse(row.payload); } catch { return { unreadableRawPayload: row.payload }; } })() })) }; }); },
    verifyAudit(value) { input(value, ['tenant']); tenantId(value.tenant); return read(() => { const state = integrity(); return { valid: true, eventCount: state.rows.filter((row) => row.tenant === value.tenant).length, receiverRecordCount: state.stored.filter((row) => row.tenant === value.tenant).length, scope: 'Unkeyed local consistency checks; not protection against an administrator rewriting this database and its hashes.' }; }); },
  };
  return api;
}

export function openDockside(path = ':memory:', options = {}) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    return { ...dockside(db, options), close: () => db.close() };
  } catch (error) {
    try { db.close(); } catch { /* Preserve the original startup failure. */ }
    throw error;
  }
}
