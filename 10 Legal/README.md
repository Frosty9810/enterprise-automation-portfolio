# Legal

Status: a new bounded roadmap-based demonstration is implemented: **LEGAL-01 Matter conflict and entity review gate**. Full flagship scope remains incomplete.

## What runs

Unicode-aware normalization, exact and ambiguous matches, and mandatory attorney clearance. Six expected-output cases include normal, exception and invalid-input behavior. The source suite runs through actual local n8n, followed by a separate synthetic contact handoff to the GHL API simulator.

## Inspect and present

- [Decision code and fixtures](../demo-lab/roadmap-scenarios.mjs)
- [Runnable n8n workflow](../demo-lab/workflows/LEGAL-01.json)
- [Manual GHL setup blueprint](../demo-lab/blueprints/LEGAL-01.json)
- [Build Studio walkthrough](../demo-lab/BUILD-STUDIO.md)
- [Execution report](../reports/n8n-local-executions.json)

## Scope

Does not implement a comprehensive conflict graph, jurisdiction deadlines or automatic matter creation. This is a new portfolio build based on [the local completion roadmap](../COMPLETION-ROADMAP.md), not a claim of a previously deployed client system. GHL remains a local simulator; the blueprint is not a native snapshot.

## Operation and recovery

Run `node demo-lab/server.mjs` from the portfolio root, open the local dashboard and select LEGAL-01. A failed expected-output assertion stops the business step and records a failed run. Inspect the named case and correct the rule or fixture deliberately before replay. The shared location/email constraint prevents duplicate local contacts. The case output and source hash remain in the local run history.
