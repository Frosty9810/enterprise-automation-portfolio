# RE-04 Build Artifacts

Real, runnable reference implementation backing [`../SOP.md`](../SOP.md) — the CRE Deal Pipeline and Comp Analysis Automation. This folder exists so a reviewer can actually import, run, or execute part of the system described in the SOP, not just read about it, per the portfolio's [Real Build Artifacts standard](../../../49%20Internal%20Standards/README.md#9-real-build-artifacts-supersedes-pure-narrative-framing).

## Files in this folder

| File | What it is |
|---|---|
| `comp_analysis.py` | Standalone Python 3 script implementing CoStar CSV parsing, 2-standard-deviation outlier flagging, valuation-range calculation, and Claude prompt construction (SOP Sections 12, 14, 34). |
| `n8n-workflow.json` | Importable n8n workflow implementing the end-to-end pipeline in SOP Section 12: file trigger → CSV/PDF parsing → Claude structured extraction → outlier statistics → Claude narrative generation → Postgres persistence → Salesforce Opportunity update → S3 OM upload → broker review Task. |
| `schema.sql` | PostgreSQL DDL for the comp database and deal financial model, matching the ER diagram in SOP Section 34. |
| `README.md` | This file. |

## 1. `comp_analysis.py`

Zero required dependencies — Python 3 standard library only (`csv`, `statistics`, `io`, `os`, `json`, `urllib.request`, `dataclasses`).

**Run the self-test:**

```bash
python3 comp_analysis.py
```

This runs entirely offline against a hardcoded sample CoStar CSV export (8 comp rows, including two deliberate outliers — one artificially high cap rate, one artificially low). It will:

1. Parse the sample CSV into `Comp` records.
2. Run `flag_outlier_comps()` and print which comps were accepted vs. flagged for review.
3. Run `calculate_valuation_range()` against a hardcoded subject property NOI and print the computed cap rate and valuation range.
4. Build (but not send) the real Claude API narrative-generation prompt via `build_claude_prompt()` and print it.
5. Call `call_claude_for_narrative()`, which prints a `[DRY RUN]` placeholder unless `ANTHROPIC_API_KEY` is set in the environment, in which case it makes a real call to the Anthropic Messages API and prints the generated narrative.

**Key functions:**

- `parse_costar_csv(csv_text: str) -> list[Comp]` — parses a CoStar-style export; raises `ValueError` on template drift (missing expected columns), matching SOP Section 17 Scenario 6.
- `flag_outlier_comps(comps: list[Comp]) -> dict[str, list[Comp]]` — the 2-standard-deviation rule from SOP Section 14, with the same `MIN_COMPS_FOR_STATISTICS = 5` floor.
- `calculate_valuation_range(subject_noi_annual_usd, accepted_comps, flagged_comps=None) -> ValuationRange` — applies the accepted comp set's median cap rate (and ±1 stdev) to the subject NOI to produce a point estimate and range.
- `build_claude_prompt(subject: dict, comps: list) -> str` — constructs the real underwriting-narrative prompt text (same content as SOP Section 14's `build_narrative_prompt()`), returned as a string with no network call required.
- `call_claude_for_narrative(prompt: str) -> str` — optional live call to `https://api.anthropic.com/v1/messages`, gated behind `ANTHROPIC_API_KEY`; returns a `[DRY RUN]` string when the key is absent so the script runs standalone with zero credentials.

## 2. `n8n-workflow.json`

**To import:**

1. Open your n8n instance (self-hosted, version 1.4x+ per SOP Section 6).
2. Workflows → **Import from File** (or **Import from URL** if hosting this file remotely) → select `n8n-workflow.json`.
3. n8n will create the workflow with all nodes and connections pre-wired. It will **not** be active on import (`"active": false`) — review credentials before activating.

**Node-by-node summary (matches SOP Section 12):**

| Node | Type | Purpose |
|---|---|---|
| Webhook - Comp File Upload | `n8n-nodes-base.webhook` | Trigger — broker uploads a comp file tied to a Salesforce Opportunity ID (`body.opportunity_id`). |
| If CSV Or PDF | `n8n-nodes-base.if` | Branches on `content-type` header. |
| Code - Parse CoStar CSV | `n8n-nodes-base.code` | Parses CSV rows into raw comp objects. |
| Code - Extract PDF Text | `n8n-nodes-base.code` | Extracts/stages raw PDF text for LoopNet flyers. |
| HTTP - Claude Structured Extraction | `n8n-nodes-base.httpRequest` | Calls the Anthropic Messages API to extract structured fields from ambiguous PDF text (SOP Section 14 extraction prompt). |
| Code - Normalize To Canonical Schema | `n8n-nodes-base.code` | Maps both the CSV and Claude-extraction paths into the canonical comp schema (SOP Section 34). |
| Code - Outlier Statistics | `n8n-nodes-base.code` | Implements the 2-standard-deviation outlier rule (SOP Section 14) in JavaScript. |
| HTTP - Claude Narrative Generation | `n8n-nodes-base.httpRequest` | Calls the Anthropic Messages API to draft the underwriting narrative (SOP Section 14 narrative prompt). |
| Postgres - Upsert Comps | `n8n-nodes-base.postgres` | Persists normalized comps to the `comps` table (upsert on the dedupe constraint). |
| Postgres - Upsert Financial Model | `n8n-nodes-base.postgres` | Persists the computed valuation range and narrative to `deal_financial_model`. |
| HTTP - Salesforce Update Opportunity | `n8n-nodes-base.httpRequest` | `PATCH /services/data/v59.0/sobjects/Opportunity/{id}` with the valuation range and confidence score. |
| HTTP - S3 Upload OM | `n8n-nodes-base.httpRequest` | `PUT` of the rendered OM PDF to the S3 object URL. |
| Salesforce - Create Broker Review Task | `n8n-nodes-base.salesforce` | Creates the mandatory broker review Task (SOP Section 12, Step 9 / BR-6). |
| Respond To Webhook | `n8n-nodes-base.respondToWebhook` | Returns an acceptance acknowledgment to the uploading client. |

Credential placeholders (`re04_postgres_credential`, `re04_salesforce_credential`, `re04_aws_credential`, `anthropic_api_credential`) are standard n8n credential references — configure them in **Credentials** after import; no secrets are embedded in the JSON. `$vars.SALESFORCE_INSTANCE_URL`, `$vars.S3_BUCKET_NAME`, and `$vars.AWS_REGION` are n8n environment variables to set before activating.

## 3. `schema.sql`

Valid PostgreSQL 14+ DDL, including the `pgcrypto` and `uuid-ossp` extensions used for column-level encryption and UUID primary keys (SOP Section 24).

**To run against a fresh database:**

```bash
createdb re04_cre_pipeline
psql -h <host> -U <user> -d re04_cre_pipeline -f schema.sql
```

Tables created: `opportunity`, `comps`, `deal_comp_link`, `deal_financial_model`, `audit_log`, `workflow_dead_letter`, plus supporting enum types, indexes, an `updated_at` trigger function, and two illustrative roles (`re04_workflow_service`, `re04_reporting_readonly`) with SOP-Section-25-aligned grants. `comps.cap_rate` and `comps.noi_annual_usd` include plaintext mirror columns alongside `*_encrypted` `bytea` columns so the schema is directly usable by `comp_analysis.py` for statistical computation without requiring a live pgcrypto key exchange in this reference build — a production deployment would decrypt-on-read instead and drop the plaintext mirrors if policy requires zero plaintext-at-rest.

## Required credentials for a live deployment

| System | Credential type | Used by |
|---|---|---|
| Anthropic (Claude API) | API key (`x-api-key` header) | Structured extraction and narrative-generation HTTP Request nodes |
| Salesforce | OAuth2 JWT bearer (Connected App) | Opportunity update and Task creation |
| AWS S3 | IAM role or access key/secret | OM document upload |
| PostgreSQL | Username/password over TLS | Comp and financial model persistence |

None of these are required to run `comp_analysis.py`'s self-test or to import/inspect `n8n-workflow.json` — they are only required to activate the workflow against live systems.
