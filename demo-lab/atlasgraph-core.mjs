import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Structured review annotations; optional source origins preserve exact imported text.
// This is not semantic extraction or a model layer.
export const atlasGraphLoadedImplementationHash = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const LIMITS = Object.freeze({ sources: 12, pages: 32, references: 6, claims: 12, inputBytes: 240000, text: 8000, hops: 6 });
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const own = (object, key) => Object.hasOwn(object, key);
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class AtlasGraphError extends Error {
  constructor(message, code = 'invalid_input') { super(message); this.name = 'AtlasGraphError'; this.code = code; this.status = 400; }
}
const fail = (message, code) => { throw new AtlasGraphError(message, code); };
function safe(value, depth = 0) {
  if (depth > 12) fail('Payload nesting exceeds 12 levels.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { if (value.length > 256) fail('Array exceeds 256 entries.'); value.forEach((item) => safe(item, depth + 1)); return; }
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Only JSON data is accepted.');
  for (const [key, item] of Object.entries(value)) { if (forbidden.has(key)) fail('Prototype-related keys are forbidden.'); safe(item, depth + 1); }
}
function object(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object.');
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail('Unknown input field.');
  if (required.some((key) => !own(value, key))) fail(`Required fields: ${required.join(', ')}.`);
}
function input(value, allowed, required = allowed) { safe(value); if (bytes(value) > LIMITS.inputBytes) fail('Payload exceeds 240000 UTF-8 bytes.'); object(value, allowed, required); }
function string(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail(`${label} must be a nonempty string up to ${max} characters.`);
  return value;
}
function id(value, label = 'Identifier') { string(value, label, 80); if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value)) fail(`${label} has an invalid format.`); return value; }
function integer(value, fallback, min, max, label) { const result = value === undefined ? fallback : value; if (!Number.isInteger(result) || result < min || result > max) fail(`${label} must be an integer from ${min} to ${max}.`); return result; }
function array(value, label, max, min = 0) { if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} must contain ${min} to ${max} entries.`); return value; }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
function normalizeOrigin(origin, pages) {
  object(origin, ['format', 'raw', 'sha256', 'ranges']);
  if (origin.format !== 'markdown-atx-v1') fail('Unknown source origin format.');
  string(origin.raw, 'Raw Markdown source', 240000);
  if (!origin.raw.isWellFormed() || /\r(?!\n)/u.test(origin.raw)) fail('Source origin requires well-formed Unicode and LF or CRLF lines.');
  const rawHash = createHash('sha256').update(origin.raw, 'utf8').digest('hex');
  if (origin.sha256 !== rawHash) fail('Raw source origin hash does not match its exact bytes.');
  const byId = new Map(pages.map((page) => [page.id, page])); const seen = new Set(); let next = 0;
  const ranges = array(origin.ranges, 'Source origin ranges', LIMITS.pages, 1).map((range) => {
    object(range, ['pageId', 'startUtf16', 'endUtf16', 'startByte', 'endByte']); id(range.pageId, 'Origin page ID');
    if (!byId.has(range.pageId) || seen.has(range.pageId)) fail('Origin ranges must identify each source page exactly once.'); seen.add(range.pageId);
    for (const field of ['startUtf16', 'endUtf16', 'startByte', 'endByte']) if (!Number.isSafeInteger(range[field]) || range[field] < 0) fail('Origin offsets must be nonnegative safe integers.');
    if (range.startUtf16 !== next || range.endUtf16 <= range.startUtf16 || range.endUtf16 > origin.raw.length) fail('Origin ranges must cover the source contiguously in original order.');
    const exact = origin.raw.slice(range.startUtf16, range.endUtf16);
    if (!exact.isWellFormed() || exact !== byId.get(range.pageId).text || range.startByte !== Buffer.byteLength(origin.raw.slice(0, range.startUtf16), 'utf8') || range.endByte !== Buffer.byteLength(origin.raw.slice(0, range.endUtf16), 'utf8')) fail('Origin ranges must match exact page text and UTF-8 offsets.');
    next = range.endUtf16; return { ...range };
  });
  if (next !== origin.raw.length || seen.size !== pages.length) fail('Origin ranges must cover every page and all raw source text.');
  return { format: origin.format, raw: origin.raw, sha256: rawHash, ranges };
}
function normalizeCompile(value) {
  input(value, ['tenant', 'sources']);
  const tenant = id(value.tenant, 'Tenant');
  const sourceIds = new Set(); const pageIds = new Set(); const pages = new Map();
  const sources = array(value.sources, 'Sources', LIMITS.sources, 1).map((source) => {
    object(source, ['id', 'version', 'title', 'approved', 'pages', 'origin'], ['id', 'version', 'title', 'approved', 'pages']);
    id(source.id, 'Source ID'); id(source.version, 'Source version'); string(source.title, 'Source title');
    if (sourceIds.has(source.id)) fail('Duplicate source ID.'); sourceIds.add(source.id);
    if (typeof source.approved !== 'boolean') fail('Source approved must be boolean.');
    const normalizedPages = array(source.pages, 'Source pages', LIMITS.pages, 1).map((page) => {
      object(page, ['id', 'title', 'text', 'claims', 'references'], ['id', 'title', 'text']);
      id(page.id, 'Page ID'); string(page.title, 'Page title'); string(page.text, 'Page text', LIMITS.text);
      if (pageIds.has(page.id)) fail('Page IDs must be unique across the tenant snapshot.'); pageIds.add(page.id);
      if (pageIds.size > LIMITS.pages) fail('Snapshot exceeds 32 pages.');
      const claimKeys = new Set();
      const claims = array(page.claims ?? [], 'Claims', LIMITS.claims).map((claim) => {
        object(claim, ['key', 'value']); id(claim.key, 'Claim key'); string(claim.value, 'Claim value', 1000);
        if (claimKeys.has(claim.key)) fail('Duplicate claim key within a page.'); claimKeys.add(claim.key);
        if (!page.text.includes(claim.value)) fail('Claim values must be exact substrings of their page text.');
        return { key: claim.key, value: claim.value };
      }).sort((a, b) => a.key.localeCompare(b.key));
      const refKeys = new Set();
      const references = array(page.references ?? [], 'References', LIMITS.references).map((reference) => {
        object(reference, ['to', 'relation', 'quote']); id(reference.to, 'Reference target'); id(reference.relation, 'Relation'); string(reference.quote, 'Reference quote', LIMITS.text);
        if (!page.text.includes(reference.quote) || !reference.quote.includes(reference.to)) fail('Reference quotes must occur exactly in the source text and name the target page ID.');
        const key = `${reference.to}:${reference.relation}`; if (refKeys.has(key)) fail('Duplicate reference.'); refKeys.add(key);
        return { to: reference.to, relation: reference.relation, quote: reference.quote };
      }).sort((a, b) => `${a.to}:${a.relation}`.localeCompare(`${b.to}:${b.relation}`));
      const result = { id: page.id, title: page.title, text: page.text, claims, references };
      pages.set(page.id, { sourceId: source.id, approved: source.approved, ...result });
      return result;
    }).sort((a, b) => a.id.localeCompare(b.id));
    return { id: source.id, version: source.version, title: source.title, approved: source.approved, pages: normalizedPages, ...(own(source, 'origin') ? { origin: normalizeOrigin(source.origin, normalizedPages) } : {}) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const links = [];
  for (const page of pages.values()) for (const reference of page.references) {
    const target = pages.get(reference.to);
    if (!target) fail(`Reference target ${reference.to} is absent from this tenant snapshot.`);
    if (!page.approved || !target.approved) fail('References may only connect approved sources.');
    links.push({ from: page.id, to: reference.to, relation: reference.relation, support: { pageId: page.id, quote: reference.quote } });
  }
  links.sort((a, b) => `${a.from}:${a.to}:${a.relation}`.localeCompare(`${b.from}:${b.to}:${b.relation}`));
  return canonical({ tenant, sources, links });
}

export function atlasGraph(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS atlas_source_versions (tenant TEXT NOT NULL, source_id TEXT NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(tenant,source_id,version));
    CREATE TABLE IF NOT EXISTS atlas_snapshots (tenant TEXT NOT NULL, snapshot_hash TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(tenant,snapshot_hash));
    CREATE TABLE IF NOT EXISTS atlas_current (tenant TEXT PRIMARY KEY, snapshot_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS atlas_receipts (tenant TEXT NOT NULL, id TEXT NOT NULL, request_hash TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(tenant,id));
    CREATE TABLE IF NOT EXISTS atlas_errors (tenant TEXT NOT NULL, id TEXT NOT NULL, receipt_id TEXT, message TEXT NOT NULL, correction TEXT, status TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, reviewed_at TEXT, PRIMARY KEY(tenant,id));`);
  const currentHash = (tenant) => db.prepare('SELECT snapshot_hash FROM atlas_current WHERE tenant=?').get(tenant)?.snapshot_hash ?? null;
  function graph(tenant) {
    const snapshotHash = currentHash(tenant);
    if (!snapshotHash) fail('No compiled snapshot exists for this tenant.', 'not_compiled');
    const stored = db.prepare('SELECT body FROM atlas_snapshots WHERE tenant=? AND snapshot_hash=?').get(tenant, snapshotHash);
    const snapshot = JSON.parse(stored.body); const pages = new Map();
    for (const source of snapshot.sources) if (source.approved) for (const page of source.pages) pages.set(page.id, { ...page, sourceId: source.id, version: source.version, sourceHash: hash(canonical(source)), ...(source.origin ? { origin: { format: source.origin.format, sha256: source.origin.sha256, range: source.origin.ranges.find((range) => range.pageId === page.id) } } : {}) });
    return { snapshotHash, pages, links: snapshot.links };
  }
  const linksFor = (state, pageId) => state.links.filter((link) => link.from === pageId || link.to === pageId).map((link) => ({ ...link, direction: link.from === pageId ? 'outgoing' : 'incoming', neighbor: link.from === pageId ? link.to : link.from }));
  function parseTenant(value, allowed, required = ['tenant']) { input(value, allowed, required); return id(value.tenant, 'Tenant'); }
  function decorate(row, replayed = false) { const result = JSON.parse(row.body); return { ...result, stale: currentHash(result.tenant) !== result.snapshotHash, replayed }; }
  function receipt(value) {
    const tenant = parseTenant(value, ['tenant', 'id'], ['tenant', 'id']); id(value.id, 'Receipt ID');
    const row = db.prepare('SELECT body FROM atlas_receipts WHERE tenant=? AND id=?').get(tenant, value.id);
    if (!row) fail('Receipt not found in this tenant.', 'not_found');
    return decorate(row);
  }
  function recordError(value) {
    const tenant = parseTenant(value, ['tenant', 'receiptId', 'message', 'correction'], ['tenant', 'message']);
    string(value.message, 'Error message', 2000);
    if (value.receiptId !== undefined) receipt({ tenant, id: value.receiptId });
    if (value.correction !== undefined) string(value.correction, 'Proposed correction', 2000);
    const errorId = randomUUID(); const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO atlas_errors (tenant,id,receipt_id,message,correction,status,created_at) VALUES (?,?,?,?,?,?,?)').run(tenant, errorId, value.receiptId ?? null, value.message, value.correction ?? null, 'pending', createdAt);
    return { id: errorId, tenant, receiptId: value.receiptId ?? null, message: value.message, correction: value.correction ?? null, status: 'pending', createdAt };
  }
  return {
    compile(value, options = {}) {
      input(options, ['expectedSnapshotHash'], []);
      if (own(options, 'expectedSnapshotHash') && options.expectedSnapshotHash !== null && (typeof options.expectedSnapshotHash !== 'string' || !/^[a-f0-9]{64}$/u.test(options.expectedSnapshotHash))) fail('Expected snapshot must be null or a SHA-256 identity.');
      const snapshot = normalizeCompile(value); const snapshotHash = hash(snapshot); const createdAt = new Date().toISOString(); let reused = false;
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = currentHash(snapshot.tenant);
        if (own(options, 'expectedSnapshotHash') && current !== options.expectedSnapshotHash && current !== snapshotHash) fail('The tenant snapshot changed after review. Preview the whole replacement again.', 'snapshot_conflict');
        reused = current === snapshotHash;
        for (const source of snapshot.sources) {
          const sourceHash = hash(canonical(source));
          const previous = db.prepare('SELECT content_hash FROM atlas_source_versions WHERE tenant=? AND source_id=? AND version=?').get(snapshot.tenant, source.id, source.version);
          if (previous && previous.content_hash !== sourceHash) fail('A source version is immutable. Change its version before changing content or approval.', 'version_conflict');
          db.prepare('INSERT OR IGNORE INTO atlas_source_versions VALUES (?,?,?,?,?)').run(snapshot.tenant, source.id, source.version, sourceHash, JSON.stringify(source));
        }
        db.prepare('INSERT OR IGNORE INTO atlas_snapshots VALUES (?,?,?,?)').run(snapshot.tenant, snapshotHash, JSON.stringify(snapshot), createdAt);
        db.prepare('INSERT INTO atlas_current VALUES (?,?) ON CONFLICT(tenant) DO UPDATE SET snapshot_hash=excluded.snapshot_hash').run(snapshot.tenant, snapshotHash);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { tenant: snapshot.tenant, snapshotHash, sources: snapshot.sources.length, pages: snapshot.sources.reduce((n, source) => n + source.pages.length, 0), approvedPages: snapshot.sources.filter((source) => source.approved).reduce((n, source) => n + source.pages.length, 0), links: snapshot.links.length, reused };
    },
    search(value) {
      const tenant = parseTenant(value, ['tenant', 'query', 'limit'], ['tenant', 'query']); string(value.query, 'Search query');
      const limit = integer(value.limit, 10, 1, 20, 'Search limit'); const state = graph(tenant);
      const terms = [...new Set(value.query.toLowerCase().split(/[^\p{L}\p{N}_.-]+/u).filter(Boolean))];
      if (!terms.length) fail('Search query must contain searchable terms.');
      const matches = [...state.pages.values()].map((page) => ({ page, score: terms.filter((term) => `${page.id} ${page.title} ${page.text}`.toLowerCase().includes(term)).length })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.page.id.localeCompare(b.page.id)).slice(0, limit).map(({ page, score }) => ({ id: page.id, title: page.title, sourceId: page.sourceId, version: page.version, score, excerpt: page.text.slice(0, 220) }));
      return { tenant, snapshotHash: state.snapshotHash, matches };
    },
    read(value) {
      const tenant = parseTenant(value, ['tenant', 'id'], ['tenant', 'id']); id(value.id, 'Page ID'); const state = graph(tenant); const page = state.pages.get(value.id);
      if (!page) fail('Approved page not found in this tenant.', 'not_found');
      return { tenant, snapshotHash: state.snapshotHash, page };
    },
    follow(value) {
      const tenant = parseTenant(value, ['tenant', 'id'], ['tenant', 'id']); id(value.id, 'Page ID'); const state = graph(tenant);
      if (!state.pages.has(value.id)) fail('Approved page not found in this tenant.', 'not_found');
      return { tenant, snapshotHash: state.snapshotHash, pageId: value.id, links: linksFor(state, value.id) };
    },
    answer(value) {
      const tenant = parseTenant(value, ['tenant', 'question', 'startId', 'requiredClaims', 'maxHops', 'evidenceBudgetBytes', 'requestId'], ['tenant', 'question', 'startId', 'requiredClaims']);
      string(value.question, 'Question', 1000); id(value.startId, 'Start page');
      const requiredClaims = array(value.requiredClaims, 'Required claim keys', 8, 1).map((key) => id(key, 'Required claim key')).sort();
      if (new Set(requiredClaims).size !== requiredClaims.length) fail('Required claim keys must be unique.');
      const maxHops = integer(value.maxHops, 2, 0, LIMITS.hops, 'Maximum hops');
      const evidenceBudgetBytes = integer(value.evidenceBudgetBytes, 12000, 256, 24000, 'Evidence budget');
      const requestId = value.requestId === undefined ? randomUUID() : id(value.requestId, 'Request ID');
      const normalized = canonical({ tenant, question: value.question, startId: value.startId, requiredClaims, maxHops, evidenceBudgetBytes }); const requestHash = hash(normalized);
      const previous = db.prepare('SELECT request_hash,body FROM atlas_receipts WHERE tenant=? AND id=?').get(tenant, requestId);
      if (previous) { if (previous.request_hash !== requestHash) fail('Request ID already belongs to a different query.', 'request_conflict'); return decorate(previous, true); }
      const state = graph(tenant); const trace = []; const visited = new Set(); const queue = []; let truncated = false;
      if (state.pages.has(value.startId)) queue.push({ pageId: value.startId, depth: 0, via: null });
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const step = queue[cursor]; if (visited.has(step.pageId)) continue; visited.add(step.pageId); trace.push(step);
        for (const link of linksFor(state, step.pageId)) if (!visited.has(link.neighbor)) {
          if (step.depth >= maxHops) { if (!queue.some((item) => item.pageId === link.neighbor && item.depth <= maxHops)) truncated = true; }
          else if (!queue.some((item) => item.pageId === link.neighbor)) queue.push({ pageId: link.neighbor, depth: step.depth + 1, via: link });
        }
      }
      // All bounded reachable pages are examined before declaring sufficiency, so
      // a later contradictory claim cannot be hidden by an early successful hit.
      const claimsByKey = new Map(requiredClaims.map((key) => [key, new Map()]));
      for (const step of trace) for (const claim of state.pages.get(step.pageId).claims) if (claimsByKey.has(claim.key)) {
        const values = claimsByKey.get(claim.key); if (!values.has(claim.value)) values.set(claim.value, []); values.get(claim.value).push(step.pageId);
      }
      const missing = requiredClaims.filter((key) => claimsByKey.get(key).size === 0);
      const conflicts = requiredClaims.filter((key) => claimsByKey.get(key).size > 1);
      const candidates = trace.map((step) => { const page = state.pages.get(step.pageId); return { pageId: page.id, sourceId: page.sourceId, version: page.version, sourceHash: page.sourceHash, text: page.text, ...(page.origin ? { origin: page.origin } : {}) }; });
      const requiredEvidenceBytes = bytes(candidates);
      const reason = !state.pages.has(value.startId) ? 'missing_start' : conflicts.length ? 'contradictory_evidence' : missing.length ? 'missing_evidence' : truncated ? 'hop_limit' : requiredEvidenceBytes > evidenceBudgetBytes ? 'evidence_budget' : 'supported';
      const supported = reason === 'supported'; const citations = supported ? candidates : [];
      const claims = supported ? requiredClaims.map((key) => { const [claimValue, pageIds] = [...claimsByKey.get(key)][0]; return { key, value: claimValue, pageIds }; }) : [];
      const result = { id: requestId, tenant, question: value.question, startId: value.startId, requiredClaims, status: supported ? 'supported' : 'abstained', reason, claims, missing, conflicts, citations, trace, maxHops, evidenceBudgetBytes, evidenceBytes: bytes(citations), requiredEvidenceBytes, snapshotHash: state.snapshotHash, createdAt: new Date().toISOString() };
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO atlas_receipts VALUES (?,?,?,?,?)').run(tenant, requestId, requestHash, JSON.stringify(result), result.createdAt);
        if (!supported) recordError({ tenant, receiptId: requestId, message: `Retrieval abstained: ${reason}. Missing: ${missing.join(', ') || 'none'}. Conflicts: ${conflicts.join(', ') || 'none'}.` });
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { ...result, stale: false, replayed: false };
    },
    receipt,
    history(value) { const tenant = parseTenant(value, ['tenant']); return { tenant, receipts: db.prepare('SELECT body FROM atlas_receipts WHERE tenant=? ORDER BY created_at DESC,id DESC LIMIT 50').all(tenant).map((row) => decorate(row)) }; },
    errors(value) { const tenant = parseTenant(value, ['tenant']); return { tenant, errors: db.prepare('SELECT id,receipt_id AS receiptId,message,correction,status,note,created_at AS createdAt,reviewed_at AS reviewedAt FROM atlas_errors WHERE tenant=? ORDER BY created_at DESC,id DESC LIMIT 50').all(tenant) }; },
    recordError,
    reviewError(value) {
      const tenant = parseTenant(value, ['tenant', 'id', 'status', 'note'], ['tenant', 'id', 'status', 'note']); id(value.id, 'Error ID');
      if (!['accepted', 'rejected'].includes(value.status)) fail('Review status must be accepted or rejected.'); string(value.note, 'Review note', 2000);
      const result = db.prepare('UPDATE atlas_errors SET status=?,note=?,reviewed_at=? WHERE tenant=? AND id=? AND status=?').run(value.status, value.note, new Date().toISOString(), tenant, value.id, 'pending');
      if (!result.changes) fail('Pending error not found in this tenant.', 'not_found');
      return { tenant, id: value.id, status: value.status, note: value.note, sourceChanged: false };
    },
  };
}

export function openAtlasGraph(path = ':memory:') {
  const db = new DatabaseSync(path); db.exec('PRAGMA busy_timeout=5000');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode=WAL');
  return { ...atlasGraph(db), close: () => db.close() };
}

export const atlasGraphLimits = LIMITS;
