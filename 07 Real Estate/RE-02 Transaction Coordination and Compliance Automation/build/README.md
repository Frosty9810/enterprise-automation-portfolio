# RE-02 Build Artifacts

Real, working reference implementation backing [`../SOP.md`](../SOP.md). These files are structurally valid and functional — importable/runnable as described below — but use placeholder credentials and a fictionalized client (Harborview Realty Partners, per portfolio confidentiality standards). See [`49 Internal Standards/README.md`](../../../49%20Internal%20Standards/README.md) Section 9 for the standard this build folder satisfies.

## Files

| File | What it is |
|---|---|
| `n8n-workflow.json` | An importable n8n workflow implementing both automation flows from the SOP: (A) a webhook-triggered flow that fires when a Close CRM Opportunity moves to "Under Contract," validates `transaction_type`, creates a Dotloop transaction, provisions and shares a Google Drive folder, and inserts the transaction ledger row into Postgres (with a parallel branch that routes unrecognized transaction types to a TC exception queue); (B) a pair of Schedule Trigger flows — a nightly Dotloop document-status poller, and a nightly deadline evaluator that computes T-3/T-1/T-0 notification tiers, sends Twilio SMS and email notifications, and escalates to the managing broker (SMS + email) when a T-0 deadline is missed. |
| `deadline_engine.py` | A standalone, dependency-free Python 3 script implementing the same deadline math the workflow's Code nodes run: computing the earnest money / inspection / financing / closing deadlines from a contract execution date and transaction type, determining notification tier (T-3/T-1/T-0), and flagging broker escalation when a T-0 deadline has passed without completion. Includes an office-offset validator and a template-ID selector mirroring SOP Section 14. Runs standalone with a built-in self-test against three sample transactions (financed, cash, and a deliberately overdue short-sale). |
| `schema.sql` | PostgreSQL 14+ DDL for the full ledger model: `transactions`, `deadline_offsets`, `deadlines`, `deadline_overrides`, `notifications`, `escalations`, `exceptions`, and an append-only `audit_log`, plus a `compliance_dashboard` view. Includes primary/foreign keys, indexes, `CHECK` constraints enumerating valid statuses/types, an `updated_at` trigger, and optimistic-locking support (`deadlines.version`) for the concurrent-override case described in SOP Section 21. |
| `README.md` | This file. |

## Deployment steps

1. **Provision Postgres and load the schema.**
   ```bash
   createdb re02_transactions   # or point at your managed instance
   psql -h <host> -U <user> -d re02_transactions -f schema.sql
   ```
   The script is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) so it can be re-run safely.

2. **Run the deadline engine self-test** to confirm the deadline math before wiring it into n8n:
   ```bash
   python3 deadline_engine.py
   ```
   No credentials or network access required — it builds three hardcoded sample transactions in memory and prints a report showing each milestone's due date, notification tier (if any), and escalation flag.

3. **Import the n8n workflow.**
   - In n8n: **Workflows → Import from File** → select `n8n-workflow.json`.
   - The import will show unresolved credentials on the HTTP Request, Postgres, and Email Send nodes — this is expected; n8n workflow exports never embed live credentials (see Internal Standards Section 9).

4. **Configure credentials in n8n** (Credentials → New):
   - **Dotloop** — an OAuth2 credential (`dotloopOAuth2Api`) authorized against your Dotloop Business+/Premium account with API v2 + webhook/polling entitlements.
   - **Google (Drive + Gmail)** — an OAuth2 / service-account credential (`googleApi`) with domain-wide delegation scoped to Drive file/folder creation and Gmail send only (least-privilege, per SOP Section 38).
   - **Twilio** — an API credential (`twilioApi`) using your Account SID / Auth Token, with a registered 10DLC campaign for U.S. SMS delivery.
   - **Postgres** — host/port/database/user/password for the instance from step 1, over TLS.
   - **Email Send (Gmail/SMTP)** — the same Google Workspace identity, or an SMTP credential if not using Gmail's API directly.

5. **Set the workflow's environment variables** (n8n Settings → Environment, or your deployment's `.env`) — see the table below.

6. **Point the Webhook node's production URL** at your Close CRM webhook subscription for the `opportunity.status_changed` event, and activate the workflow (`active: true`) once credentials are verified in a test run.

7. **Verify the two Schedule Trigger nodes' cron expressions** (`0 2 * * *` for the document poller, `0 6 * * *` for the deadline evaluator) against each office's local timezone per SOP Section 17 scenario 5 — in a multi-timezone deployment, clone the schedule-trigger branch per timezone cluster rather than relying on one global cron, exactly as the SOP's lessons-learned section (43) describes.

## Required environment variables / credentials

| Variable / Credential | Used by | Purpose |
|---|---|---|
| `DOTLOOP_CLIENT_ID` / `DOTLOOP_CLIENT_SECRET` (via n8n Dotloop OAuth2 credential) | HTTP Request nodes calling `api.dotloop.com` | Loop creation and document/status polling |
| Google service-account JSON (via n8n Google API credential, domain-wide delegated) | HTTP Request nodes calling `googleapis.com/drive/v3` and the Email Send node | Folder provisioning, folder sharing, templated email notifications |
| `TWILIO_ACCOUNT_SID` | HTTP Request nodes calling `api.twilio.com` | Path segment identifying the Twilio account |
| `TWILIO_AUTH_TOKEN` (via n8n Twilio credential) | Same nodes | Twilio API authentication |
| `TWILIO_FROM_NUMBER` | Same nodes | Registered 10DLC sending number |
| Postgres host/port/database/user/password (via n8n Postgres credential) | Postgres nodes | Ledger reads/writes described in `schema.sql` |
| `BROKER_PHONE_BY_OFFICE` / `MANAGING_BROKER_EMAIL_BY_OFFICE` | Escalation HTTP Request + Email Send nodes | Per-office managing broker contact lookup for T-0 escalations |
| `__ACTIVE_TRANSACTIONS_SHARED_DRIVE_FOLDER_ID__` (placeholder in the Drive folder-creation node body) | Google Drive folder-creation HTTP Request node | Parent shared-drive folder ID under which per-transaction folders are created |

No credentials are embedded in `n8n-workflow.json` — every credential field is left for the operator to fill in with their own keys, consistent with a normal shareable n8n template.

## Validation performed

- `n8n-workflow.json` was parsed with a JSON parser to confirm it is syntactically valid.
- `deadline_engine.py` was executed directly (`python3 deadline_engine.py`) and confirmed to print a full self-test report with no errors, exercising `calculate_deadlines`, `notification_tier`, `evaluate_escalation`, `select_template_id`, and `validate_office_offsets`.
- `schema.sql` statements were reviewed for balanced parentheses/statement termination and, where a live Postgres instance was available, executed end-to-end against a fresh database.

---
*Part of the Enterprise Automation Portfolio. See [../SOP.md](../SOP.md) for the full SOP.*
