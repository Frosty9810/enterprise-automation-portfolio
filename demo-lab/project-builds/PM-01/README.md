# PM-01 Maintenance triage and access review

Status: **Populated — bounded local build; hosted integration and PostgreSQL execution pending.**

A gas-leak fixture triggers deterministic emergency escalation; routine work requires access review.

**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._
**Real Build Artifacts:** [Runbook and build files →](build/README.md)

## Durable maintenance workbench

Open `http://127.0.0.1:5680/maintenance?project=PM-01` after starting the lab. The [maintenance runbook](../../MAINTENANCE.md) covers synthetic intake, known emergency holds, occupant consent, vendor proposals, independent exact-hash review, local receiver recovery and operator-reported closure. Run `node demo-lab/run-maintenance.mjs` for reproducible local acceptance.

This workbench has durable SQLite tables and a fixed synthetic clock. The legacy n8n triage example remains separate; its `dispatchAllowed: false` is not the new local receiver operation. No tenant authentication, vendor contact, live escalation or verified property visit is claimed. The full PM-01 flagship remains partial.

## Business flow

Tenant issue → emergency or routine triage → operator/access/vendor review.

## Review materials

- [44-section SOP](SOP.md)
- [Recording script](walkthrough-script.md)
- [Build runbook](build/README.md)


---
*Part of the Enterprise Automation Portfolio. See [project build index](../README.md).*
