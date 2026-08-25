# Build artifacts — SAAS-04 Usage-Based Billing Reconciliation & RevRec Pipeline

This folder is the real, working reference implementation backing [`../SOP.md`](../SOP.md). Per the portfolio's [Internal Standards, Section 9 — Real Build Artifacts](../../49%20Internal%20Standards/README.md), every file here is structurally valid and functional: the JSON imports as a real n8n workflow, the Python script runs and produces real output, and the SQL executes cleanly against a fresh PostgreSQL 14+ database. None of it is tied to a live client's actual credentials — Section 2 (Confidentiality & Anonymization) governs why the client context stays illustrative even though the mechanics are real.

## Files

| File | What it is |
|---|---|
| `reconciliation_engine.py` | Pure-stdlib Python 3 module implementing the core computation logic: nightly variance calculation/classification (SOP Section 14.1) and monthly revenue recognition schedule + QuickBooks journal entry construction (SOP Section 14.2, 34.4). This is the logic that the n8n Code nodes below run — written so it can be pasted directly into an n8n Code node or imported by a test harness. |
| `n8n-workflow.json` | A real, importable n8n workflow export containing both automations described in the SOP: (A) the nightly reconciliation flow (Schedule Trigger → Postgres usage pull + Stripe invoice pull → Code node variance calc → If node → Postgres logging + Slack alert), and (B) the monthly revrec flow (Schedule Trigger → Postgres subscription pull → Code node schedule generation → idempotency check → QuickBooks Online journal entry POST with an `Idempotency-Key` header → Postgres logging). |
| `schema.sql` | Real PostgreSQL DDL for every table in the SOP's ER diagram (Section 34.5): `accounts`, `usage_snapshots`, `usage_ingestion_exceptions`, `reconciliation_ledger`, `subscriptions`, `plan_change_events`, `revrec_schedule`, `revrec_backlog`, `posted_journal_entries`, `cost_center_map`, `replica_heartbeat`. All money columns use `NUMERIC`, never `FLOAT`/`REAL`. |
| `README.md` | This file. |

## Running the Python self-test

`reconciliation_engine.py` has zero external dependencies — it uses only `decimal`, `datetime`, `hashlib`, and `json` from the standard library. No credentials, no network calls, no database connection required to run the self-test.

```bash
python3 reconciliation_engine.py
```

Expected behavior: the script runs three hardcoded sample accounts through `calculate_variance()` and `classify_variance()` —

1. **Account A** (`acct_am_10021`) — clean, ~0.04% variance, classified `auto_resolved`.
2. **Account B** (`acct_am_48213`) — the SOP's own worked example (Appendix 34.2/34.3), a large negative variance (revenue leakage pattern), classified `needs_finance_review` with the "possible missed Stripe usage-record submission" root-cause hint.
3. **Account C** (`acct_am_77410`) — mid-cycle plan change not prorated, classified `needs_finance_review` with the plan-change root-cause hint.

It then runs `generate_revrec_schedule()` against Account B's contract terms to produce a 30-day straight-line seat schedule plus a usage-triggered recognition record, and calls `build_journal_entry()` to print a fully balanced QuickBooks Online Journal Entry payload (debits == credits, enforced by a `ValueError` if they ever don't match) with the idempotency key embedded in `PrivateNote`.

Exit code `0` and no unhandled exceptions confirms the logic runs correctly.

## Importing the n8n workflow

1. In n8n, go to **Workflows → Import from File** (or **Add workflow → Import from URL/File** depending on version) and select `n8n-workflow.json`.
2. n8n will create both flows inside a single workflow (they share the reconciliation ledger and cost-center data, per SOP Section 11 — this mirrors how the two jobs are documented together in the SOP). If you'd rather run them as two separate workflows, split at the two Schedule Trigger nodes; each half is self-contained.
3. Every node with a `credentials` block references a **named placeholder credential** (e.g. `postgres_metering_replica`, `stripe_readonly_key`, `qbo_oauth2`, `slack_finance_bot`) — n8n will prompt you to map these to real credential entries in your instance. No real keys are embedded anywhere in the file.
4. The workflow is imported with `"active": false` deliberately — per SOP Section 30 (Deployment), this class of workflow should run in shadow mode against real data before any live Slack alert or QuickBooks posting is enabled.

## Required credentials for a real deployment

| Credential | Type in n8n | Used by | Notes |
|---|---|---|---|
| Metering DB replica | Postgres (username/password, TLS) | "Postgres: Pull Internal Usage" | Read-only role; must never point at the primary metering database (SOP Section 24). |
| Reconciliation store | Postgres (username/password, TLS) | All other Postgres nodes | Hosts `reconciliation_ledger`, `revrec_schedule`, `posted_journal_entries`, etc. — see `schema.sql`. |
| Stripe API key | HTTP Header Auth / Stripe credential type | "Stripe: Pull Invoice Line Items" | Restricted, read-only scope. Pin `Stripe-Version` header per SOP Section 6. |
| QuickBooks Online OAuth2 | QuickBooks OAuth2 API credential | "QuickBooks: POST Journal Entry" | OAuth 2.0 with refresh-token rotation; sandbox company for all testing until VP of Finance sign-off (SOP Section 30). |
| Slack bot token | Slack API (OAuth2, bot token) | "Slack: Post Variance Alert" | Scoped to `#finance-billing-variance` only. |

## Idempotency mechanism (double-post prevention)

Per SOP Section 18, financial postings to QuickBooks must never be duplicated. This is implemented at two layers, both visible in the build artifacts:

- **Application layer:** `Code: Build JE Payload + Idempotency Key` computes `sha256(subscription_batch_id + ":" + period_end + ":" + je_type)` and embeds it both as an `Idempotency-Key` HTTP header on the QuickBooks POST node and inside the JE payload's `PrivateNote` field (QuickBooks Online has no native idempotency field — see SOP Section 38).
- **Database layer:** `posted_journal_entries.idempotency_key` in `schema.sql` carries a `UNIQUE` constraint, so even a bug that bypassed the application-level check would be rejected at insert time. The `If: Already Posted (Duplicate Guard)` node checks this table before every POST attempt and routes already-posted batches to a `duplicate_prevented` log entry instead of retrying the HTTP call.

## Validation performed before this folder was marked complete

- `n8n-workflow.json` parsed successfully as JSON (`json.load` / `JSON.parse` clean parse, no syntax errors).
- `schema.sql` was checked for balanced statements and executed against a fresh PostgreSQL instance with no errors (tables, constraints, indexes, and triggers all created successfully; seed data inserts cleanly).
- `reconciliation_engine.py` was executed directly (`python3 reconciliation_engine.py`) and produced the expected variance classifications and a balanced, correctly-shaped journal entry payload for all three sample accounts with no unhandled exceptions.
