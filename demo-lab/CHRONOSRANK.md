# ChronosRank local temporal memory ledger

This build implements a bounded local slice of the [ChronosRank research plan](../47%20Automation%20Blueprints/2026%20Research-to-Production/02-chronosrank.md). It stores synthetic memory events, retrieves exact supplied text at an explicit time, saves replayable receipts and accepts append-only feedback. Its status is **partial-local**. It does not implement the plan's trained small reranker, distillation, vector index, calibrated confidence, provider adapters or research/production benchmarks.

Start the [demo lab](README.md) and open `/chronosrank`. The local browser API shares the demo server's loopback host/origin/intent checks. Tenant labels are selectors; they are not authenticated identities or an authorization boundary against a person who can choose another label.

Run the standalone authored examples and the adverse-case tests from the repository root:

```powershell
node demo-lab/run-chronosrank.mjs
node --test demo-lab/chronosrank-core.test.mjs
```

The runner checks seven authored expectations: old memory before scheduled replacement, replacement at the exact boundary, no revival after successor expiry, expiry at equality, distinct tied text abstention, separate tenant records and an unmatched query. It then closes/reopens a file-backed SQLite database and verifies a saved receipt and immutable command replay. These are synthetic acceptance examples used to design this implementation, not a held-out model benchmark.

## Memory commands and time

`chronosRank(db)` uses an existing Node SQLite `DatabaseSync`; `openChronosRank(path)` owns a connection and adds `close()`. `append` accepts exactly one of these objects:

```json
{
  "commandId": "remember-policy-1", "tenant": "acme", "kind": "remember",
  "memoryId": "policy-1", "entity": "delivery-policy",
  "text": "Synthetic deliveries arrive Tuesday.",
  "provenance": { "sourceId": "policy-source-1", "quote": "Synthetic deliveries arrive Tuesday." },
  "recordedAt": "2026-10-20T09:00:00.000Z",
  "validFrom": "2026-10-20T09:00:00.000Z", "expiresAt": null
}
```

`supersede` uses the same fields plus `"supersedes":"policy-1"` and a **new** `memoryId`. The predecessor must exist in the same tenant and entity and can have only one successor. A successor's `validFrom` cannot precede its predecessor's `validFrom`, preventing inverted replacement chains from reviving older generations. `expire` accepts exactly `commandId`, `tenant`, `kind`, `memoryId`, `recordedAt`. It appends an expiration event and preserves the original source. The API exposes no destructive deletion or editable source records.

Every time must be a real canonical UTC timestamp with milliseconds. Offset forms, missing milliseconds, impossible dates and calendar rollovers are rejected. Memory is eligible when both `recordedAt <= asOf` and `validFrom <= asOf`. Configured or explicit expiry excludes it at equality. A successor supersedes its predecessor when both the successor's `recordedAt` and `validFrom` have been reached; successor expiration never revives a predecessor. Historical queries before that boundary can still cite the old source.

The tenant knowledge watermark is the maximum of all committed memory `recordedAt` and retrieval `asOf` inputs. Later memory commands must have `recordedAt >= watermark`. This prevents a newly submitted command from backdating into an earlier observed time window. Equality is allowed, and any later memory event makes earlier receipts explicitly stale. A future `asOf` advances this watermark, so subsequent ingestion must respect it. These are supplied local timestamps, not trusted wall time or automatic business retention decisions.

The supplied quote must contain the memory text exactly. The engine preserves both and the source ID. It does **not** fetch or authenticate the source, verify its truth, detect semantic contradictions or infer protection labels.

## Retrieval and immutable receipts

```json
{
  "requestId": "retrieve-policy-1", "tenant": "acme", "entity": "delivery-policy",
  "query": "deliveries arrive", "asOf": "2026-10-22T11:00:00.000Z",
  "threshold": 100, "limit": 3
}
```

`retrieve` normalizes text with Unicode NFKC, lowercases it and compares distinct Unicode letter/number tokens. The integer score is `floor(100 * matching query tokens / distinct query tokens)`. It is a lexical percentage, **not probability or calibrated confidence**. Thresholds are integers 1–100; result limits are 1–10. Empty/punctuation-only queries and more than 32 distinct tokens are rejected.

Only the requested tenant and entity produce candidates or exclusion IDs. Results include exact supplied text/quote, score, source ID and validity timestamps. Expired, superseded, future, below-threshold and over-limit candidates receive explicit exclusion reasons. If distinct normalized text ties at the highest qualifying score, retrieval abstains instead of choosing an arbitrary text. This is narrow lexical tie detection; differently worded semantic conflicts with different scores can remain undetected.

The receipt includes `snapshot:true`, the memory ledger head, an implementation source hash, algorithm version and the exact request. `receipt({tenant,receiptId})` or replaying an identical request returns that saved result, not a new search. `stale:true` indicates later memory changes or changed implementation bytes after restart; `currentLedgerHead` and `currentImplementationHash` identify the current memory/code snapshot. Feedback or other retrievals do not falsely stale an unchanged memory snapshot. Use a new `requestId` to search the latest ledger. The UI's **Prepare a fresh request for these fields** action generates that ID while retaining the query and as-of time; then click **Retrieve at this instant**. No live model learns from feedback.

The workbench checks saved history before retrieving and asks you to append the timeline or one event first if the tenant is empty. This prevents an accidental empty query from advancing the watermark past the bundled historical events. The underlying API still permits explicit empty retrieval and records its abstention; local CLI callers must manage that ingestion policy themselves.

`feedback({commandId,tenant,receiptId,outcome,note})` accepts `useful` or `not-useful`, references an existing same-tenant receipt and appends its note. `history({tenant})` lists memory events, receipts, feedback and the watermark. Both memory and feedback commands share an immutable per-tenant command namespace; retrieval IDs use a separate namespace. Identical replay has no second effect; changed input under an existing identifier fails.

## Durability and integrity limits

Memory commands, receipt creation and feedback commit inside SQLite `BEGIN IMMEDIATE` transactions with their canonical request hash, response, preceding hash and updated tenant head/count. Read APIs use one consistent read transaction, recompute the hash chain and validate each saved receipt against its original preceding memory snapshot. Failed inserts roll back log, head and watermark together. `verifyAudit({tenant})` returns `valid:false` for detected corruption; ordinary reads and writes fail closed. The implementation source must remain unchanged while the process is running; restart after editing it.

The hash chain detects accidental edits, malformed rows and tail truncation when the head is intact. It is not an external signature, encrypted vault or defense against an administrator who can rewrite the whole database and its head. Local filesystem access still controls the SQLite file. Receipt hashes identify the source bytes used when a receipt was created; they do not certify a human review or source truth. This version accepts its defined lexical algorithm version when reopening receipts and recomputes their deterministic behavior; a changed algorithm needs an explicit migration/version policy.

The tests cover strict schemas and timestamps, expiry and replacement boundaries, no revival, tenant/entity separation, threshold equality, immutable replay and stale snapshots, backdating rejection, SQL failure rollback, corrupt source/receipt/head rejection, close/reopen, a separate-process restart and two independent connections. They do not establish concurrent production throughput, general retrieval quality, authenticated tenancy or p95 latency.
