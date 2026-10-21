# Usage-to-invoice evidence contract

F10 at `/flagships#F10` calculates a synthetic USD invoice draft and next-invoice adjustment. It never issues an invoice or writes to an accounting provider.

Raw event arrival order is irrelevant. The engine validates and normalizes explicit-offset timestamps to UTC, deduplicates by opaque event ID and canonical business fields, and orders by posting instant. At the same instant, original usage precedes credits; IDs break remaining ties deterministically. A credit must refer to positive original usage at the same occurrence instant, posted no later than the credit. Cumulative credits cannot exceed the original quantity. Input objects are not mutated.

The accepted event fields are `id`, whole nonzero `units` (absolute maximum 1,000,000), `occurredAt`, `postedAt` and, only for credits, `adjusts`. Unknown fields and conflicting repeats reject the entire calculation. Equivalent timezone spellings and property ordering do not create duplicate charges. Canonical output entries retain both timestamps so the classification can be inspected.

Usage must occur in the half-open period `[periodStart, periodEnd)`. A posting exactly at `closedAt` belongs to the closed period; postings after it become next-invoice adjustments. All money uses integer cents and exact multiplication with safe-range validation. The journal is a draft two-sided local example, not tax or revenue-recognition guidance.

`ledgerHashVersion: usage-ledger-v2` binds account, currency, price, canonical period boundaries, close instant and every unique normalized entry. Arrival permutations and equivalent repeats preserve the hash; changed timestamps or close evidence invalidate it even when amounts happen to match. This is an analysis fingerprint, not a provider action key, durable deduplication ledger or authority to bill. Consumers retaining v1 evidence must recalculate/review v2; do not treat a changed hash as permission to reissue an invoice.

Run the domain regressions, including the six additional contract cases, from the repository root:

```sh
node --test demo-lab/flagship-decisions.test.mjs
node demo-lab/run-flagships.mjs
```

Backlog: `PORTFOLIO-ROADMAP.md` item 10. Persistent metering ingestion, authenticated account provenance, concurrent ledger updates and real accounting acceptance remain separate work.
