import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCrmBackfill } from './crm-backfill-reconciliation.mjs';

const at = minute => '2026-11-16T10:' + String(minute).padStart(2, '0') + ':00.000Z';
const event = (eventId, leadId, stage, minute, source = null, campaign = null) => ({
  eventId, leadId, stage, occurredAt: at(minute), source, campaign,
});

test('late qualification unlocks downstream stages that were already loaded', () => {
  const outcome = reconcileCrmBackfill({
    asOf: at(20),
    initialEvents: [
      event('intake', 'lead-a', 'intake_started', 20),
      event('handoff', 'lead-a', 'handed_off', 15),
      event('inquiry', 'lead-a', 'inquiry', 5, 'paid_search', 'winter_demo'),
    ],
    backfillEvents: [event('qualification', 'lead-a', 'qualified', 10)],
  });

  assert.equal(outcome.asOf, at(20));
  assert.deepEqual(outcome.initial.load, { inserted: 3, replayed: 0 });
  assert.equal(outcome.initial.cohorts[0].intake_started, 0);
  assert.equal(outcome.backfill.cohorts[0].intake_started, 1);
  assert.deepEqual(outcome.changes[0].delta, {
    inquiries: 0,
    qualified: 1,
    handed_off: 1,
    intake_started: 1,
    inquiry_to_qualified_rate: 1,
    qualified_to_handoff_rate: null,
    handoff_to_intake_rate: null,
    inquiry_to_intake_rate: 1,
    average_handoff_ms: null,
  });
  assert.deepEqual(outcome.backfill.load, { inserted: 1, replayed: 0 });
  assert.deepEqual(outcome.replay, { load: { inserted: 0, replayed: 1 }, unchanged: true });
});

test('an earlier inquiry moves attribution and preserves null rates for missing cohorts', () => {
  const outcome = reconcileCrmBackfill({
    asOf: at(30),
    initialEvents: [
      event('inquiry', 'lead-b', 'inquiry', 8, 'shared_source', 'old_campaign'),
      event('qualification', 'lead-b', 'qualified', 10),
    ],
    backfillEvents: [event('earlier', 'lead-b', 'inquiry', 3, 'shared_source', 'new_campaign')],
  });

  assert.deepEqual(outcome.changes.map(change => change.campaign), ['new_campaign', 'old_campaign']);
  const [added, removed] = outcome.changes;
  assert.equal(added.before, null);
  assert.equal(added.after.qualified, 1);
  assert.equal(added.delta.qualified, 1);
  assert.equal(added.delta.inquiry_to_qualified_rate, null);
  assert.equal(removed.before.qualified, 1);
  assert.equal(removed.after, null);
  assert.equal(removed.delta.qualified, -1);
  assert.equal(removed.delta.inquiry_to_qualified_rate, null);
});

test('future events are retained and replayable without changing the historical cutoff', () => {
  const initialEvents = [
    event('inquiry', 'lead-a', 'inquiry', 5, 'paid_search', 'winter_demo'),
    event('qualification', 'lead-a', 'qualified', 10),
    event('handoff', 'lead-a', 'handed_off', 15),
    event('intake', 'lead-a', 'intake_started', 20),
  ];
  const backfillEvents = [event('new-lead', 'lead-c', 'inquiry', 45, 'organic', 'website_demo')];
  const early = reconcileCrmBackfill({ asOf: at(30), initialEvents, backfillEvents });
  const later = reconcileCrmBackfill({ asOf: at(45), initialEvents, backfillEvents });

  assert.deepEqual(early.initial.cohorts, early.backfill.cohorts);
  assert.equal(early.changes.length, 1);
  assert.ok(Object.values(early.changes[0].delta).every(value => value === 0));
  assert.deepEqual(early.backfill.load, { inserted: 1, replayed: 0 });
  assert.deepEqual(early.replay, { load: { inserted: 0, replayed: 1 }, unchanged: true });
  assert.deepEqual(later.backfill.cohorts.map(cohort => cohort.source), ['organic', 'paid_search']);
});

test('conflicting IDs fail the drill and a subsequent clean run starts from the supplied events', () => {
  const original = event('inquiry', 'lead-a', 'inquiry', 5, 'paid_search', 'winter_demo');
  const input = {
    asOf: at(30),
    initialEvents: [original],
    backfillEvents: [event('new-lead', 'lead-b', 'inquiry', 10, 'organic', 'website_demo')],
  };
  const collision = { ...original, campaign: 'different' };
  assert.throws(() => reconcileCrmBackfill({
    ...input, backfillEvents: [...input.backfillEvents, collision],
  }), /different payload/);
  const result = reconcileCrmBackfill(input);
  assert.deepEqual(result.initial.load, { inserted: 1, replayed: 0 });
  assert.deepEqual(result.backfill.load, { inserted: 1, replayed: 0 });
  assert.equal(result.initial.cohorts.length, 1);
  assert.equal(result.backfill.cohorts.length, 2);
});
