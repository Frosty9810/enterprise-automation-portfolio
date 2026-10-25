# INS-01 build runbook

Status: **Populated — local script and copied workflow available; PostgreSQL execution pending.**

## Durable desk evidence

The [new desk runbook](../../../INSURANCE.md) documents the independently executable SQLite packet and adjuster queue at `/industry/insurance?project=INS-01`. Run `node demo-lab/run-insurance.mjs` for the actual one-row revocation/regrant acceptance flow, or `node --test demo-lab/insurance-core.test.mjs demo-lab/insurance-ui.test.mjs demo-lab/insurance-http.test.mjs` for adverse behavior. The existing `demo.js`, copied orchestration and PostgreSQL proposal below remain separate artifacts; the new desk does not silently claim to wire them to an insurer.

The queue has durable command deduplication, case compare-and-swap, source/config fingerprints, independent reviews and audit/head/materialization checks. Exact duplicate consent must be managed on the primary case, ambiguous identities require human fixture reconciliation, and fictional date exceptions route to an adjuster without a coverage decision. Full source integrations, authenticated access, real consent evidence, PostgreSQL execution, production monitoring and recorded video remain pending.

## Files

- `demo.js`: imports the existing business implementation and executes assertions against synthetic fixtures.
- `n8n-workflow.json`: exact copy of the local five-node orchestration export; calls the local API and simulated GHL contact service.
- `schema.sql`: proposed two-table PostgreSQL persistence model, with identity, foreign key, event deduplication and source-hash constraints. It is not wired to the current SQLite runtime.

## Run from the repository root

`node demo-lab/project-builds/INS-01/build/demo.js`

For the full local demonstration, run `npm ci --prefix demo-lab`, then `node demo-lab/server.mjs`. Open http://127.0.0.1:5680, select INS-01 and run the demo. The dashboard imports and executes the local workflow with its bundled n8n version and records actual results. Importing this workflow elsewhere requires the API to remain reachable at the exported loopback address; a remote n8n server cannot reach your workstation through its own localhost.

## PostgreSQL deployment

In a fresh disposable PostgreSQL database, run `psql -X -v ON_ERROR_STOP=1 -d portfolio_demo -f demo-lab/project-builds/INS-01/build/schema.sql`. Connection settings are standard PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE, supplied privately by the operator. This DDL is one-time setup, not a repeatable migration. SQL has a structural check only until a PostgreSQL engine execution is recorded.

## Hosted integration boundary

No external credentials are needed for this local run. A hosted deployment needs authenticated source intake, a dedicated GHL location and its actual provider credentials, persistence adapters, role enforcement and verified recovery. There is no hosted GHL writer in these files. The local demonstration token is not a provider credential.

## Expected evidence

Inspect missing evidence, out-of-window loss and duplicate signals; coverage remains undecided. Keep actual failure output when an assertion fails. Do not replace it with a success claim. See [SOP](../SOP.md) and [recording script](../walkthrough-script.md).

---
*Part of the Enterprise Automation Portfolio. See [project overview](../README.md).*
