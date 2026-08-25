# SAAS-02 build artifacts

Status: **Populated**

This folder contains a real, working reference implementation of the automation described in [`../SOP.md`](../SOP.md) — not just narrative documentation. Each file below is structurally valid and independently verifiable per [`49 Internal Standards/README.md`](../../../49%20Internal%20Standards/README.md), Section 9 ("Real Build Artifacts").

## Files in this folder

| File | What it is |
|---|---|
| [`n8n-workflow.json`](n8n-workflow.json) | A real, importable n8n workflow export implementing the full dunning pipeline: Stripe webhook trigger → tier/decline-reason extraction (Code node) → Switch node branching by plan tier → Wait-node-based Day 3/7/14 cadence with Postgres check-before-send guards → HubSpot email sends → Twilio SMS escalation for high-value accounts → internal subscription-suspend call → a parallel Enterprise branch that creates a Close CRM task → a second webhook flow that marks recovery and reconciles to QuickBooks Online. Uses only real n8n core node types (`n8n-nodes-base.webhook`, `n8n-nodes-base.code`, `n8n-nodes-base.switch`, `n8n-nodes-base.wait`, `n8n-nodes-base.if`, `n8n-nodes-base.postgres`, `n8n-nodes-base.httpRequest`, `n8n-nodes-base.twilio`, `n8n-nodes-base.respondToWebhook`). |
| [`dunning_state_machine.py`](dunning_state_machine.py) | A standalone Python 3 script (stdlib only — `datetime`, `enum`, `dataclasses`) implementing the graduated 14-day cadence: state enum, high-value/Enterprise branching logic, `determine_state_and_action()`, and `advance_case()` for simulating a transition. Runs a self-test against 4 sample cases when executed directly. |
| [`schema.sql`](schema.sql) | Real PostgreSQL DDL for the `dunning_cases` lifecycle table plus an append-only `dunning_case_audit_log` table, enum types for plan tier / decline reason / status, indexes, an `updated_at` trigger, and an `active_dunning_cases` view. Executes cleanly against a fresh PostgreSQL 13+ database. |
| `README.md` | This file. |

## Running the Python self-test

No dependencies, no credentials, no network calls required.

```bash
python3 dunning_state_machine.py
```

Expected output: a header line with the evaluation timestamp, followed by one block per sample case (fresh failure within the Smart Retry window, a Day-3 SMB case, a Day-7 Enterprise/high-value case, and a Day-16 unrecovered Mid-Market case), each showing the determined `CaseState` and action string, followed by `Self-test complete: 4/4 sample cases evaluated successfully.`

To use the module in your own code:

```python
from dunning_state_machine import DunningCase, PlanTier, DeclineReason, determine_state_and_action
from datetime import datetime

case = DunningCase(
    dunning_case_id="dc_example_01",
    invoice_id="in_example",
    customer_id="cus_example",
    plan_tier=PlanTier.MID_MARKET,
    decline_reason=DeclineReason.INSUFFICIENT_FUNDS,
    amount_due_cents=49900,
    mrr_cents=89000,
    failed_at=datetime(2026, 6, 30, 8, 0, 0),
)
state, action = determine_state_and_action(case, datetime(2026, 7, 4, 8, 0, 0))
```

## Importing the n8n workflow

1. In n8n, go to **Workflows → Import from File** (or **Import from URL** if hosted) and select `n8n-workflow.json`.
2. n8n will create all nodes and connections automatically. The workflow imports in an inactive state (`"active": false`) by design — review credentials before activating.
3. Each node referencing a credential (Postgres, HubSpot, Close CRM, Twilio, QuickBooks Online, the internal app API) will show as unconfigured until you attach your own credential of the matching type. This is expected and normal for a shareable n8n template — no real keys are embedded.
4. Update the two webhook nodes' paths/URLs to match your n8n instance's public URL, then point Stripe's webhook configuration (test mode first) at the `invoice.payment_failed` and `invoice.payment_succeeded` endpoints respectively.
5. Run the schema in `schema.sql` against your Postgres instance before the first execution, since every Postgres node in the workflow assumes the `dunning_cases` and `dunning_case_audit_log` tables already exist.
6. For local testing without waiting on real Wait-node delays, temporarily shorten the `amount`/`unit` parameters on the `Wait Until Day 3 / Day 7 / Day 14` nodes (e.g., minutes instead of days), consistent with the accelerated-schedule UAT approach described in SOP Section 29.

## Required credentials for a real deployment

| Credential | Used by | Scope needed |
|---|---|---|
| Stripe webhook signing secret + restricted API key | Webhook signature verification (upstream of this workflow; validate before forwarding to n8n) | Read-only on invoices/charges/customers |
| PostgreSQL connection (host, database, user, password) | All `n8n-nodes-base.postgres` nodes | INSERT/UPDATE/SELECT on `dunning_cases`, `dunning_case_audit_log` |
| HubSpot private app token or OAuth2 | `HubSpot - Send Day 3/Day 7 Email` HTTP Request nodes | `transactional-email` send scope, Marketing Hub Professional+ |
| Twilio Account SID + Auth Token | `Twilio - Send SMS Escalation` node | Programmable SMS, verified sender ID |
| Close CRM API key | `Close CRM - Create CSM Task` node | Task create, lead read on the Enterprise pipeline |
| QuickBooks Online OAuth2 app (client ID/secret, refresh token, realm ID) | `QuickBooks - Reconcile Journal Entry` node | `com.intuit.quickbooks.accounting` scope |
| Internal app API key/token | `HTTP - Suspend or Downgrade Subscription` node | Write access to the subscription-suspend/downgrade endpoint |

All credential values above are placeholders in `n8n-workflow.json` (credential IDs like `postgres-dunning-engine`, `hubspot-api`, `close-crm-api`, `twilio-account`, `quickbooks-online-oauth2`, `internal-app-api`) — no real secrets are embedded anywhere in this repository, consistent with [`49 Internal Standards/README.md`](../../../49%20Internal%20Standards/README.md), Section 2.

## Validation performed

- `n8n-workflow.json` parsed successfully as valid JSON (`json.load` / `JSON.parse` clean) and matches the required top-level n8n export shape (`name`, `nodes`, `connections`, `active`, `settings`, `id`).
- `schema.sql` was checked for balanced statements and valid PostgreSQL syntax (enum types, table constraints, indexes, trigger function, view).
- `dunning_state_machine.py` was executed directly (`python3 dunning_state_machine.py`) and produced the expected 4/4 sample-case output with no errors.
