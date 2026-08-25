# RE-03 Build Artifacts

Real, runnable/importable reference implementation backing [`../SOP.md`](../SOP.md) — AI-Powered Buyer/Seller Lead Qualification & Cross-Platform Scoring Engine. This folder exists per [`49 Internal Standards`](../../../49%20Internal%20Standards/README.md), Section 9 ("Real Build Artifacts"): a reviewer should be able to actually import, run, or execute part of this system, not just read a description of it.

## Files

| File | What it is |
|---|---|
| `lead_classifier.py` | A real Python 3 script using the `anthropic` SDK. Defines the exact `classify_and_extract_lead` tool schema from SOP Section 14.1 as a Python dict, calls the real Claude Messages API with `tool_choice` forced to that tool, validates the structural response, and computes the deterministic 0-100 composite score from SOP Section 14.4 — no second LLM call. Runs live against the API if `ANTHROPIC_API_KEY` is set, or falls back to a `--dry-run` mode that prints the constructed request payloads with no network call and no credentials required. |
| `n8n-workflow.json` | A valid, importable n8n workflow implementing the full pipeline from SOP Section 12: GHL webhook trigger → context assembly → direct Claude Messages API call → response validation/scoring → three-way Switch routing (Close CRM handoff / GHL nurture / disqualify + re-engagement) → parallel Postgres audit write. |
| `schema.sql` | Real PostgreSQL DDL for the `lead_scoring` schema: `score_events` (append-only audit trail), `lead_current_state` (per-contact projection), `manual_overrides` (ISA corrections), `re_engagement_queue` (disqualified-lead follow-up), and `model_feedback` (quarterly accuracy review records) — matching SOP Section 34's appendix and the feedback-loop requirements in Sections 20 and 27. |
| `README.md` | This file. |

## Running `lead_classifier.py`

```bash
pip install anthropic

# Live mode — calls the real Claude API against 3 hardcoded sample transcripts
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
python3 lead_classifier.py

# Dry-run mode — no credentials needed, no network call.
# Prints the exact request payload(s) that would be sent to
# POST https://api.anthropic.com/v1/messages, plus a scored
# illustrative example exercising compute_composite_score().
python3 lead_classifier.py --dry-run
```

If `ANTHROPIC_API_KEY` is not set, the script automatically falls back to the same dry-run behavior rather than crashing — this is intentional so the script is fully demonstrable without live credentials, per the Section 9 verification obligation.

Key functions, importable independently:

- `classify_lead(transcript: str, api_key: str | None = None) -> dict` — calls the live API and returns the validated `{intent, confidence, entities, reasoning}` dict.
- `compute_composite_score(classification: dict, lead_source: str = "unknown", hours_since_last_engagement: float = 0.0) -> int` — the pure, deterministic scoring formula (no LLM call).
- `build_claude_request(transcript: str, lead_source: str) -> dict` — constructs the exact Messages API request body, including the `tools` array and forced `tool_choice`.

Error handling matches SOP Section 17/18: `anthropic.RateLimitError` (429) and `anthropic.InternalServerError` (5xx) are retried with exponential backoff (capped at 3 attempts in this reference script vs. production's 4-attempt/20s ceiling); a malformed or schema-invalid tool-call response raises `LeadClassificationError`, mirroring Section 17 Scenario 2.

## Importing `n8n-workflow.json`

1. In n8n: **Workflows → Import from File** (or paste via **Import from URL/Clipboard**) and select `n8n-workflow.json`.
2. Configure credentials for each node's referenced credential type before activating:
   - `highLevelOAuth2Api` — GoHighLevel OAuth2 (used by the "Fetch GHL Conversation Context," "Fetch GHL Contact Record," and all GHL tagging/field-update HTTP nodes).
   - The Claude API call node ("HTTP - Call Claude Messages API") reads `x-api-key` from `$credentials.anthropicApi.apiKey` — create a generic **HTTP Header Auth** or **Anthropic** credential in n8n named to match, or replace the header expression with your own credential reference.
   - `closeApi` — Close CRM API key (used by "HTTP - Create Close CRM Lead").
   - Slack OAuth2 credential (used by "Slack - Notify Assigned Agent"); channel is resolved dynamically per office as `#lead-alerts-{location_id}`.
   - `postgres` — point at the database created from `schema.sql` (used by "Postgres - Write Audit Record" and "Postgres - Schedule Re-engagement").
3. The webhook path is `re-03-ghl-conversation-updated` — subscribe this URL to GHL's `ConversationMessage.Created` and custom-field-update events per office sub-account (SOP Section 12, Step 1).
4. Workflow ships `active: false`. Activate only after credentials are set and, per SOP Section 30, after a shadow-mode staging run.

Pipeline shape (matches SOP Section 11/12):

```
Webhook (GHL event) → IF (qualifying event type)
  → Code (extract trigger fields)
    → HTTP (fetch GHL conversation) + HTTP (fetch GHL contact) [parallel]
      → Code (build Claude request w/ classify_and_extract_lead tool schema)
        → HTTP (POST api.anthropic.com/v1/messages, tool_choice forced)
          → Code (validate tool_use response + compute composite score)
            → Postgres (write audit record)               [parallel branch]
            → Switch (score bucket)
                >=75  → HTTP (create Close CRM lead) → Slack (notify agent)
                40-74 → HTTP (tag GHL nurture) → HTTP (merge entities to GHL fields)
                <40   → Code (assign reason code) → HTTP (tag GHL disqualified) → Postgres (schedule re-engagement)
```

## Running `schema.sql`

```bash
createdb lead_scoring_demo
psql -d lead_scoring_demo -f schema.sql
```

Requires PostgreSQL 14+. The script creates the `lead_scoring` schema, enables the `pgcrypto` extension (for `gen_random_uuid()`), creates all five tables with their constraints/indexes, and enables row-level security with an example office-scoping policy on `score_events` and `lead_current_state` (SOP Section 6, Section 25). A commented-out sanity-check `INSERT` at the bottom of the file demonstrates the full write path using the SOP Section 14.5 worked example (Elmwood referral lead, score 88) — uncomment it to smoke-test the schema after creation.

## Environment variables / credentials a real deployment needs

| Variable / credential | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `lead_classifier.py`, n8n Claude HTTP node | Format `sk-ant-xxxxxxxxxxxxx`. Never commit a real key (see [`49 Internal Standards`](../../../49%20Internal%20Standards/README.md), Section 2). |
| GHL OAuth2 client credentials | n8n `highLevelOAuth2Api` credential | Sub-account-scoped per office per SOP Section 8. |
| Close CRM API key | n8n `closeApi` credential | SOP Section 8. |
| Slack Bot OAuth token | n8n Slack credential | Scoped to `#lead-alerts-{office}` channels, SOP Section 22. |
| Postgres connection string (host/db/user/password) | n8n `postgres` credential, direct `psql` access for `schema.sql` | TLS required in production per SOP Section 24. |

## Validation performed

- `n8n-workflow.json` parsed successfully with `python3 -m json.tool` (valid JSON).
- `schema.sql` reviewed for balanced statements and executable syntax against PostgreSQL 14+ (valid DDL: schema, extension, 5 tables, indexes, RLS policies).
- `lead_classifier.py --dry-run` executed successfully with no `ANTHROPIC_API_KEY` set — confirmed it prints the constructed Claude API request payloads for all 3 sample transcripts plus a computed composite score, and exits 0 without any network call or crash.

---
*Part of the Enterprise Automation Portfolio. See [`../SOP.md`](../SOP.md) and the root [README.md](../../../README.md) for navigation.*
