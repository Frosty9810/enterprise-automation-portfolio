# RevenueOS — Salesforce RevenueOps control room

A complete local Salesforce-focused flagship: lead assignment, opportunity follow-up and case escalation. Open **http://127.0.0.1:5680/salesforce** after starting the existing lab. Click **Run full local demonstration** to evaluate three authoritative synthetic records, record scripted permission-fixture reviews, apply three local updates and reconcile a case update whose acknowledgement was lost.

This is a working local reconstruction, not an integration with a Salesforce org. No client records, credentials, hosted CRM writes, live API success or production outcome are implied.

## Business workflows

| Object | Triggering evidence | Proposed update | Explicit boundary |
|---|---|---|---|
| Lead | Score at least 80 and at least 200 employees | Enterprise owner assignment | Missing storage consent holds approval |
| Opportunity | Proposal stage with seven or more days without a next step | Concrete follow-up NextStep | No stage, amount or revenue change |
| Case | Critical severity | High priority and escalation owner | Reviewer approval; uncertain writes must reconcile |

Each proposal reads its record from the local store. Input events cannot provide replacement record fields. Review binds the exact before/patch, expected local revision and source policy byte hash. Apply checks all three again. Another local operator changing the record invalidates prior authorization.

## What to demonstrate in three minutes

1. Run the full demonstration. Inspect the three confirmed updates, actual local fields and case recovery trail.
2. Start a new normal run; evaluate a record. Choose the read-only profile and show denied review. Choose the reviewer profile and acknowledge the proposed fields.
3. Simulate a write with a lost acknowledgement. Retry and export remain disabled. Reconcile the existing local effect; export the confirmed receipt.
4. On another fresh run, simulate an operator change after approval. The existing review cannot overwrite the new record; reevaluate current evidence.
5. Explore missing consent, denied field permission and stale event evidence. They hold updates. Inspect the current source and receipt hashes.

## Salesforce foundations and deliberate differences

- [CDC change-event structure](https://developer.salesforce.com/docs/platform/change-data-capture/guide/cdc-message-structure.html): real CDC uses ChangeEventHeader and decoded record fields. This lab uses a small normalized synthetic envelope with org, transaction key, sequence and record identity; it does not decode Avro, handle gap/overflow events or subscribe to Pub/Sub.
- [Event durability](https://developer.salesforce.com/docs/platform/pub-sub-api/guide/event-message-durability.html): replay IDs are opaque stream positions, not business identities. This demonstration stores the supplied position without arithmetic and deduplicates by org/transaction/sequence/object/record. Duplicate receipts never advance the cursor. This is local consumer behavior, not verified Salesforce subscription acceptance. Real retained events have a limited retention window; production recovery needs a resynchronization path.
- [Conditional REST requests](https://developer.salesforce.com/docs/platform/api-rest/guide/intro-rest-conditional-requests.html): a live adapter must protect updates against intervening changes using supported conditional requests and handle failed preconditions. The local integer revision models that intent; it is not a Salesforce field, ETag or claim about real REST behavior. Account-specific ETags should not be assumed for Lead, Opportunity or Case.
- Reviewer profiles demonstrate least privilege and field-write checks. They are server-side local fixtures, not authenticated Salesforce users, OAuth scopes, CRUD/FLS enforcement or production authorization. Live Describe metadata and authenticated user permissions must replace these fixtures.

## Run and verify

Requires the existing Node 24 environment; no extra package installation is needed.

```sh
node demo-lab/server.mjs
node --test demo-lab/salesforce.test.mjs demo-lab/salesforce-ui.test.mjs
node demo-lab/run-salesforce.mjs
```

The runner uses a fresh temporary SQLite database, executes all three domain updates and held scenarios, closes/reopens the database and verifies uncertain-write recovery. It writes `reports/salesforce-local-acceptance.json`, including source hash, measured duration and zero external actions. Tests additionally cover tenant rejection, unsupported injected fields, conflicting duplicates, permission failure, intervening updates, bounded retries, source changes, missing-effect reconciliation, HTTP boundaries and UI state.

The durable schema stores separate runs, records, event-bound intents, unique per-intent local effects and application audit entries. Immediate transactions atomically update the record, effect and state. This establishes local atomicity and durable receipt behavior; it does not establish distributed exactly-once delivery. Export is historical evidence and includes the current record separately; later changes do not retroactively invalidate a previously completed update.

## Live sandbox acceptance still required

Use an authorized Developer sandbox and an approved OAuth connection. Resolve metadata and actual record IDs, authenticate operators, validate CRUD/FLS and record access, fetch authoritative current records, decode CDC and handle replay-window gaps, enforce conditional writes, test real failures/rate limits and reconcile provider evidence before replay. Log correlations without tokens or client contact data. Keep any live adapter separate from the deterministic local mode.
