# RE-01 Build Artifacts

> Status: **Populated**

This folder contains the real, working reference implementation backing [`../SOP.md`](../SOP.md), per [`49 Internal Standards`](../../../49%20Internal%20Standards/README.md#9-real-build-artifacts-supersedes-pure-narrative-framing). Nothing here is pseudo-code — each file is structurally valid and independently runnable/importable, though credential values are left as placeholders for the operator to supply.

## Files

| File | What it is |
|---|---|
| [`n8n-workflow.json`](n8n-workflow.json) | A real, importable n8n workflow export (14 nodes) implementing the full pipeline from SOP Sections 11–14: webhook intake → payload normalization (Code node) → Postgres fuzzy-dedup lookup → If/Switch branching → Twilio SMS + GoHighLevel contact/email → lead scoring (Code node) → Switch on drip tier → GHL drip enrollment → hot-lead escalation → Close CRM lead creation → Postgres audit write. |
| [`lead_scoring.py`](lead_scoring.py) | A standalone, dependency-free (stdlib only) Python 3 script implementing fuzzy dedup matching, the lead scoring function, tier assignment, and the 24-hour hot-escalation check — exactly matching the logic in SOP Section 14. Runnable as-is; its `__main__` block exercises all functions against four hardcoded sample leads (Zillow, Realtor.com, and two brokerage-website shapes) and prints results to stdout. |
| [`schema.sql`](schema.sql) | Real PostgreSQL DDL for the `leads`, `lead_inquiries`, `lead_exceptions`, `lead_dlq`, `lead_audit_log`, `engagement_events`, and `agent_roster` tables, including the `pg_trgm` extension, trigram GIN indexes for fuzzy matching, the unique phone constraint that resolves the race condition in SOP Section 17 Scenario 3, and the idempotent composite key on the audit log described in SOP Section 18. |
| `README.md` | This file. |

## Deploy steps

### 1. Database

```bash
# Requires PostgreSQL 14+ and a database already created, e.g. `re01_leads`.
psql -h <host> -U <user> -d re01_leads -f schema.sql
```

This creates all tables, extensions (`pg_trgm`, `pgcrypto`), indexes, and the `updated_at` trigger function. It is idempotent — every `CREATE TABLE`/`CREATE INDEX` uses `IF NOT EXISTS`, so it is safe to re-run against an already-provisioned database.

### 2. Python self-test

```bash
# No external packages required — stdlib only.
python3 lead_scoring.py
```

This runs the scoring, normalization, and dedup functions against four hardcoded sample leads and prints:
- Normalized email/phone, price band, form completeness, score, and tier for each sample lead.
- A fuzzy-dedup match between the Zillow and Realtor.com sample leads (same underlying person, two different portal formats — this should report `matched: True`).
- A fuzzy-dedup non-match check against an unrelated lead.
- Three hot-queue escalation checks covering the "engaged within 24h," "engaged but stale touch," and "no engagement" cases.

No credentials, database connection, or network access are required — this is a fully self-contained demonstration of the core logic that also runs inside the n8n Code nodes in production.

### 3. n8n workflow import

1. In n8n, go to **Workflows → Import from File** (or **Import from URL** if hosted) and select `n8n-workflow.json`.
2. After import, open each node that references a credential and create/attach the corresponding credential (see **Credentials** below) — n8n will show a red warning badge on any node with an unresolved credential reference until this is done.
3. Update the following node parameters to match your environment:
   - **Webhook - Portal Lead Intake**: note the generated webhook URL and configure it as the delivery endpoint on the Zillow Premier Agent and Realtor.com lead-delivery settings (or point your website form handler at it).
   - **Twilio - Send Instant SMS**: confirm the `From` value resolves to your registered A2P 10DLC sender (`TWILIO_MESSAGING_SERVICE_NUMBER` environment variable).
   - **GHL - Create Contact & Trigger Email** / **GHL - Enroll in Tiered Drip Campaign**: set `GHL_LOCATION_ID`, `GHL_WORKFLOW_FAST_TRACK_ID`, `GHL_WORKFLOW_STANDARD_ID`, `GHL_WORKFLOW_LONG_CYCLE_ID` to your GoHighLevel sub-account's actual location and workflow IDs.
   - **Postgres** nodes: attach a Postgres credential pointing at the database you provisioned in Step 1.
4. Leave `active: false` until you have completed a shadow-mode validation pass (SOP Section 30, Deployment) — the workflow imports in an inactive state by design.
5. Toggle the workflow active once you're ready to accept live traffic.

## Credentials / environment variables a real deployment needs

| Variable / Credential | Used by | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | n8n Twilio credential (`twilioApi`) | Stored in n8n's encrypted credential store, never inlined in workflow JSON. Requires A2P 10DLC registration before production SMS volume. |
| `TWILIO_MESSAGING_SERVICE_NUMBER` | n8n environment variable, referenced in the SMS node body | The registered sending number/messaging service SID. |
| `GHL_OAUTH_CLIENT_ID` / `GHL_OAUTH_CLIENT_SECRET` (or long-lived API key) | n8n GoHighLevel credential (`highLevelOAuth2Api`) | Scoped to contacts, workflows, and custom fields only — no billing/account-admin scope (SOP Section 24). |
| `GHL_LOCATION_ID` | n8n environment variable | The Harborview sub-account's location ID. |
| `GHL_WORKFLOW_FAST_TRACK_ID` / `GHL_WORKFLOW_STANDARD_ID` / `GHL_WORKFLOW_LONG_CYCLE_ID` | n8n environment variable | GHL workflow IDs for the three drip tiers. |
| `CLOSE_API_KEY` | n8n Close CRM credential (HTTP Basic Auth, API key as username, blank password) | Scoped to task-creation and lead read/write only — cannot delete leads or modify billing (SOP Section 24). |
| `POSTGRES_CONNECTION_STRING` (host, port, database, user, password) | n8n Postgres credential | Network-restricted to the n8n host's IP range, TLS-enforced (SOP Section 24). |

All values above are placeholders in the committed JSON/SQL/Python — no real keys, tokens, or credentials are present anywhere in this folder, per [`49 Internal Standards` Section 2](../../../49%20Internal%20Standards/README.md#2-confidentiality--anonymization).

## Validation performed

- `n8n-workflow.json` was validated with `python3 -m json.tool n8n-workflow.json` — parses cleanly as valid JSON.
- `lead_scoring.py` was executed directly (`python3 lead_scoring.py`) and produces correct, deterministic output for all four sample leads plus the dedup and escalation checks, with no errors and no external dependencies.
- `schema.sql` statements use only standard PostgreSQL 14+ DDL syntax (`CREATE EXTENSION`, `CREATE TABLE ... CHECK`, `CREATE UNIQUE INDEX ... WHERE`, `CREATE TRIGGER`) and are written to execute cleanly against a fresh database.

---
*Part of the Enterprise Automation Portfolio. See [`07 Real Estate`](../../README.md) for section navigation.*
