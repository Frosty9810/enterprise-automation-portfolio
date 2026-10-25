# CON-01 local construction compliance and change-order ledger

CON-01 remains **PARTIAL**. This executable synthetic slice links manually supplied document provenance, current compliance checklists, versioned change orders, independent reviews and one atomic local cost commitment. It does not approve real site work, verify an issuer, change a real contract, contact a provider or make a payment.

## Reproduce

Use Node 24 with built-in `node:sqlite` from the repository root:

```sh
node --test demo-lab/construction-core.test.mjs
node demo-lab/run-construction.mjs
```

The core suite currently executes 50 tests. They cover exact-cents limits, expired and superseded evidence, independent roles, revoke/reverify review invalidation, revision-bound changes, immutable command replay, SQL-trigger rollback, anchored history/row/budget tampering, an actual separate-process reopen and two real independent processes competing for the same budget. Browser and HTTP validation are separate evidence, not inferred from these tests.

The acceptance runner submits and independently reviews two synthetic manifests, creates a USD1250.00 change, collects manager and finance approvals and records one local commitment. It then revokes a current document: readiness becomes held while the historical USD1250.00 cost remains in the ledger. The observed local budget is USD10000.00 allocated, USD1250.00 committed, USD8750.00 remaining; nine successful audit events are recorded. These are fixture numbers, not business results.

## Systems of record and ownership

The local SQLite event chain is the history of accepted intents. Document and order tables are integrity-checked materializations; a separate commitments table contains append-only cost postings, and a budget table records current exact-cents totals. Every successful command, next materialized revision, commitment and budget update is committed together in one database transaction. This is not a distributed accounting or property-platform guarantee.

Two registry tenants, `acme` and `beta`, have separate sites, subcontractors, budgets and actor labels. The operator submits supplied evidence and requests changes. A distinct compliance label reviews a source manifest; a manager and a finance label review the exact order/document-set hash. Manager and finance must differ from each other and the requester. These labels are **unauthenticated fixture selectors**, not user identities or enforced real-world separation of duties. No source-selected URL is fetched.

## Provenance and document readiness

`submitDocument` accepts an explicit synthetic `email` or `pdf-manifest` channel, reference, supplied text, received timestamp, kind and exclusive `validUntil`. The server hashes the actual supplied UTF-8 content as `sourceContentHash` and binds its metadata/version/context in `contentHash`. It does not parse a PDF, extract OCR, inspect a real email attachment or verify an insurer/licensing body. Manual field truth is outside this slice.

Insurance and license are the two required fixture kinds. A new source ID for a kind creates a new immutable content version; the latest version alone determines current readiness. An unverified, revoked, stale or expired latest document holds readiness even when an older verified version exists. Reviews append history and advance a document's review revision; they do not overwrite its source content. A compliance review must match the exact saved content hash and current `expectedRevision`, and differ from the submitting actor. A verify intent prepared before a concurrent revocation cannot re-verify that now-changed revision; a fresh explicit review of the saved revoked revision is required.

`validUntil` is exclusive: a document is expired at the exact timestamp, not one millisecond later. Canonical UTC timestamps are required, impossible dates and future received sources are rejected, and timestamps remain distinct: source receipt does not establish an issuance or validity-start date. An expired document received after its expiry can be stored and reviewed as supplied evidence but cannot establish current readiness. The configured site must also be inside its active fixture period.

## Change review and local posting

1. Create an order with a stable tenant-scoped source issue ID, synthetic scope/provenance, positive integer USD cents and a zero-through-365 whole-day schedule impact. Positive change costs through 1000000000 cents are accepted as proposals; the smaller site budget is independently checked before a commitment. Negative credits, real tax calculations, original contract pricing, change disputes and reversals are intentionally excluded from this slice.
2. Revise an uncommitted order using its current `expectedRevision`. Scope, price, schedule and source provenance become a new immutable version in the event history; both prior review records are cleared. A committed order cannot be revised or posted again with a new command.
3. Current readiness is required before manager/finance review. The order's `reviewHash` binds its version, requester, scope, exact cents, currency, schedule, source content/reference/timestamp, configured site/subcontractor and source/config identity. It also binds each current document's identity, immutable content hash, version and review revision/decision/reviewer. A document renewal or any review generation changes the order hash. Revoking then re-verifying a document cannot silently revive previous order approvals.
4. Both manager and finance approve the exact current hash. A rejected or stale review does not authorize a commitment. These are local fixture review records, not signatures or human sign-off.
5. `recordCommitment` rechecks current source/config identity, current document readiness and exclusive expiry, both independent approvals, exact hash and budget inside `BEGIN IMMEDIATE`. One order produces at most one append-only local cost entry. Total committed cents plus this amount must be a safe integer within the allocation. Concurrent independent processes cannot both consume the same remaining budget.
6. Revocation or expiry after a commitment exposes a current readiness hold while preserving the historical posting. No implied contract cancellation, accounting reversal, payment or real vendor notification occurs. The operator must hand off real-world follow-up through an authorized external process.

The UI should distinguish a committed historical entry from current readiness. A green local checklist is not legal compliance, safety certification or authority to enter a construction site. Schedule impact is the supplied delta, not a critical-path calculation or updated real schedule.

## API and recovery

`constructionDesk(DatabaseSync, options?)` uses a caller-owned database. `openConstruction(path, options?)` opens and owns it and adds `close()`. Initialization sets a five-second busy timeout before schema transactions; failures close the owned handle. Options permit only an internally injected test clock and a bounded registry revision identity.

The API exposes `catalog`, `submitDocument`, `reviewDocument`, `documentReceipt`, `readiness`, `createOrder`, `reviseOrder`, `reviewOrder`, `recordCommitment`, `receipt`, `history`, `state`, `audit` and `verifyAudit`. Exact closed payloads are exercised in [core tests](construction-core.test.mjs) and the [runner](run-construction.mjs). The catalog exposes the fixture registry, complete input examples and clock label. All inputs are bounded plain finite JSON; unknown fields, prototype keys, control characters, unsupported roles, wrong tenant/site/subcontractor selectors and malformed timestamps are rejected.

Every mutation requires a tenant-scoped immutable `commandId`. The same command and payload return the current saved record without repeating its effect. Reusing an ID with another operation or changed payload conflicts. Source document IDs and order source issue IDs are separately immutable; replay the original command instead of creating duplicate source records. Read methods use consistent SQLite transactions and return copies. On a lost browser response, recover history/state or retry the unchanged command; a separate process can reopen the file and recover committed data. There is no simulated transport or external uncertain-response protocol in this ledger because all its actual effects share one SQLite transaction.

## Clock, audit and remaining work

The default clock is fixed at **2026-10-24T12:00:00.000Z**. This makes fixture expiry reproducible on later days. It is not live monitoring, a background expiry alarm or a notification service. HTTP callers cannot override this clock. Internal clock injection supports expiry and site-period boundary tests.

Every accepted command records a hash-linked event and updates a separate durable event-count/head anchor. Reads and mutations verify the chain, command identity, row revision lineage, every document/order/commitment/budget materialization and the reconciliation of budget totals to actual commitment entries. Missing anchors are rejected on reopen; deleted budgets are not silently reseeded. SQL failures roll the whole local operation back. Source fingerprints hash the exact core and fixture module bytes; changed source/config makes prior authority stale. No migration/reapproval adapter is implemented for stale historical records.

The chain is unkeyed and local. A privileged actor who coherently rewrites all events, materializations and anchors is outside its guarantee. It is not a signed ledger, production compliance control or proof of authentic email/PDF provenance. The wider CON-01 blueprint remains open: authenticated contractors/reviewers, real attachment intake and issuer checks, complete approval chains and contract amendments, real accounting/schedule/site systems, integrations and acceptance recordings.
