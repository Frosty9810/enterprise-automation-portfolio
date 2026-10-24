# DocksideSLM: reviewed offline document delivery

This is a **partial local implementation** of the [DocksideSLM blueprint](../47%20Automation%20Blueprints/2026%20Research-to-Production/04-docksideslm.md). It accepts supplied synthetic document text and supplied structured extraction, validates the extraction, records an independent review and delivers approved jobs to a durable local SQLite receiver. It implements the validation/review/queue/reconciliation boundary of the planned pipeline.

There is no OCR, language model, learned confidence score, document authenticity check, hardware inference, energy measurement, cloud dashboard or live ERP integration. Validation does **not** prove that supplied extraction matches the supplied document text. A reviewer must compare them; the demo label is not an authenticated human. No 4 GB execution, field accuracy, latency or compression result is claimed.

## Run the reproducible examples

From the repository root, using Node 24 with the built-in SQLite module:

```powershell
node demo-lab/run-dockside.mjs
node --test demo-lab/dockside-core.test.mjs
```

The CLI creates an in-memory database, submits all eight catalog scenarios and checks four delivered records and four rejected extractions. Its scripted review is test setup, not human acceptance. The scenarios cover a valid invoice, a zero-value packing list, an offline retry, a lost response requiring reconciliation, a mismatched total, an unknown vendor, an impossible date and an unknown item. Test fixtures are deliberately synthetic.

The core suite also checks separate-process restart, concurrent delivery workers, integer bounds and multiplication, malformed dates/currency/schema, review rejection, content/hash binding, self-review, command replay, superseded revisions, duplicate business identity, rollback after storage failure, receiver/audit corruption and configuration/source drift. Temporary test databases are isolated and removed by the tests. File/restart tests are separate from the in-memory CLI evidence.

## Durable state and transitions

`openDockside(path)` opens a SQLite database; `dockside(db)` shares an already-open database. `openDockside()` defaults to in-memory and exposes `close()`. Callers must supply a durable path to retain state between runs. The HTTP server chooses its database; requests cannot choose a database path, arbitrary sender, callback, registry or configuration.

```text
supplied text + supplied extraction
  -> rejected (validation reasons retained; no review or delivery override)
  -> awaiting-review
      -> review-rejected
      -> ready
          -> offline -> retry -> delivered
          -> uncertain -> reconcile receiver record -> delivered
```

Jobs are immutable source/extraction revisions. A SHA-256 content hash binds the document, extraction, source-text hash, registry revision and core/fixture source hashes. Approval must provide that exact hash and a different configured reviewer label from the submitting actor. A later document revision needs a higher positive integer version and a new command ID; it supersedes older undelivered revisions and needs fresh review. A document already delivered or uncertain cannot be revised through this demo: a real ERP correction/credit workflow remains unimplemented. The receiver additionally rejects the same tenant/kind/vendor/reference under another document ID, preventing a second posting disguised as another job.

The source/configuration identity is rechecked before review, delivery and reconciliation. A stale receipt remains inspectable with `stale: true`, but cannot be used for those actions. Do not export it as current delivery evidence. Resubmit an undelivered document as a higher revision after a source/configuration change. A stale uncertain delivery needs an explicit operational recovery/correction design; deleting the queue or replaying it into another ERP is not a supported recovery.

SQLite `BEGIN IMMEDIATE` serializes mutations. Receiver writes, the delivery outcome and the audit append commit together; a forced audit insertion failure rolls back the receiver write. Exact submission command replay and already-delivered sync replay do not add receiver effects. Read transactions keep receipt/state/verification snapshots consistent with concurrent writers.

## Validation boundary

The envelope accepts exactly `commandId`, `tenant`, `actor`, `document`, and `extraction`. `document` contains exactly `id`, integer `version` and nonempty `text`. IDs are bounded ASCII identifiers; source text is limited to 10,000 characters, the entire request to 24,000 JSON bytes, and nested JSON to ten levels. Prototype-related keys and nonfinite numbers are rejected. Malformed envelopes throw without accepting a job. A valid envelope with invalid extraction becomes a retained `rejected` receipt with reasons.

Extraction contains exactly:

```json
{
  "kind": "invoice",
  "vendorId": "vendor-acme",
  "reference": "INV-demo",
  "issuedOn": "2026-10-23",
  "currency": "USD",
  "lines": [{"itemId":"item-widget","quantity":2,"unitPriceMinor":1250,"lineTotalMinor":2500}],
  "totalMinor": 2500
}
```

Accepted kinds are `invoice` and `packing-list`. Dates must be real calendar days from 2000 through 2099. Tenant-specific vendors and items come from a fixed server-held registry: `acme` uses `vendor-acme`; `beta` uses `vendor-beta`; both have `item-widget`, `item-bolt` and USD. Unknown vendors/items/currencies are rejected. Item IDs cannot repeat within a document. Each extraction has 1–50 lines. Quantities are positive integers at most 1,000,000; unit prices are integer minor units from 0 through 1,000,000,000; line and document totals are integer minor units from 0 through 1,000,000,000,000. BigInt multiplication/summation checks exact line and aggregate totals. Packing-list monetary fields must all be zero; this receiver does not infer invoice prices from packing lists.

These checks establish schema, reference-registry membership and arithmetic. They do not establish tax correctness, currency conversion, real supplier approval, purchase-order matching, stock availability or whether an invoice has previously been paid outside this receiver.

## Core API

All methods are synchronous. The server maps these closed operations to its guarded loopback API; only the core is described here. Use `catalog()` for the exact current synthetic scenarios and labels.

| Operation | Input | Result |
| --- | --- | --- |
| `catalog()` | none | `{scope, scenarios:[{id,title,input}], tenants, reviewerLabels, receiverProfiles}` |
| `submit(input)` | Strict envelope above | Receipt with immutable source and validation |
| `review(input)` | `{tenant,receiptId,reviewer,expectedHash,decision,note}` | Reviewed receipt; decision is `approve` or `reject` |
| `sync(input)` | `{tenant,receiptId,receiverProfileId?}` | Actual closed local receiver outcome |
| `reconcile(input)` | `{tenant,receiptId}` | Delivered receipt only after matching authoritative receiver row |
| `receipt(input)` | `{tenant,receiptId}` | Verified receipt |
| `history(input)` | `{tenant}` | `{receipts:[...]}` |
| `state(input)` | `{tenant}` | `{jobs,erpRecords,summary}` |
| `audit(input)` | `{tenant}` | `{verification,events}`; diagnostic rows remain available when verification fails |
| `verifyAudit(input)` | `{tenant}` | `{valid:true,eventCount,receiverRecordCount,scope}` or an integrity error |

Receipts include `receiptId`, `tenant`, `commandId`, `actor`, `document`, `extraction`, `contentHash`, `sourceHash`, `validation:{valid,reasons}`, `status`, `review`, `delivery:{attempts,receiverRecordId}`, `stale` and `scope`. `awaiting-review`, `rejected`, `review-rejected`, `ready`, `offline`, `uncertain`, `delivered` and `superseded` describe local queue state, not a provider receipt. Reviewer IDs such as `acme-reviewer` and `acme-reviewer-two` are configured labels; `acme-dual-role` can submit/review separate jobs but cannot review its own submission. `beta` objects remain tenant-scoped, but the demo tenant selector is not authentication or authorization suitable for deployment.

`sync` accepts only these fixed server-defined fault scenarios:

- `online`: execute the local receiver SQL write, then return the stored outcome.
- `offline`: leave the job retryable and perform no receiver write.
- `lose-response`: commit the local receiver write but report the caller's delivery as uncertain. A second sync is refused until `reconcile` confirms the authoritative receiver row.

The selected fault profile does not accept a success flag, approval flag, URL, arbitrary callback or receiver contents. `lose-response` models a lost response deterministically; it is not evidence of an actual network outage. The receiver shares the queue database so the test can check effects atomically; this is deliberately not a claim of a distributed exactly-once transaction.

## Integrity and recovery limits

An unkeyed SHA-256 chain binds ordered event rows, with a separate durable head/count updated in the same transaction. This detects a deleted terminal review/offline event as well as modified payloads or missing middle events. Receiver records are compared against the effects recorded in that chain before state/receipt exports or new mutations. Altered/deleted receiver records fail closed. Raw `audit` remains diagnostic and includes an explicit verification result; unverified rows are not current delivery evidence. Stop delivery and preserve the database on an integrity error; restore a trusted backup and reconcile with the real downstream system before any future adapter is introduced.

The chain is a local consistency check. It has no external anchor, signature or administrator protection: an administrator can rewrite the entire database and recompute hashes, or remove all state. These checks are not a privacy or security guarantee. There is no retention/encryption policy, credential boundary, real reviewer identity, external source watcher, actual OCR/model source identity or externally signed receiver acknowledgement.

## Work still open

The blueprint still requires OCR, offline SLM extraction, calibrated confidence/fallback behavior, hardware memory/energy/latency measurement, model compression comparisons, a signed model registry and a real ERP adapter with a business-approved correction/reconciliation contract. Those requirements remain open in the portfolio inventory. This local reviewed queue is a dependency for that work; it does not complete DocksideSLM.
