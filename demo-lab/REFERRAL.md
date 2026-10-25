# MED-01 synthetic administrative referral queue

MED-01 remains **PARTIAL**. This executable local slice links a closed synthetic referral, fictional payer document checklist, synthetic consent source, independent packet review and a durable local staff queue. It does not make a clinical, treatment, care-eligibility, coverage or insurance-authorization decision. No provider or payer is contacted.

## Reproduce

Use Node 24 with built-in `node:sqlite` from the repository root:

```sh
node --test demo-lab/referral-core.test.mjs
node demo-lab/run-referral.mjs
```

The core suite has 40 cases, including separate-process restart, two independent processes competing to enqueue or revoke the same revision, SQL-trigger rollback, anchored corruption checks, exclusive document expiry, current source-editor separation and immutable replay. Browser and HTTP evidence are separate checks.

The runner creates a complete fictional packet, records a synthetic grant and independent staff review, persists one queue assignment, then revokes the consent source. Revocation atomically holds the local queue and clears its assignee. A new grant cannot revive the old review. Fresh review and enqueue create a second audited generation of the **same one local queue row**. The runner observes ten accepted audit events; no external action or real-world consent is implied.

## Synthetic-only boundary

The server holds a registry of fictional referral, patient-label, document and consent-proof fixtures for two tenants. The interface selects these fixtures; intake does not accept a patient name, clinical text, uploaded file or caller-supplied checklist. A source event must match its registered synthetic referral exactly. A selected document or proof must belong to that referral and tenant. This is a narrow schema boundary, **not a general PHI detector or privacy guarantee**. Command IDs and other protocol metadata remain plaintext and could carry caller labels. Do not submit real patient data. No real email, PDF, chart or consent record is ingested.

`DEMO_PAYER_A` requires the fictional form and order. `DEMO_PAYER_B` also requires a supporting-document fixture. `UNKNOWN_DEMO` is a closed unconfigured option that holds the packet for administrative checklist review; it is not a real payer policy. These rules are illustrative administrative fixtures, not coverage criteria.

## Clock and document selection

The default clock is fixed at **2026-10-25T12:00:00.000Z**. This allows reproducible examples on later days. It is not live monitoring, a notification service, a clinical deadline or an SLA. HTTP callers cannot override it; a trusted internal factory option supports boundary tests.

Each selected source has a registered kind, content-version identity and exclusive `validUntil`. At the exact expiry instant it cannot support readiness. Superseded or expired registered sources may be selected for inspection but hold the packet, with no fallback to a different version. A packet accepts at most one source per kind. The second referral fixture in each tenant has an expired current form to reproduce that hold. Source identities and completeness do not prove the truth or clinical adequacy of a document.

## Lifecycle and ownership

1. `intake` uses the closed referral and matching event ID. One source event has one case identity. A second new command for that event conflicts; exact original-command replay returns the current receipt without another case.
2. `setPacket` saves a new packet version containing selected document IDs and the closed payer option. `setConsent` records a matching synthetic grant/revoke proof and advances consent revision. Both require current `expectedRevision`, invalidate staff review and atomically hold any existing queue/clear assignment. A stale grant cannot undo a newer revocation; a fresh explicit grant still requires fresh review.
3. Readiness holds missing consent, unknown fictional payer, missing required kinds, superseded/expired sources and stale source/configuration. A complete packet is only ready for administrative staff review.
4. `review` binds the current packet, payer/checklist version, complete selected document metadata, consent revision/proof/source editor, packet source editor and source/config hashes. The registered reviewer must differ from intake and the current packet/consent source editors. Approval uses `packet-checked`; rejection uses `needs-follow-up`. These are fixture records, not authenticated human signatures.
5. `enqueue` rechecks exact hash, current revision, independent review, current consent and source readiness under `BEGIN IMMEDIATE`. One business case has one actual SQLite queue row. Re-enqueue after a hold needs fresh review; it updates the same row with a new generation and preserves earlier generations in event history. Repeated exact enqueue command does not create another generation.
6. `assign` selects a registered staff fixture only while that queue is currently eligible. Packet/consent changes persist a hold. Expiry or source/config changes discovered by a later read expose `effectiveStatus: held` while `status` remains the actual stored queue state; no background worker or physical update is invented. The receiver is only this local administrative queue. Clinical completion, payer submission, provider acceptance and an external uncertain-delivery protocol are intentionally excluded.

Actor and tenant labels are **unauthenticated fixture selectors**. Role and current-editor checks demonstrate local invariants; they do not enforce identity or real-world consent rights. There is no staff notification or operational authority.

## Consistent workspace and strict API

`referralDesk(DatabaseSync, options?)` uses a caller-owned database. `openReferral(path, options?)` owns its database and adds `close()`. Options accept only a trusted internal `clock` and bounded `registryRevision`. Initialization sets a five-second busy timeout before schema transactions; owned initialization failures close the handle.

Methods are `catalog`, `intake`, `setPacket`, `setConsent`, `review`, `enqueue`, `assign`, `receipt`, `state`, `audit` and `verifyAudit`. Each mutation has immutable tenant-scoped `commandId`; all updates also require current `expectedRevision`. Schemas reject unknown fields, non-finite/prototype data, malformed scalar selectors and arbitrary source/payer identities. Complete DTO examples are exercised in [core tests](referral-core.test.mjs) and the [runner](run-referral.mjs).

`state({tenant})` returns cases, queue rows, as-of time and audit anchor from one SQLite read transaction. Each case includes the current review hash, readiness and queue effective status computed in that same snapshot. The browser should reconcile its selection from this one workspace response, rather than mixing an older operation response with independently fetched state/history. `receipt` is also an audit-verified consistent read. Returned data are copies.

## Durable evidence and remaining work

A successful command appends its request, next case revision and optional queue effect to a hash-linked event, alongside a separate durable count/head anchor. Case and queue materializations are verified against replayed events before and after every mutation; a queue, case, event tail or anchor changed outside the controller fails closed. Case/queue writes, append and anchor update commit or roll back together in **one local SQLite database**, not a distributed exactly-once guarantee. The chain is unkeyed: a privileged actor who coherently rewrites all events, materializations and anchors is outside this guarantee.

Source fingerprints cover the exact core and fixture bytes, and configuration identity covers the registry, proof/document catalogs and fictional payer policies. Stale records remain readable as historical evidence but cannot authorize new work; no migration/reapproval adapter is implemented. The full MED-01 blueprint remains open: secure real intake, actual document classification and clinical/payer workflows, authenticated access, real consent/data governance, EHR/provider integration and independently recorded acceptance. No privacy, regulatory, clinical or production certification is claimed here.
