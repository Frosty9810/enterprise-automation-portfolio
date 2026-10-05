# n8n workflow evidence

Status: populated; local structural/Code-node execution evidence, live server acceptance pending.

The [showcase catalog](../showcase/README.md) links all 17 projects. Each package contains a manual-trigger contact preview, alongside links to the original project. Sixteen original business workflows remain in their industry build folders.

Run `node --test tests/ghl-n8n.test.mjs` to execute the actual Code-node text for all new exports. Run `python scripts/validate_portfolio.py` to check node identity, graph connections and reachability from recognized triggers. These checks do not emulate the n8n engine or prove node-version compatibility.

Follow the [shared runbook](../integrations/ghl-n8n/README.md) for import, credential binding and live acceptance. Keep exports inactive. Review original HTTP/database nodes for empty-output behavior, item preservation, pagination, timeout reconciliation and credential compatibility before activation. RE-01 has known unresolved dataflow risks listed in the audit.

---
Part of the [Enterprise Automation Portfolio](../README.md).

## Local engine verification update

All 19 showcase integration wrappers now execute in real n8n 2.38.1. The original 16 exports also pass installed node/version/credential registry inspection. The wrappers execute source demos and local HTTP calls, not every node of the original full business workflows. [Open the lab and evidence](../demo-lab/README.md).
