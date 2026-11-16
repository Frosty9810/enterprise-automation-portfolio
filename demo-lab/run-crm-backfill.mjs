import { reconcileCrmBackfill } from './crm-backfill-reconciliation.mjs';

const at = minute => '2026-11-16T10:' + String(minute).padStart(2, '0') + ':00.000Z';
const event = (eventId, leadId, stage, minute, source = null, campaign = null) => ({
  eventId, leadId, stage, occurredAt: at(minute), source, campaign,
});

const report = reconcileCrmBackfill({
  asOf: at(30),
  initialEvents: [
    event('a-intake', 'lead-a', 'intake_started', 20),
    event('a-handoff', 'lead-a', 'handed_off', 15),
    event('a-inquiry', 'lead-a', 'inquiry', 5, 'paid_search', 'winter_demo'),
    event('b-inquiry', 'lead-b', 'inquiry', 8, 'outbound', 'inside_sales_demo'),
    event('b-qualified', 'lead-b', 'qualified', 11),
    event('b-handoff', 'lead-b', 'handed_off', 18),
    event('b-intake', 'lead-b', 'intake_started', 25),
  ],
  backfillEvents: [
    event('a-qualified', 'lead-a', 'qualified', 10),
    event('b-prior-inquiry', 'lead-b', 'inquiry', 3, 'referral', 'partner_demo'),
    event('c-future-inquiry', 'lead-c', 'inquiry', 45, 'paid_search', 'winter_demo'),
  ],
});

console.log(JSON.stringify({ fixture: 'synthetic', ...report }, null, 2));
