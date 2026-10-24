import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { maintenanceRegistry, maintenanceScenarios, maintenanceScope, scenarioAsOf } from './maintenance-fixtures.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const sourceHash = () => digest(['maintenance-core.mjs', 'maintenance-fixtures.mjs'].map(name => createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex')));
const LOADED_SOURCE = sourceHash(), GENESIS = '0'.repeat(64);
export class MaintenanceError extends Error {
  constructor(message, code = 'invalid_input') { super(message); this.name = 'MaintenanceError'; this.code = code; this.status = code === 'not_found' ? 404 : ['conflict', 'stale', 'integrity_failed'].includes(code) ? 409 : 400; }
}
const fail = (message, code) => { throw new MaintenanceError(message, code); };
function safe(value, depth = 0) {
  if (depth > 8) fail('Input nesting exceeds eight levels.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { if (/[\u0000-\u001f\u007f]/u.test(value)) fail('Control characters are forbidden.'); return; }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) fail('Only finite JSON data is accepted.');
  if (Object.keys(value).length > 100) fail('Input collection exceeds 100 entries.');
  for (const [key, item] of Object.entries(value)) { if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Prototype keys are forbidden.'); safe(item, depth + 1); }
}
function schema(value, fields) {
  safe(value);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !fields.includes(key))) fail(`Expected exactly: ${fields.join(', ')}.`);
  if (Buffer.byteLength(JSON.stringify(value)) > 24000) fail('Input exceeds 24000 bytes.');
}
function text(value, label, max = 200) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be a nonempty string of at most ${max} characters.`); return value; }
function identifier(value) { text(value, 'Identifier', 100); if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) fail('Invalid identifier.'); return value; }
function instant(value) { if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value)) fail('Timestamp must be canonical UTC from 2000 through 2099.'); const n = Date.parse(value); if (!Number.isFinite(n) || new Date(n).toISOString() !== value) fail('Timestamp is not a real canonical UTC instant.'); return n; }
function windows(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) fail('Provide one through twelve access windows.');
  let previousEnd = -Infinity;
  for (const window of value) { schema(window, ['start', 'end']); const start = instant(window.start), end = instant(window.end); if (start >= end || end - start > 7 * 86400000 || start < previousEnd) fail('Windows must be sorted, disjoint, positive, and no longer than seven days.'); previousEnd = end; }
}
const overlaps = (a, b) => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
const fits = (window, slot) => Date.parse(window.start) <= Date.parse(slot.start) && Date.parse(slot.end) <= Date.parse(window.end);
const rowKey = row => `${row.tenant}:${row.caseId}`;
const knownTriggers = /\b(gas\s+leak|smell\s+of\s+gas|fire|smoke|sparks|flooding|carbon\s+monoxide|exposed\s+wires)\b/iu;
const hazardFlags = ['gas', 'fire', 'flood', 'electrical-danger', 'carbon-monoxide', 'unknown-danger'];

/** Local closed simulation. Calling code supplies a DatabaseSync owned by its caller. */
export function maintenanceDesk(db, options = {}) {
  if (!options || Object.keys(options).some(key => !['clock', 'registryRevision'].includes(key))) fail('Unknown factory option.');
  if (options.clock !== undefined && typeof options.clock !== 'function') fail('clock must be a function.');
  if (options.registryRevision !== undefined) identifier(options.registryRevision);
  const clock = options.clock ?? (() => scenarioAsOf);
  const now = () => { const result = clock(); const iso = typeof result === 'number' ? new Date(result).toISOString() : result; instant(iso); return iso; };
  const registry = clone(maintenanceRegistry), configHash = digest({ registry, revision: options.registryRevision ?? 'fixture-v1' });
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='maintenance_events'").get();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (existing && !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='maintenance_head'").get()) fail('Existing history lost its durable head table.', 'integrity_failed');
    if (existing && !db.prepare('SELECT * FROM maintenance_head WHERE singleton=1').get()) fail('Existing history lost its durable head row.', 'integrity_failed');
  db.exec(`CREATE TABLE IF NOT EXISTS maintenance_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL, command_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, request TEXT NOT NULL, body TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL, UNIQUE(tenant, command_id));
    CREATE TABLE IF NOT EXISTS maintenance_head (singleton INTEGER PRIMARY KEY CHECK(singleton=1), event_count INTEGER NOT NULL, hash TEXT NOT NULL);
    INSERT OR IGNORE INTO maintenance_head VALUES(1,0,'${GENESIS}');
    CREATE TABLE IF NOT EXISTS maintenance_bookings (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS maintenance_outbox (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS maintenance_receiver (id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  function tenant(value) { if (typeof value !== 'string' || !Object.hasOwn(registry, value)) fail('Unknown configured tenant.'); return value; }
  function actor(value, owner, role) { identifier(value); if (!registry[owner].actors[role].includes(value)) fail(`Choose a configured ${role} fixture for this tenant.`); }
  const bookId = job => rowKey(job), receiverId = job => `local-${job.tenant}-${job.caseId}`;
  function eventHash(row) { return digest({ seq: Number(row.seq), tenant: row.tenant, commandId: row.command_id, operation: row.operation, requestHash: row.request_hash, request: row.request, body: row.body, previousHash: row.prev_hash }); }
  function scan() {
    const rows = db.prepare('SELECT * FROM maintenance_events ORDER BY seq').all(), cases = new Map(), effects = { bookings: new Map(), outbox: new Map(), receiver: new Map() };
    let previous = GENESIS, count = 0;
    for (const row of rows) {
      count++;
      if (Number(row.seq) !== count || row.prev_hash !== previous || eventHash(row) !== row.hash) fail('Audit chain does not match stored event bytes.', 'integrity_failed');
      let body, request;
      try { body = JSON.parse(row.body); request = JSON.parse(row.request); } catch { fail('Stored event is not JSON.', 'integrity_failed'); }
      if (digest(request) !== row.request_hash || request.tenant !== row.tenant || request.commandId !== row.command_id) fail('Stored command identity changed.', 'integrity_failed');
      const job = body.case, previousCase = cases.get(`${row.tenant}:${job?.caseId}`);
      if (!job || job.tenant !== row.tenant || job.revision !== (previousCase?.revision ?? 0) + 1) fail('Case revision lineage changed.', 'integrity_failed');
      cases.set(rowKey(job), job);
      for (const name of Object.keys(effects)) for (const effect of body.effects[name] ?? []) effects[name].set(effect.id, effect);
      previous = row.hash;
    }
    const head = db.prepare('SELECT * FROM maintenance_head WHERE singleton=1').get();
    if (!head || Number(head.event_count) !== count || head.hash !== previous) fail('Durable audit head/count does not match history.', 'integrity_failed');
    for (const name of Object.keys(effects)) {
      const actual = db.prepare(`SELECT id,body FROM maintenance_${name}`).all();
      if (actual.length !== effects[name].size || actual.some(row => !effects[name].has(row.id) || row.body !== JSON.stringify(effects[name].get(row.id)))) fail(`Durable ${name} differs from audited effects.`, 'integrity_failed');
    }
    return { rows, cases, effects, count, hash: previous };
  }
  function transaction(write, task) { db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN'); try { const result = task(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
  function verifyAudit(value) {
    schema(value, ['tenant']); tenant(value.tenant);
    return transaction(false, () => { try { const state = scan(); return { valid: true, eventCount: state.count, headHash: state.hash, tenantEventCount: state.rows.filter(row => row.tenant === value.tenant).length, scope: 'Single SQLite database, unkeyed chain and anchored head/count; privileged coherent rewrites are outside this guarantee.' }; } catch (error) { if (error.code !== 'integrity_failed') throw error; return { valid: false, reason: error.message }; } });
  }
  function fresh(job) { if (sourceHash() !== LOADED_SOURCE || job.sourceHash !== LOADED_SOURCE || job.configHash !== configHash) fail('Source/configuration changed; prior authority is stale.', 'stale'); }
  function activeLease(job, asOf) { const lease = registry[job.tenant].lease; if (job.leaseId !== lease.id || Date.parse(asOf) < Date.parse(lease.activeFrom) || Date.parse(asOf) >= Date.parse(lease.activeUntil)) fail('Lease is not active at the scenario clock.', 'stale'); return lease; }
  function present(job, asOf = now()) {
    const result = clone(job), ageMinutes = (Date.parse(asOf) - Date.parse(job.receivedAt)) / 60000;
    result.stale = job.sourceHash !== LOADED_SOURCE || job.configHash !== configHash || sourceHash() !== LOADED_SOURCE;
    result.scope = maintenanceScope;
    result.sla = { asOf, ageMinutes, targetMinutes: job.priority === 'emergency' ? 5 : 1440, breached: ageMinutes > (job.priority === 'emergency' ? 5 : 1440), mode: 'Synthetic elapsed-time readout; no active monitoring or provider SLA.' };
    return result;
  }
  function selected(state, value) { tenant(value.tenant); identifier(value.caseId); const job = state.cases.get(`${value.tenant}:${value.caseId}`); if (!job) fail('Maintenance case was not found in this tenant.', 'not_found'); return clone(job); }
  function mutable(job) { if (['cancelled', 'reported-complete'].includes(job.status)) fail('Case is terminal.', 'conflict'); }
  function routine(job) { if (job.priority !== 'routine') fail('Emergency hold cannot enter routine dispatch.', 'conflict'); }
  function effect(row, stateName, state) { return state.effects[stateName].get(rowKey(row)); }
  function proposalHash(job, proposal) { return digest({ tenant: job.tenant, caseId: job.caseId, sourceIssueId: job.sourceIssueId, description: job.description, hazards: job.hazards, priority: job.priority, requiredSkill: job.requiredSkill, durationMinutes: job.durationMinutes, receivedAt: job.receivedAt, lease: registry[job.tenant].lease, vendor: registry[job.tenant].vendors.find(v => v.id === proposal.vendorId), slot: { start: proposal.start, end: proposal.end }, proposedBy: proposal.proposedBy, access: job.access, sourceHash: job.sourceHash, configHash: job.configHash }); }
  function validateSlot(job, proposal, state, asOf) {
    activeLease(job, asOf); routine(job);
    if (job.access.revoked || !job.access.windows.length || proposal.accessRevision !== job.access.revision) fail('Live access grant no longer matches the proposal.', 'stale');
    const vendor = registry[job.tenant].vendors.find(item => item.id === proposal.vendorId);
    const lease = registry[job.tenant].lease;
    if (!vendor?.approved || vendor.tenant !== job.tenant || !vendor.skills.includes(job.requiredSkill) || !job.access.windows.some(w => fits(w, proposal)) || !vendor.windows.some(w => fits(w, proposal)) || Date.parse(proposal.start) < Date.parse(asOf) || Date.parse(proposal.end) > Date.parse(lease.activeUntil) || Date.parse(proposal.start) < Date.parse(lease.activeFrom) || Date.parse(proposal.end) - Date.parse(proposal.start) !== job.durationMinutes * 60000) fail('Vendor, skill, lease or appointment window is no longer eligible.', 'stale');
    if (proposalHash(job, proposal) !== proposal.hash) fail('Proposal hash differs from live semantic dependencies.', 'stale');
    for (const booking of state.effects.bookings.values()) if (booking.status === 'active' && booking.vendorId === proposal.vendorId && booking.caseId !== job.caseId && overlaps(booking, proposal)) fail('Vendor already has an overlapping local reservation.', 'conflict');
  }
  function mutate(operation, value, fields, handler) {
    schema(value, fields); tenant(value.tenant); identifier(value.commandId);
    return transaction(true, () => {
      const state = scan(), requestHash = digest(value), previousCommand = state.rows.find(row => row.tenant === value.tenant && row.command_id === value.commandId);
      if (previousCommand) { if (previousCommand.operation !== operation || previousCommand.request_hash !== requestHash) fail('Command ID was already used for a different immutable intent.', 'conflict'); return present(selected(state, { tenant: value.tenant, caseId: JSON.parse(previousCommand.body).case.caseId })); }
      if (sourceHash() !== LOADED_SOURCE) fail('Loaded source files changed. Restart and re-plan.', 'stale');
      const asOf = now(), effects = { bookings: [], outbox: [], receiver: [] }, job = handler(state, asOf, effects);
      job.revision++;
      const body = JSON.stringify({ case: job, effects }), request = JSON.stringify(value), seq = state.count + 1;
      const row = { seq, tenant: value.tenant, command_id: value.commandId, operation, request_hash: requestHash, request, body, prev_hash: state.hash };
      const hash = eventHash(row);
      for (const name of Object.keys(effects)) for (const rowEffect of effects[name]) db.prepare(`INSERT INTO maintenance_${name}(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body`).run(rowEffect.id, JSON.stringify(rowEffect));
      db.prepare('INSERT INTO maintenance_events(seq,tenant,command_id,operation,request_hash,request,body,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?,?)').run(seq, row.tenant, row.command_id, operation, requestHash, request, body, state.hash, hash);
      db.prepare('UPDATE maintenance_head SET event_count=?,hash=? WHERE singleton=1').run(seq, hash);
      scan();
      return present(job, asOf);
    });
  }
  const common = ['commandId', 'tenant', 'caseId', 'actor'];
  function operatorJob(state, value) { actor(value.actor, value.tenant, 'operators'); const job = selected(state, value); fresh(job); mutable(job); return job; }
  function clearAuthority(job) { job.proposal = null; job.review = null; }
  function release(job, state, effects, status) {
    for (const name of ['bookings', 'outbox']) { const row = effect(job, name, state); if (row) effects[name].push({ ...row, status }); }
  }
  const api = {
    catalog() { return clone({ scope: maintenanceScope, clock: { mode: options.clock ? 'Injected trusted test clock' : 'Fixed synthetic scenario clock', asOf: now() }, scenarios: maintenanceScenarios, actors: { operators: Object.values(registry).flatMap(r => r.actors.operators), reviewers: Object.values(registry).flatMap(r => r.actors.reviewers), tenants: Object.values(registry).flatMap(r => r.actors.tenants) }, leases: Object.values(registry).map(r => r.lease), vendors: Object.values(registry).flatMap(r => r.vendors), receiverProfiles: ['online', 'offline', 'lose-response'] }); },
    intake(value) { return mutate('intake', value, ['commandId', 'tenant', 'actor', 'sourceIssueId', 'leaseId', 'description', 'hazards', 'requiredSkill', 'durationMinutes', 'receivedAt'], (state, asOf) => {
      actor(value.actor, value.tenant, 'operators'); identifier(value.sourceIssueId); identifier(value.leaseId); text(value.description, 'Description', 2000); instant(value.receivedAt);
      if (Date.parse(value.receivedAt) > Date.parse(asOf)) fail('receivedAt cannot be after the trusted scenario clock.');
      if (value.leaseId !== registry[value.tenant].lease.id) fail('Lease is not configured for this tenant.');
      if (!['plumbing', 'electrical'].includes(value.requiredSkill) || !Number.isSafeInteger(value.durationMinutes) || value.durationMinutes < 1 || value.durationMinutes > 480) fail('Skill or bounded duration is invalid.');
      if (!Array.isArray(value.hazards) || value.hazards.length > hazardFlags.length || new Set(value.hazards).size !== value.hazards.length || value.hazards.some(flag => !hazardFlags.includes(flag))) fail('Hazards must be unique configured structured flags.');
      if ([...state.cases.values()].some(job => job.tenant === value.tenant && job.sourceIssueId === value.sourceIssueId)) fail('sourceIssueId already has an immutable intake; replay its original command.', 'conflict');
      const triageReasons = [...value.hazards.map(flag => `Structured hazard: ${flag}`), ...(knownTriggers.test(value.description) ? ['Known emergency text trigger'] : [])], priority = triageReasons.length ? 'emergency' : 'routine';
      const job = { caseId: randomUUID(), tenant: value.tenant, sourceIssueId: value.sourceIssueId, intakeActor: value.actor, leaseId: value.leaseId, description: value.description, hazards: clone(value.hazards), requiredSkill: value.requiredSkill, durationMinutes: value.durationMinutes, receivedAt: value.receivedAt, priority, triageReasons, status: priority === 'emergency' ? 'emergency-hold' : 'access-required', revision: 0, sourceHash: LOADED_SOURCE, configHash, access: { revision: 0, windows: [], grantedBy: null, revoked: true }, proposal: null, review: null, delivery: { state: 'none', attempts: 0, receiverRecordId: null, sentProposalHash: null }, requiresFollowUp: priority === 'emergency', completion: null };
      activeLease(job, asOf); return job;
    }); },
    grantAccess(value) { return mutate('grantAccess', value, [...common, 'windows'], (state, asOf, effects) => {
      actor(value.actor, value.tenant, 'tenants'); const job = selected(state, value); fresh(job); mutable(job); routine(job); const lease = activeLease(job, asOf);
      if (lease.occupant !== value.actor || ['uncertain', 'delivered'].includes(job.delivery.state)) fail('Occupant or already-sent delivery prevents replacing this grant.', 'conflict');
      windows(value.windows); if (value.windows.some(w => Date.parse(w.end) <= Date.parse(asOf) || Date.parse(w.start) < Date.parse(lease.activeFrom) || Date.parse(w.end) > Date.parse(lease.activeUntil))) fail('Access windows must be live and inside the lease.');
      release(job, state, effects, 'cancelled'); job.access = { revision: job.access.revision + 1, windows: clone(value.windows), grantedBy: value.actor, revoked: false }; clearAuthority(job); job.status = 'planning-review'; job.delivery.state = 'none'; return job;
    }); },
    revokeAccess(value) { return mutate('revokeAccess', value, [...common, 'note'], (state, asOf, effects) => {
      actor(value.actor, value.tenant, 'tenants'); text(value.note, 'Revocation note', 1000); const job = selected(state, value); fresh(job); mutable(job); routine(job);
      if (registry[value.tenant].lease.occupant !== value.actor) fail('Only the configured occupant may revoke this case grant.');
      job.access = { revision: job.access.revision + 1, windows: [], grantedBy: value.actor, revoked: true }; clearAuthority(job);
      const sent = ['uncertain', 'delivered'].includes(job.delivery.state); if (!sent) release(job, state, effects, 'cancelled'); job.status = sent ? 'access-revoked' : 'access-required'; job.requiresFollowUp = sent; if (!sent) job.delivery.state = 'none'; return job;
    }); },
    propose(value) { return mutate('propose', value, common, (state, asOf) => {
      const job = operatorJob(state, value); routine(job); const lease = activeLease(job, asOf);
      if (job.delivery.state !== 'none') fail('Reconcile/cancel the existing sent delivery first.', 'conflict');
      if (job.access.revoked || !job.access.windows.length) fail('An occupant-owned live access grant is required.', 'conflict');
      const candidates = [];
      for (const vendor of registry[job.tenant].vendors.filter(v => v.approved && v.skills.includes(job.requiredSkill))) for (const vendorWindow of vendor.windows) for (const access of job.access.windows) {
        const earliest = Math.max(Date.parse(asOf), Date.parse(vendorWindow.start), Date.parse(access.start), Date.parse(lease.activeFrom));
        const latest = Math.min(Date.parse(vendorWindow.end), Date.parse(access.end), Date.parse(lease.activeUntil));
        const busy = [...state.effects.bookings.values()].filter(b => b.status === 'active' && b.vendorId === vendor.id && b.caseId !== job.caseId).sort((a, b) => a.start.localeCompare(b.start));
        let start = earliest; for (const booking of busy) { if (start + job.durationMinutes * 60000 <= Date.parse(booking.start)) break; if (start < Date.parse(booking.end)) start = Date.parse(booking.end); }
        if (start + job.durationMinutes * 60000 <= latest) candidates.push({ vendorId: vendor.id, start: new Date(start).toISOString(), end: new Date(start + job.durationMinutes * 60000).toISOString(), accessRevision: job.access.revision, proposedBy: value.actor });
      }
      candidates.sort((a, b) => a.start.localeCompare(b.start) || a.vendorId.localeCompare(b.vendorId));
      if (!candidates.length) fail('No eligible vendor/window remains inside live access and lease constraints.', 'conflict');
      const proposal = candidates[0]; proposal.hash = proposalHash(job, proposal); validateSlot(job, proposal, state, asOf); job.proposal = proposal; job.review = null; job.status = 'awaiting-review'; return job;
    }); },
    review(value) { return mutate('review', value, ['commandId', 'tenant', 'caseId', 'reviewer', 'expectedHash', 'decision', 'note'], (state, asOf) => {
      actor(value.reviewer, value.tenant, 'reviewers'); text(value.note, 'Review note', 1000); if (!['approve', 'reject'].includes(value.decision)) fail('Review decision must be approve or reject.');
      const job = selected(state, value); fresh(job); mutable(job); routine(job);
      if (job.intakeActor === value.reviewer || job.proposal?.proposedBy === value.reviewer) fail('Independent review must differ from the intake actor.', 'conflict');
      if (!job.proposal || value.expectedHash !== job.proposal.hash || job.delivery.state !== 'none') fail('Review must bind the current unsent proposal hash.', 'stale');
      validateSlot(job, job.proposal, state, asOf); job.review = { reviewer: value.reviewer, decision: value.decision, note: value.note, expectedHash: value.expectedHash }; job.status = value.decision === 'approve' ? 'ready' : 'planning-review'; return job;
    }); },
    dispatch(value) { return mutate('dispatch', value, [...common, 'receiverProfileId'], (state, asOf, effects) => {
      if (!['online', 'offline', 'lose-response'].includes(value.receiverProfileId)) fail('Choose a closed local receiver profile.');
      const job = operatorJob(state, value); routine(job);
      if (job.delivery.state === 'uncertain') fail('Uncertain delivery must reconcile the actual local receiver before any retry.', 'conflict');
      if (job.delivery.state === 'delivered') fail('A local receiver record already exists; do not resend.', 'conflict');
      if (!job.proposal || job.review?.decision !== 'approve' || job.review.expectedHash !== job.proposal.hash || (job.review.reviewer === job.intakeActor || job.review.reviewer === job.proposal.proposedBy)) fail('A current independent approved hash-bound review is required.', 'conflict');
      validateSlot(job, job.proposal, state, asOf);
      const proposal = job.proposal, booking = { id: bookId(job), tenant: job.tenant, caseId: job.caseId, vendorId: proposal.vendorId, start: proposal.start, end: proposal.end, proposalHash: proposal.hash, status: 'active' };
      effects.bookings.push(booking); job.delivery.attempts++; job.delivery.sentProposalHash = proposal.hash;
      effects.outbox.push({ id: bookId(job), tenant: job.tenant, caseId: job.caseId, proposalHash: proposal.hash, status: value.receiverProfileId === 'offline' ? 'pending' : value.receiverProfileId === 'lose-response' ? 'uncertain' : 'acknowledged' });
      if (value.receiverProfileId === 'offline') { job.status = 'queued'; job.delivery.state = 'pending'; return job; }
      if (effect(job, 'receiver', state)) fail('Receiver already contains this case.', 'conflict');
      const recordId = receiverId(job); effects.receiver.push({ id: bookId(job), recordId, tenant: job.tenant, caseId: job.caseId, proposalHash: proposal.hash, vendorId: proposal.vendorId, start: proposal.start, end: proposal.end, status: 'received' });
      job.delivery.state = value.receiverProfileId === 'lose-response' ? 'uncertain' : 'delivered'; job.status = job.delivery.state; job.delivery.receiverRecordId = value.receiverProfileId === 'lose-response' ? null : recordId; return job;
    }); },
    reconcile(value) { return mutate('reconcile', value, common, (state, asOf, effects) => {
      const job = operatorJob(state, value);
      if (job.delivery.state !== 'uncertain') fail('Only uncertain delivery needs receiver reconciliation.', 'conflict');
      const receiver = effect(job, 'receiver', state); if (!receiver || receiver.proposalHash !== job.delivery.sentProposalHash) fail('Actual local receiver does not match the uncertain intent.', 'integrity_failed');
      const outbox = effect(job, 'outbox', state); if (outbox) effects.outbox.push({ ...outbox, status: 'acknowledged' });
      job.delivery.state = 'delivered'; job.delivery.receiverRecordId = receiver.recordId; job.status = job.access.revoked ? 'access-revoked' : 'delivered'; return job;
    }); },
    cancel(value) { return mutate('cancel', value, [...common, 'expectedRevision', 'note'], (state, asOf, effects) => {
      const job = operatorJob(state, value); if (job.delivery.state === 'uncertain') fail('Uncertain delivery must reconcile the actual local receiver before cancellation.', 'conflict'); text(value.note, 'Cancellation note', 1000); if (value.expectedRevision !== job.revision) fail('Cancellation revision is stale.', 'stale');
      release(job, state, effects, 'cancelled'); const receiver = effect(job, 'receiver', state); if (receiver) effects.receiver.push({ ...receiver, status: 'cancelled-locally' });
      clearAuthority(job); job.status = 'cancelled'; job.delivery.state = 'cancelled'; job.requiresFollowUp = Boolean(receiver) || job.priority === 'emergency'; job.cancellation = { note: value.note, actor: value.actor, asOf, scope: 'Local record cancellation; no external vendor contacted.' }; return job;
    }); },
    complete(value) { return mutate('complete', value, [...common, 'expectedRevision', 'note'], (state, asOf, effects) => {
      const job = operatorJob(state, value); text(value.note, 'Completion note', 1000); if (value.expectedRevision !== job.revision) fail('Completion revision is stale.', 'stale');
      if (job.status !== 'delivered' || job.access.revoked) fail('Completion report requires a reconciled delivered local record with live access.', 'conflict');
      release(job, state, effects, 'reported-complete'); const receiver = effect(job, 'receiver', state); if (!receiver) fail('Completion requires an actual local receiver record.', 'integrity_failed'); effects.receiver.push({ ...receiver, status: 'reported-complete' });
      job.status = 'reported-complete'; job.delivery.state = 'reported-complete'; job.completion = { actor: value.actor, note: value.note, asOf, label: 'Operator-reported completion; not proof of a physical visit.' }; return job;
    }); },
    receipt(value) { schema(value, ['tenant', 'caseId']); return transaction(false, () => present(selected(scan(), value))); },
    history(value) { schema(value, ['tenant']); tenant(value.tenant); return transaction(false, () => { const asOf = now(); return { cases: [...scan().cases.values()].filter(job => job.tenant === value.tenant).map(job => present(job, asOf)) }; }); },
    state(value) { schema(value, ['tenant']); tenant(value.tenant); return transaction(false, () => { const state = scan(), asOf = now(); return { cases: [...state.cases.values()].filter(job => job.tenant === value.tenant).map(job => present(job, asOf)), bookings: [...state.effects.bookings.values()].filter(row => row.tenant === value.tenant), outbox: [...state.effects.outbox.values()].filter(row => row.tenant === value.tenant), receiverRecords: [...state.effects.receiver.values()].filter(row => row.tenant === value.tenant) }; }); },
    audit(value) { schema(value, ['tenant']); tenant(value.tenant); return transaction(false, () => { const state = scan(); return { verification: { valid: true, eventCount: state.count, headHash: state.hash }, events: state.rows.filter(row => row.tenant === value.tenant).map(row => ({ sequence: row.seq, commandId: row.command_id, operation: row.operation, hash: row.hash, previousHash: row.prev_hash, caseId: JSON.parse(row.body).case.caseId })) }; }); },
    verifyAudit
  };
  transaction(false, scan);
  return api;
}
export function openMaintenance(path, options = {}) { const db = new DatabaseSync(path); try { const desk = maintenanceDesk(db, options); return { ...desk, close: () => db.close() }; } catch (error) { db.close(); throw error; } }
