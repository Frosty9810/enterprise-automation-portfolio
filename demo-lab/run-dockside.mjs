import assert from 'node:assert/strict';
import { openDockside } from './dockside-core.mjs';

const api = openDockside();
try {
  const results = [];
  for (const scenario of api.catalog().scenarios) {
    let job = api.submit(scenario.input); const lookup = { tenant: job.tenant, receiptId: job.receiptId };
    if (job.validation.valid) {
      job = api.review({ ...lookup, reviewer: 'acme-reviewer', expectedHash: job.contentHash, decision: 'approve', note: 'Scripted review of this exact synthetic fixture; not authenticated human acceptance.' });
      if (scenario.id === 'offline-queue') { assert.equal(api.sync({ ...lookup, receiverProfileId: 'offline' }).status, 'offline'); assert.equal(api.state({ tenant: 'acme' }).erpRecords.some((record) => record.receiptId === job.receiptId), false); }
      job = api.sync({ ...lookup, receiverProfileId: scenario.id === 'uncertain-response' ? 'lose-response' : 'online' });
      if (job.status === 'uncertain') { assert.throws(() => api.sync(lookup)); job = api.reconcile(lookup); }
      assert.equal(job.status, 'delivered'); assert.deepEqual(api.sync(lookup), job);
    } else { assert.equal(job.status, 'rejected'); assert.throws(() => api.sync(lookup)); }
    results.push({ scenario: scenario.id, status: job.status, reasons: job.validation.reasons, contentHash: job.contentHash, attempts: job.delivery.attempts });
  }
  const state = api.state({ tenant: 'acme' }), audit = api.verifyAudit({ tenant: 'acme' });
  assert.equal(results.length, 8); assert.equal(state.erpRecords.length, 4); assert.equal(audit.valid, true);
  console.log(JSON.stringify({ passed: true, scenarios: results.length, results, summary: state.summary, audit, scope: api.catalog().scope }, null, 2));
} finally { api.close(); }
