# EA-01 reported local task completion

Status: **partial local implementation**. This slice records an operator's report that one reviewed synthetic task generation is complete. It does not establish that real work happened, send a message, book or cancel a calendar event, or verify a provider outcome. Actor labels remain fixture selectors, not authenticated identities.

## Reproduce

From the repository root with Node.js 24+:

```powershell
node demo-lab/run-executive-completion.mjs
node --test demo-lab/executive-completion.test.mjs
node demo-lab/server.mjs
```

The CLI uses an in-memory SQLite store and synthetic fixtures only. It ingests, independently reviews, records and completes one task, then revokes and regrants access. It proves one task generation, one prior review decision and six valid audit events; exact retry adds no effect. The reported completion occurs after the planned window starts, so scheduling readiness remains held. No provider is contacted.

Open the [executive desk](http://127.0.0.1:5680/industry/executive?project=EA-01), intake as `acme-assistant`, approve as `acme-principal`, recover and record as assistant, then explicitly report local completion. A completed task keeps its original generation, recorded timestamp, source, window, owner and action text. The new completion metadata identifies the fixture operator, trusted scenario timestamp, reviewed source/version, ACL revision and generation. It is an administrative assertion, not externally verified evidence.

## Exact command

POST `/api/industry/executive/complete-task` maps to `completeTask` in the [core](executive-core.mjs). Existing loopback Host/Origin and `X-Demo-Client: local-showcase` checks apply; these are not authentication.

```js
{
  commandId, tenant, actor, caseId,
  expectedRevision, expectedHash, expectedGeneration,
  reasonCode: 'reported-complete'
}
```

Use the current receipt revision, `reviewHash` and recorded task generation. No supplied note, outcome, free text, timestamp or extra field is accepted. The current operator must retain source access. New reports require fresh core/fixture identity, configuration, exact revision/hash/generation, a current valid source, recipient access, current independent approval and the stored active task matching its source commitment.

Completion readiness intentionally differs from scheduling readiness: a window that has already started does not prevent a completion report. An expired/superseded source or a scenario clock earlier than the recorded task still blocks a new report. Neither branch uses a wall-clock monitoring service. The default scenario clock stays fixed; trusted clock injection is a test facility.

## Durable terminal history

The same write transaction updates the case revision, replaces the task with its completed form, appends the immutable command/event, and updates the audit head. Four injected SQL failures demonstrate rollback at case, task, event and head boundaries. Separate-process restart and competing completion writers are covered in the [completion tests](executive-completion.test.mjs).

An exact immutable command retry returns the latest currently authorized receipt. A changed command intent conflicts; a revoked actor cannot use retry to recover protected contents. A different command cannot complete the same terminal generation again.

New proposal revisions, reviews and task recording cannot silently reopen a completed case. Explicit reopening/replanning is not implemented. Custodian ACL edits remain possible and clear current review while preserving the historical completed task and its original completion metadata. Regrant does not reactivate it. Completed tasks no longer reserve an active local owner slot.

Receipts show `status: 'completed'` and the task's historical `effectiveStatus: 'completed'` even if current scheduling readiness is held. `readiness.holds` remains visible and `completionReadiness` disallows another completion. This terminal label does not grant current access: existing actor-filtered state, receipts, decision and audit views still hide revoked sources. A later expiry does not retroactively erase a previously recorded report.

Fresh calendar export rejects completed tasks. Previously downloaded calendar snapshots cannot be recalled, cancelled or synchronized by this local app.

## Evidence limits and remaining work

No schema migration is introduced. Existing source/configuration freshness rules remain: a store created by older core source cannot acquire new authority under the changed source without an explicit future migration policy. Existing history remains readable within the established access rules; do not erase a real store to avoid freshness checks.

The audit is unkeyed local integrity evidence, not protection against coherent privileged rewrites. Real authentication, actual source ingestion, authorized task-provider reconciliation, verified completion evidence, reopening/replanning, production privacy controls and recorded acceptance remain open. This adds depth to EA-01; it adds no project count and does not complete the flagship.

See the [base executive runbook](EXECUTIVE.md), [calendar snapshot scope](EXECUTIVE-CALENDAR.md), and [project SOP](project-builds/EA-01/SOP.md).
