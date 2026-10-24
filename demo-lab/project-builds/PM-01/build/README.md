# PM-01 build runbook

Status: **Populated — local script and copied workflow available; PostgreSQL execution pending.**

## Durable maintenance workbench

The [separate maintenance controller and runbook](../../../MAINTENANCE.md) add SQLite intake, consent, reviewed bookings and receiver recovery. Start the lab and open `/maintenance?project=PM-01`, or run `node demo-lab/run-maintenance.mjs`. Fixed scenario time, synthetic labels and a local receiver are explicit boundaries. This proposed PostgreSQL schema is not the controller's runtime schema. The n8n script below tests the narrower triage-only contract.

## Files

- `demo.js`: imports the existing business implementation and executes assertions against synthetic fixtures.
- `n8n-workflow.json`: exact copy of the local five-node orchestration export; calls the local API and simulated GHL contact service.
- `schema.sql`: proposed two-table PostgreSQL persistence model, with identity, foreign key, event deduplication and source-hash constraints. It is not wired to the current SQLite runtime.

## Run from the repository root

`node demo-lab/project-builds/PM-01/build/demo.js`

For the full local demonstration, run `npm ci --prefix demo-lab`, then `node demo-lab/server.mjs`. Open http://127.0.0.1:5680, select PM-01 and run the demo. The dashboard imports and executes the local workflow with its bundled n8n version and records actual results. Importing this workflow elsewhere requires the API to remain reachable at the exported loopback address; a remote n8n server cannot reach your workstation through its own localhost.

## PostgreSQL deployment

In a fresh disposable PostgreSQL database, run `psql -X -v ON_ERROR_STOP=1 -d portfolio_demo -f demo-lab/project-builds/PM-01/build/schema.sql`. Connection settings are standard PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE, supplied privately by the operator. This DDL is one-time setup, not a repeatable migration. SQL has a structural check only until a PostgreSQL engine execution is recorded.

## Hosted integration boundary

No external credentials are needed for this local run. A hosted deployment needs authenticated source intake, a dedicated GHL location and its actual provider credentials, persistence adapters, role enforcement and verified recovery. There is no hosted GHL writer in these files. The local demonstration token is not a provider credential.

## Expected evidence

The legacy triage script compares emergency escalation, missing access and approved access; its `dispatchAllowed` stays false. Reproduce reviewed local dispatch and uncertain acknowledgement recovery separately using the maintenance runbook. Keep actual failure output when an assertion fails. Do not replace it with a success claim. See [SOP](../SOP.md) and [recording script](../walkthrough-script.md).

---
*Part of the Enterprise Automation Portfolio. See [project overview](../README.md).*
