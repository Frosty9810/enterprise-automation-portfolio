# CRM-01 lead-to-intake funnel

The local funnel turns synthetic CRM lifecycle events into marketing conversion and sales-to-intake handoff metrics. It uses SQLite with Node.js 24 and the built-in `node:sqlite` module.

```sh
node demo-lab/run-crm-handoff-funnel.mjs
node --test demo-lab/crm-handoff-funnel.test.mjs
```

The demo loads six events, including a handoff and intake received before their prerequisites, then retries the batch. It produces two cohorts. Paid search has two inquiries, one intake and a 15-minute average qualified-to-handoff interval. Referral has one inquiry and no completed handoff. These figures are synthetic.

Use `openCrmHandoffFunnel()` for a temporary in-memory database or pass a local SQLite file path to persist the events. Call `ingest(events)` with 1 to 1,000 event objects and `report(asOf)` with a UTC timestamp through the cutoff, then call `close()`.

| Field | Contract |
|---|---|
| `eventId` | Stable ID for the delivery, unique within the local database. |
| `leadId` | Stable, already resolved lead identity within the local database. |
| `stage` | One of `inquiry`, `qualified`, `handed_off` or `intake_started`. |
| `occurredAt` | Real UTC ISO instant with milliseconds, for example `2026-11-12T10:05:00.000Z`. |
| `source`, `campaign` | Required slugs on inquiries, and explicitly null for other stages. |

IDs and attribution slugs use lowercase letters, digits, hyphens or underscores, start with a letter or digit, and are at most 64 characters. Exact event retries have no additional effect. Reuse of an event ID with a different payload rolls back the entire batch.

The report includes events whose timestamps are at or before the cutoff. Each lead is counted once, attributed to its earliest inquiry, with event ID as the tie-breaker. Each later stage must occur at or after its preceding stage. An event without a prerequisite is retained but cannot advance the funnel until a qualifying predecessor arrives. Backfilled events can therefore revise reports for earlier cutoffs. Repeat inquiries are tracked as events under the same lead and do not open new funnels.

Rates use the preceding stage or the inquiry cohort as the named denominator. A zero denominator yields null. Average handoff latency is in milliseconds and includes only leads that reached handoff. Results are ordered by source and campaign.

The [CRM-01 build runbook](project-builds/CRM-01/build/README.md) covers the separate local contact handoff workflow. The funnel consumes already normalized synthetic events. Live CRM account mapping, provider delivery, dashboard services and measured conversion outcomes require separate implementation and verification.
