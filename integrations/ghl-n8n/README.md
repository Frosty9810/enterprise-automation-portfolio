# n8n → GoHighLevel contact handoff

Status: local reference implementation; live import/API acceptance pending.

The shared planner is runnable JavaScript, embedded into each project's generated n8n workflow. Every export starts with a manual trigger and synthetic fixture. The last node returns a request preview; **no export sends a request**. The generated `ghl-build.json` is a configuration blueprint, not a HighLevel snapshot.

## Run and inspect

From the repository root:

```sh
python scripts/build_showcase.py
node --test tests/ghl-n8n.test.mjs
node scripts/benchmark_handoff.mjs
```

Open `showcase/README.md`, select a project, then import its `n8n-workflow.json` into n8n. Execute manually and inspect `status`, `eventKey`, and `request`. Set `storageConsent` to false in the fixture and rerun: the output must be `rejected` with no request.

## Account setup and live acceptance

1. Use a dedicated test GHL location. Configure duplicate matching by email and inspect existing duplicate records. Upsert behavior depends on location settings; an event key here is a correlation key, **not durable deduplication**.
2. Create the project's pipeline/stages from `ghl-build.json` manually. Assign a named operator. Keep all messaging/workflow enrollment disabled. These objects are not created by the contact demo.
3. Replace `DEMO_LOCATION` in the trusted configuration node with the test location. Do not accept location IDs from webhook input. A public webhook requires separate authentication/signature validation, payload limits and tenant authorization before this planner.
4. In a separate test copy, add an HTTP Request node after a strict IF `status === ready` branch. Set POST, the fixed URL from the plan, JSON body `={{ $json.request.body }}`, and `Version: v3`. Bind an n8n encrypted credential with test-location contact write scope. Never put a bearer token into the JSON export.
5. Set a finite timeout (10 seconds). Stop on errors. Do not blindly retry POST on timeout: the remote contact may already exist. Reconcile by location/email first. Handle 429 with bounded Retry-After scheduling and a dead-letter queue; handle 401/403 by stopping and repairing credentials.
6. Send one synthetic test contact, capture the returned ID, verify the location/email in GHL, then replay and prove the contact count is unchanged. Test invalid consent, tenant mismatch, 401, 429 and uncertain timeout. Record n8n/GHL version, execution ID, timestamp and redacted evidence.
7. Remove test data through the operator's normal cleanup process. Re-export without credential identifiers or execution data and keep the original preview-only workflow available to reviewers.

## Design boundary

Email is the single demo identity to avoid conflicting phone/email matches. Only names and email enter the request. Financial, candidate, support and mission details stay in their original systems; GHL is a relationship handoff, not a replacement ledger. No payment, approval, message, refund or agent authority is created here. For unattended delivery, implement a durable outbox with a unique `(location, project, event)` constraint and explicit uncertain-result reconciliation before enabling retries.

The planner uses a constant number of bounded field checks. Its benchmark measures local planning latency only, excluding network, n8n scheduling, persistence and API execution.

## Sources checked 8 September 2026

- [HighLevel contact upsert](https://marketplace.gohighlevel.com/docs/ghl/contacts/upsert-contact/index.html): v3 request fields and location duplicate behavior. Tags can replace the existing set, so this adapter omits them.
- [n8n HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/): credentials, JSON body and response behavior.

---
Part of the [Enterprise Automation Portfolio](../../README.md).
