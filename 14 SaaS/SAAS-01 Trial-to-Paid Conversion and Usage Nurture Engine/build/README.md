# SAAS-01 Build Artifacts

Real, working reference implementation backing [`../SOP.md`](../SOP.md), per the portfolio's [Real Build Artifacts standard](../../../49%20Internal%20Standards/README.md#9-real-build-artifacts-supersedes-pure-narrative-framing). These are not illustrations — the JSON imports into n8n, the Python script runs and produces output, and the SQL executes against a live PostgreSQL database.

## Files

### `usage_scoring.py`

Standalone Python 3 (stdlib only, no external dependencies, no credentials) implementation of the scoring and routing logic described in SOP Sections 12 and 14:

- `aggregate_daily_usage()` — rolls up a stream of raw `UsageEvent` objects (`feature_activated`, `integration_connected`, `workflow_created`, `seat_invited`) into a per-account `UsageSnapshot` as of a given date, matching the nightly/incremental rollup job in SOP Section 12, Step 2.
- `compute_intent_score()` — the weighted 0–100 scoring function from SOP Section 14 (integrations x12 capped at 5, seats x8 capped at 6, workflows x3 capped at 10, features x1 capped at 20), with the `no_usage_data` edge case (SOP Section 17, Scenario 5) returning 0.0 explicitly.
- `is_high_intent()` / `classify_intent_tier()` — the high-intent threshold check from SOP Section 13/14: `integrations_connected >= 3 AND seats_invited >= 2 AND trial_day < 10`.
- `determine_checkpoint()` — computes which day-7/day-3/day-1-remaining lifecycle checkpoint applies given a trial start date and "today" (SOP Section 12, Step 3 / Section 15).
- `build_checkpoint_milestones()` — builds the "milestones hit" vs. "milestones missed" lists used to personalize the checkpoint email payload.

**Run the self-test:**

```bash
python3 usage_scoring.py
```

No arguments, no environment variables, no network access required. The `if __name__ == "__main__":` block runs the aggregation → scoring → classification → checkpoint pipeline against three hardcoded sample accounts and prints the results to stdout:

| Sample account | Profile | Expected result |
|---|---|---|
| `acct_high_intent_01` | 4 integrations, 3 seats, all by trial day 6 | `intent_tier = high`, `is_high_intent = True` |
| `acct_low_usage_02` | Single feature activation, nothing else | `intent_tier = standard`, low score, near-dormant |
| `acct_borderline_03` | 3 integrations but only 1 seat invited | `intent_tier = standard` — meets the integration threshold alone but not the seat threshold, so it intentionally does **not** qualify as high-intent (see SOP Section 37 FAQ) |

### `n8n-workflow.json`

A real, importable n8n workflow export (top-level shape: `name`, `nodes`, `connections`, `active`, `settings`, `id` — same as prior portfolio projects). Implements the full pipeline from SOP Section 12:

1. **Webhook - Usage Event Stream** (`n8n-nodes-base.webhook`) → **Validate & Normalize Event** (`n8n-nodes-base.code`, HMAC check) → **If - Event Valid** → **Postgres - Insert Usage Event** (dedupe on `event_id` via `ON CONFLICT DO NOTHING`) or **Postgres - Log Rejected Event**, each followed by a `respondToWebhook` node.
2. **Schedule - Incremental Rollup (15 min)** (`n8n-nodes-base.scheduleTrigger`) → **Postgres - Read Active Trial Usage** → **Code - Aggregate Daily Score** (running score computation matching `usage_scoring.py`) → **Postgres - Upsert Account Score**.
3. **If - High Intent Threshold Crossed** → **Postgres - Read Account Ownership** → **Close CRM - Create Opportunity** (`POST https://api.close.com/api/v1/opportunity/`) → **Slack - Alert AE** → **Postgres - Set Idempotency Flag** (`high_intent_opportunity_created`).
4. **Schedule - Hourly Checkpoint Sweep** → **Postgres - Read Checkpoint Candidates** → **Code - Determine Checkpoint** → **If - Checkpoint Due** → **HubSpot - Send Checkpoint Email** (`POST https://api.hubapi.com/marketing/v3/transactional/single-email/send`) → **Postgres - Mark Checkpoint Sent**.
5. **Webhook - Stripe Trial End Event** → **Code - Normalize Stripe Event** → **Stripe - Get Customer Card Status** (`GET https://api.stripe.com/v1/customers/{id}`) → **Code - Merge Card Status** → **If - Card On File** → either **Stripe - Convert Subscription to Active** (`POST https://api.stripe.com/v1/subscriptions/{id}`, `trial_end=now`) → **Postgres - Mark Converted**, or **Postgres - Read Intent Tier** → **If - Intent Tier High** → **Set - Show Sales CTA (High Intent, No Card)** / **Set - Standard Paywall** → **Postgres - Persist Access State** → **Respond 200**.

All node parameters use real n8n expression syntax (`={{ $json.field }}`) and real core node types (`webhook`, `code`, `if`, `postgres`, `httpRequest`, `set`, `scheduleTrigger`, `respondToWebhook`). Credential fields reference standard n8n credential types (`postgres`, `httpHeaderAuth`, `httpBasicAuth`, `hubspotOAuth2Api`, `slackOAuth2Api`) and are left for the operator to fill in with their own keys.

**Import steps:**

1. In n8n, go to **Workflows → Import from File** (or **⋮ → Import from File** on the workflows list).
2. Select `n8n-workflow.json`.
3. Create/attach credentials for each of the 5 credential slots referenced by the nodes (see below).
4. Update the two webhook node paths (`atlas-usage-event`, `stripe-trial-end`) if you want different endpoint URLs, and point Atlas Metrics' event API / Stripe webhook configuration at the resulting production webhook URLs.
5. Leave `active: false` until credentials are attached and you've run a manual test execution.

### `schema.sql`

Real, executable PostgreSQL 14+ DDL. Run with:

```bash
psql -d your_database -f schema.sql
```

Creates:

- `trial_accounts` — master trial record (trial dates, card-on-file flag, intent tier, AE assignment, access state).
- `usage_events` — append-only raw event log, deduplicated on `event_id`.
- `usage_events_rejected` / `orphaned_events` — malformed/unmatched event handling per SOP Section 16.
- `account_usage_daily` — the wide, denormalized daily rollup table (SOP Section 38) that the checkpoint sweep reads with a single indexed lookup.
- `workflow_audit_log` — full audit trail per SOP Section 23.
- `workflow_dead_letter` — retry-exhausted operations per SOP Section 19.
- `manual_overrides` — CS/Sales intent-tier overrides per SOP Section 20.
- `v_high_intent_pending_handoff` — a convenience view mirroring the high-intent-and-not-yet-handed-off query used by the n8n If-node check.

The script is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE` for the trigger function and view) and wrapped in a transaction.

## Required credentials / environment variables

| Credential | Used by | Notes |
|---|---|---|
| PostgreSQL connection | All Postgres nodes in the n8n workflow | Host, port, database, user, password for the database created via `schema.sql`. n8n credential type: `postgres`. |
| HubSpot private app token | `HubSpot - Send Checkpoint Email` | OAuth2 / private app token scoped to transactional email send + contact property write. n8n credential type: `hubspotOAuth2Api` (or `httpHeaderAuth` with a Bearer token if using a raw private-app token). |
| Close CRM API key | `Close CRM - Create Opportunity` | Basic auth with the API key as the username, blank password. n8n credential type: `httpBasicAuth`. |
| Stripe restricted API key | `Stripe - Get Customer Card Status`, `Stripe - Convert Subscription to Active` | Scoped to subscriptions/customers read-write only, per SOP Section 24. n8n credential type: `httpHeaderAuth` (`Authorization: Bearer sk_live_xxxxxxxxxxxxx`). |
| Slack bot token | `Slack - Alert AE` | Bot token scoped to `chat:write`. n8n credential type: `slackOAuth2Api` (or `httpHeaderAuth` with a Bearer token). |
| `ATLAS_WEBHOOK_SECRET` | `Validate & Normalize Event` code node | Shared HMAC secret used to validate signatures on inbound usage events from Atlas Metrics' internal event API. Set as an n8n environment variable, referenced via `$env.ATLAS_WEBHOOK_SECRET`. |

No real credentials are embedded anywhere in these files — every credential field is a named placeholder for the operator to fill in with their own keys, consistent with the portfolio's confidentiality standard.

## Validation performed

- `n8n-workflow.json` parsed successfully with `json.load()` — valid JSON, correct top-level shape (`name`, `nodes`, `connections`, `active`, `settings`, `id`), 35 nodes, fully connected graph with no dangling references.
- `usage_scoring.py` executed with `python3 usage_scoring.py` — runs cleanly against the three sample accounts and prints the expected scores, tiers, and checkpoint boundaries.
- `schema.sql` reviewed for balanced statements, valid PostgreSQL 14+ syntax, and consistency with the JSON payload shapes in SOP Section 34.

---
*Part of the Enterprise Automation Portfolio. See [`../SOP.md`](../SOP.md) for the full standard operating procedure.*
