import { createHash } from 'node:crypto';
import { planContact } from '../integrations/ghl-n8n/contract.mjs';
import { sourceSnapshot } from './project-passports.mjs';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const text = (x, label) => { if (typeof x !== 'string' || !x.trim() || x.length > 200)
    throw Error(label + ' required'); return x.trim(); };
/** Durable synthetic lifecycle. Labels are not authentication; no network is used. */
export function reliabilityDesk(db, snapshot = sourceSnapshot) {
    db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS reliability_intents(id TEXT PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,project TEXT NOT NULL,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,source_hash TEXT NOT NULL,status TEXT NOT NULL,reviewer TEXT,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS reliability_effects(intent_id TEXT PRIMARY KEY REFERENCES reliability_intents(id),payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reliability_events(sequence INTEGER PRIMARY KEY,intent_id TEXT NOT NULL REFERENCES reliability_intents(id),kind TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS reliability_events_intent ON reliability_events(intent_id,sequence);`);
    const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try {
        const value = fn();
        db.exec('COMMIT');
        return value;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    } };
    const get = id => { const row = db.prepare('SELECT * FROM reliability_intents WHERE id=?').get(text(id, 'Receipt')); if (!row)
        throw Error('Unknown receipt'); return row; };
    const fresh = row => { if (snapshot(row.project).hash !== row.source_hash)
        throw Error('Source changed: create a new event and review the current source'); };
    const event = (row, kind, detail = {}) => db.prepare('INSERT INTO reliability_events(intent_id,kind,status,detail) VALUES(?,?,?,?)').run(row.id, kind, row.status, JSON.stringify(detail));
    const change = (row, status, kind, detail = {}) => { db.prepare('UPDATE reliability_intents SET status=? WHERE id=?').run(status, row.id); row.status = status; event(row, kind, detail); };
    const view = row => ({ receiptId: row.id, projectId: row.project, eventKey: row.event_key, status: row.status, reviewer: row.reviewer, attempts: row.attempts, payload: JSON.parse(row.payload), payloadHash: row.payload_hash, sourceHash: row.source_hash,
        localEffects: db.prepare('SELECT COUNT(*) AS count FROM reliability_effects WHERE intent_id=?').get(row.id).count,
        events: db.prepare('SELECT sequence,kind,status,detail FROM reliability_events WHERE intent_id=? ORDER BY sequence').all(row.id).map(e => ({ ...e, detail: JSON.parse(e.detail) })), externalActions: 0, scope: 'Local synthetic contact handoff; not domain-policy validation or provider delivery.' });
    return {
        submit(projectId, input) {
            const current = snapshot(projectId), plan = planContact(input, { projectId, locationId: 'DEMO_LOCATION' });
            if (plan.status !== 'ready')
                return { ...plan, externalActions: 0, stored: false };
            const payload = JSON.stringify(plan.request.body), payloadHash = hash(plan.request.body), id = hash({ eventKey: plan.eventKey, payloadHash, source: current.hash });
            return transaction(() => {
                const old = db.prepare('SELECT * FROM reliability_intents WHERE event_key=?').get(plan.eventKey);
                if (old) {
                    if (old.payload_hash !== payloadHash)
                        throw Error('Event identity conflict: changed payload requires a new event ID');
                    fresh(old);
                    return { ...view(old), replayed: true };
                }
                db.prepare('INSERT INTO reliability_intents(id,event_key,project,payload,payload_hash,source_hash,status) VALUES(?,?,?,?,?,?,?)').run(id, plan.eventKey, projectId, payload, payloadHash, current.hash, 'pending_review');
                const row = get(id);
                event(row, 'submitted');
                return view(row);
            });
        },
        review(id, reviewer) {
            const label = text(reviewer, 'Reviewer label');
            return transaction(() => {
                const row = get(id);
                fresh(row);
                if (row.reviewer) {
                    if (row.reviewer !== label)
                        throw Error('Original reviewer retained');
                    return { ...view(row), replayed: true };
                }
                if (row.status !== 'pending_review')
                    throw Error('Review requires a pending receipt');
                db.prepare('UPDATE reliability_intents SET reviewer=? WHERE id=?').run(label, id);
                row.reviewer = label;
                change(row, 'reviewed', 'reviewed', { reviewer: label });
                return view(row);
            });
        },
        execute(id, outcome) {
            if (!['success', 'timeout_before', 'timeout_after'].includes(outcome))
                throw Error('Unknown simulated outcome');
            return transaction(() => {
                const row = get(id);
                fresh(row);
                if (row.status === 'completed')
                    return { ...view(row), replayed: true };
                if (!row.reviewer || !['reviewed', 'retryable'].includes(row.status))
                    throw Error('A reviewed, certain request is required; reconcile uncertain writes');
                if (row.attempts >= 2) {
                    change(row, 'stopped', 'attempt_limit');
                    return view(row);
                }
                row.attempts++;
                db.prepare('UPDATE reliability_intents SET attempts=? WHERE id=?').run(row.attempts, id);
                if (outcome === 'timeout_before')
                    change(row, row.attempts === 2 ? 'stopped' : 'retryable', 'confirmed_no_effect', { outcome });
                else {
                    db.prepare('INSERT INTO reliability_effects VALUES(?,?)').run(id, row.payload);
                    change(row, outcome === 'success' ? 'completed' : 'uncertain', outcome === 'success' ? 'local_effect_confirmed' : 'acknowledgement_lost', { outcome });
                }
                return view(row);
            });
        },
        reconcile(id) {
            return transaction(() => {
                const row = get(id);
                fresh(row);
                if (row.status === 'completed')
                    return { ...view(row), replayed: true };
                if (row.status !== 'uncertain')
                    throw Error('Only uncertain receipts require reconciliation');
                const effect = db.prepare('SELECT payload FROM reliability_effects WHERE intent_id=?').get(id);
                if (!effect || effect.payload !== row.payload) {
                    event(row, 'reconciliation_unresolved');
                    return view(row);
                }
                change(row, 'completed', 'reconciled_existing_effect');
                return view(row);
            });
        },
        inspect(id) { return view(get(id)); },
        export(id) { const row = get(id); fresh(row); if (row.status !== 'completed')
            throw Error('Confirmed local completion required'); return { format: 'portfolio-reliability-evidence/v1', ...view(row), authority: 'local_demo_only', communicationAllowed: false }; },
    };
}
