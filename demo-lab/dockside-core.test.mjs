import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, copyFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { dockside, openDockside } from './dockside-core.mjs';
import { docksideScenarios } from './dockside-fixtures.mjs';

const sample = (id = 'valid-invoice') => structuredClone(docksideScenarios().find((scenario) => scenario.id === id).input);
const lookup = (job) => ({ tenant: job.tenant, receiptId: job.receiptId });
const review = (api, job, changes = {}) => api.review({ ...lookup(job), reviewer: 'acme-reviewer', expectedHash: job.contentHash, decision: 'approve', note: 'Scripted test review of this exact synthetic fixture.', ...changes });
const withApi = (work) => { const api = openDockside(); try { return work(api); } finally { api.close(); } };
const moduleUrl = new URL('./dockside-core.mjs', import.meta.url).href;

test('eight source-linked fixtures store four valid and four rejected outcomes', () => withApi((api) => {
  const jobs = docksideScenarios().map((scenario) => api.submit(scenario.input));
  assert.equal(jobs.filter((job) => job.validation.valid).length, 4);
  assert.equal(jobs.filter((job) => job.status === 'rejected').length, 4);
  for (const job of jobs.filter((item) => !item.validation.valid)) { assert.throws(() => review(api, job)); assert.throws(() => api.sync(lookup(job))); }
  assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 0);
}));

test('review is exact, independent and immutable; delivery is idempotent', () => withApi((api) => {
  const input = sample(); input.actor = 'acme-dual-role'; const job = api.submit(input);
  assert.throws(() => api.sync(lookup(job)), /approval/);
  assert.throws(() => review(api, job, { reviewer: 'acme-dual-role' }), /different/);
  assert.throws(() => review(api, job, { expectedHash: 'wrong' }), /exact/);
  assert.throws(() => review(api, job, { reviewer: 'beta-reviewer' }), /configured/);
  const ready = review(api, job); assert.equal(ready.status, 'ready'); assert.deepEqual(review(api, job), ready);
  assert.throws(() => review(api, job, { decision: 'reject' }), /immutable/);
  const delivered = api.sync(lookup(job)); assert.equal(delivered.status, 'delivered');
  assert.deepEqual(api.sync(lookup(job)), delivered); assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 1);
  assert.equal(api.verifyAudit({ tenant: 'acme' }).valid, true);
}));

test('review rejection blocks all receiver effects', () => withApi((api) => {
  const job = api.submit(sample()); assert.equal(review(api, job, { decision: 'reject' }).status, 'review-rejected');
  assert.throws(() => api.sync(lookup(job))); assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 0);
}));

test('offline persists a retryable queue; reconnect produces one real local record', () => withApi((api) => {
  const job = api.submit(sample('offline-queue')); review(api, job);
  const offline = api.sync({ ...lookup(job), receiverProfileId: 'offline' }); assert.equal(offline.status, 'offline'); assert.equal(offline.delivery.attempts, 1);
  assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 0);
  const delivered = api.sync({ ...lookup(job), receiverProfileId: 'online' }); assert.equal(delivered.status, 'delivered'); assert.equal(delivered.delivery.attempts, 2);
  assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 1);
}));

test('lost response preserves one receiver effect and requires authoritative reconciliation', () => withApi((api) => {
  const job = api.submit(sample('uncertain-response')); review(api, job);
  const uncertain = api.sync({ ...lookup(job), receiverProfileId: 'lose-response' }); assert.equal(uncertain.status, 'uncertain'); assert.equal(uncertain.delivery.receiverRecordId, null);
  assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 1); assert.throws(() => api.sync(lookup(job)), /reconcile/);
  const reconciled = api.reconcile(lookup(job)); assert.equal(reconciled.status, 'delivered'); assert.equal(reconciled.delivery.attempts, 1);
  assert.deepEqual(api.reconcile(lookup(job)), reconciled); assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 1);
}));

test('reused command IDs cannot alter source/extraction and exact replay has no extra audit event', () => withApi((api) => {
  const input = sample(), job = api.submit(input); assert.deepEqual(api.submit(input), job);
  input.document.text += ' altered'; assert.throws(() => api.submit(input), /different input/);
  assert.equal(api.verifyAudit({ tenant: 'acme' }).eventCount, 1);
}));

test('new immutable document revision invalidates old approval and requires fresh review', () => withApi((api) => {
  const input = sample(), old = api.submit(input); review(api, old);
  input.commandId += '-revision'; input.document.version = 2; input.document.text += ' corrected';
  const current = api.submit(input); assert.equal(api.receipt(lookup(old)).status, 'superseded');
  assert.throws(() => api.sync(lookup(old)), /superseded/); assert.throws(() => api.sync(lookup(current)), /approval/);
  review(api, current); assert.equal(api.sync(lookup(current)).status, 'delivered');
  input.document.version = 3; input.commandId += '-again'; assert.throws(() => api.submit(input), /correction workflow/);
}));

test('document revisions cannot be reused even under new command IDs', () => withApi((api) => {
  const input = sample(); api.submit(input); input.commandId += '-new'; assert.throws(() => api.submit(input), /increase/);
}));

test('business identity deduplication prevents two document IDs posting the same invoice', () => withApi((api) => {
  const first = api.submit(sample()); review(api, first); api.sync(lookup(first));
  const input = sample(); input.commandId += '-duplicate'; input.document.id += '-duplicate'; const second = api.submit(input); review(api, second);
  assert.throws(() => api.sync(lookup(second)), /second posting/); assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 1);
}));

for (const [title, mutate] of [
  ['fractional quantity', (e) => { e.lines[0].quantity = 1.5; }],
  ['negative quantity', (e) => { e.lines[0].quantity = -1; }],
  ['unsafe integer total', (e) => { e.totalMinor = Number.MAX_SAFE_INTEGER + 1; }],
  ['multiply overflow', (e) => { e.lines[0] = { itemId: 'item-widget', quantity: 1_000_000, unitPriceMinor: 1_000_000_000, lineTotalMinor: 1_000_000_000_000 }; e.totalMinor = 1_000_000_000_000; }],
  ['fractional price', (e) => { e.lines[0].unitPriceMinor = 12.5; }],
  ['wrong currency', (e) => { e.currency = 'EUR'; }],
  ['invalid date month', (e) => { e.issuedOn = '2026-13-01'; }],
  ['invalid leap date', (e) => { e.issuedOn = '2025-02-29'; }],
  ['unknown kind', (e) => { e.kind = 'bill-of-lading'; }],
  ['extra extraction field', (e) => { e.approved = true; }],
  ['extra line field', (e) => { e.lines[0].trusted = true; }],
  ['duplicate item', (e) => { e.lines.push({ ...e.lines[0] }); e.totalMinor = 5000; }],
  ['packing-list invoice value', (e) => { e.kind = 'packing-list'; }],
  ['empty lines', (e) => { e.lines = []; }],
]) test(`invalid ${title} is retained as rejected evidence with zero effects`, () => withApi((api) => {
  const input = sample(); mutate(input.extraction); const job = api.submit(input); assert.equal(job.status, 'rejected'); assert.ok(job.validation.reasons.length);
  assert.throws(() => review(api, job)); assert.throws(() => api.sync(lookup(job))); assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 0);
}));

test('tenant, actor, source and JSON boundary cannot be overridden with client claims', () => withApi((api) => {
  const job = api.submit(sample()); assert.throws(() => api.receipt({ tenant: 'beta', receiptId: job.receiptId }), /not found/);
  assert.deepEqual(api.state({ tenant: 'beta' }).jobs, []);
  for (const changes of [{ approved: true }, { online: true }, { actor: 'acme-reviewer' }, { tenant: 'constructor' }, { document: { id: 'bad', version: 0, text: 'x' } }, { extraction: { ...sample().extraction, totalMinor: NaN } }]) assert.throws(() => api.submit({ ...sample(), ...changes }));
  assert.throws(() => api.submit(JSON.parse('{"__proto__":{}}')), /Prototype/);
  assert.throws(() => api.sync({ ...lookup(job), receiverProfileId: 'https://example.com' }), /fixed/);
}));

test('delivery effect, outcome and audit append roll back together on a storage failure', () => {
  const db = new DatabaseSync(':memory:'), api = dockside(db); try {
    const job = api.submit(sample()); review(api, job);
    db.exec("CREATE TRIGGER fail_sync BEFORE INSERT ON dockside_events WHEN NEW.kind='synced' BEGIN SELECT RAISE(ABORT,'forced storage failure'); END;");
    assert.throws(() => api.sync(lookup(job)), /forced storage/); assert.equal(api.state({ tenant: 'acme' }).erpRecords.length, 0); assert.equal(api.receipt(lookup(job)).status, 'ready');
    db.exec('DROP TRIGGER fail_sync;'); assert.equal(api.sync(lookup(job)).status, 'delivered');
  } finally { db.close(); }
});

test('receiver corruption fails closed for receipt exports, sync and state', () => {
  const db = new DatabaseSync(':memory:'), api = dockside(db); try {
    const job = api.submit(sample()); review(api, job); api.sync(lookup(job)); db.exec("UPDATE dockside_receiver SET body='{}';");
    for (const operation of [() => api.receipt(lookup(job)), () => api.sync(lookup(job)), () => api.state({ tenant: 'acme' }), () => api.verifyAudit({ tenant: 'acme' })]) assert.throws(operation, /audited delivery/);
    assert.equal(api.audit({ tenant: 'acme' }).events.length, 3);
  } finally { db.close(); }
});

test('deleted/altered audit entries are detected before further writes', () => {
  for (const statement of ["UPDATE dockside_events SET payload='{}' WHERE seq=1;", 'DELETE FROM dockside_events WHERE seq=1;']) {
    const db = new DatabaseSync(':memory:'), api = dockside(db); try { const job = api.submit(sample()); review(api, job); db.exec(statement); assert.throws(() => api.sync(lookup(job)), /Audit|Stored/); } finally { db.close(); }
  }
});

test('durable audit head detects deletion of terminal review/offline events', () => {
  for (const offline of [false, true]) {
    const db = new DatabaseSync(':memory:'), api = dockside(db); try {
      const job = api.submit(sample()); review(api, job); if (offline) api.sync({ ...lookup(job), receiverProfileId: 'offline' });
      db.exec('DELETE FROM dockside_events WHERE seq=(SELECT MAX(seq) FROM dockside_events);');
      assert.throws(() => api.receipt(lookup(job)), /head\/count/); assert.throws(() => api.sync(lookup(job)), /head\/count/);
      assert.equal(api.audit({ tenant: 'acme' }).verification.valid, false);
    } finally { db.close(); }
  }
});

test('registry change marks existing receipts stale and blocks approved delivery', () => {
  const db = new DatabaseSync(':memory:'), first = dockside(db); try {
    const job = first.submit(sample()); review(first, job); const changed = dockside(db, { registryRevision: 'v2' });
    assert.equal(changed.receipt(lookup(job)).stale, true); assert.throws(() => changed.sync(lookup(job)), /stale/);
  } finally { db.close(); }
});

test('queue survives a separate-process restart and reconciles a lost response', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dockside-restart-')), path = join(dir, 'queue.sqlite');
  try {
    const first = openDockside(path), job = first.submit(sample()); review(first, job); first.close();
    const run = (code) => { const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {openDockside} from ${JSON.stringify(moduleUrl)}; const api=openDockside(${JSON.stringify(path)});try{${code}}finally{api.close()}`], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
    assert.equal(run(`console.log(JSON.stringify(api.sync(${JSON.stringify({ ...lookup(job), receiverProfileId: 'lose-response' })})))`).status, 'uncertain');
    assert.equal(run(`console.log(JSON.stringify(api.reconcile(${JSON.stringify(lookup(job))})))`).status, 'delivered');
    assert.equal(run("console.log(JSON.stringify(api.state({tenant:'acme'})))").erpRecords.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('concurrent delivery workers produce one receiver record and one delivery event', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dockside-concurrent-')), path = join(dir, 'queue.sqlite');
  try {
    const api = openDockside(path), job = api.submit(sample()); review(api, job); api.close();
    const worker = () => new Promise((resolve, reject) => { const child = spawn(process.execPath, ['--input-type=module', '-e', `import {openDockside} from ${JSON.stringify(moduleUrl)};const api=openDockside(${JSON.stringify(path)});try{console.log(JSON.stringify(api.sync(${JSON.stringify(lookup(job))})))}finally{api.close()}`]); let stderr = ''; child.stderr.on('data', (data) => { stderr += data; }); child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr))); });
    await Promise.all([worker(), worker()]); const check = openDockside(path); try { assert.equal(check.state({ tenant: 'acme' }).erpRecords.length, 1); assert.equal(check.audit({ tenant: 'acme' }).events.filter((event) => event.kind === 'synced').length, 1); } finally { check.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('source-file drift between processes blocks prior approved jobs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dockside-source-')), path = join(dir, 'queue.sqlite'), module = join(dir, 'dockside-core.mjs');
  try {
    for (const name of ['dockside-core.mjs', 'dockside-fixtures.mjs']) copyFileSync(new URL(name, import.meta.url), join(dir, name));
    const first = openDockside(path), job = first.submit(sample()); review(first, job); first.close();
    appendFileSync(join(dir, 'dockside-fixtures.mjs'), '\n// changed fixture source\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {openDockside} from ${JSON.stringify(pathToFileURL(module).href)};const api=openDockside(${JSON.stringify(path)});try{try{api.sync(${JSON.stringify(lookup(job))});process.exitCode=2}catch(error){console.log(error.code)}}finally{api.close()}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), 'stale');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
