import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { flagshipSuite, evaluateInvoice, sourceArtifact } from './flagship-suite.mjs';
import { crossCheckFlagships } from './flagship-acceptance.mjs';
test('acceptance can be repeated after manual acknowledgement without overwriting the reviewer', async () => {
    const db = new DatabaseSync(':memory:'), suite = flagshipSuite(db);
    try {
        const receipt = await suite.evaluate('F12', { candidate: 'reconstructed' });
        suite.review(receipt.receiptId, 'Human analyst');
        for (let i = 0; i < 2; i++) {
            const report = await crossCheckFlagships(suite);
            assert.equal(report.passedProjects, 12);
            assert.equal(report.passedChecks, 48);
        }
        assert.equal(suite.export(receipt.receiptId).review.actor, 'Human analyst');
    } finally { db.close(); }
});
test('all twelve distinct projects execute their actual entry points and retain reviewed evidence', async () => { const db = new DatabaseSync(':memory:'), suite = flagshipSuite(db); try {
    assert.equal(suite.catalog().length, 12);
    for (const p of suite.catalog()) {
        const receipt = await suite.evaluate(p.id, suite.example(p.id));
        assert.equal(receipt.toolId, p.id);
        assert.equal(receipt.externalActions, 0);
        assert.equal(receipt.sourceHash, p.source.hash);
        assert.throws(() => suite.export(receipt.receiptId), /acknowledgement/);
        suite.review(receipt.receiptId, 'Analyst');
        assert.equal(suite.export(receipt.receiptId).authority, 'reviewed_local_analysis_only');
    }
    const map = suite.architecture();
    assert.equal(map.nodes.length, 12);
    assert.equal(map.observed.length, 12);
    assert.ok(map.observed.every(o => o.sourceCurrent));
    assert.ok(map.edges.every(e => e.kind === 'authored_wiring'));
    assert.equal(suite.history().length, 12);
}
finally {
    db.close();
} });
test('actual Python AP policy rejects receipt/PO variance, changed banks and altered duplicate amounts', async () => { const db = new DatabaseSync(':memory:'), suite = flagshipSuite(db); try {
    const x = suite.example('F05'), good = await evaluateInvoice(x);
    assert.equal(good.decision.action, 'draft_payable');
    x.invoice.total = 241;
    x.knownFingerprints = [good.fingerprint];
    const duplicate = await evaluateInvoice(x);
    assert.equal(duplicate.decision.action, 'blocked');
    assert.ok(duplicate.decision.reasons.includes('duplicate_invoice'));
    x.knownFingerprints = [];
    x.invoice.bank_details_changed = true;
    assert.equal((await evaluateInvoice(x)).decision.action, 'blocked');
    const po = suite.example('F05');
    po.purchase.po_quantity = 9;
    assert.ok((await evaluateInvoice(po)).decision.reasons.includes('quantity_exceeds_purchase_order'));
    po.invoice.total = true;
    await assert.rejects(evaluateInvoice(po), /finite/);
}
finally {
    db.close();
} });
test('source changes fail closed for evaluation, review and export, and artifacts use a fixed allowlist', async () => { const db = new DatabaseSync(':memory:'); let hash = 'v1'; const suite = flagshipSuite(db, () => ({ hash, files: [] })); try {
    const r = await suite.evaluate('F12', { candidate: 'reconstructed' });
    suite.review(r.receiptId, 'Analyst');
    hash = 'v2';
    await assert.rejects(suite.evaluate('F12', { candidate: 'reconstructed' }), /restart/);
    assert.throws(() => suite.review(r.receiptId, 'Analyst'), /restart/);
    assert.throws(() => suite.export(r.receiptId), /restart/);
    assert.equal(suite.catalog()[0].sourceCurrent, false);
    assert.throws(() => sourceArtifact('../private', 0));
    assert.throws(() => sourceArtifact('F05', -1));
    assert.throws(() => sourceArtifact('F05', 200));
}
finally {
    db.close();
} });
