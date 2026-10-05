import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { maintenance } from './extra-scenarios.mjs';

const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error(`${label} required`);
  return value.trim();
};
const instant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Canonical UTC instant required');
  return Date.parse(value);
};

/** Proposes an eligible appointment; never dispatches a vendor. */
export function maintenanceDispatch(input) {
  const triage = maintenance(input);
  const now = instant(input.asOf);
  const received = instant(input.receivedAt);
  if (received > now) throw new Error('Received time is in the future');
  const ageMinutes = (now - received) / 60000;
  const base = { projectId: 'PM-01', priority: triage.priority, ageMinutes,
    slaBreached: ageMinutes >= triage.slaMinutes, dispatchAllowed: false, externalActions: 0 };
  if (triage.priority === 'emergency') return { ...base, queue: triage.queue, reason: 'deterministic_emergency_override', appointment: null };
  const skill = text(input.requiredSkill, 'Required skill');
  if (input.accessApproved !== true) return { ...base, queue: 'access_confirmation', reason: 'tenant_access_not_approved', appointment: null };
  if (!Array.isArray(input.accessWindows) || !Array.isArray(input.vendors) || input.accessWindows.length > 100 || input.vendors.length > 100) throw new Error('Bounded access windows and vendors required');
  if (!Number.isSafeInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 480) throw new Error('Duration must be 1–480 whole minutes');
  const window = w => {
    const start = instant(w.start), end = instant(w.end);
    if (start >= end) throw new Error('Window end must follow start');
    return { start, end };
  };
  const windows = input.accessWindows.map(window);
  const seen = new Set();
  const candidates = [];
  for (const vendor of input.vendors) {
    const id = text(vendor.id, 'Vendor ID');
    if (seen.has(id)) throw new Error('Duplicate vendor identity requires review');
    seen.add(id);
    if (vendor.approved !== true || !Array.isArray(vendor.skills) || !vendor.skills.includes(skill)) continue;
    if (!Array.isArray(vendor.availability) || vendor.availability.length > 100) throw new Error('Bounded vendor availability required');
    for (const available of vendor.availability.map(window)) for (const access of windows) {
      const start = Math.max(now, available.start, access.start);
      const end = start + input.durationMinutes * 60000;
      if (end <= Math.min(available.end, access.end)) candidates.push({ vendorId: id, start, end });
    }
  }
  candidates.sort((a, b) => a.start - b.start || (a.vendorId < b.vendorId ? -1 : a.vendorId > b.vendorId ? 1 : 0));
  const pick = candidates[0];
  return { ...base, queue: pick ? 'dispatcher_review' : 'scheduling_review',
    reason: pick ? 'approved_skill_and_access_overlap' : 'no_eligible_window',
    appointment: pick ? { vendorId: pick.vendorId, start: new Date(pick.start).toISOString(), end: new Date(pick.end).toISOString() } : null };
}

/** Durable local register. ACLs are supplied by a trusted demo adapter, not inferred from message text. */
export function openDecisionRegister(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS register_entries (
      source_id TEXT NOT NULL, item_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('commitment','decision')),
      owner TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('needs_owner_review','confirmed')),
      fingerprint TEXT NOT NULL, PRIMARY KEY(source_id,item_id));
    CREATE TABLE IF NOT EXISTS register_events (
      event_id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, item_id TEXT NOT NULL, event TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS register_owner_status ON register_entries(owner,status);`);
  return {
    close: () => db.close(),
    entries: () => db.prepare('SELECT source_id AS sourceId,item_id AS id,kind,owner,body AS text,status FROM register_entries ORDER BY source_id,item_id').all(),
    events: () => db.prepare('SELECT source_id AS sourceId,item_id AS id,event FROM register_events ORDER BY event_id').all(),
    ingest(input) {
      const sourceId = text(input.sourceId, 'Source identity');
      const principal = text(input.principal, 'Principal');
      if (!['email', 'meeting'].includes(input.channel)) throw new Error('Supported source channel required');
      if (!Array.isArray(input.allowedReaders) || input.allowedReaders.length > 100 || input.allowedReaders.some(v => typeof v !== 'string')) throw new Error('Explicit source ACL required');
      // Denied content is not parsed or persisted; no body is copied to audit events.
      if (!input.allowedReaders.includes(principal)) return { queue: 'access_denied', retained: 0, duplicates: 0, conflicts: 0, externalActions: 0 };
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new Error('1–100 items required');
      const items = input.items.map(item => {
        const id = text(item.id, 'Item identity'), owner = text(item.owner, 'Owner'), body = text(item.text, 'Text');
        if (!['commitment', 'decision'].includes(item.kind)) throw new Error('Supported register kind required');
        const status = item.confirmed === true && item.confirmedBy === owner ? 'confirmed' : 'needs_owner_review';
        const fingerprint = createHash('sha256').update(JSON.stringify([item.kind, owner, body, status])).digest('hex');
        return { id, owner, body, kind: item.kind, status, fingerprint };
      });
      let retained = 0, duplicates = 0, conflicts = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const item of items) {
          const existing = db.prepare('SELECT fingerprint FROM register_entries WHERE source_id=? AND item_id=?').get(sourceId, item.id);
          if (existing) {
            if (existing.fingerprint === item.fingerprint) { duplicates++; continue; }
            conflicts++;
            db.prepare('INSERT INTO register_events(source_id,item_id,event) VALUES(?,?,?)').run(sourceId, item.id, 'identity_conflict_requires_review');
            continue;
          }
          db.prepare('INSERT INTO register_entries VALUES(?,?,?,?,?,?,?)').run(sourceId, item.id, item.kind, item.owner, item.body, item.status, item.fingerprint);
          db.prepare('INSERT INTO register_events(source_id,item_id,event) VALUES(?,?,?)').run(sourceId, item.id, 'captured');
          retained++;
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { queue: conflicts ? 'identity_review' : 'owner_review', retained, duplicates, conflicts, externalActions: 0 };
    },
  };
}

export const depthFixtures = {
  maintenance: { description: 'Kitchen tap dripping', accessApproved: true, requiredSkill: 'plumbing',
    asOf: '2026-09-10T10:00:00.000Z', receivedAt: '2026-09-09T09:00:00.000Z', durationMinutes: 60,
    accessWindows: [{ start: '2026-09-10T11:00:00.000Z', end: '2026-09-10T13:00:00.000Z' }],
    vendors: [{ id: 'demo-plumber', approved: true, skills: ['plumbing'], availability: [{ start: '2026-09-10T12:00:00.000Z', end: '2026-09-10T15:00:00.000Z' }] }] },
  register: { sourceId: 'demo-meeting-1', principal: 'demo-assistant', channel: 'meeting', allowedReaders: ['demo-assistant'],
    items: [{ id: 'commitment-1', kind: 'commitment', owner: 'Demo owner', text: 'Review the supplier proposal', confirmed: false }] },
};

export function evaluateIndustryDepth(id) {
  const cases = [];
  const check = (name, fn) => { try { fn(); cases.push({ name, passed: true }); } catch (error) { cases.push({ name, passed: false, error: error.message }); } };
  let result;
  if (id === 'PM-01') {
    const fixture = structuredClone(depthFixtures.maintenance);
    result = maintenanceDispatch(fixture);
    check('skill and consent windows overlap', () => assert.equal(result.appointment.start, '2026-09-10T12:00:00.000Z'));
    check('SLA breach is visible', () => assert.equal(result.slaBreached, true));
    check('dispatch always requires a human', () => assert.equal(result.dispatchAllowed, false));
    check('emergency bypasses scheduling', () => assert.equal(maintenanceDispatch({ ...fixture, description: 'Gas leak' }).queue, 'human_emergency_operator'));
    check('unapproved access blocks appointment', () => assert.equal(maintenanceDispatch({ ...fixture, accessApproved: false }).appointment, null));
    check('insufficient duration goes to review', () => assert.equal(maintenanceDispatch({ ...fixture, durationMinutes: 61 }).queue, 'scheduling_review'));
  } else if (id === 'EA-01') {
    const fixture = structuredClone(depthFixtures.register), register = openDecisionRegister();
    try {
      result = register.ingest(fixture);
      check('authorized source is retained', () => assert.equal(result.retained, 1));
      check('identical replay deduplicates', () => assert.equal(register.ingest(fixture).duplicates, 1));
      check('conflicting identity waits for review', () => assert.equal(register.ingest({ ...fixture, items: [{ ...fixture.items[0], owner: 'Other owner' }] }).conflicts, 1));
      check('conflict does not replace owner', () => assert.equal(register.entries()[0].owner, 'Demo owner'));
      check('denied source is not ingested', () => assert.equal(register.ingest({ ...fixture, principal: 'outsider' }).queue, 'access_denied'));
      check('owner confirmation remains pending', () => assert.equal(register.entries()[0].status, 'needs_owner_review'));
      result = { ...result, entries: register.entries(), events: register.events() };
    } finally { register.close(); }
  } else throw new Error('Unsupported industry depth project');
  return { projectId: id, evaluation: { passed: cases.filter(c => c.passed).length, total: cases.length, cases }, result, externalActions: 0 };
}
