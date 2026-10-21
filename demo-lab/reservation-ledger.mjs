import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { instant } from './flagship-decisions.mjs';

const version = 'local-reservations/v1';
const scope = 'Synthetic local SQLite reservations only. Tenant IDs and reviewer labels are supplied, not authenticated. No provider calendar, vendor dispatch or operational authority.';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function identifier(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) throw Error(label + ' must be bounded nonblank text');
    return value;
}
function commandInput(input, fields, kind) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key)))
        throw Error('Unsupported reservation command fields');
    if (input.reviewed !== true) throw Error('Explicit local review acknowledgement required');
    return { version, kind, tenant: identifier(input.tenant, 'Tenant'), requestId: identifier(input.requestId, 'Request ID'), reviewerLabel: identifier(input.reviewerLabel, 'Reviewer label') };
}
const view = row => ({ id: row.id, resourceId: row.resource_id, start: new Date(row.start_ms).toISOString(), end: new Date(row.end_ms).toISOString(), bufferMinutes: row.buffer_minutes, status: row.status, revision: row.revision });

export function reservationDesk(db) {
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS local_reservations(
        tenant TEXT NOT NULL,id TEXT NOT NULL,resource_id TEXT NOT NULL,
        start_ms INTEGER NOT NULL,end_ms INTEGER NOT NULL,buffer_minutes INTEGER NOT NULL CHECK(buffer_minutes BETWEEN 0 AND 120),
        blocked_start INTEGER NOT NULL,blocked_end INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','cancelled')),revision INTEGER NOT NULL CHECK(revision>0),
        PRIMARY KEY(tenant,id),CHECK(start_ms<end_ms),CHECK(blocked_start<blocked_end));
      CREATE INDEX IF NOT EXISTS local_reservation_conflicts ON local_reservations(tenant,resource_id,status,blocked_start,blocked_end);
      CREATE TABLE IF NOT EXISTS local_reservation_commands(
        tenant TEXT NOT NULL,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(tenant,request_id));
      CREATE TABLE IF NOT EXISTS local_reservation_audit(
        sequence INTEGER PRIMARY KEY,tenant TEXT NOT NULL,request_id TEXT NOT NULL,kind TEXT NOT NULL,result TEXT NOT NULL,
        FOREIGN KEY(tenant,request_id) REFERENCES local_reservation_commands(tenant,request_id));`);
    function command(input, apply) {
        const fingerprint = hash(input);
        db.exec('BEGIN IMMEDIATE');
        try {
            const old = db.prepare('SELECT * FROM local_reservation_commands WHERE tenant=? AND request_id=?').get(input.tenant, input.requestId);
            if (old) {
                if (old.input_hash !== fingerprint) throw Error('Conflicting reservation request identity');
                db.exec('COMMIT');
                return { ...JSON.parse(old.result), replayed: true, newLocalEffects: 0 };
            }
            const result = { ...apply(), version, externalActions: 0, scope };
            const encoded = JSON.stringify(result);
            db.prepare('INSERT INTO local_reservation_commands VALUES(?,?,?,?)').run(input.tenant, input.requestId, fingerprint, encoded);
            db.prepare('INSERT INTO local_reservation_audit(tenant,request_id,kind,result) VALUES(?,?,?,?)').run(input.tenant, input.requestId, input.kind, JSON.stringify({ inputHash: fingerprint, reviewerLabel: input.reviewerLabel, action: result.action, reservationId: result.reservation?.id ?? null, localEffects: result.localEffects }));
            db.exec('COMMIT');
            return { ...result, replayed: false, newLocalEffects: result.localEffects };
        } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    const desk = {
        reserve(input) {
            const canonical = commandInput(input, ['tenant', 'resourceId', 'requestId', 'start', 'end', 'asOf', 'bufferMinutes', 'reviewed', 'reviewerLabel'], 'reserve');
            const start = instant(input.start), end = instant(input.end), asOf = instant(input.asOf);
            if (start >= end) throw Error('Reservation start must precede end');
            if (!Number.isSafeInteger(input.bufferMinutes) || input.bufferMinutes < 0 || input.bufferMinutes > 120) throw Error('Buffer must be integer minutes from 0 to 120');
            Object.assign(canonical, { resourceId: identifier(input.resourceId, 'Resource'), start: new Date(start).toISOString(), end: new Date(end).toISOString(), asOf: new Date(asOf).toISOString(), bufferMinutes: input.bufferMinutes });
            return command(canonical, () => {
                if (start < asOf) return { action: 'reservation_held', reasons: ['past_window'], conflicts: [], localEffects: 0 };
                const blockedStart = start - input.bufferMinutes * 60000, blockedEnd = end + input.bufferMinutes * 60000;
                const conflicts = db.prepare("SELECT id FROM local_reservations WHERE tenant=? AND resource_id=? AND status='active' AND blocked_start<? AND blocked_end>? ORDER BY id").all(canonical.tenant, canonical.resourceId, blockedEnd, blockedStart).map(row => row.id);
                if (conflicts.length) return { action: 'reservation_held', reasons: ['calendar_conflict'], conflicts, localEffects: 0 };
                const id = hash([version, canonical.tenant, canonical.requestId]);
                db.prepare('INSERT INTO local_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').run(canonical.tenant, id, canonical.resourceId, start, end, input.bufferMinutes, blockedStart, blockedEnd, 'active', 1);
                return { action: 'locally_reserved', reservation: view(db.prepare('SELECT * FROM local_reservations WHERE tenant=? AND id=?').get(canonical.tenant, id)), localEffects: 1 };
            });
        },
        cancel(input) {
            const canonical = commandInput(input, ['tenant', 'requestId', 'reservationId', 'expectedRevision', 'reviewed', 'reviewerLabel'], 'cancel');
            if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw Error('Expected revision must be a positive integer');
            Object.assign(canonical, { reservationId: identifier(input.reservationId, 'Reservation ID'), expectedRevision: input.expectedRevision });
            return command(canonical, () => {
                const row = db.prepare('SELECT * FROM local_reservations WHERE tenant=? AND id=?').get(canonical.tenant, canonical.reservationId);
                if (!row) throw Error('Unknown reservation in tenant');
                if (row.revision !== canonical.expectedRevision) throw Error('Reservation revision changed');
                if (row.status === 'cancelled') return { action: 'already_cancelled', reservation: view(row), localEffects: 0 };
                const update = db.prepare("UPDATE local_reservations SET status='cancelled',revision=revision+1 WHERE tenant=? AND id=? AND revision=? AND status='active'").run(canonical.tenant, row.id, canonical.expectedRevision);
                if (update.changes !== 1) throw Error('Reservation revision changed during cancellation');
                return { action: 'locally_cancelled', reservation: view({ ...row, status: 'cancelled', revision: row.revision + 1 }), localEffects: 1 };
            });
        },
        state(tenant, resourceId) {
            identifier(tenant, 'Tenant'); identifier(resourceId, 'Resource');
            return db.prepare('SELECT * FROM local_reservations WHERE tenant=? AND resource_id=? ORDER BY start_ms,id').all(tenant, resourceId).map(view);
        },
        audit(tenant) {
            identifier(tenant, 'Tenant');
            return db.prepare('SELECT sequence,request_id,kind,result FROM local_reservation_audit WHERE tenant=? ORDER BY sequence').all(tenant).map(row => ({ sequence: row.sequence, requestId: row.request_id, kind: row.kind, detail: JSON.parse(row.result) }));
        },
    };
    return desk;
}

export function reservationExercise() {
    const db = new DatabaseSync(':memory:');
    try {
        const desk = reservationDesk(db), input = { tenant: 'synthetic-team', resourceId: 'demo-calendar', requestId: 'first', start: '2026-11-01T09:00:00Z', end: '2026-11-01T10:00:00Z', asOf: '2026-11-01T08:00:00Z', bufferMinutes: 10, reviewed: true, reviewerLabel: 'Scripted local reviewer' };
        const first = desk.reserve(input), conflict = desk.reserve({ ...input, requestId: 'overlap' }), replay = desk.reserve(input);
        const cancelled = desk.cancel({ tenant: input.tenant, requestId: 'cancel-first', reservationId: first.reservation.id, expectedRevision: 1, reviewed: true, reviewerLabel: input.reviewerLabel });
        const replacement = desk.reserve({ ...input, requestId: 'replacement' });
        return { steps: [['Reserve', first], ['Overlapping request', conflict], ['Replay', replay], ['Cancel', cancelled], ['Reserve released window', replacement]].map(([step, result]) => ({ step, action: result.action, newLocalEffects: result.newLocalEffects })), activeReservations: desk.state(input.tenant, input.resourceId).filter(row => row.status === 'active').length, auditEvents: desk.audit(input.tenant).length, externalActions: 0, scope: 'Separate fixed synthetic calendar exercise in in-memory SQLite. File persistence and competing-process behavior are tested separately; no entered candidate slot is reserved.' };
    } finally { db.close(); }
}
