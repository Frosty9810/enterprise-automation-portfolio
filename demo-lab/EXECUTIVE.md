# EA-01 source-bound executive follow-up

Status: **partial local implementation**. This is a closed synthetic permission and review simulation. It extends the older commitment/decision-register fixtures; it does not complete real inbox or meeting ingestion, authenticated correspondence controls or provider follow-up.

## Run and inspect

Node.js 24+ is required for `node:sqlite`. From the repository root:

```powershell
node demo-lab/run-executive.mjs
node --test demo-lab/executive-core.test.mjs demo-lab/executive-ui.test.mjs demo-lab/executive-http.test.mjs
node demo-lab/server.mjs
```

Open [the local executive desk](http://127.0.0.1:5680/industry/executive?project=EA-01). The unified 73-entry inventory links the existing EA-01 entry here; registering this desk adds no project count. The CLI uses an in-memory store and exits without a provider request. The normal server shares its local SQLite store with the other desks.

## Reproducible operator path

1. Keep `acme-assistant`, select current source `src-acme-a-v2`, choice 1 and recipient `acme-assistant`, then intake. Inspect the supplied source contents, ACL and full fingerprint. The local task is absent.
2. Switch to `acme-principal`. The page immediately clears source contents. Recover the accessible case, inspect its exact saved values, check the acknowledgment and approve.
3. Switch back to `acme-assistant`, recover, and record. One actual SQLite task row is now active; there is no real calendar booking or sent message.
4. Switch to `acme-principal`, recover, and revoke `acme-assistant`. The existing task is stored held and its review is cleared in the same transaction. The assistant's subsequent receipts, cases, tasks, decision register and event summaries exclude the source.
5. Grant the assistant again. The former approval remains invalid. The principal edited the ACL and cannot approve its own access change. Recover as `acme-delegate` and record a fresh independent approval, then recover as assistant and record generation 2. There is still one task row.
6. Switch to observer. No source, task or decision content is visible. Global event count/head hash and the restricted case count are deliberately public protocol metadata in this simulation. These are not a production confidentiality claim.

The CLI asserts the same review/revoke/regrant/review path: one task, generation 2, two decision rows and seven valid audit events. Random command/case IDs make its final head hash vary. It also asserts exact task replay is effect-free and old authority cannot create another task.

## What executes

- [Fixture registry](executive-fixtures.mjs) supplies two tenants, registered actors, versioned source families and two closed commitment windows per source. No arbitrary correspondence, task text, recipient email or file-upload field is accepted.
- [Core](executive-core.mjs) enforces tenant-bound exact schemas, immutable `(tenant, commandId)` intents, revision compare-and-swap, one case per source family, source/configuration hashes and independent exact-fingerprint review. The current family case contains one chosen commitment; this is not general NLP extraction or reconciliation of every commitment in a source.
- The fingerprint includes source version, supplied commitment, recipient, proposal revision, complete ACL revision/allowlist and current editors. Review differs from the intake, current proposal and access editors and requires current source access.
- Only the registered source custodian may change a case ACL. It cannot remove its own recovery grant. Revision changes preserve the current ACL, so selecting a source version does not resurrect a revoked actor. A change clears review and holds the actual task.
- A supplied superseded source, expired/not-yet-current source, inaccessible proposed recipient or started task window holds readiness. The fixed scenario time is `2026-10-25T12:00:00.000Z`; this is not background monitoring. A trusted injected clock exists only for tests. Source expiration derives an effective held status on reads without claiming an unperformed background write.
- An approved current proposal records a SQLite task and generation. Another stored active task for the same supplied owner cannot overlap its half-open UTC window. Adjacent supplied windows are accepted. This is local fixture collision checking, not external calendar availability or timezone/DST inference.
- Every successful mutation atomically writes case/task/decision materializations, an unkeyed hash-chained event and a durable head/count. Reads cross-check the chain, tail anchor and exact materializations. Tests cover injected SQL failures, separate-process restart and competing writers. Coherent privileged database rewrites are outside the integrity guarantee.
- [UI](executive-ui.mjs) clears protected views on identity changes, disables authority for unsaved drafts, recovers actor-filtered atomic state and rejects mismatched state/audit snapshots. Evidence export rechecks receipt, current access, revision and audit; it never downloads a cached old receipt after a detected revocation. An already downloaded synthetic file cannot be recalled by this app.

## HTTP contract

GET `/api/industry/executive/catalog` returns neutral actor/source/commitment selectors and scope, never protected source contents or task descriptions. POST paths below require the server's existing loopback Host/Origin intent checks and `X-Demo-Client: local-showcase`; the header and role selector are not authentication.

| Operation | Exact fields |
|---|---|
| `ingest` | `commandId, tenant, actor, sourceFixtureId, commitmentId, recipient` |
| `revise` | `commandId, tenant, actor, caseId, expectedRevision, sourceFixtureId, commitmentId, recipient` |
| `set-access` | `commandId, tenant, actor, caseId, expectedRevision, targetActor, decision` (`grant` or `revoke`) |
| `review` | `commandId, tenant, actor, caseId, expectedRevision, expectedHash, decision, reasonCode`; `approve/checked` or `reject/follow-up` |
| `record-task` | `commandId, tenant, actor, caseId, expectedRevision, expectedHash` |
| `receipt` | `tenant, actor, caseId` |
| `state`, `audit`, `verify-audit` | `tenant, actor` |

A review decision is accepted only after source/recipient/time holds are resolved. A rejected review records follow-up, not task authority. Unknown keys, prototype keys, non-scalar selectors and unknown fixture IDs are rejected. Bodies are size/depth bounded; request-provided clocks and source text are not supported. Known operation routes are manifest-whitelisted. Core, fixtures and manifests are not served as static assets.

## Evidence and remaining delivery

The targeted suite covers real SQLite mutations through core, DOM and loopback HTTP, including neutral catalog, denied/revoked reads, review-editor separation, task overlap, stale CAS, atomic rollback, restart, writer races, source/config drift, lost responses, delayed identity responses and export revocation races. DOM assertions are not visual browser observation or accessibility certification. Use the coordinator's exact-head quality/governor/CI report for complete repository checks; this runbook does not claim them in advance.

Remaining full flagship work: authenticated source connectors and sender/attendee policy enforcement, independent provider acceptance, a real inbox/meeting parser or model, cross-channel commitment identity and follow-up lifecycle, timezone/DST and live calendar reconciliation, encrypted source storage/retention, production authorization and privacy review, monitored scheduling, PostgreSQL adapter execution, a recorded walkthrough and observed business outcomes. No paid providers, private source or client material is needed for this bounded slice.

The older [n8n/build runbook](project-builds/EA-01/build/README.md), [project SOP](project-builds/EA-01/SOP.md) and [proposed PostgreSQL schema](project-builds/EA-01/build/schema.sql) remain separately scoped artifacts. The n8n contact wrapper does not execute this new desk's permission/task lifecycle.

## Read-only calendar snapshot

An already active reviewed task can now be exported as one tentative, transparent synthetic `.ics` snapshot. The [calendar runbook](EXECUTIVE-CALENDAR.md) documents fresh source access, revision/review/task-generation checks, exact UTC serialization and read-only evidence. This downloads a local file; it is not a calendar invitation, provider booking, synchronization or cancellation. Downloaded files cannot be recalled after a later source-access change. Existing JSON evidence and task operations retain their separate contracts.