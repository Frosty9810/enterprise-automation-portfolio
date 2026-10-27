# CON-01: reviewed full local commitment reversal

This extension undoes the full cost of one already committed synthetic change order. It preserves the original positive posting and appends one linked negative posting, atomically returning those exact cents to the local site budget. It does not make payments or refunds, cancel contracts, adjust schedules, notify vendors, or authorize site work.

Run from the repository root with Node.js supporting `node:sqlite`:

```sh
node demo-lab/run-construction-reversal.mjs
node --test demo-lab/construction-core.test.mjs demo-lab/construction-reversal.test.mjs
```

The CLI uses a fresh in-memory SQLite database. It verifies synthetic documents, independently approves and records a USD1250.00 commitment, revokes the current insurance evidence, proposes a full reversal, collects new manager and finance approvals and posts the linked USD-1250.00 entry. Exact retry creates no second credit. The final local budget is USD10000.00 allocated, USD0.00 net committed and USD10000.00 remaining; current compliance readiness stays held. Thirteen successful synthetic audit events are observed. These numbers are fixture evidence, not business outcomes.

## Explicit workflow

1. `proposeReversal({commandId,tenant,orderId,actor,expectedRevision,reasonCode,note})` requires a current configured operator, a fresh historically committed order and its current integer revision. The reason is exactly `change-cancelled` or `scope-withdrawn`; the bounded nonempty note records the operator's synthetic explanation. There is one immutable proposal per order. The caller cannot select a credit amount or an arbitrary ledger entry.
2. `reviewReversal({commandId,tenant,orderId,reviewer,role,expectedRevision,expectedHash,decision,note})` requires role `project_manager` or `finance`, decision `approve` or `reject`, and the current revision plus `reversalHash`. Both roles must use distinct configured fixture labels, independent of both the original order requester and the reversal requester. A new command may replace a prior decision before posting; its prior decision remains in append-only event history. A rejection blocks posting until a new valid approval replaces it.
3. `recordReversal({commandId,tenant,orderId,actor,expectedRevision,expectedHash})` requires a configured operator, the current revision/fingerprint and both independent approvals. One SQLite transaction appends the negative entry, updates the order and budget, and anchors the audit event. A failed SQL statement rolls back all these effects.

All request objects accept exactly the documented keys. `expectedHash` is the current view's `reversalHash`, not the original cost review hash. Each new intent uses a new command ID and current revision. Reusing an identical command returns the latest receipt without another event or credit, including after later revisions or process restart. Reusing its ID with changed content conflicts. Following an unknown response, retry the exact original object; changing its revision is a different intent.

The proposal hash binds the original exact positive entry, proposal identity, requester, reason/note, timestamp and source/config identities. Reviews and the eventual posting do not change that hash. Current certificate approval, revocation and expiry do not participate: returning a historical cost must remain possible when compliance documents are held. Changing the implementation, fixture bytes or registry revision makes new authority stale and prevents fresh reversal mutations; reads retain historical entries. Reopening old records does not reapprove them. Core source identity already includes the core and fixture files, so this implementation update also invalidates earlier stored authority under the existing freshness policy.

## Receipts and ledger identity

`status` remains `committed` for every historically committed order, including after reversal. `commitment` remains the exact original positive entry. Separate view fields are:

- `reversalStatus`: `not-proposed`, `pending`, `ready`, or `reversed`.
- `reversalHash`: null before proposal, otherwise its exact fingerprint.
- `reversalReviewsCurrent`: both current independent approvals bind the fresh proposal.
- `reversal`: absent on legacy/unproposed rows; otherwise version 1, requester, reasonCode, note, originalEntryId, originalEntryHash, sourceHash, configHash, proposedAt, reviews and `entry` (null until posted).

The negative `reversal.entry` has `kind: 'full-reversal'`, ID `tenant:reversal-orderId`, `reversesEntryId` pointing to the original, its original-entry hash, the same tenant/site/subcontractor/order/currency/version, the exact negated amount, zero schedule impact, proposal/review identity and the posting actors/time. A completed reversal cannot be edited, proposed again or reversed again. Old cost review, revise and commitment actions remain blocked whenever the original commitment exists.

The scan reconstructs audited effects and requires exact materialized rows and anchored history. It checks that every negative links one existing positive of the same context and exact magnitude, and that the proposal, approvals and posted entry agree. Duplicate, orphan, partial, chained and mismatched entries fail closed. The signed ledger must reconcile to the configured budget with net committed cents between zero and its allocation. Credited capacity can then be consumed by another independently reviewed order. These are unkeyed local integrity checks; a fully coherent privileged database/history rewrite is outside their guarantee.

## Evidence and limits

The targeted suite runs 63 tests: 50 existing construction regressions plus 13 reversal tests. New cases exercise independent role/requester exclusions, rejected approvals and replacement, revision/hash/schema failures with unchanged tables, original preservation, exact replay, held-document undo, credit reuse, native file reopen/config drift, materialization tamper, SQL-trigger rollback and two actual independent Node processes racing to post one reversal. Browser/HTTP tests and independent AI review are separate evidence, reported by the delivery coordinator.

This is a local exact-cents business slice. It has no real authentication, accounting/tax treatment, partial credits, payment integration, contract acceptance, schedule reversal or external provider acceptance. Manually supplied synthetic source content and role names are not proof of real-world cancellation or authorization. The existing construction UI/API and original JSON workflow remain available; broader CON-01 requirements stay open in the portfolio inventory.
