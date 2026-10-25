# LEGAL-01 synthetic administrative desk

Status: **Partial local implementation.** The complete legal-industry blueprint remains unfinished.

A supplied fictional intake pins its original party IDs. NFKC and punctuation normalization compare selected fixture names against a versioned alias/relationship register. Exact and ambiguous matches stay held; a reviewer can record follow-up but cannot clear either match. A no-match result still needs an independent, exact-fingerprint administrative review before one actual SQLite matter row can be recorded.

A recorded local matter can propose one supplied fictional date. An independent reviewer checks the exact saved date fingerprint and source reference. Only a current source with a future date at the fixed scenario clock can produce a local calendar row. A new proposal or return-for-follow-up holds the existing row. This is supplied-date administration: no statute, jurisdiction rule, legal advice, professional conflicts clearance, real representation, or actual calendar notification is implemented.

## Reproduce

From the repository root with Node.js 24+:

```powershell
node demo-lab/run-legal.mjs
node --test demo-lab/legal-core.test.mjs demo-lab/legal-ui.test.mjs demo-lab/legal-http.test.mjs
node demo-lab/server.mjs
```

Open `http://127.0.0.1:5680/industry/legal?project=LEGAL-01`. The unified project inventory links the existing LEGAL-01 row to this page; it does not add another portfolio project. Browser/DOM tests require the repository's existing `demo-lab` dependencies. The standalone core/CLI use built-in Node modules and SQLite.

The CLI asserts two saved cases, one local matter, one local calendar row, an exact-match follow-up hold, and eight valid local audit events. It runs in memory and does not send messages. Automated tests cover alias normalization, pinned party retention, exact/ambiguous holds, source-editor independence, compare-and-swap revisions, immutable command replay, restart/concurrent processes, injected SQLite rollback, anchored-history corruption, source/config drift, supplied-date expiry, lost-response recovery, stale UI responses and export freshness. These are executable local assertions, not a provider acceptance report or a recorded walkthrough.

## Operators and recovery

1. Choose `acme` and the fictional marine-services intake. Save the synthetic intake.
2. Inspect saved party IDs, relationships, graph version and fingerprint. Acknowledge the saved fingerprint, then record a no-match review using `acme-reviewer`.
3. Record the local matter. No-match results alone never create the row. A dual-role actor that edited current parties cannot review its own source.
4. Save the supplied future-date proposal. Inspect its source reference and exact date fingerprint, acknowledge it, record an independent date review, then record the local calendar row.
5. Inspect actual persisted effects and verify the audit. Export rereads audit verification and then a fresh receipt; a changed revision, derived date status, source, configuration or integrity failure blocks download.
6. Select the alias-match intake to inspect a permanent administrative hold and record professional follow-up. It cannot produce a matter row, even after an attempted party omission.

Unsaved party edits disable authority and export until saved or explicitly discarded by refresh. Choosing another date does not authorize that date until a proposal is saved and reviewed. Every mutation is followed by one fresh atomic state read; later saved revisions replace older operation responses. If a request commits but its response is lost, actions are disabled. Refresh saved state and recover the case, or retry unchanged intake with its original cached command. A new command cannot duplicate an existing source, matter or current calendar effect. Do not edit SQLite history or evidence to recover a failed check.

## Storage and HTTP contract

The server uses its existing SQLite connection. `legal_cases`, `legal_matters` and `legal_deadlines` are materialized effects; `legal_events` and `legal_head` anchor ordered commands and their hashes. Each mutation checks history/materializations inside `BEGIN IMMEDIATE`, validates the saved revision and current source/configuration fingerprints, and commits all effects together. One case is allowed per tenant/source fixture, one matter row per case, and one current local calendar row per case with a generation counter. Independent processes serialize through SQLite and stale revisions fail.

`GET /api/industry/legal/catalog` returns only supplied synthetic fixtures. Other operations use `POST /api/industry/legal/<operation>` with `Content-Type: application/json` and `X-Demo-Client: local-showcase`. The shared host checks its exact loopback Host/Origin, limits JSON bodies, and exposes only manifest-listed operations and static assets. It does not serve core source or fixture files. These browser-intent checks do not authenticate users.

| Operation | Input beyond tenant / technical command ID |
|---|---|
| `intake` | operator fixture and registered source ID |
| `set-parties` | case ID, expected revision, operator and selected party IDs; pinned source parties cannot be removed |
| `review-conflict` | case ID, expected revision, independent reviewer, expected conflict hash, approve/return and matching closed reason |
| `create-matter` | case ID, expected revision, operator and exact reviewed conflict hash |
| `propose-deadline` | case ID, expected revision, operator and supplied date fixture ID |
| `review-deadline` | case ID, expected revision, independent reviewer, exact date hash, approve/return and matching closed reason |
| `record-deadline` | case ID, expected revision, operator and exact reviewed date hash |
| `receipt` | tenant and case ID, without command ID |
| `state`, `audit`, `verify-audit` | tenant only, without command ID |

See the [closed operation manifest](industry-desks/legal.json), [core](legal-core.mjs), [fixtures](legal-fixtures.mjs), [UI](legal-ui.mjs) and [CLI](run-legal.mjs) for exact field names. Unknown fields, foreign fixtures, caller-supplied clock/approval fields and malformed JSON are rejected. Command IDs and other protocol metadata are plaintext bounded identifiers, not private-data detection.

## Evidence boundaries and unfinished scope

The default clock is fixed at `2026-10-25T12:00:00.000Z`. No live deadline monitor runs. An injected trusted clock exists for adverse-case tests; an HTTP caller cannot set it. Expiry is exclusive: a due date at or before the clock is held. The local hash chain is an integrity check, not an external signature or protection against a privileged operator rewriting all local storage and source.

All names, relationships, sources, reviewers and dates are fabricated fixtures. Actor labels can be selected by anyone who runs the demonstration; they are not authenticated identities or a professional's actual decision. There is no private correspondence ingestion, arbitrary document upload, fuzzy entity model, complete conflict graph, real attorney review, jurisdiction/statutory date engine, PostgreSQL runtime adapter, hosted platform import, provider acceptance, production result or recorded video. The older [bounded rules runner](project-builds/LEGAL-01/build/demo.js) and copied workflow remain separate compatibility examples; their simulated contact handoff is not used by this SQLite desk and is not a matter-management integration.

Before any real use, the open blueprint requires qualified review of actual rules, authenticated intake/review permissions, real source provenance, approved retention/access controls, jurisdiction-specific date validation, platform adapters and recovery acceptance. No such acceptance is inferred from local tests. See the [project overview](project-builds/LEGAL-01/README.md), [SOP](project-builds/LEGAL-01/SOP.md) and [build runbook](project-builds/LEGAL-01/build/README.md).
