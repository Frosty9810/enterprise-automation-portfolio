# EA-01 build and validation runbook

Status: **partial synthetic local desk with SQLite; hosted integration and PostgreSQL execution pending**.

## Current desk

From the repository root, with Node.js 24+ and the lab's existing dependencies:

```powershell
node demo-lab/run-executive.mjs
node --test demo-lab/executive-core.test.mjs demo-lab/executive-ui.test.mjs demo-lab/executive-http.test.mjs
node demo-lab/server.mjs
```

Open http://127.0.0.1:5680/industry/executive?project=EA-01. Follow the [source/review/revoke/regrant walkthrough and HTTP contract](../../../EXECUTIVE.md). The CLI uses memory only, verifies one task through generation 2, two decisions, denied actor exclusion and seven valid events, and closes its handle. The server uses its shared local SQLite path. Do not delete an existing lab store to reset the scenario; use a separate disposable store or in-memory test instead.

The targeted tests exercise the actual core in core/DOM/loopback layers. The standard repository quality and governor commands remain the coordinator's final gates. A DOM test is not a browser screenshot, provider acceptance or a real user's approval.

## Older artifacts retained

- [demo.js](demo.js): existing business-fixture/decision-register assertions. This is a separate older demonstration.
- [n8n-workflow.json](n8n-workflow.json): local five-node orchestration export calling the existing run API and local GHL contact simulator. It does not call the new desk's permission/task lifecycle and is not a hosted provider writer.
- [schema.sql](schema.sql): proposed PostgreSQL model, not the SQLite desk's runtime schema or an executed migration.

Run the older assertions with `node demo-lab/project-builds/EA-01/build/demo.js`. Use the main lab's EA-01 wrapper view for n8n evidence. A remote n8n instance cannot reach this workstation through its own localhost.

## Persistence and recovery boundary

The desk's SQLite mutation transaction includes case/task/decision effects, immutable command intent, audit event and durable head/count. Exact command replay recovers current accessible state without another effect. A changed payload under the same command is rejected. Source family identity, expected case revision, source/config fingerprints and independently reviewed exact hash prevent stale task authority. SQL failure/restart/writer-race tests are local evidence, not production scale or HA acceptance.

A lost response clears UI authority: refresh accessible records and recover. Retry an unchanged intake only with its original cached command intent. A revoked actor cannot recover source contents; the current custodian retains recovery access. Regrant does not revive approval. A coherent privileged rewrite is outside the unkeyed audit guarantee.

## Full flagship gates still open

Real authenticated intake, sender/attendee authorization, source retention/encryption, cross-channel commitment extraction/identity, timezone/DST and provider calendar reconciliation, safe delegated follow-up adapters, human security/privacy review, hosted acceptance, measured results and a recorded video remain unverified. Actor labels are role simulation, not credentials.

The proposed PostgreSQL artifact still needs execution in a disposable engine and an actual writer/migration/adapter before any PostgreSQL claim. No actual provider credentials or paid services are used by the current desk. See the [SOP](../SOP.md) and [project overview](../README.md).


The [reported completion runbook](../../../EXECUTIVE-COMPLETION.md) covers terminal local task completion, current access/review checks and historical preservation. It does not verify real work, reopen tasks or synchronize provider calendars.
