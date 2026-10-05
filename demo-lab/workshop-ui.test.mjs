import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { mountWorkshop } from './workshop.mjs';
import { projectPassports } from './project-passports.mjs';
const flush = () => new Promise(r => setImmediate(r));
test('all project choices display their own passport and safe event identity', async () => { const dom = new JSDOM(readFileSync(new URL('./workshop.html', import.meta.url), 'utf8'), { url: 'http://127.0.0.1:5680/workshop#ACC-01' }); const d = dom.window.document; await mountWorkshop(d, async () => ({ ok: true, json: async () => ({ projects: projectPassports() }) }), dom.window.location, { randomUUID }); assert.equal(d.getElementById('project').options.length, 27); assert.equal(d.getElementById('project').value, 'ACC-01'); for (const p of projectPassports()) {
    d.getElementById('project').value = p.id;
    d.getElementById('project').dispatchEvent(new dom.window.Event('change'));
    assert.equal(JSON.parse(d.getElementById('event').value).projectId, p.id);
    assert.equal(d.getElementById('decision').textContent, p.decision);
    assert.equal(d.getElementById('domain').getAttribute('href'), p.deepLink);
} dom.window.close(); });
test('edits and project changes invalidate review and ignore late responses', async () => { const dom = new JSDOM(readFileSync(new URL('./workshop.html', import.meta.url), 'utf8'), { url: 'http://127.0.0.1:5680/workshop' }); const d = dom.window.document; let release; const receipt = { receiptId: 'test', status: 'pending_review', attempts: 0, localEffects: 0, externalActions: 0, payload: { email: 'safe@example.test' }, sourceHash: 'hash', payloadHash: 'payload', events: [] }; const api = async (path) => path.endsWith('projects') ? { ok: true, json: async () => ({ projects: projectPassports() }) } : new Promise(r => { release = () => r({ ok: true, json: async () => receipt }); }); await mountWorkshop(d, api, dom.window.location, { randomUUID }); d.getElementById('submit').click(); await flush(); d.getElementById('event').dispatchEvent(new dom.window.Event('input')); release(); await flush(); assert.equal(d.getElementById('receipt').textContent, 'Validate an event to begin.'); assert.equal(d.getElementById('review').disabled, true); d.getElementById('submit').click(); await flush(); release(); await flush(); assert.match(d.getElementById('receipt').textContent, /pending review/); assert.equal(d.getElementById('review').disabled, true); d.getElementById('ack').checked = true; d.getElementById('ack').dispatchEvent(new dom.window.Event('change')); assert.equal(d.getElementById('review').disabled, false); d.getElementById('project').value = 'ECOM-01'; d.getElementById('project').dispatchEvent(new dom.window.Event('change')); assert.equal(d.getElementById('ack').checked, false); assert.equal(d.getElementById('execute').disabled, true); assert.equal(d.getElementById('export').disabled, true); dom.window.close(); });
