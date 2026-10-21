import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { JSDOM } from 'jsdom';
import { mountFlagships } from './flagships-ui.mjs';
import { flagshipSuite } from './flagship-suite.mjs';

async function setup() {
    const db = new DatabaseSync(':memory:'), suite = flagshipSuite(db);
    const dom = new JSDOM(readFileSync(new URL('./flagships.html', import.meta.url), 'utf8'));
    const api = async (kind, body) => kind === 'catalog' ? { projects: suite.catalog() } : kind === 'example' ? suite.example(body) : suite.evaluate(body.toolId, body.input);
    await mountFlagships(dom.window.document, api, () => {}, 'F11');
    return { document: dom.window.document, window: dom.window, close() { dom.window.close(); db.close(); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('scheduling UI shows entered-slot analysis separately from actual fixed-calendar transitions', async () => {
    const x = await setup();
    try {
        x.document.getElementById('evaluate').click(); await flush();
        const details = x.document.getElementById('details');
        assert.equal(details.querySelectorAll('table').length, 2);
        assert.match(details.textContent, /Separate local reservation exercise/);
        assert.match(details.textContent, /no entered candidate slot is reserved/);
        assert.match(details.textContent, /locally_reserved/);
        assert.match(details.textContent, /reservation_held/);
        assert.match(details.textContent, /locally_cancelled/);
        assert.match(details.textContent, /1 active local reservation/);
        assert.match(details.textContent, /4 audit events/);
        assert.match(details.textContent, /0 external actions/);
        assert.equal(x.document.getElementById('export').disabled, true);
    } finally { x.close(); }
});

test('changing candidate eligibility invalidates analysis without claiming those slots were reserved', async () => {
    const x = await setup();
    try {
        x.document.getElementById('evaluate').click(); await flush();
        const editor = x.document.getElementById('input'), input = JSON.parse(editor.value);
        input.slots.forEach(slot => { slot.ownerReviewed = false; });
        editor.value = JSON.stringify(input); editor.dispatchEvent(new x.window.Event('input'));
        assert.equal(x.document.getElementById('export').disabled, true);
        x.document.getElementById('evaluate').click(); await flush();
        assert.match(x.document.getElementById('summary').textContent, /all windows held/);
        assert.match(x.document.getElementById('details').textContent, /Separate fixed synthetic calendar exercise/);
        assert.match(x.document.getElementById('details').textContent, /no entered candidate slot is reserved/);
    } finally { x.close(); }
});
