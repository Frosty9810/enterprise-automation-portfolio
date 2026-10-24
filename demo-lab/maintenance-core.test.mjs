import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { maintenanceDesk, openMaintenance } from './maintenance-core.mjs';
import { maintenanceAccessWindows } from './maintenance-fixtures.mjs';

const owner = { tenant: 'acme' };
function setup(t, options) { const db = new DatabaseSync(':memory:'); const desk = maintenanceDesk(db, options); t.after(() => db.close()); return { db, desk }; }
function input(desk, suffix = 'one', scenario = 0) { return { ...desk.catalog().scenarios[scenario].input, commandId: `intake-${suffix}`, sourceIssueId: `source-${suffix}` }; }
function common(job, commandId) { return { commandId, tenant: job.tenant, caseId: job.caseId, actor: `${job.tenant}-operator` }; }
function grant(desk, job, commandId = 'grant', windows = maintenanceAccessWindows) { return desk.grantAccess({ ...common(job, commandId), actor: `${job.tenant}-tenant`, windows }); }
function ready(desk, suffix = 'one', intakeActor) {
  let i = input(desk, suffix); if (intakeActor) i.actor = intakeActor;
  let job = desk.intake(i); job = grant(desk, job, `grant-${suffix}`); job = desk.propose(common(job, `propose-${suffix}`));
  return desk.review({ commandId: `review-${suffix}`, tenant: job.tenant, caseId: job.caseId, reviewer: 'acme-reviewer', expectedHash: job.proposal.hash, decision: 'approve', note: 'Checked synthetic access, lease, skill and appointment.' });
}
function dispatch(desk, job, profile = 'online', id = 'dispatch') { return desk.dispatch({ ...common(job, id), receiverProfileId: profile }); }
function cancel(desk, job, id = 'cancel') { return desk.cancel({ ...common(job, id), expectedRevision: job.revision, note: 'Cancel this local record.' }); }
function reject(fn, pattern) { assert.throws(fn, pattern); }

for (const index of [1, 2]) test(`emergency fixture ${index} cannot become routine dispatch`, t => {
  const { desk } = setup(t); const job = desk.intake(input(desk, 'hazard', index)); assert.equal(job.status, 'emergency-hold'); assert.equal(job.priority, 'emergency'); assert.equal(job.requiresFollowUp, true);
  reject(() => grant(desk, job), /Emergency hold/); reject(() => desk.propose(common(job, 'plan')), /Emergency hold/); reject(() => dispatch(desk, job), /Emergency hold/); assert.equal(desk.state(owner).receiverRecords.length, 0);
});
for (const description of ['smell of gas', 'SMOKE near socket', 'exposed wires', 'carbon monoxide alarm', 'sparks', 'flooding']) test(`documented known text trigger holds: ${description}`, t => {
  const { desk } = setup(t); assert.equal(desk.intake({ ...input(desk), description }).priority, 'emergency');
});
test('routine intake requires occupant-owned grant, independently approved hash, actual local receipt and reported completion', t => {
  const { desk } = setup(t); let job = desk.intake(input(desk));
  reject(() => desk.propose(common(job, 'no-grant')), /grant/); reject(() => dispatch(desk, job), /review/);
  job = grant(desk, job); job = desk.propose(common(job, 'plan')); assert.equal(job.proposal.vendorId, 'vendor-acme-plumbing');
  reject(() => dispatch(desk, job), /review/);
  job = desk.review({ commandId: 'review', tenant: 'acme', caseId: job.caseId, reviewer: 'acme-reviewer', expectedHash: job.proposal.hash, decision: 'approve', note: 'Reviewed.' });
  job = dispatch(desk, job); assert.equal(job.status, 'delivered');
  const command = { ...common(job, 'finish'), expectedRevision: job.revision, note: 'Operator reports work complete in this synthetic scenario.' };
  job = desk.complete(command); assert.equal(job.status, 'reported-complete'); assert.match(job.completion.label, /not proof/); assert.equal(desk.complete(command).revision, job.revision);
  assert.equal(desk.state(owner).bookings[0].status, 'reported-complete'); assert.equal(desk.verifyAudit(owner).valid, true);
});
test('strict intake rejects invented role, tenant, lease, flags, fields, dates and unbounded data without an event', t => {
  const { desk } = setup(t); const original = input(desk);
  for (const patch of [{ actor: 'beta-operator' }, { tenant: 'constructor' }, { leaseId: 'lease-beta' }, { hazards: ['none'] }, { hazards: ['fire', 'fire'] }, { durationMinutes: Infinity }, { durationMinutes: 0 }, { durationMinutes: 1.5 }, { receivedAt: '2026-02-30T12:00:00.000Z' }, { receivedAt: '2026-10-24T12:00:01.000Z' }, { description: 'x'.repeat(2001) }, { description: 'hello\u0000' }, { approved: true }]) reject(() => desk.intake({ ...original, ...patch }));
  reject(() => desk.intake(JSON.parse('{"__proto__":{},"tenant":"acme"}')), /Prototype/);
  assert.equal(desk.verifyAudit(owner).eventCount, 0);
});
test('command and source identities are immutable, including across operation kinds', t => {
  const { desk } = setup(t); const command = input(desk); let job = desk.intake(command); assert.equal(desk.intake(command).caseId, job.caseId);
  reject(() => desk.intake({ ...command, description: 'A different issue.' }), /immutable/);
  reject(() => desk.intake({ ...command, commandId: 'another-command' }), /sourceIssueId/);
  reject(() => grant(desk, job, command.commandId), /immutable/);
  job = grant(desk, job); assert.equal(desk.intake(command).revision, job.revision); assert.equal(desk.verifyAudit(owner).eventCount, 2);
});
test('cross-tenant selectors and forged occupant grants are rejected', t => {
  const { desk } = setup(t); const job = desk.intake(input(desk));
  reject(() => desk.receipt({ tenant: 'beta', caseId: job.caseId }), /not found/);
  reject(() => desk.grantAccess({ ...common(job, 'forged'), windows: maintenanceAccessWindows }), /tenants/);
  reject(() => desk.grantAccess({ ...common(job, 'cross'), actor: 'beta-tenant', windows: maintenanceAccessWindows }), /tenants/);
  assert.deepEqual(desk.history({ tenant: 'beta' }).cases, []);
});
test('independent reviewer cannot be intake or proposal actor even using dual-role fixture', t => {
  const { desk } = setup(t); let job = desk.intake({ ...input(desk), actor: 'acme-dual-role' }); job = grant(desk, job); job = desk.propose(common(job, 'plan'));
  const review = { commandId: 'review', tenant: 'acme', caseId: job.caseId, reviewer: 'acme-dual-role', expectedHash: job.proposal.hash, decision: 'approve', note: 'Attempt self-review.' };
  reject(() => desk.review(review), /Independent/);
  let second = desk.intake(input(desk, 'two')); second = grant(desk, second, 'grant-two'); second = desk.propose({ ...common(second, 'plan-two'), actor: 'acme-dual-role' });
  reject(() => desk.review({ ...review, caseId: second.caseId, expectedHash: second.proposal.hash }), /Independent/);
});
test('wrong hash and rejected review cannot authorize delivery', t => {
  const { desk } = setup(t); let job = desk.intake(input(desk)); job = grant(desk, job); job = desk.propose(common(job, 'plan'));
  const review = { commandId: 'review', tenant: 'acme', caseId: job.caseId, reviewer: 'acme-reviewer', expectedHash: job.proposal.hash, decision: 'reject', note: 'Need correction.' };
  reject(() => desk.review({ ...review, expectedHash: 'f'.repeat(64) }), /hash/); job = desk.review(review); reject(() => dispatch(desk, job), /review/);
});
test('grant replacement and revocation invalidate prior proposal and review', t => {
  const { desk } = setup(t); let job = ready(desk); const oldHash = job.proposal.hash;
  job = grant(desk, job, 'replacement', [{ start: '2026-10-24T14:00:00.000Z', end: '2026-10-24T16:00:00.000Z' }]); assert.equal(job.proposal, null); assert.equal(job.review, null); reject(() => dispatch(desk, job), /review/);
  job = desk.propose(common(job, 'replan')); assert.notEqual(job.proposal.hash, oldHash);
  job = desk.revokeAccess({ ...common(job, 'revoke'), actor: 'acme-tenant', note: 'Access is withdrawn.' }); assert.equal(job.access.revoked, true); assert.equal(job.proposal, null); reject(() => desk.propose(common(job, 'blocked')), /grant/);
});
for (const badWindows of [[], [{ start: '2026-10-24T14:00:00Z', end: '2026-10-24T15:00:00.000Z' }], [{ start: '2026-10-24T14:00:00.000Z', end: '2026-10-24T13:00:00.000Z' }], [{ start: '2026-10-24T11:00:00.000Z', end: '2026-10-24T12:00:00.000Z' }], [{ start: '2026-10-24T13:00:00.000Z', end: '2026-10-24T15:00:00.000Z' }, { start: '2026-10-24T14:00:00.000Z', end: '2026-10-24T16:00:00.000Z' }], [{ start: '2026-12-31T23:30:00.000Z', end: '2027-01-01T00:30:00.000Z' }]]) test(`invalid access window ${JSON.stringify(badWindows)} is rejected`, t => {
  const { desk } = setup(t); const job = desk.intake(input(desk)); reject(() => grant(desk, job, 'bad', badWindows)); assert.equal(desk.receipt({ tenant: 'acme', caseId: job.caseId }).access.revision, 0);
});
test('configured skill determines vendor and no window is invented', t => {
  const { desk } = setup(t); let job = desk.intake(input(desk, 'electric', 3)); job = grant(desk, job); job = desk.propose(common(job, 'plan')); assert.equal(job.proposal.vendorId, 'vendor-acme-electrical'); assert.equal(job.proposal.start, '2026-10-24T15:00:00.000Z');
  let other = desk.intake(input(desk, 'long')); other = grant(desk, other, 'short-grant', [{ start: '2026-10-24T13:00:00.000Z', end: '2026-10-24T13:30:00.000Z' }]); reject(() => desk.propose(common(other, 'no-fit')), /No eligible/);
});
test('simultaneously reviewed overlap is blocked at dispatch; half-open adjacent slot succeeds; cancellation releases capacity', t => {
  const { desk } = setup(t); let first = ready(desk, 'first'), second = ready(desk, 'second'); assert.equal(first.proposal.start, second.proposal.start);
  first = dispatch(desk, first, 'online', 'dispatch-first'); reject(() => dispatch(desk, second, 'online', 'dispatch-second'), /overlapping/);
  second = desk.propose(common(second, 'replan-second')); assert.equal(second.proposal.start, first.proposal.end); second = desk.review({ commandId: 'rereview', tenant: 'acme', caseId: second.caseId, reviewer: 'acme-reviewer', expectedHash: second.proposal.hash, decision: 'approve', note: 'Reviewed adjacent slot.' }); second = dispatch(desk, second, 'online', 'dispatch-adjacent');
  first = cancel(desk, first); const third = ready(desk, 'third'); assert.equal(third.proposal.start, '2026-10-24T13:00:00.000Z'); assert.equal(desk.state(owner).bookings.filter(b => b.status === 'active').length, 1);
});
test('offline retry reserves one slot/outbox and sends one local receiver only', t => {
  const { desk } = setup(t); let job = ready(desk); job = dispatch(desk, job, 'offline', 'offline-one'); job = dispatch(desk, job, 'offline', 'offline-two');
  assert.equal(job.delivery.attempts, 2); assert.equal(desk.state(owner).bookings.length, 1); assert.equal(desk.state(owner).outbox.length, 1); assert.equal(desk.state(owner).receiverRecords.length, 0);
  reject(() => desk.propose(common(job, 'queued-replan')), /existing sent/);
  job = dispatch(desk, job, 'online', 'recover'); assert.equal(job.status, 'delivered'); assert.equal(desk.state(owner).receiverRecords.length, 1); reject(() => dispatch(desk, job, 'online', 'duplicate'), /already exists/);
});
test('uncertain response must reconcile authoritative receiver; immutable retry does not resend', t => {
  const { desk } = setup(t); let job = ready(desk); const command = { ...common(job, 'lost'), receiverProfileId: 'lose-response' }; job = desk.dispatch(command); assert.equal(job.status, 'uncertain'); assert.equal(job.delivery.receiverRecordId, null); assert.equal(desk.state(owner).outbox[0].status, 'uncertain');
  assert.equal(desk.dispatch(command).revision, job.revision); reject(() => cancel(desk, job), /must reconcile/); assert.equal(desk.state(owner).bookings[0].status, 'active'); reject(() => dispatch(desk, job, 'online', 'blind-retry'), /must reconcile/);
  job = desk.reconcile(common(job, 'reconcile')); assert.equal(job.status, 'delivered'); assert.match(job.delivery.receiverRecordId, /^local-/); assert.equal(desk.state(owner).outbox[0].status, 'acknowledged'); assert.equal(desk.state(owner).receiverRecords.length, 1); assert.equal(desk.state(owner).bookings.length, 1);
});
for (const profile of ['offline', 'online', 'lose-response']) test(`access revocation after ${profile} blocks dispatch while retaining truthful effect history`, t => {
  const { desk } = setup(t); let job = dispatch(desk, ready(desk), profile); job = desk.revokeAccess({ ...common(job, 'revoke'), actor: 'acme-tenant', note: 'No longer consent to access.' });
  assert.equal(job.proposal, null); assert.equal(desk.state(owner).bookings[0].status, profile === 'offline' ? 'cancelled' : 'active'); reject(() => dispatch(desk, job, 'online', 'resend'));
  if (profile === 'offline') { assert.equal(job.status, 'access-required'); assert.equal(desk.state(owner).receiverRecords.length, 0); }
  else { assert.equal(job.status, 'access-revoked'); assert.equal(job.requiresFollowUp, true); if (profile === 'lose-response') { job = desk.reconcile(common(job, 'reconcile')); assert.equal(job.status, 'access-revoked'); } assert.equal(desk.state(owner).receiverRecords.length, 1); }
});

for (const profile of ['online', 'lose-response']) test(`revocation after ${profile} holds capacity until explicit receiver cancellation`, t => {
  const { desk } = setup(t); let first = ready(desk, 'first'), second = ready(desk, 'second');
  assert.equal(first.proposal.start, second.proposal.start); first = dispatch(desk, first, profile, 'dispatch-first');
  first = desk.revokeAccess({ ...common(first, 'revoke-first'), actor: 'acme-tenant', note: 'Occupant withdraws access after local send.' });
  assert.equal(desk.state(owner).bookings[0].status, 'active'); assert.equal(desk.state(owner).receiverRecords[0].status, 'received');
  reject(() => dispatch(desk, second, 'online', 'blocked-second'), /overlapping/);
  if (profile === 'lose-response') { reject(() => cancel(desk, first), /must reconcile/); first = desk.reconcile(common(first, 'reconcile-first')); assert.equal(first.status, 'access-revoked'); }
  first = cancel(desk, first, 'cancel-first'); assert.equal(desk.state(owner).receiverRecords[0].status, 'cancelled-locally');
  second = dispatch(desk, second, 'online', 'send-second'); assert.equal(second.status, 'delivered');
  assert.equal(desk.state(owner).receiverRecords.filter(r => r.status === 'received').length, 1); assert.equal(desk.state(owner).bookings.filter(b => b.status === 'active').length, 1);
});

test('clock boundary rechecks before effect and SLA is derived only from provided timestamp and trusted scenario clock', t => {
  let clock = '2026-10-24T12:00:00.000Z'; const { desk } = setup(t, { clock: () => clock }); const job = ready(desk); assert.equal(job.sla.ageMinutes, 30); assert.equal(job.sla.breached, false);
  clock = job.proposal.start; assert.equal(dispatch(desk, job, 'offline').status, 'queued'); clock = '2026-10-24T13:00:00.001Z'; reject(() => dispatch(desk, job, 'online', 'expired'), /no longer eligible/); assert.equal(desk.state(owner).receiverRecords.length, 0);
  clock = '2027-01-01T00:00:00.000Z'; reject(() => desk.propose(common(desk.intake(input(desk, 'later')), 'expired-lease')), /Lease/);
});
test('stale revision, early completion, terminal mutation and invented transport fail closed', t => {
  const { desk } = setup(t); let job = ready(desk); reject(() => desk.complete({ ...common(job, 'early'), expectedRevision: job.revision, note: 'Premature.' }), /Completion report/);
  reject(() => desk.cancel({ ...common(job, 'old'), expectedRevision: job.revision - 1, note: 'Old view.' }), /stale/); reject(() => dispatch(desk, job, 'https://example.com'), /closed local/);
  job = cancel(desk, job); reject(() => grant(desk, job, 'terminal'), /terminal/); reject(() => dispatch(desk, job, 'online', 'terminal-send'), /terminal/);
});
test('returned values cannot mutate server-held grants, registries or history', t => {
  const { desk } = setup(t); const catalog = desk.catalog(); catalog.vendors[0].approved = false; let job = ready(desk); job.access.windows.length = 0; job.proposal.hash = 'forged'; job = desk.receipt({ tenant: 'acme', caseId: job.caseId }); assert.equal(job.access.windows.length, 1); assert.notEqual(job.proposal.hash, 'forged'); assert.equal(dispatch(desk, job).status, 'delivered');
});
test('SQL failure rolls booking, outbox, receiver, event and head back together', t => {
  const { desk, db } = setup(t); const job = ready(desk), before = desk.verifyAudit(owner); db.exec("CREATE TRIGGER fail_receiver BEFORE INSERT ON maintenance_receiver BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  reject(() => dispatch(desk, job), /injected failure/); assert.equal(desk.state(owner).bookings.length, 0); assert.equal(desk.state(owner).outbox.length, 0); assert.equal(desk.verifyAudit(owner).headHash, before.headHash); assert.equal(desk.receipt({ tenant: 'acme', caseId: job.caseId }).status, 'ready');
  db.exec('DROP TRIGGER fail_receiver'); assert.equal(dispatch(desk, job).status, 'delivered');
});
for (const corruption of ["UPDATE maintenance_events SET request='{}' WHERE seq=1", 'DELETE FROM maintenance_events WHERE seq=(SELECT MAX(seq) FROM maintenance_events)', 'DELETE FROM maintenance_head', "UPDATE maintenance_receiver SET body='{}'", 'DELETE FROM maintenance_bookings']) test(`durable integrity rejects corruption: ${corruption}`, t => {
  const { desk, db } = setup(t); const job = dispatch(desk, ready(desk)); db.exec(corruption); assert.equal(desk.verifyAudit(owner).valid, false); reject(() => desk.state(owner), /Audit|head|Durable|Stored/); reject(() => cancel(desk, job));
});
function temp(t) { const dir = mkdtempSync(join(tmpdir(), 'portfolio-maintenance-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
const coreURL = new URL('./maintenance-core.mjs', import.meta.url).href;
test('real process restart reconciles uncertain record without another receiver or booking', t => {
  const dir = temp(t), path = join(dir, 'restart.sqlite'); let desk = openMaintenance(path); const job = dispatch(desk, ready(desk), 'lose-response'); desk.close();
  const worker = `import {openMaintenance} from ${JSON.stringify(coreURL)};const d=openMaintenance(${JSON.stringify(path)});const r=d.reconcile(${JSON.stringify(common(job, 'restart-reconcile'))});console.log(JSON.stringify({status:r.status,state:d.state({tenant:'acme'}),audit:d.verifyAudit({tenant:'acme'})}));d.close();`;
  const process = spawnSync(globalThis.process.execPath, ['--input-type=module', '-e', worker], { encoding: 'utf8' }); assert.equal(process.status, 0, process.stderr); const result = JSON.parse(process.stdout); assert.equal(result.status, 'delivered'); assert.equal(result.state.receiverRecords.length, 1); assert.equal(result.state.bookings.length, 1); assert.equal(result.audit.valid, true);
});
test('two independent processes atomically arbitrate overlapping pre-reviewed appointments', async t => {
  const dir = temp(t), path = join(dir, 'concurrent.sqlite'); const desk = openMaintenance(path); const jobs = [ready(desk, 'first'), ready(desk, 'second')]; desk.close();
  const run = (job, index) => new Promise((resolve, rejectPromise) => {
    const code = `import {openMaintenance} from ${JSON.stringify(coreURL)};const d=openMaintenance(${JSON.stringify(path)});try {d.dispatch(${JSON.stringify({ ...common(job, `parallel-${index}`), receiverProfileId: 'online' })});console.log('delivered')}catch(e){if(e.code!=='conflict')throw e;console.log('conflict')}finally{d.close()}`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = ''; child.stdout.on('data', chunk => out += chunk); child.stderr.on('data', chunk => err += chunk); child.once('error', rejectPromise); child.once('close', exit => exit === 0 ? resolve(out.trim()) : rejectPromise(new Error(err)));
  });
  assert.deepEqual((await Promise.all(jobs.map(run))).sort(), ['conflict', 'delivered']); const reopened = openMaintenance(path); try { assert.equal(reopened.state(owner).receiverRecords.length, 1); assert.equal(reopened.state(owner).bookings.length, 1); assert.equal(reopened.verifyAudit(owner).valid, true); } finally { reopened.close(); }
});
test('missing head is rejected on reopen rather than silently reinitialized', t => {
  const dir = temp(t), path = join(dir, 'head.sqlite'); const desk = openMaintenance(path); desk.intake(input(desk)); desk.close(); const db = new DatabaseSync(path); db.exec('DELETE FROM maintenance_head'); db.close(); reject(() => openMaintenance(path), /lost its durable head/); const check = new DatabaseSync(path); assert.equal(check.prepare('SELECT COUNT(*) AS n FROM maintenance_head').get().n, 0); check.close();
});
test('configuration revision and byte-level source drift make stored authority stale', async t => {
  const dir = temp(t), path = join(dir, 'stale.sqlite'); let desk = openMaintenance(path); const job = ready(desk); desk.close(); desk = openMaintenance(path, { registryRevision: 'fixture-v2' }); assert.equal(desk.receipt({ tenant: 'acme', caseId: job.caseId }).stale, true); reject(() => dispatch(desk, job), /Source\/configuration/); desk.close();
  const isolated = join(dir, 'maintenance-core.mjs'); copyFileSync(new URL('./maintenance-core.mjs', import.meta.url), isolated); const fixture = join(dir, 'maintenance-fixtures.mjs'); copyFileSync(new URL('./maintenance-fixtures.mjs', import.meta.url), fixture);
  const isolatedModule = await import(pathToFileURL(isolated).href); const local = isolatedModule.openMaintenance(':memory:'); const localJob = ready(local); writeFileSync(fixture, readFileSync(fixture, 'utf8') + '\n// drift\n'); assert.equal(local.receipt({ tenant: 'acme', caseId: localJob.caseId }).stale, true); reject(() => dispatch(local, localJob), /source files changed/); local.close();
});


test('tenant selectors require strings consistently across every read and mutation',t=>{
  const {desk}=setup(t), job=desk.intake(input(desk));
  for(const tenant of [['acme'],{value:'acme'},null,1]){
    for(const method of ['history','state','audit','verifyAudit'])assert.throws(()=>desk[method]({tenant}),/Unknown configured tenant/);
    assert.throws(()=>desk.receipt({tenant,caseId:job.caseId}),/Unknown configured tenant/);
    assert.throws(()=>desk.propose({commandId:'bad-selector',tenant,caseId:job.caseId,actor:'acme-operator'}),/Unknown configured tenant/);
  }
  assert.equal(desk.history({tenant:'acme'}).cases.length,1);
});
