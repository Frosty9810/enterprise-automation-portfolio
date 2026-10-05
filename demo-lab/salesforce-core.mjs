import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const digest = value => createHash('sha256').update(value).digest('hex');
export const salesforceSourceHash = () => digest(readFileSync(new URL('./salesforce-core.mjs', import.meta.url)));
const stringify = value => JSON.stringify(value);
const required = (value, name) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 200)
        throw Error(name + ' must be nonempty text');
    return value;
};
const whole = (value, name) => {
    if (!Number.isSafeInteger(value) || value < 1)
        throw Error(name + ' must be a positive integer');
    return value;
};
export const salesforceScenarios = ['normal', 'consent_hold', 'field_denied', 'stale_event'];
export const salesforceScope = 'Synthetic Salesforce-shaped records and normalized events; local SQLite updates only. No Salesforce org connected. Reviewer profiles simulate permissions; they are not authenticated identities.';
const templates = [
    { id: '00Q000000000001', object: 'Lead', Name: 'Avery · Northstar Labs', Company: 'Northstar Labs', Score: 91, Employees: 420, StorageConsent: true, OwnerId: '005000000000001', Status: 'Open' },
    { id: '006000000000001', object: 'Opportunity', Name: 'Northstar · Expansion', Amount: 48000, StageName: 'Proposal', DaysWithoutNextStep: 9, NextStep: 'Awaiting discovery notes', OwnerId: '005000000000001' },
    { id: '500000000000001', object: 'Case', Name: 'Northstar · Integration outage', Severity: 'Critical', Priority: 'Medium', Status: 'New', OwnerId: '005000000000001' },
];
/** Deliberately small local record store, not a Salesforce transport or CDC decoder. */
export function salesforceDesk(db, sourceHash = salesforceSourceHash) {
    db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS sf_runs(id TEXT PRIMARY KEY,org TEXT NOT NULL,scenario TEXT NOT NULL,cursor TEXT);
 CREATE TABLE IF NOT EXISTS sf_records(run TEXT NOT NULL REFERENCES sf_runs(id),id TEXT NOT NULL,object TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(run,id));
 CREATE TABLE IF NOT EXISTS sf_intents(id TEXT PRIMARY KEY,run TEXT NOT NULL REFERENCES sf_runs(id),identity TEXT NOT NULL,event_hash TEXT NOT NULL,event TEXT NOT NULL,record_id TEXT NOT NULL,before_data TEXT NOT NULL,patch TEXT NOT NULL,revision INTEGER NOT NULL,policy TEXT NOT NULL,status TEXT NOT NULL,reasons TEXT NOT NULL,reviewer TEXT,attempts INTEGER NOT NULL DEFAULT 0,UNIQUE(run,identity));
 CREATE TABLE IF NOT EXISTS sf_effects(intent TEXT PRIMARY KEY REFERENCES sf_intents(id),after_data TEXT NOT NULL,revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sf_audit(sequence INTEGER PRIMARY KEY,intent TEXT NOT NULL REFERENCES sf_intents(id),kind TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL);`);
    const tx = fn => {
        db.exec('BEGIN IMMEDIATE');
        try {
            const result = fn();
            db.exec('COMMIT');
            return result;
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    };
    const run = id => {
        const row = db.prepare('SELECT * FROM sf_runs WHERE id=?').get(required(id, 'Run'));
        if (!row)
            throw Error('Unknown run');
        return row;
    };
    const record = (runId, id) => {
        const row = db.prepare('SELECT * FROM sf_records WHERE run=? AND id=?').get(runId, id);
        if (!row)
            throw Error('Unknown record');
        return { ...row, data: JSON.parse(row.data) };
    };
    const intent = id => {
        const row = db.prepare('SELECT * FROM sf_intents WHERE id=?').get(required(id, 'Receipt'));
        if (!row)
            throw Error('Unknown receipt');
        return row;
    };
    const audit = (row, kind, detail = {}) => db.prepare('INSERT INTO sf_audit(intent,kind,status,detail) VALUES(?,?,?,?)').run(row.id, kind, row.status, stringify(detail));
    const status = (row, next, kind, detail = {}) => { row.status = next; db.prepare('UPDATE sf_intents SET status=? WHERE id=?').run(next, row.id); audit(row, kind, detail); };
    const policyFresh = row => {
        if (row.policy !== sourceHash())
            throw Error('Policy changed; evaluate a new event against current source');
    };
    const view = row => ({ receiptId: row.id, runId: row.run, recordId: row.record_id, status: row.status, reasons: JSON.parse(row.reasons), before: JSON.parse(row.before_data), patch: JSON.parse(row.patch), expectedRevision: row.revision, sourceHash: row.policy, reviewer: row.reviewer, attempts: row.attempts,
        currentRecord: record(row.run, row.record_id), localEffects: db.prepare('SELECT COUNT(*) AS n FROM sf_effects WHERE intent=?').get(row.id).n,
        history: db.prepare('SELECT sequence,kind,status,detail FROM sf_audit WHERE intent=? ORDER BY sequence').all(row.id).map(e => ({ ...e, detail: JSON.parse(e.detail) })), externalActions: 0, scope: salesforceScope });
    const writable = (r, patch) => r.scenario !== 'field_denied' && Object.keys(patch).every(field => ['OwnerId', 'NextStep', 'Priority'].includes(field));
    const fresh = row => {
        policyFresh(row);
        const current = record(row.run, row.record_id);
        if (current.revision !== row.revision || stringify(current.data) !== row.before_data)
            throw Error('Record changed after evaluation; reevaluate current evidence');
    };
    const desk = {
        start(scenario = 'normal') {
            if (!salesforceScenarios.includes(scenario))
                throw Error('Unknown scenario');
            return tx(() => {
                const id = randomUUID();
                db.prepare('INSERT INTO sf_runs VALUES(?,?,?,NULL)').run(id, '00D000000000001', scenario);
                for (const template of templates) {
                    const data = structuredClone(template);
                    if (data.object === 'Lead' && scenario === 'consent_hold')
                        data.StorageConsent = false;
                    db.prepare('INSERT INTO sf_records VALUES(?,?,?,?,?)').run(id, data.id, data.object, stringify(data), scenario === 'stale_event' ? 2 : 1);
                }
                return desk.state(id);
            });
        },
        state(runId) { const r = run(runId); return { runId: r.id, orgId: r.org, scenario: r.scenario, cursor: r.cursor, records: db.prepare('SELECT id FROM sf_records WHERE run=? ORDER BY object').all(runId).map(row => record(runId, row.id)), receipts: db.prepare('SELECT id FROM sf_intents WHERE run=? ORDER BY rowid DESC').all(runId).map(row => view(intent(row.id))), sourceHash: sourceHash(), scope: salesforceScope, profiles: [{ id: 'revops-reviewer', canReview: true }, { id: 'analyst-readonly', canReview: false }] }; },
        event(runId, recordId) { const r = run(runId), rec = record(runId, recordId); return { orgId: r.org, entityName: rec.object, recordId: rec.id, transactionKey: randomUUID(), sequenceNumber: 1, replayId: Buffer.from(randomUUID()).toString('base64'), expectedRevision: r.scenario === 'stale_event' ? Math.max(1, rec.revision - 1) : rec.revision, changeType: 'UPDATE' }; },
        submit(runId, input) {
            const r = run(runId);
            if (!input || typeof input !== 'object' || Array.isArray(input))
                throw Error('Event must be an object');
            const keys = ['orgId', 'entityName', 'recordId', 'transactionKey', 'sequenceNumber', 'replayId', 'expectedRevision', 'changeType'];
            if (Object.keys(input).some(key => !keys.includes(key)))
                throw Error('Unsupported event fields');
            for (const name of ['orgId', 'entityName', 'recordId', 'transactionKey', 'replayId'])
                required(input[name], name);
            whole(input.sequenceNumber, 'sequenceNumber');
            whole(input.expectedRevision, 'expectedRevision');
            if (input.orgId !== r.org)
                throw Error('Tenant mismatch');
            if (input.changeType !== 'UPDATE')
                throw Error('Only normalized UPDATE events supported');
            const rec = record(runId, input.recordId);
            if (input.entityName !== rec.object)
                throw Error('Object identity mismatch');
            const canonical = Object.fromEntries(keys.map(key => [key, input[key]]));
            const identity = stringify([r.org, input.transactionKey, input.sequenceNumber, input.entityName, input.recordId]);
            // Cursor is opaque, excluded from business identity and semantic payload. Never increment it.
            const semantic = { ...canonical };
            delete semantic.replayId;
            const eventHash = digest(stringify(semantic));
            return tx(() => {
                const previous = db.prepare('SELECT * FROM sf_intents WHERE run=? AND identity=?').get(runId, identity);
                if (previous) {
                    if (previous.event_hash !== eventHash)
                        throw Error('Conflicting duplicate event');
                    policyFresh(previous);
                    return { ...view(previous), replayed: true };
                }
                const reasons = [], patch = {};
                const data = rec.data;
                if (input.expectedRevision !== rec.revision)
                    reasons.push('stale_record_evidence');
                if (rec.object === 'Lead') {
                    if (data.StorageConsent !== true)
                        reasons.push('storage_consent_required');
                    if (data.Score >= 80 && data.Employees >= 200) {
                        patch.OwnerId = '005000000000002';
                        reasons.push('enterprise_fit_and_intent');
                    }
                    else
                        reasons.push('no_routing_change');
                }
                if (rec.object === 'Opportunity') {
                    if (data.StageName === 'Proposal' && data.DaysWithoutNextStep >= 7) {
                        patch.NextStep = 'Schedule expansion review; confirm decision owner and next milestone.';
                        reasons.push('proposal_followup_overdue');
                    }
                    else
                        reasons.push('no_followup_change');
                }
                if (rec.object === 'Case') {
                    if (data.Severity === 'Critical') {
                        patch.Priority = 'High';
                        patch.OwnerId = '005000000000003';
                        reasons.push('critical_service_escalation');
                    }
                    else
                        reasons.push('no_escalation_change');
                }
                if (!writable(r, patch))
                    reasons.push('field_write_permission_denied');
                const blocked = reasons.some(reason => ['stale_record_evidence', 'storage_consent_required', 'field_write_permission_denied'].includes(reason));
                const id = randomUUID();
                db.prepare('INSERT INTO sf_intents(id,run,identity,event_hash,event,record_id,before_data,patch,revision,policy,status,reasons) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, runId, identity, eventHash, stringify(canonical), rec.id, stringify(data), stringify(patch), rec.revision, sourceHash(), blocked ? 'held' : Object.keys(patch).length ? 'pending_review' : 'no_change', stringify(reasons));
                const row = intent(id);
                audit(row, 'evaluated', { reasons });
                db.prepare('UPDATE sf_runs SET cursor=? WHERE id=?').run(input.replayId, runId);
                return view(row);
            });
        },
        review(id, profile) {
            return tx(() => {
                const row = intent(id);
                fresh(row);
                if (profile !== 'revops-reviewer')
                    throw Error('Reviewer profile cannot approve');
                if (row.reviewer)
                    return { ...view(row), replayed: true };
                if (row.status !== 'pending_review')
                    throw Error('Held or unchanged records cannot be approved');
                if (!writable(run(row.run), JSON.parse(row.patch)))
                    throw Error('Field permission denied');
                row.reviewer = profile;
                db.prepare('UPDATE sf_intents SET reviewer=? WHERE id=?').run(profile, id);
                status(row, 'reviewed', 'review_recorded', { profile });
                return view(row);
            });
        },
        execute(id, outcome = 'success') {
            if (!['success', 'timeout_before', 'timeout_after'].includes(outcome))
                throw Error('Unknown outcome');
            return tx(() => {
                const row = intent(id);
                policyFresh(row);
                if (row.status === 'completed')
                    return { ...view(row), replayed: true };
                if (!row.reviewer || !['reviewed', 'retryable'].includes(row.status))
                    throw Error('Review required; uncertain outcomes require reconciliation');
                fresh(row);
                if (!writable(run(row.run), JSON.parse(row.patch)))
                    throw Error('Field permission denied');
                if (row.attempts >= 2)
                    throw Error('Attempt limit');
                row.attempts++;
                db.prepare('UPDATE sf_intents SET attempts=? WHERE id=?').run(row.attempts, id);
                if (outcome === 'timeout_before') {
                    status(row, row.attempts === 2 ? 'stopped' : 'retryable', 'confirmed_no_write');
                    return view(row);
                }
                const rec = record(row.run, row.record_id), after = { ...rec.data, ...JSON.parse(row.patch) }, revision = rec.revision + 1;
                const changed = db.prepare('UPDATE sf_records SET data=?,revision=? WHERE run=? AND id=? AND revision=?').run(stringify(after), revision, row.run, row.record_id, row.revision);
                if (changed.changes !== 1)
                    throw Error('Concurrent record change');
                db.prepare('INSERT INTO sf_effects VALUES(?,?,?)').run(id, stringify(after), revision);
                status(row, outcome === 'success' ? 'completed' : 'uncertain', outcome === 'success' ? 'local_update_confirmed' : 'acknowledgement_lost');
                return view(row);
            });
        },
        reconcile(id) {
            return tx(() => {
                const row = intent(id);
                policyFresh(row);
                if (row.status === 'completed')
                    return { ...view(row), replayed: true };
                if (row.status !== 'uncertain')
                    throw Error('Only uncertain updates require reconciliation');
                const effect = db.prepare('SELECT * FROM sf_effects WHERE intent=?').get(id), rec = record(row.run, row.record_id);
                if (!effect || rec.revision !== effect.revision || stringify(rec.data) !== effect.after_data) {
                    audit(row, 'reconciliation_unresolved');
                    return view(row);
                }
                status(row, 'completed', 'existing_update_reconciled');
                return view(row);
            });
        },
        simulateChange(runId, recordId) { return tx(() => { run(runId); const rec = record(runId, recordId); const data = { ...rec.data, OwnerId: '005000000000004' }; db.prepare('UPDATE sf_records SET data=?,revision=revision+1 WHERE run=? AND id=?').run(stringify(data), runId, recordId); return desk.state(runId); }); },
        export(id) {
            const row = intent(id);
            policyFresh(row);
            if (row.status !== 'completed')
                throw Error('Confirmed completion required');
            return { format: 'salesforce-revenueops-local/v1', ...view(row), authority: 'local_simulation_only', exportedAt: new Date().toISOString() };
        },
        fullRun() {
            const batch = desk.start();
            const results = [];
            for (const rec of batch.records) {
                const receipt = desk.submit(batch.runId, desk.event(batch.runId, rec.id));
                desk.review(receipt.receiptId, 'revops-reviewer');
                const result = desk.execute(receipt.receiptId, rec.object === 'Case' ? 'timeout_after' : 'success');
                results.push(result.status === 'uncertain' ? desk.reconcile(result.receiptId) : result);
            }
            return { passed: results.every(r => r.status === 'completed' && r.localEffects === 1), ...desk.state(batch.runId), results, externalActions: 0 };
        },
    };
    return desk;
}
