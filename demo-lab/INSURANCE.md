# INS-01 synthetic loss-evidence desk

**Status: partial local administrative slice.** This adds a durable packet and adjuster-queue workflow to the existing scenario/workflow demonstration. It does not complete the full insurance flagship.

## Reproduce

From the repository root with Node.js 24 or newer and the existing demo-lab dependencies:

```powershell
node --test demo-lab/insurance-core.test.mjs demo-lab/insurance-ui.test.mjs demo-lab/insurance-http.test.mjs
node demo-lab/run-insurance.mjs
node demo-lab/server.mjs
```

Open `http://127.0.0.1:5680/industry/insurance?project=INS-01`, also reachable through the unified project inventory. The acceptance CLI uses a real in-memory SQLite database and asserts one queue row, revocation clearing its assignment, fresh independent review after regrant, generation 2 and a valid ten-event local audit chain. It does not contact an insurer. These are reproducible assertions, not production throughput results. The browser desk uses the server's persistent local store.

## Operator walkthrough

1. Register `event-acme-01`. Save the current incident report and policy-reference fixtures, then record the synthetic grant.
2. The reviewer fixture must differ from the intake, current packet and consent editors. Check the acknowledgement for the exact saved fingerprint, then approve the administrative route. The operator can enqueue and assign the actual local row.
3. Record synthetic revocation. The same transaction clears review, holds the queue and removes its assignee. Regrant changes the fingerprint and requires fresh independent review. Re-enqueue updates one row with a new generation.
4. Register `event-acme-01-repeat`. It is an exact repeated source, never another business loss. An independent reviewer can link only its registered current primary case. Consent editing is disabled and rejected on every exact-repeat case, before and after linking. Recover the primary from history to edit consent with its current revision. Linking does not merge evidence or consent.
5. `event-acme-02` has an ambiguous identity signal. It requires an independent explicit distinct-loss reconciliation. That resolver cannot approve the resulting packet; choose the separate dual-role reviewer fixture after its sources were edited by the intake fixture.
6. `event-acme-03` carries a supplied date outside the fictional policy window. The visible flag requires `adjuster-exception` and `date-exception-routing`. A normal route is rejected. Neither route approves or denies coverage.

Missing, historical or expired source manifests keep the packet held. Expiry is exclusive at the supplied `validUntil`. The fixed scenario clock is `2026-10-25T12:00:00.000Z`, not live monitoring. A trusted test clock demonstrates expiry. Stored queue status may remain assigned while its receipt exposes `effectiveStatus: held` after clock expiry; reads do not pretend to perform background writes.

## API and durable effects

`GET /api/industry/insurance/catalog` returns closed synthetic source, policy, evidence, proof and actor options. `POST /api/industry/insurance/{operation}` requires the shared loopback Host/Origin and `X-Demo-Client: local-showcase` intent checks. Those checks are not authentication.

| Operation | Required fields beyond tenant |
| --- | --- |
| intake | commandId, actor, eventFixtureId |
| set-packet | commandId, actor, caseId, expectedRevision, policyId, evidenceIds |
| set-consent | commandId, actor, caseId, expectedRevision, decision, proofId |
| resolve-duplicate | commandId, reviewer, caseId, expectedRevision, expectedHash, decision, primaryCaseId, primaryExpectedRevision, reasonCode |
| review | commandId, reviewer, caseId, expectedRevision, expectedHash, decision, route, reasonCode |
| enqueue | commandId, actor, caseId, expectedRevision, expectedHash |
| assign | commandId, actor, caseId, expectedRevision, assignee |
| receipt | caseId |
| state, audit, verify-audit | no additional fields |

Every body has exact allowed keys. No claimant name, claim narrative, upload, address or arbitrary policy document is accepted. Command/case identifiers are technical metadata, not privacy-filtered content. Do not put private data in identifiers. Only registered tenant-bound fixtures can supply business evidence, actor roles or consent proof labels.

Each mutation acquires `BEGIN IMMEDIATE`, verifies the complete audit chain and durable head against materialized cases/queue, enforces current case revision, records its immutable command intent and commits case/queue/event/head together. The queue key is tenant plus registered business-loss identity. Replay of the same command returns current authority without adding effects; a changed intent using the same ID fails. Original source event uniqueness and two-process serialization prevent duplicate intake. Queue/event/head failure tests demonstrate rollback. Restart tests use another real Node process.

Review hashes bind source/configuration bytes, supplied policy/evidence, current consent revision, packet version and duplicate resolution. All current source editors and duplicate resolver are excluded from final packet review. Source drift leaves inspectable history but invalidates authority. Separate tenant reads cannot select another tenant's case. Actor strings remain a simulation; anyone operating this local exercise can choose a fixture role.

## Browser evidence and recovery

The UI renders user-visible values with text nodes. An unsaved fixture selection disables approval, routing, consent mutations and export. Refresh retains a draft and clears acknowledgement. History recovery reads a fresh atomic workspace, including the currently selected case and queue. A failed mutation clears selected authority. A response lost after commit offers exact frozen-intent retry, which recovers the one saved case. Forgetting local retry does not roll back the server; recover history first.

Export verifies the audit then reads an atomic current workspace. Revision, fingerprint, tenant/context and head must still match; concurrent revocation or changed authority prevents export. It exports synthetic evidence and local audit metadata only. No UI screenshot or real-user usability study is claimed by the automated DOM suite.

## Evidence boundaries and remaining flagship scope

The included tests exercise real SQLite/DOM/HTTP behavior: 38 core cases, 21 actual-core DOM cases and four loopback HTTP cases at this implementation checkpoint. Broader repository gates and independent review are coordinator tasks and must be recorded separately after they run.

There is no real policy interpretation, fraud detection, payout, coverage authorization, claimant verification, signed consent verification, insurer integration, production access control or compliance guarantee. The unkeyed audit chain/head detects inconsistent local changes and truncation, not a coherent rewrite by a privileged database/code owner. No real photos, client files, OCR or model output are processed. Full FNOL normalization across real channels, authenticated access, insurer/adjuster platform adapters, PostgreSQL migration/execution, operational monitoring and recorded walkthrough acceptance remain open. This local slice is a useful prerequisite, not completion of those dependencies.

See the [project overview](project-builds/INS-01/README.md), [SOP](project-builds/INS-01/SOP.md), [original copied-workflow runbook](project-builds/INS-01/build/README.md), [core](insurance-core.mjs), [fixtures](insurance-fixtures.mjs), [CLI](run-insurance.mjs) and [manifest](industry-desks/insurance.json).
