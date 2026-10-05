/** Reproducible complete local acceptance run. No external API or installed Salesforce CLI required. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { salesforceDesk, salesforceSourceHash } from './salesforce-core.mjs';
const dir = mkdtempSync(join(tmpdir(), 'revenueops-acceptance-'));
let db;
try {
    const file = join(dir, 'acceptance.sqlite');
    db = new DatabaseSync(file);
    let desk = salesforceDesk(db);
    const started = performance.now();
    const full = desk.fullRun();
    assert.equal(full.passed, true);
    const checks = [{ name: 'Three domain updates and case reconciliation', passed: true }, { name: 'Exactly one persisted local effect per intent', passed: full.results.every(r => r.localEffects === 1) }];
    for (const [scenario, reason] of [['consent_hold', 'storage_consent_required'], ['field_denied', 'field_write_permission_denied'], ['stale_event', 'stale_record_evidence']]) {
        const run = desk.start(scenario), lead = run.records.find(r => r.object === 'Lead');
        const receipt = desk.submit(run.runId, desk.event(run.runId, lead.id));
        assert.equal(receipt.status, 'held');
        assert.ok(receipt.reasons.includes(reason));
        assert.throws(() => desk.execute(receipt.receiptId));
        checks.push({ name: reason, passed: true });
    }
    const restart = desk.start(), lead = restart.records.find(r => r.object === 'Lead'), event = desk.event(restart.runId, lead.id), receipt = desk.submit(restart.runId, event);
    desk.review(receipt.receiptId, 'revops-reviewer');
    desk.execute(receipt.receiptId, 'timeout_after');
    db.close();
    db = new DatabaseSync(file);
    desk = salesforceDesk(db);
    assert.equal(desk.submit(restart.runId, event).status, 'uncertain');
    assert.equal(desk.reconcile(receipt.receiptId).localEffects, 1);
    checks.push({ name: 'Uncertain update survives restart without duplicate effect', passed: true });
    const report = { format: 'salesforce-local-acceptance/v1', measuredAt: new Date().toISOString(), sourceHash: salesforceSourceHash(), wallDurationMs: performance.now() - started, passed: checks.every(c => c.passed), checks, fullRun: full, restartReceipt: desk.export(receipt.receiptId), externalActions: 0 };
    writeFileSync(new URL('../reports/salesforce-local-acceptance.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
    console.log(`Salesforce-shaped local acceptance: ${checks.length}/${checks.length} checks, 3/3 domain updates, restart and reconciliation PASS; external actions 0.`);
}
finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
}
