# EA-01 source-bound executive commitments

Status: **partial synthetic local implementation; authenticated source/provider acceptance pending**.
Version: 1.1 | Owner: portfolio maintainer

Video walkthrough remains pending. The [older recording script](walkthrough-script.md) is not evidence that this desk has been recorded.

## 1. Purpose

Convert one supplied synthetic source-family commitment into an inspectable, independently reviewed local task while preserving the case's current fixture grants.

## 2. Business Problem

Source versions and recipient permissions can change after a commitment is proposed. An older approved task must not silently retain authority after a source, recipient, window or ACL edit.

## 3. Business Goals

Make source provenance, access changes, exact review and actual local effects reproducible. Do not infer real executive authority, confidentiality or provider activity from fixture selectors.

## 4. Business Requirements

One immutable case per tenant/source family; one selected supplied commitment per case; source-authorized current reads; independent exact-hash review; local task generation and overlap checking; durable atomic audit.

## 5. Functional Requirements

Ingest a registered source, revise its supplied choice/recipient, grant/revoke fixture access as its custodian, approve/return as an independent reviewer and record a reviewed local task. Recover only currently accessible evidence.

## 6. Technical Requirements

Node.js 24+ with node:sqlite, the intact public source tree and existing lab dependencies for DOM/server tests. SQLite is the executed persistence target; the older PostgreSQL DDL is proposed only.

## 7. Dependencies

[Core](../../executive-core.mjs), [closed fixtures](../../executive-fixtures.mjs), [shared loopback server](../../server.mjs), [registered desk manifest](../../industry-desks/executive.json) and [operator/API runbook](../../EXECUTIVE.md).

## 8. Systems Used

JavaScript rule core, SQLite event/materialization tables and a local browser UI. The older n8n/GHL-shaped contact wrapper is a separate retained demo and does not execute this task lifecycle.

## 9. Roles

Fixture assistant/principal may propose and record. Principal/delegate may review when independent. Only the source custodian may alter its case ACL. Observer starts without source access. All are untrusted selector labels, not authenticated identities.

## 10. Responsibilities

The operator inspects supplied source and exact commitment; an independent reviewer inspects fingerprint/ACL/window; the custodian manages fixture grants. A real security/domain owner must validate production requirements separately.

## 11. Workflow Overview

Closed source selector -> authorized source-family case -> exact independent review -> SQLite task. Source/proposal/access changes -> held task + cleared review -> fresh review before another generation.

## 12. Detailed Workflow Steps

Use the [step-by-step path](../../EXECUTIVE.md): intake current A v2 as assistant, recover/review as principal, recover/record as assistant, revoke/regrant as principal, independently re-review as delegate and record generation 2.

## 13. Decision Tree

Superseded, expired, future source, inaccessible recipient or started supplied window: hold. Missing/stale/non-independent review: no task. Owner overlap: reject without effects. Current exact independent approval: one task generation may be recorded.

## 14. Automation Logic

The fingerprint binds source/version, commitment/window, recipient, proposal revision, complete current ACL and editors. Review cannot be by intake, current proposal or current access editor. Source-version revision preserves the current ACL.

## 15. Trigger Conditions

Manual UI/API/CLI actions only. The fixed 2026-10-25T12:00:00.000Z scenario clock is not live monitoring. No schedule, real inbox connector, outgoing message or public webhook is installed.

## 16. Data Validation

Exact bounded plain-JSON schemas, registered tenant-bound scalar identifiers, closed source/commitment/recipient/reason choices, canonical supplied UTC instants, expected revision and exact review hash. Arbitrary source text/uploads and request-provided clocks are rejected.

## 17. Error Handling

Every mutation uses one immediate SQLite transaction. Invalid input, stale CAS, source drift, overlap or SQL failure leaves effects/audit unchanged. The UI drops actionable receipts when current authority cannot be established.

## 18. Retry Logic

(Tenant, commandId) binds one immutable intent. Exact replay returns current accessible state; another payload under the same key conflicts. Lost intake responses can retry the unchanged cached intent. Refresh/recover before any new task intent.

## 19. Fallback Procedures

Stop at a hold and recover the accessible current case. Resolve supplied source/recipient/window choices or use custodian recovery. No bypass turns a denied recipient, stale receipt or absent independent review into authority.

## 20. Manual Override

No approval bypass or real external override exists. The custodian may alter fixture access with CAS, which invalidates review and holds the actual task. It cannot revoke its own recovery grant.

## 21. Exception Handling

Returned review records follow-up only after readiness holds are resolved; it is never task authority. Superseded/source-time/recipient holds require a saved corrected proposal or explicit grant, then a fresh independent review.

## 22. Notifications

No email, calendar invitation, provider task or real message is sent. The saved task label explicitly says local follow-up only. Future provider adapters require separate authorization and acceptance evidence.

## 23. Audit Logs

Successful mutations append an unkeyed SHA-256 chain with immutable request identity and durable head/count while writing exact case/task/decision materializations. Reads verify both history and effects. Global count/hash are public protocol metadata; current ACL filters event summaries.

## 24. Security

Loopback Host/Origin checks, fixed operation/static allowlists and strict schemas constrain this local synthetic demo. They do not establish real authentication, encryption, confidentiality, tenant isolation against a privileged operator or secure production hosting.

## 25. Permissions

Every receipt/state/task/decision/event summary uses the case's current fixture allowlist. Revoked actors lose current reads and command replay contents. Role selectors can be changed by the presenter; this is policy simulation only.

## 26. Compliance

No privacy, regulatory or delegated-authority certification is asserted. Real correspondence policies, data retention, source consent and organizational access rules need an authorized owner's review and real acceptance evidence.

## 27. Performance Metrics

The targeted tests report local case assertions, not production throughput or SLA. Audit verification scans history and materializations; no production-size performance result is claimed.

## 28. KPIs

Useful future measures include reviewed commitment turnaround, stale-authority rejection and reconciled follow-up completion. No measured client baseline, adoption rate or time saving is available.

## 29. Testing Procedure

Run [core/DOM/HTTP tests and CLI](build/README.md). Inspect revocation, regrant, source drift, exact replay, separate-process restart, writer race, injected SQL rollback, neutral catalog and export/delayed-response races. Coordinator runs complete quality/governor gates after freezing source.

## 30. Deployment

Local loopback execution only. No deployment authorization is implied by a green local test. Real source/provider adapters, authenticated identities, retention, privacy review, monitored recovery and an executed persistence adapter remain gates.

## 31. Maintenance

Changing core or fixtures invalidates persisted source authority. Preserve historical evidence, restart with reviewed sources and prepare fresh cases rather than editing records to make hashes green. Rerun meaningful tests and final governor after source changes.

## 32. Version History

1.0 (2026-09-10): older bounded fixture/wrapper and proposed PostgreSQL artifacts. 1.1 (2026-10-25): partial source/version/ACL-bound local desk with reviewed SQLite task effects and adverse-case tests.

## 33. Future Improvements

Authenticated permission-aware inbox/meeting intake, cross-channel commitment identity, general multi-commitment extraction, timezone/DST and provider calendar reconciliation, delegated provider follow-up lifecycle, encryption/retention, PostgreSQL adapter acceptance, recorded walkthrough and observed business outcomes remain open.

## 34. Appendix

SQLite runtime tables: executive_cases, executive_tasks, executive_decisions, executive_events and executive_head. The [older schema.sql](build/schema.sql) is a proposed PostgreSQL artifact and does not define these executed runtime tables.

## 35. Troubleshooting

Connection refused: start the local lab on 5680. No case visible: inspect the selected fixture identity and current grants. Overlap: inspect existing accessible tasks and choose the adjacent supplied slot. Stale CAS: refresh/recover; do not forge a revision or reuse an edited intent.

## 36. Recovery Procedure

After a lost response, refresh accessible cases and recover the immutable family case. A successful prior task remains one row. After revocation, custodian recovery remains available. Regrant clears old review authority and needs an independent fresh reviewer.

## 37. Frequently Asked Questions

Does changing actor prove identity? No. Is the source text real? No, all supplied examples are synthetic. Is a task a real calendar booking? No. Does the older n8n contact wrapper prove this new desk's provider integration? No.

## 38. Technical Notes

Browser exports re-read receipt and actor-filtered atomic state/audit, reject detected revision/access drift and exclude inaccessible rows. A saved downloaded file cannot be remotely revoked. Local unkeyed integrity detects inconsistent edits, not coherent privileged rewrites.

## 39. Business Notes

The slice is executable evidence for one proposed follow-up workflow. It does not claim a complete chief-of-staff platform, actual executive decisions, real confidential correspondence handling or client delivery history.

## 40. Estimated Time Savings

Unmeasured. Compare observed manual and assisted review effort with comparable volume and exception handling before publishing a saving.

## 41. ROI Analysis

No ROI value is asserted. Any later calculation must use observed volume, actual net time saved and infrastructure/review costs, not synthetic fixture counts.

## 42. Risk Assessment

Key risks are stale task authority, permission edits reviving approval, unauthorized source leakage, source-version confusion and overlap. Local tests cover bounded defenses; real authentication, privacy, provider recovery and scale remain unverified.

## 43. Lessons Learned

Current source access must govern both operational actions and evidence recovery. Hash/revision authority, atomic held effects and independent review must move together; a role selector cannot supply production identity.

## 44. Related SOPs

[Executable scope and contract](../../EXECUTIVE.md), [build runbook](build/README.md), [project overview](README.md), [portfolio verification](../../VERIFICATION.md) and [project build index](../README.md).


The [reported completion runbook](../../EXECUTIVE-COMPLETION.md) covers terminal local task completion, current access/review checks and historical preservation. It does not verify real work, reopen tasks or synchronize provider calendars.
