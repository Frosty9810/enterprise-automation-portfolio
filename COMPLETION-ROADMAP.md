# Portfolio Completion Roadmap

This roadmap replaces the old document-count target with an evidence target. A section is complete only when a reviewer can inspect a real decision, run or validate an artifact, and understand how another engineer would operate it six months later.

## Definition of complete

An industry flagship must include:

- a concrete business flow from trigger to measurable outcome;
- explicit systems of record and ownership boundaries;
- one hard operational, privacy, compliance, cost, or legacy constraint;
- a technical mechanism worth discussing in an engineering interview;
- a documented decision with its tradeoff;
- one intentionally excluded feature and the reason it was cut;
- runnable logic, an importable workflow, a persistence schema, synthetic fixtures, and automated tests;
- failure handling, idempotency, monitoring signals, and takeover notes;
- honest labeling of illustrative context versus verified execution.

## Industry flagship backlog

| Order | ID | Flagship | Distinct proof | Hard constraint |
|---|---|---|---|---|
| 1 | MKT-01 ✅ | Multi-Channel Ad Operations Control Plane | Meta/Google ingestion, attribution normalization, anomaly detection, budget approval | Reporting may recommend but cannot mutate spend without approval |
| 2 | REC-01 ✅ | Candidate Intake, Matching & Interview Operations | explainable matching, consent ledger, scheduling state machine | protected attributes excluded from ranking |
| 3 | ACC-01 ✅ | Accounts Payable Three-Way Match & Cash Forecast | invoice extraction, PO/receipt matching, exception workflow | no payment-changing action without segregation of duties |
| 4 | CS-01 ✅ | Support Quality & Knowledge Feedback Loop | sampled QA, grounded answer evaluation, knowledge-gap clustering | customer text minimized and redacted at model boundary |
| 5 | PM-01 | Lease-to-Maintenance Operations Control Tower | tenant intake, vendor dispatch, access windows, SLA escalation | emergency classification cannot depend on an LLM |
| 6 | CON-01 | Subcontractor Compliance & Change-Order Ledger | document expiry, site readiness, approval chain, cost impact | immutable approval history across legacy email/PDF inputs |
| 7 | MED-01 | Referral Intake & Prior-Authorization Work Queue | document classification, completeness rules, payer checklist | synthetic data only; no PHI leaves the controlled boundary |
| 8 | LEGAL-01 | Matter Intake, Conflict Check & Deadline Control | entity resolution, conflict graph, jurisdiction rules | ambiguous conflicts always stop automatic matter creation |
| 9 | INS-01 | First Notice of Loss Triage & Evidence Pipeline | event normalization, coverage checks, fraud signals, adjuster routing | model output cannot approve or deny coverage |
| 10 | EA-01 | Executive Commitments & Decision Register | inbox/meeting ingestion, deduped commitments, follow-up state | private correspondence follows sender/attendee access controls |

Real Estate, SaaS, and E-Commerce already meet the flagship-suite standard. The import-company operating system remains the cross-department enterprise flagship.

## Platform evidence backlog

Sections 19–31 will be completed by extracting tested patterns from flagships:

- AI agents: tool permissions, state, handoffs, evaluation, and agent-versus-workflow decision records.
- Claude/OpenAI: structured-output adapters, cost budgets, prompt/version registry, and fallback behavior.
- n8n, Make, and Zapier: selection matrix, importable patterns, credential mapping, retries, and operational limits.
- GoHighLevel, Close, HubSpot, Salesforce, and Airtable: canonical CRM object mappings, ownership rules, deduplication, and sync contracts.
- Integrations and API documentation: webhook verification, OAuth rotation, pagination, rate limits, idempotency, and sample contracts.
- Prompt library: only prompts tied to a runnable project and evaluation fixture.

## Operating evidence backlog

Sections 32–46 will be generated from project evidence rather than generic prose: SOP index, diagram catalog, schema catalog, threat models, SLOs, test matrices, deployment runbooks, maintenance schedules, incident playbooks, handover packages, case studies, ROI models, dashboard contracts, and AI system cards.

## Release gates

Before a batch merges:

1. Python parses and project tests pass.
2. n8n JSON parses, node references resolve, and every non-trigger node is reachable.
3. SQL contains executable tables, keys, constraints, and operational indexes.
4. No credentials, client-identifying claims, or unverifiable production metrics are included.
5. Root navigation, master status, and the SOP/video index match repository reality.
