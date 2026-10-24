import assert from 'node:assert/strict';
import { openMaintenance } from './maintenance-core.mjs';
import { maintenanceAccessWindows } from './maintenance-fixtures.mjs';

const desk = openMaintenance(':memory:');
try {
  const catalog = desk.catalog(), tenant = 'acme';
  const common = (job, commandId) => ({ commandId, tenant: job.tenant, caseId: job.caseId, actor: `${job.tenant}-operator` });
  let routine = desk.intake(catalog.scenarios[0].input);
  routine = desk.grantAccess({ ...common(routine, 'grant'), actor: 'acme-tenant', windows: maintenanceAccessWindows });
  routine = desk.propose(common(routine, 'propose'));
  routine = desk.review({ commandId: 'review', tenant, caseId: routine.caseId, reviewer: 'acme-reviewer', expectedHash: routine.proposal.hash, decision: 'approve', note: 'Checked the synthetic lease, access, vendor skill and appointment.' });
  routine = desk.dispatch({ ...common(routine, 'offline'), receiverProfileId: 'offline' });
  assert.equal(desk.state({ tenant }).receiverRecords.length, 0);
  routine = desk.dispatch({ ...common(routine, 'lost-response'), receiverProfileId: 'lose-response' });
  assert.equal(routine.status, 'uncertain');
  assert.throws(() => desk.dispatch({ ...common(routine, 'blind-retry'), receiverProfileId: 'online' }), /must reconcile/);
  routine = desk.reconcile(common(routine, 'reconcile'));
  routine = desk.complete({ ...common(routine, 'report-completion'), expectedRevision: routine.revision, note: 'Synthetic operator reports completion. No real visit has been verified.' });
  const emergency = desk.intake(catalog.scenarios[1].input);
  assert.throws(() => desk.dispatch({ ...common(emergency, 'blocked-emergency'), receiverProfileId: 'online' }), /Emergency hold/);
  const state = desk.state({ tenant }), audit = desk.verifyAudit({ tenant });
  assert.equal(state.receiverRecords.length, 1); assert.equal(state.bookings.length, 1); assert.equal(audit.valid, true);
  console.log(JSON.stringify({ scope: catalog.scope, clock: catalog.clock, routine: { status: routine.status, completion: routine.completion, attempts: routine.delivery.attempts }, emergency: { status: emergency.status, triageReasons: emergency.triageReasons }, localEffects: { receiverRecords: state.receiverRecords.length, bookings: state.bookings.length, outbox: state.outbox.length }, audit }, null, 2));
} finally { desk.close(); }
