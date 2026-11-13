import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openCrmHandoffFunnel } from './crm-handoff-funnel.mjs';

const time = minute => '2026-11-12T10:' + String(minute).padStart(2, '0') + ':00.000Z';
const row = (eventId, leadId, stage, minute, cohort = {}) => ({
  eventId, leadId, stage, occurredAt: time(minute),
  source: stage === 'inquiry' ? 'paid_search' : null,
  campaign: stage === 'inquiry' ? 'launch' : null,
  ...cohort,
});

test('out-of-order delivery produces a first-touch funnel with strict chronology and cutoff', () => {
  const funnel = openCrmHandoffFunnel();
  try {
    funnel.ingest([
      row('finish', 'a', 'intake_started', 16),
      row('too-early', 'a', 'handed_off', 5),
      row('z-touch', 'a', 'inquiry', 4, { source: 'referral' }),
      row('handoff', 'a', 'handed_off', 12),
      row('a-touch', 'a', 'inquiry', 4),
      row('qualify', 'a', 'qualified', 7),
      row('other-lead', 'b', 'inquiry', 2),
      row('missing-steps', 'b', 'intake_started', 10),
      row('orphaned', 'c', 'qualified', 9),
      row('referral', 'd', 'inquiry', 1, { source: 'referral', campaign: 'partner' }),
    ]);
    const before = funnel.report(time(12));
    const after = funnel.report(time(16));
    assert.equal(before[0].intake_started, 0);
    assert.equal(before[0].handoff_to_intake_rate, 0);
    assert.deepEqual(after[0], {
      source: 'paid_search', campaign: 'launch', inquiries: 2, qualified: 1,
      handed_off: 1, intake_started: 1, inquiry_to_qualified_rate: 0.5,
      qualified_to_handoff_rate: 1, handoff_to_intake_rate: 1,
      inquiry_to_intake_rate: 0.5, average_handoff_ms: 5 * 60_000,
    });
    assert.deepEqual(after[1], {
      source: 'referral', campaign: 'partner', inquiries: 1, qualified: 0,
      handed_off: 0, intake_started: 0, inquiry_to_qualified_rate: 0,
      qualified_to_handoff_rate: null, handoff_to_intake_rate: null,
      inquiry_to_intake_rate: 0, average_handoff_ms: null,
    });
  } finally {
    funnel.close();
  }
});

test('exact retries across reopen are idempotent and conflicting IDs roll back the batch', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-funnel-'));
  const path = join(directory, 'events.sqlite');
  const original = row('first', 'a', 'inquiry', 4);
  let funnel = openCrmHandoffFunnel(path);
  try {
    assert.deepEqual(funnel.ingest([original, original]), { inserted: 1, replayed: 1 });
    funnel.close();
    funnel = openCrmHandoffFunnel(path);
    assert.deepEqual(funnel.ingest([original]), { inserted: 0, replayed: 1 });
    const newEvent = row('second', 'b', 'inquiry', 5);
    assert.throws(() => funnel.ingest([newEvent, { ...original, campaign: 'different' }]), /different payload/);
    assert.equal(funnel.report(time(10))[0].inquiries, 1);
    assert.deepEqual(funnel.ingest([newEvent]), { inserted: 1, replayed: 0 });
    assert.equal(funnel.report(time(10))[0].inquiries, 2);
  } finally {
    funnel.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('invalid timestamps and attribution changes cannot partially persist a batch', () => {
  const funnel = openCrmHandoffFunnel();
  const inquiry = row('first', 'a', 'inquiry', 3);
  try {
    assert.throws(() => funnel.ingest([inquiry, {
      ...row('second', 'b', 'inquiry', 4),
      occurredAt: '2026-02-30T10:00:00.000Z',
    }]), /real UTC timestamp/);
    assert.throws(() => funnel.ingest([row('qualify', 'a', 'qualified', 5, { source: 'referral' })]), /Only inquiry/);
    assert.throws(() => funnel.ingest([{ ...inquiry, unexpected: true }]), /exactly the six/);
    assert.throws(() => funnel.report('2026-11-12T10:00:00Z'), /canonical UTC timestamp/);
    assert.deepEqual(funnel.report(time(10)), []);
  } finally {
    funnel.close();
  }
});
