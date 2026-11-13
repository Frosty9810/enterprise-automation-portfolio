import { openCrmHandoffFunnel } from './crm-handoff-funnel.mjs';

const events = [
  { eventId: 'a-intake', leadId: 'lead-a', stage: 'intake_started', occurredAt: '2026-11-12T10:30:00.000Z', source: null, campaign: null },
  { eventId: 'a-handoff', leadId: 'lead-a', stage: 'handed_off', occurredAt: '2026-11-12T10:20:00.000Z', source: null, campaign: null },
  { eventId: 'a-new', leadId: 'lead-a', stage: 'inquiry', occurredAt: '2026-11-12T10:00:00.000Z', source: 'paid_search', campaign: 'fall_demo' },
  { eventId: 'b-new', leadId: 'lead-b', stage: 'inquiry', occurredAt: '2026-11-12T10:01:00.000Z', source: 'paid_search', campaign: 'fall_demo' },
  { eventId: 'c-new', leadId: 'lead-c', stage: 'inquiry', occurredAt: '2026-11-12T10:03:00.000Z', source: 'referral', campaign: 'partner_demo' },
  { eventId: 'a-qualified', leadId: 'lead-a', stage: 'qualified', occurredAt: '2026-11-12T10:05:00.000Z', source: null, campaign: null },
];

const funnel = openCrmHandoffFunnel();
try {
  const initialLoad = funnel.ingest(events);
  const retry = funnel.ingest(events);
  const asOf = '2026-11-12T11:00:00.000Z';
  console.log(JSON.stringify({ fixture: 'synthetic', asOf, initialLoad, retry, cohorts: funnel.report(asOf) }, null, 2));
} finally {
  funnel.close();
}
