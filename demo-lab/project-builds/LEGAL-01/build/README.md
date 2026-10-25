# LEGAL-01 build runbook

Status: **Partial local implementation.** A durable synthetic SQLite desk is executable. Real legal rules, authentication, provider integration, PostgreSQL execution and recorded walkthrough remain open.

## Current SQLite desk

From the repository root with Node.js 24+:

```powershell
node demo-lab/run-legal.mjs
node --test demo-lab/legal-core.test.mjs demo-lab/legal-ui.test.mjs demo-lab/legal-http.test.mjs
node demo-lab/server.mjs
```

Open `http://127.0.0.1:5680/industry/legal?project=LEGAL-01`. Existing demo-lab dependencies are required for actual-core DOM tests; no API key, paid provider or private source is used. Startup uses the server's local SQLite store. The standalone CLI uses a fresh in-memory database and asserts two cases, one matter, one local calendar row and eight verified audit events.

The [core](../../../legal-core.mjs), [closed fixtures](../../../legal-fixtures.mjs), [UI](../../../legal-ui.mjs), [manifest](../../../industry-desks/legal.json) and [complete API/recovery guide](../../../LEGAL.md) are the current desk. Pinned source party IDs cannot be omitted. Exact/ambiguous fixture relationships cannot be cleared. A no-match result needs a current independent hash review before one SQLite matter row is recorded. Supplied dates need a separate independent review; expired/superseded dates remain held and can be returned for follow-up. A new proposal holds the old calendar row until fresh review/recording.

The clock is fixed at `2026-10-25T12:00:00.000Z`. A local calendar row is not an actual notification, statutory calculation, attorney clearance or permission to represent a client. Fixture reviewer labels are not authenticated identities. Do not enter private client data or reuse protocol identifiers as a privacy boundary.

## Recovery and evidence

After a lost response, refresh saved state and recover the existing case. Unchanged intake can retry its exact cached command; a different intent cannot reuse a command ID. Each mutation validates revision/hash and history inside an atomic SQLite transaction. The UI follows successful mutation with a fresh atomic state read and discards actionable authority when transport or read verification fails. Export rereads audit verification and a fresh receipt and refuses changed evidence. Never edit saved events, materializations or result flags to turn a failure into a pass.

Use the three targeted test files for supplied aliases/holds, source-editor independence, CAS/replay, real restart/concurrent processes, rollback/corruption, clock/source/config drift, actual-core UI races/recovery/export, registered deep links and browser-intent rejection. Repository quality checks and governor are additional gates; only actual run output establishes their result. They do not constitute professional or provider acceptance.

## Older compatibility artifacts

- [demo.js](demo.js) imports the original bounded rules implementation in `roadmap-scenarios.mjs`. That older rules runner creates no matter and remains unchanged.
- [n8n-workflow.json](n8n-workflow.json) is the existing copied five-node local orchestration export with a simulated contact handoff. It does not call the new SQLite desk or a real matter provider.
- [schema.sql](schema.sql) is a proposed PostgreSQL model. It is not the operational SQLite schema and is not wired to this desk.

The older runner can still be executed using `node demo-lab/project-builds/LEGAL-01/build/demo.js`. Hosted n8n acceptance remains separate; a remote server cannot reach this workstation through its own localhost.

## PostgreSQL and provider acceptance remain pending

In a deliberately disposable PostgreSQL database, the existing proposed DDL can be tested with `psql -X -v ON_ERROR_STOP=1 -d portfolio_demo -f demo-lab/project-builds/LEGAL-01/build/schema.sql`. Connection settings are supplied privately by the operator. This command is a documented future acceptance step, not evidence it was run; the DDL is one-time setup, not a repeatable migration.

Real deployment requires qualified jurisdiction/conflict-rule review, authenticated source and reviewer permissions, private-data handling/retention, verified matter/calendar adapters and recovery, and actual acceptance evidence. No hosted provider writer, real legal decision, private client file, production result or deployment is claimed. See the [SOP](../SOP.md) and [project overview](../README.md).
