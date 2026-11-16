# CRM-01 late-event reconciliation

Run the drill from the repository root with Node.js 24:

```sh
node demo-lab/run-crm-backfill.mjs
node --test demo-lab/crm-backfill-reconciliation.test.mjs
```

The drill captures a baseline from the rows currently loaded, applies a separate backfill batch, then recomputes the report at the same event-time cutoff. A late qualification can explain a handoff and intake already loaded. A late, earlier inquiry can move a lead to its correct first-touch campaign. Events after the cutoff cannot advance that report. Replaying the backfill leaves the restated report unchanged.

The fixture starts with seven events and applies three more. At the fixed cutoff, paid-search intake goes from zero to one, and one already-completed intake moves from outbound to referral. The after-cutoff inquiry is stored but excluded. Exact replay inserts zero rows.

Read the before and after rows together. An added or removed cohort reflects a change in first-touch attribution in this fixture. The changes list includes every cohort in either snapshot, including unchanged rows. A count delta uses zero when the cohort is absent. A rate delta is undefined when either corresponding rate is undefined, including if the cohort has disappeared. Undefined rate and latency deltas are JSON null. Rates are fractions, so a delta of 0.5 represents 50 percentage points.

Both snapshots in this drill are produced during one local run with a temporary SQLite database. To reconstruct a report that was published on a real date, retain the original snapshot or record when each event became known. The base funnel records event time. This local exercise uses synthetic events and makes no claims about live CRM events or campaign performance.
