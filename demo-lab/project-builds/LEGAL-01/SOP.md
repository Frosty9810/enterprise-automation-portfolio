# LEGAL-01 Matter Intake, Conflict Check and Supplied-Date Desk

Status: **Partial local implementation; actual legal operations and full blueprint remain unfinished.**
Version: 2.0 | Updated: 2026-10-25 | Evidence: synthetic local SQLite operations

**Video walkthrough:** Pending recording. The [existing script](walkthrough-script.md) predates this desk and does not prove its acceptance.

## 1. Purpose

Make the local administrative path from supplied intake to reviewed matter and supplied-date record executable and inspectable. Keep every real legal decision outside this synthetic demonstration.

## 2. Business Problem

A name-match summary alone is insufficient authority to create even a local demonstration matter. Source parties, alias relationships, reviewer independence and the exact reviewed revision must remain visible through the actual write.

## 3. Business Goals

Demonstrate durable provenance, permanent exact/ambiguous holds, independent source-bound reviews, single local effects and recoverable uncertainty. No production throughput, savings or legal outcome is claimed.

## 4. Business Requirements

Pin the original source party IDs. Exact or ambiguous relationships cannot be cleared. A no-match case needs independent review before one local matter row. Only independently reviewed current future supplied dates may create a local calendar row.

## 5. Functional Requirements

Select closed tenant/source/party/date fixtures, save intake, edit additional parties before recording a matter, inspect relationships, review exact hashes, record local effects, recover saved cases, verify integrity and export a freshly checked receipt.

## 6. Technical Requirements

Node.js 24+ with built-in SQLite. Browser tests use the existing demo-lab jsdom dependency. The server binds loopback; PostgreSQL, n8n/GHL and real calendar/matter providers are not dependencies of this new desk.

## 7. Dependencies

The [core](../../legal-core.mjs), [fixtures](../../legal-fixtures.mjs), [manifest](../../industry-desks/legal.json), [shared local server](../../server.mjs) and [desk runbook](../../LEGAL.md) define the checked scope.

## 8. Systems Used

The actual desk uses local HTTP, browser controls and SQLite cases/matters/deadlines/events/head tables. The older rules script and copied n8n workflow remain separate compatibility examples with a simulated contact handoff.

## 9. Roles

Registered operator fixtures save intake, party selections, local matters and date proposals. Reviewer fixtures record exact-hash administrative review. A dual-role label cannot review intake/current party edits or a date proposal it supplied. Labels are not authenticated users.

## 10. Responsibilities

The presenter keeps fixture assumptions visible. Independent AI reviewers inspect reliability and presentation; a deterministic governor cross-checks local sources. None of these records is a qualified professional clearance or human legal signoff.

## 11. Workflow Overview

Supplied source -> pinned parties -> normalized alias/relationship check -> permanent match hold or independently reviewed no-match -> one SQLite matter -> supplied date proposal -> independent exact-date review -> local calendar row. Follow-up never overrides holds.

## 12. Detailed Workflow Steps

Run the [CLI](../../run-legal.mjs), start the server, open `/industry/legal?project=LEGAL-01`, save marine-services intake, inspect/acknowledge the conflict hash, record review, record matter, propose supplied future date, review its hash, then record calendar. Inspect effects and audit. The alias-match source must remain held.

## 13. Decision Tree

Any exact/ambiguous fixture relationship stops matter creation. No match without an independent current review also stops it. A date with no matter, superseded source, elapsed due time, stale fingerprint or missing independent review cannot create calendar authority.

## 14. Automation Logic

[legal-core.mjs](../../legal-core.mjs) normalizes names with NFKC, folds case/punctuation, compares registered aliases and flags shared long tokens as ambiguous. This is a closed deterministic fixture graph, not complete entity resolution or a trained matching model.

## 15. Trigger Conditions

Only explicit local API/UI/CLI operations write. No background deadline scheduler, real webhook, private inbox, professional engagement or external action is installed.

## 16. Data Validation

Exact JSON schemas reject unknown fields and caller-supplied authority/clock values. Registered tenant-scoped IDs select server-held fixtures; original parties cannot be omitted. Technical identifiers are plaintext metadata, not a privacy classifier or PHI/client-data detector.

## 17. Error Handling

Rejected writes preserve prior materializations and audit count. SQL failures roll back cases, effects, events and the durable head atomically. UI transport/read failures discard actionable authority and require recovery instead of retaining a green old receipt.

## 18. Retry Logic

Each immutable command ID is bound to the operation and exact request hash. Exact replay returns the current checked case. A changed intent cannot reuse that ID. A new ID cannot duplicate a source case, matter, or already recorded current calendar effect.

## 19. Fallback Procedures

Keep exact/ambiguous relationships held and record professional follow-up. Past/superseded dates can be returned for follow-up without calendar authority. If local evidence is incomplete, refresh/recover; do not change evidence flags to force acceptance.

## 20. Manual Override

There is no override to clear matched relationships, remove pinned parties, bypass independence or post an unreviewed date. Changing fixtures/source is a new reviewed implementation change and invalidates prior source-bound authority.

## 21. Exception Handling

Additional parties may change before a matter is recorded and invalidate the old review. Matter parties become immutable in this slice. New date proposals hold existing calendar authority and require fresh review; prior rows remain visible with held effective status.

## 22. Notifications

No messages, external calendar invites, reminders or client communications are sent. A local calendar row is a SQLite effect only. Notification adapters and recipient permissions require future implementation and acceptance.

## 23. Audit Logs

`legal_events` binds command/request/effect lineage and a previous hash. `legal_head` anchors count/head; scans compare materialized cases, matters and deadlines to audited effects. Truncation, changed rows and missing anchors fail. This is not externally signed or privileged-admin tamper resistance.

## 24. Security

The server enforces exact loopback Host/Origin, browser-intent header, bounded JSON and closed asset/operation allowlists. Core and fixture source are not static endpoints. These are local browser boundaries, not authentication, production authorization or a security guarantee.

## 25. Permissions

Tenant fixture membership and source-editor independence are enforced in the core. Anyone running the lab can choose actor labels. Real identity verification, attorney authorization, private matter access, key/secret management and retention controls are unimplemented.

## 26. Compliance

All sources and dates are fabricated. No legal, regulatory, professional or privacy compliance certification is asserted. Actual jurisdiction rules, conflict clearance and any real representation require qualified professional procedures outside this desk.

## 27. Performance Metrics

Tests measure success/failure of bounded local operations, restart/concurrency and integrity checks. No general matching recall, production latency, scale, availability or live deadline performance has been measured.

## 28. KPIs

Observed local proof is case/effect counts, independent review binding, rejected invalid actions and verified event lineage. Real reviewer workload, conflict recall and time saved need a separately collected, qualified baseline.

## 29. Testing Procedure

Run `node --test demo-lab/legal-core.test.mjs demo-lab/legal-ui.test.mjs demo-lab/legal-http.test.mjs` from repository root. Tests use real SQLite, actual-core DOM, loopback HTTP, independent processes and injected rollback/corruption. Run repository quality/governor after source freeze; do not claim unrun gates.

## 30. Deployment

[Build runbook](build/README.md) documents local startup. No deployment is performed. Authenticated intake, reviewed real rules, external adapter recovery, provider acceptance and production operational ownership remain prerequisites.

## 31. Maintenance

After code/fixture changes, rerun the entire applicable test suite and governor. Prior source/config fingerprints become historical read-only authority. Reconcile stored evidence honestly; do not rewrite event history to revive a past review.

## 32. Version History

Version 1.0 (2026-09-10): bounded rules example and proposed PostgreSQL schema. Version 2.0 (2026-10-25): independent SQLite desk, pinned-source conflict controls, reviewed supplied dates, UI/recovery/export and executable adverse-case tests.

## 33. Future Improvements

The wider blueprint still needs real authenticated intake, complete entity resolution and professional conflict processes, jurisdiction-specific date rules, matter/calendar integrations, PostgreSQL adapter execution, tested recovery, measured outcomes and a recorded walkthrough.

## 34. Appendix

SQLite effect identity is `tenant:caseId`. One source fixture creates one case; one matter and one current calendar row belong to that case. Calendar generations retain reviewed replacement history through events. [schema.sql](build/schema.sql) is a separate proposed PostgreSQL model, not this runtime schema.

## 35. Troubleshooting

Connection refused: start `node demo-lab/server.mjs` and open loopback5680. Missing jsdom: use the repository demo-lab dependency environment. Unknown fixture: inspect GET catalog. Stale revision/source or held receipt: refresh and inspect saved evidence; no bypass is provided.

## 36. Recovery Procedure

After lost response, refresh saved state and click the existing case. Unchanged intake can retry its cached command without duplication. The UI reads one fresh atomic state after mutation, replacing a late operation receipt with the latest stored revision. Export rereads verification and receipt and refuses changed evidence.

## 37. Frequently Asked Questions

Does no-match imply real clearance? No. Does the date row calculate a statutory deadline or send an invite? No. Is a fixture reviewer authenticated? No. Does the new desk write SQLite effects? Yes. Does it execute the old copied n8n workflow or PostgreSQL schema? No.

## 38. Technical Notes

Mutations use `BEGIN IMMEDIATE`, anchored scans and exact expected revisions. SHA-256 fingerprints include source/configuration and versioned supplied evidence. Default time is fixed `2026-10-25T12:00:00.000Z`; only trusted test code injects a clock. Due time is exclusive: at or before it, calendar authority is held.

## 39. Business Notes

The local matter label explicitly denies professional clearance and real representation. The complete LEGAL-01 industry project remains partial. Neither this fixture demonstration nor the old simulated contact handoff establishes client delivery or hosted integration.

## 40. Estimated Time Savings

Unmeasured. Do not infer savings from a passing synthetic workflow. A qualified operating study must compare real administrative volume and review time with an approved manual baseline.

## 41. ROI Analysis

No ROI value is claimed. Future calculation must use observed benefit and actual review, integration, infrastructure and maintenance costs. There are no paid provider calls in this local delivery.

## 42. Risk Assessment

Primary risks are treating a closed no-match as professional clearance, a supplied date as a statutory calculation, fixture roles as real permissions, a SQLite calendar row as a sent notification, or local hashes as external signatures. The UI/runbook label these boundaries and the implementation holds invalid effects.

## 43. Lessons Learned

Pin source parties rather than trusting an editable current selection; bind reviews to exact versioned evidence; replace stale asynchronous receipts with atomic current state; show actual persisted effects; and preserve professional follow-up instead of silently clearing uncertainty.

## 44. Related SOPs

[Portfolio verification](../../VERIFICATION.md), [build status](../../BUILD-ARTIFACT-STATUS.md), [project overview](README.md), [executable desk documentation](../../LEGAL.md) and [local build runbook](build/README.md).

*Part of the Enterprise Automation Portfolio. See the [project build index](../README.md).*
