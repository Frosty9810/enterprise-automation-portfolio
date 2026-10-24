import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { JSDOM } from 'jsdom';
import { mountSalesforce } from './salesforce-ui.mjs';
import { salesforceDesk, salesforceScope } from './salesforce-core.mjs';
const flush = () => new Promise(r => setImmediate(r));
function setup() {
    const dom = new JSDOM(readFileSync(new URL('./salesforce.html', import.meta.url), 'utf8'));
    const db = new DatabaseSync(':memory:'), desk = salesforceDesk(db);
    let exported;
    const api = async (kind, body) => {
        if (kind === 'config')
            return { scope: salesforceScope };
        if (kind === 'start')
            return desk.start(body.scenario);
        if (kind === 'full-run')
            return desk.fullRun();
        if (kind === 'state')
            return desk.state(body.runId);
        if (kind === 'evaluate')
            return desk.submit(body.runId, desk.event(body.runId, body.recordId));
        if (kind === 'change')
            return desk.simulateChange(body.runId, body.recordId);
        if (kind === 'review')
            return desk.review(body.receiptId, body.profile);
        if (kind === 'execute')
            return desk.execute(body.receiptId, body.outcome);
        if (kind === 'reconcile')
            return desk.reconcile(body.receiptId);
        if (kind === 'export')
            return desk.export(body.receiptId);
        throw Error('Unknown action');
    };
    return { dom, db, desk, api, d: dom.window.document, download: x => { exported = x; }, exported: () => exported, close: () => { dom.window.close(); db.close(); } };
}
test('full UI run shows three actual confirmations and permits receipt export', async () => {
    const x = setup();
    try {
        await mountSalesforce(x.d, x.api, x.download);
        assert.equal(x.d.querySelectorAll('.record').length, 3);
        assert.equal(x.d.getElementById('confirmed').textContent, '0');
        x.d.getElementById('full').click();
        await flush();
        assert.equal(x.d.getElementById('confirmed').textContent, '3');
        assert.match(x.d.getElementById('notice').textContent, /3\/3 workflows confirmed/);
        assert.equal(x.d.getElementById('export').disabled, false);
        x.d.getElementById('export').click();
        await flush();
        assert.equal(x.exported().externalActions, 0);
        assert.equal(x.exported().status, 'completed');
        const lead = [...x.d.querySelectorAll('.record')].find(b => b.textContent.includes('LEAD'));
        lead.click();
        assert.match(x.d.getElementById('result').textContent, /005000000000002/);
    }
    finally {
        x.close();
    }
});
test('review acknowledgement, read-only rejection and uncertain recovery are visible', async () => {
    const x = setup();
    try {
        await mountSalesforce(x.d, x.api, x.download);
        x.d.getElementById('evaluate').click();
        await flush();
        assert.equal(x.d.getElementById('review').disabled, true);
        x.d.getElementById('ack').checked = true;
        x.d.getElementById('ack').dispatchEvent(new x.dom.window.Event('change'));
        x.d.getElementById('profile').value = 'analyst-readonly';
        x.d.getElementById('review').click();
        await flush();
        assert.match(x.d.getElementById('notice').textContent, /cannot approve/);
        x.d.getElementById('profile').value = 'revops-reviewer';
        x.d.getElementById('review').click();
        await flush();
        assert.equal(x.d.getElementById('execute').disabled, false);
        x.d.getElementById('outcome').value = 'timeout_after';
        x.d.getElementById('execute').click();
        await flush();
        assert.equal(x.d.getElementById('execute').disabled, true);
        assert.equal(x.d.getElementById('export').disabled, true);
        assert.equal(x.d.getElementById('reconcile').disabled, false);
        x.d.getElementById('reconcile').click();
        await flush();
        assert.equal(x.d.getElementById('confirmed').textContent, '1');
        assert.match(x.d.getElementById('history').textContent, /existing update reconciled/);
    }
    finally {
        x.close();
    }
});
test('scenario changes and operator changes invalidate visible approval', async () => {
    const x = setup();
    try {
        await mountSalesforce(x.d, x.api, x.download);
        x.d.getElementById('evaluate').click();
        await flush();
        x.d.getElementById('ack').checked = true;
        x.d.getElementById('ack').dispatchEvent(new x.dom.window.Event('change'));
        x.d.getElementById('review').click();
        await flush();
        x.d.getElementById('change').click();
        await flush();
        assert.equal(x.d.getElementById('ack').checked, false);
        assert.equal(x.d.getElementById('execute').disabled, true);
        x.d.getElementById('scenario').value = 'field_denied';
        x.d.getElementById('scenario').dispatchEvent(new x.dom.window.Event('change'));
        assert.equal(x.d.getElementById('evaluate').disabled, true);
        x.d.getElementById('start').click();
        await flush();
        x.d.getElementById('evaluate').click();
        await flush();
        assert.match(x.d.getElementById('result').textContent, /field_write_permission_denied/);
        assert.equal(x.d.getElementById('review').disabled, true);
    }
    finally {
        x.close();
    }
});
test('late evaluations do not restore receipts after scenario changes', async () => {
    const x = setup();
    let release;
    try {
        const api = async (kind, body) => kind === 'evaluate' ? new Promise(r => { release = async () => r(await x.api(kind, body)); }) : x.api(kind, body);
        await mountSalesforce(x.d, api, x.download);
        x.d.getElementById('evaluate').click();
        await flush();
        x.d.getElementById('scenario').value = 'stale_event';
        x.d.getElementById('scenario').dispatchEvent(new x.dom.window.Event('change'));
        await release();
        await flush();
        assert.equal(x.d.getElementById('review').disabled, true);
        assert.equal(x.d.getElementById('execute').disabled, true);
        assert.equal(x.d.getElementById('export').disabled, true);
        assert.equal(x.d.querySelectorAll('.record').length, 0);
    }
    finally {
        x.close();
    }
});
