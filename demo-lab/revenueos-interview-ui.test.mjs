import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { JSDOM } from 'jsdom';
import { salesforceDesk } from './salesforce-core.mjs';
import { mountRevenueInterview } from './revenueos-interview-ui.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const dom = new JSDOM(readFileSync(new URL('./revenueos-interview.html', import.meta.url), 'utf8'));
  const db = new DatabaseSync(':memory:');
  const desk = salesforceDesk(db);
  let exported;
  const api = async (kind, body) => {
    if (kind === 'start') return desk.start(body.scenario);
    if (kind === 'state') return desk.state(body.runId);
    if (kind === 'evaluate') return desk.submit(body.runId, desk.event(body.runId, body.recordId));
    if (kind === 'review') return desk.review(body.receiptId, body.profile);
    if (kind === 'execute') return desk.execute(body.receiptId, body.outcome);
    if (kind === 'reconcile') return desk.reconcile(body.receiptId);
    if (kind === 'export') return desk.export(body.receiptId);
    throw new Error('Unknown kind');
  };
  return {
    dom, db, desk, api, d: dom.window.document,
    download: result => { exported = result; },
    exported: () => exported,
    close() { dom.window.close(); db.close(); },
  };
}
async function click(x, id) {
  x.d.getElementById(id).click();
  await flush();
}
async function approve(x) {
  x.d.getElementById('acknowledge').checked = true;
  x.d.getElementById('acknowledge').dispatchEvent(new x.dom.window.Event('change'));
  await click(x, 'approve');
}

test('guided case requires explicit review, reconciles one saved effect and replays it', async () => {
  const x = setup();
  try {
    await mountRevenueInterview(x.d, x.api, x.download);
    assert.equal(x.db.prepare('SELECT count(*) AS n FROM sf_runs').get().n, 0);
    await click(x, 'story-Case');
    await click(x, 'start-story');
    await click(x, 'evaluate');
    assert.match(x.d.getElementById('proposal').textContent, /Priority.*Medium.*High/);
    assert.equal(x.d.getElementById('approve').disabled, true);
    assert.equal(x.d.getElementById('effects').textContent, '0');
    await approve(x);
    assert.equal(x.d.getElementById('effects').textContent, '0');
    assert.equal(x.d.getElementById('apply').disabled, false);
    await click(x, 'apply');
    assert.equal(x.d.getElementById('status').textContent, 'Response lost');
    assert.equal(x.d.getElementById('apply').disabled, true);
    assert.equal(x.d.getElementById('download').hidden, true);
    assert.equal(x.d.getElementById('effects').textContent, '1');
    await click(x, 'reconcile');
    assert.equal(x.d.getElementById('status').textContent, 'Update confirmed');
    const saved = JSON.parse(x.d.getElementById('receipt-json').textContent);
    await click(x, 'replay');
    const replayed = JSON.parse(x.d.getElementById('receipt-json').textContent);
    assert.equal(replayed.receiptId, saved.receiptId);
    assert.deepEqual(replayed.history, saved.history);
    assert.equal(x.db.prepare('SELECT count(*) AS n FROM sf_effects').get().n, 1);
    await click(x, 'download');
    assert.equal(x.exported().authority, 'local_simulation_only');
  } finally { x.close(); }
});

test('held evidence and readonly reviewer stay visible and story switch clears authority', async () => {
  const x = setup();
  try {
    await mountRevenueInterview(x.d, x.api, x.download);
    x.d.getElementById('challenge').value = 'consent_hold';
    await click(x, 'start-story');
    await click(x, 'evaluate');
    assert.equal(x.d.getElementById('status').textContent, 'Held for review');
    assert.match(x.d.getElementById('proposal').textContent, /storage consent required/);
    assert.equal(x.d.getElementById('review-controls').hidden, true);
    await click(x, 'story-Opportunity');
    x.d.getElementById('challenge').value = 'normal';
    await click(x, 'start-story');
    await click(x, 'evaluate');
    x.d.getElementById('reviewer').value = 'analyst-readonly';
    await approve(x);
    assert.match(x.d.getElementById('notice').textContent, /cannot approve/);
    assert.equal(x.d.getElementById('approve').disabled, true);
    await click(x, 'verify');
    x.d.getElementById('reviewer').value = 'revops-reviewer';
    await approve(x);
    await click(x, 'story-Case');
    assert.equal(x.d.getElementById('acknowledge').checked, false);
    assert.equal(x.d.getElementById('approve').disabled, true);
    assert.equal(x.d.getElementById('effects').textContent, '—');
    assert.equal(x.d.getElementById('technical').hidden, true);
  } finally { x.close(); }
});

test('a lost execute reply reloads the durable outcome before any further write', async () => {
  const x = setup();
  let lose = true;
  try {
    const api = async (kind, body) => {
      const result = await x.api(kind, body);
      if (kind === 'execute' && lose) { lose = false; throw new Error('Response unavailable'); }
      return result;
    };
    await mountRevenueInterview(x.d, api, x.download);
    await click(x, 'start-story');
    await click(x, 'evaluate');
    await approve(x);
    await click(x, 'apply');
    assert.equal(x.d.getElementById('apply').disabled, true);
    assert.equal(x.d.getElementById('verify').hidden, false);
    await click(x, 'verify');
    assert.equal(x.d.getElementById('status').textContent, 'Update confirmed');
    assert.equal(x.d.getElementById('effects').textContent, '1');
    await click(x, 'replay');
    assert.equal(x.db.prepare('SELECT count(*) AS n FROM sf_effects').get().n, 1);
  } finally { x.close(); }
});

test('an older proposal response cannot restore another story or its acknowledgement', async () => {
  const x = setup();
  let release;
  try {
    const api = async (kind, body) => kind === 'evaluate'
      ? new Promise(resolve => { release = () => resolve(x.api(kind, body)); }) : x.api(kind, body);
    await mountRevenueInterview(x.d, api, x.download);
    await click(x, 'start-story');
    await click(x, 'evaluate');
    await click(x, 'story-Case');
    await release();
    await flush();
    assert.match(x.d.getElementById('brief-title').textContent, /service issue/);
    assert.equal(x.d.getElementById('technical').hidden, true);
    assert.equal(x.d.getElementById('effects').textContent, '—');
    assert.equal(x.d.getElementById('approve').disabled, true);
    assert.equal(x.d.getElementById('acknowledge').checked, false);
  } finally { x.close(); }
});
