import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { salesforceDesk } from './salesforce-core.mjs';
import { reliabilityDesk } from './reliability.mjs';
import { evaluateProduct } from './product-governance.mjs';
import { evaluateIndustryDepth } from './industry-depth.mjs';
import { supportDesk, routingLab, mergePreview, journey, usageLedger, scheduleBoard, text } from './flagship-decisions.mjs';
import { reconstructionChallenge } from './reconstruction.mjs';
import { flagshipFixtures, flagshipDescriptions } from './flagship-fixtures.mjs';
const hash = x => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
export const flagshipScope = 'Twelve executable local business demonstrations with synthetic data. Reviews acknowledge analysis only; they do not authorize live operations. No hosted Salesforce, paid model inference, external messages, payments, publishing or calendar writes.';
export function sourceManifest(id) { const row = flagshipDescriptions.find(r => r[0] === id); if (!row)
    throw Error('Unknown flagship'); const paths = [...new Set([...row[5], 'flagship-suite.mjs', 'flagship-fixtures.mjs', 'server.mjs', 'flagship-acceptance.mjs', 'flagships-ui.mjs', 'flagships-ui.test.mjs', 'flagship-http.test.mjs'])]; const files = paths.map(path => ({ path, sha256: hash(readFileSync(new URL(path, import.meta.url))) })); return { hash: hash(files), files, scope: 'Explicit checked-in source/test manifest, not automatic discovery of every runtime dependency.' }; }
export function sourceArtifact(id, index) { const row = flagshipDescriptions.find(r => r[0] === id); if (!row || !Number.isSafeInteger(index) || index < 0 || index >= row[5].length)
    throw Error('Unknown source artifact'); return { path: fileURLToPath(new URL(row[5][index], import.meta.url)), name: row[5][index].split('/').at(-1) }; }
export function evaluateInvoice(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.knownFingerprints) || input.knownFingerprints.some(x => typeof x !== 'string' || !/^[a-f0-9]{20}$/.test(x)))
        return Promise.reject(Error('Known fingerprints must be a list of 20-character hexadecimal invoice identities'));
    return new Promise((resolve, reject) => { const payload = JSON.stringify(input); if (Buffer.byteLength(payload) > 32768)
        return reject(Error('Invoice payload too large')); const python = fileURLToPath(new URL(process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python', import.meta.url)); const source = sourceArtifact('F05', 0).path; const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'].includes(k.toUpperCase()))); const child = spawn(python, [source, '--stdin'], { env: { ...env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = '', settled = false; const finish = (error, value) => { if (settled)
        return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); }; const timer = setTimeout(() => { child.kill(); finish(Error('Invoice policy timed out')); }, 10000); child.on('error', e => finish(e)); child.stdin.on('error', e => finish(e)); child.stdout.on('data', c => { out += c; if (out.length > 65536) {
        child.kill();
        finish(Error('Invoice output too large'));
    } }); child.stderr.on('data', c => { err = (err + c).slice(-2000); }); child.on('close', code => { if (code !== 0)
        return finish(Error(err.trim() || 'Invoice policy failed')); try {
        finish(null, { ...JSON.parse(out), externalActions: 0, scope: 'Original Python three-way match against supplied synthetic purchase evidence and duplicate ledger fixture. No payment release.' });
    }
    catch {
        finish(Error('Invalid invoice policy output'));
    } }); child.stdin.end(payload); });
}
export function flagshipSuite(db, manifest = sourceManifest) {
    db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS flagship_receipts(id TEXT PRIMARY KEY,tool TEXT NOT NULL,input TEXT NOT NULL,result TEXT NOT NULL,source_hash TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS flagship_reviews(receipt TEXT PRIMARY KEY REFERENCES flagship_receipts(id),actor TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS flagship_audit(sequence INTEGER PRIMARY KEY,receipt TEXT NOT NULL REFERENCES flagship_receipts(id),kind TEXT NOT NULL,detail TEXT NOT NULL);`);
    const loaded = new Map(flagshipDescriptions.map(([id]) => [id, manifest(id)]));
    const current = id => { if (!loaded.has(id))
        throw Error('Unknown flagship'); const value = manifest(id); if (value.hash !== loaded.get(id).hash)
        throw Error('Source changed since server startup; restart the lab and reevaluate'); return value; };
    const sf = salesforceDesk(db), recovery = reliabilityDesk(db);
    const receipt = id => { const row = db.prepare('SELECT * FROM flagship_receipts WHERE id=?').get(text(id, 'Receipt')); if (!row)
        throw Error('Unknown receipt'); return row; };
    const view = row => ({ receiptId: row.id, toolId: row.tool, input: JSON.parse(row.input), result: JSON.parse(row.result), sourceHash: row.source_hash, created: row.created, review: db.prepare('SELECT actor FROM flagship_reviews WHERE receipt=?').get(row.id) ?? null, externalActions: 0, scope: flagshipScope });
    const fresh = row => { if (current(row.tool).hash !== row.source_hash)
        throw Error('Receipt source changed'); };
    const tx = fn => { db.exec('BEGIN IMMEDIATE'); try {
        const value = fn();
        db.exec('COMMIT');
        return value;
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    } };
    const suite = {
        catalog() { return flagshipDescriptions.map(([id, title, problem, discipline, deepLink, paths]) => ({ id, title, problem, discipline, deepLink, sources: paths.map((path, index) => ({ name: path.split('/').at(-1), url: `/api/flagships/source/${id}/${index}` })), source: loaded.get(id), sourceCurrent: manifest(id).hash === loaded.get(id).hash, status: 'local_demo', integrationStatus: 'live_acceptance_pending' })); },
        example(id) { current(id); return structuredClone(flagshipFixtures[id]); },
        architecture() { return { action: 'source_map', nodes: suite.catalog().map(p => ({ id: p.id, title: p.title, sourceHash: p.source.hash, sourceCurrent: p.sourceCurrent, sources: p.sources })), edges: flagshipDescriptions.map(([id]) => ({ from: id, to: 'durable_analysis_receipt', kind: 'authored_wiring' })), observed: db.prepare('SELECT r.* FROM flagship_receipts r JOIN (SELECT tool,MAX(rowid) AS last FROM flagship_receipts GROUP BY tool) latest ON r.rowid=latest.last').all().map(r => ({ toolId: r.tool, receiptId: r.id, sourceCurrent: r.source_hash === manifest(r.tool).hash, resultHash: hash(r.result), created: r.created })), externalActions: 0, scope: 'Edges describe authored wiring. Observed entries identify actual saved evaluations and explicitly expose stale source evidence.' }; },
        async evaluate(id, input) {
            const source = current(id);
            if (!input || typeof input !== 'object' || Array.isArray(input))
                throw Error('Input object required');
            if (Buffer.byteLength(JSON.stringify(input)) > 32768)
                throw Error('Input too large');
            let result;
            switch (id) {
                case 'F01':
                    if (Object.keys(input).length)
                        throw Error('Full RevenueOS fixture takes no fields');
                    result = sf.fullRun();
                    break;
                case 'F02': {
                    if (!['success', 'timeout_before', 'timeout_after'].includes(input.outcome) || typeof input.recover !== 'boolean')
                        throw Error('Outcome and strict recovery flag required');
                    const initial = recovery.submit('OPS-01', { projectId: 'OPS-01', eventId: 'incident-' + randomUUID(), storageConsent: true, contact: { email: 'synthetic@example.test' } });
                    recovery.review(initial.receiptId, 'Scripted demo reviewer');
                    const failed = recovery.execute(initial.receiptId, input.outcome);
                    const recovered = input.recover && failed.status === 'uncertain' ? recovery.reconcile(initial.receiptId) : input.recover && failed.status === 'retryable' ? recovery.execute(initial.receiptId, 'success') : failed;
                    result = { action: recovered.status === 'completed' ? 'incident_resolved' : 'operator_review', beforeRecovery: failed, afterRecovery: recovered, externalActions: 0, scope: 'Actual durable shared handoff transitions and SQLite effect reconciliation, not a live provider incident.' };
                    break;
                }
                case 'F03':
                    result = supportDesk(input);
                    break;
                case 'F04':
                    result = routingLab(input);
                    break;
                case 'F05':
                    result = await evaluateInvoice(input);
                    break;
                case 'F06':
                    if (Object.keys(input).length)
                        throw Error('Source explorer takes no fields');
                    result = suite.architecture();
                    break;
                case 'F07':
                    result = mergePreview(input);
                    break;
                case 'F08':
                    result = { ...await evaluateProduct(input), externalActions: 0, scope: 'Original Python product policy; local publishing eligibility analysis only. Use the dedicated product desk for source-bound draft review. No publishing.' };
                    break;
                case 'F09':
                    result = journey(input);
                    break;
                case 'F10':
                    result = usageLedger(input);
                    break;
                case 'F11':
                    result = { ...scheduleBoard(input), industryChecks: { maintenance: evaluateIndustryDepth('PM-01'), commitments: evaluateIndustryDepth('EA-01') } };
                    break;
                case 'F12':
                    result = reconstructionChallenge(input);
                    break;
                default: throw Error('Unknown flagship');
            }
            current(id);
            const encoded = JSON.stringify(result), receiptId = hash({ id, input, result, source: source.hash });
            return tx(() => { const old = db.prepare('SELECT * FROM flagship_receipts WHERE id=?').get(receiptId); if (old)
                return { ...view(old), replayed: true }; db.prepare('INSERT INTO flagship_receipts VALUES(?,?,?,?,?,?)').run(receiptId, id, JSON.stringify(input), encoded, source.hash, new Date().toISOString()); db.prepare('INSERT INTO flagship_audit(receipt,kind,detail) VALUES(?,?,?)').run(receiptId, 'evaluation_recorded', JSON.stringify({ sourceHash: source.hash, resultHash: hash(encoded) })); return view(receipt(receiptId)); });
        },
        review(id, actor) { const label = text(actor, 'Analyst label'); return tx(() => { const row = receipt(id); fresh(row); const old = db.prepare('SELECT actor FROM flagship_reviews WHERE receipt=?').get(id); if (old) {
            if (old.actor !== label)
                throw Error('Original analysis reviewer retained');
            return { ...view(row), replayed: true };
        } db.prepare('INSERT INTO flagship_reviews VALUES(?,?)').run(id, label); db.prepare('INSERT INTO flagship_audit(receipt,kind,detail) VALUES(?,?,?)').run(id, 'analysis_reviewed', JSON.stringify({ actor: label, authority: 'none' })); return view(row); }); },
        export(id) { const row = receipt(id); fresh(row); const value = view(row); if (!value.review)
            throw Error('Analysis acknowledgement required'); return { format: 'portfolio-flagship-analysis/v1', ...value, authority: 'reviewed_local_analysis_only' }; },
        history() { return db.prepare('SELECT tool,COUNT(*) AS evaluations,MAX(created) AS last FROM flagship_receipts GROUP BY tool').all(); },
    };
    return suite;
}
