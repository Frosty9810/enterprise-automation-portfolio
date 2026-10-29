# Portfolio Completion Roadmap

This roadmap replaces the old document-count target with an evidence target. A section is complete only when a reviewer can inspect a real decision, run or validate an artifact, and understand how another engineer would operate it six months later.

Reconciled October 27, 2026 against public main `0bc9f05ef85fb83f364d65657a78136af2aa53b5`. All six partial industry slices described below are integrated local implementations. The [project inventory](PROJECT-INVENTORY.md) records the merged research improvements and their remaining scope; neither catalog presence nor a passing local run completes the wider flagship.

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

PM-01 now has a [bounded durable maintenance workbench](demo-lab/MAINTENANCE.md): registered synthetic lease intake, deterministic emergency holds, occupant access consent, independent exact-hash review, vendor/window booking, local receiver recovery and operator-reported closure. Its fixed fixture clock does not monitor live deadlines. The full milestone stays open: authentication, wider lease lifecycle, real property/vendor adapters, live escalation delivery and recorded acceptance remain unfinished.

CON-01 now has a [bounded compliance and change-order ledger](demo-lab/CONSTRUCTION.md): supplied legacy-source document receipts, time-bound readiness holds, independently reviewed change versions and atomic local cost commitments against a fixed project budget. The full milestone stays open: actual email/PDF ingestion, issuer verification, authenticated role enforcement, real site/project-system integration and recorded acceptance are unfinished. No payment or authority to start site work is implied.

The [CON-01 full local reversal](demo-lab/CONSTRUCTION-REVERSAL.md) preserves an original posted cost and adds one linked negative entry after fresh independent manager and finance reviews. Exact-cents budget credit, immutable intent replay, current revision/fingerprint checks and append-only reconciliation prevent repeated credit. This reverses only a synthetic local ledger commitment; current compliance holds remain visible. Real contract amendments, payments/refunds, partial credits, source/issuer verification, authenticated actors, external accounting integration and recorded acceptance remain open.

Real Estate, SaaS, and E-Commerce already meet the flagship-suite standard. The import-company operating system remains the cross-department enterprise flagship.

MED-01 now has a [bounded synthetic administrative queue](demo-lab/REFERRAL.md): closed fixture intake, fictional payer checklists, consent holds, independent exact-packet review and durable local staff handoff. This is not a clinical or insurance-authorization system. Controlled real intake, authenticated roles, actual payer/provider acceptance and recorded evidence remain open; the full milestone stays partial.

LEGAL-01 now has a [bounded synthetic administrative desk](demo-lab/LEGAL.md): pinned source parties, normalized alias/relationship checks, non-overridable exact/ambiguous conflict holds, independent exact-fingerprint review before a local matter row, and separate review of supplied fictional dates before a local calendar row. No statute/jurisdiction engine, professional conflicts clearance or actual calendar notification runs. Qualified rules review, authentic source intake, a complete conflict graph, authenticated permissions, real platform integration and recorded acceptance remain open.

INS-01 now has a [bounded synthetic loss-evidence desk](demo-lab/INSURANCE.md): registered source intake, repeat-loss reconciliation, supplied policy/evidence packets, consent/revocation holds, independent fingerprint review and one durable local adjuster queue with assignment. Regrant requires fresh review; a fixture route cannot approve or deny coverage or make a fraud/payment decision. Real multi-channel FNOL, verified claimant/consent sources, authenticated roles, insurer/adjuster integration, monitoring and recorded acceptance remain open.

EA-01 now has a [bounded source-bound executive follow-up desk](demo-lab/EXECUTIVE.md): closed synthetic source versions, an access-control simulation, independent fingerprint review, local task/window checks and revoke/regrant invalidation of previous approval. Its durable decision register and task rows are actual SQLite effects; they do not ingest private correspondence or send follow-up. Authenticated sender/attendee policies, inbox/meeting connectors, cross-channel commitments, live calendar/timezone reconciliation, production privacy/storage review, provider acceptance and recordings remain open.

### EA-01 calendar file export (bounded local increment)

The [executive calendar snapshot](demo-lab/EXECUTIVE-CALENDAR.md) exports a single actual reviewed, active local task as an `.ics` file after fresh source-access, revision, review and readiness checks. Stable case identity and revision sequence accompany the supplied UTC window. Held or revoked tasks cannot produce new exports; an already downloaded file cannot be recalled or updated automatically. Events are explicitly synthetic, tentative and transparent. This adds a portable local artifact, not another project or a completed calendar integration. Authenticated inbox/meeting intake, timezone/DST and live-calendar reconciliation, provider import acceptance, follow-up synchronization, production privacy controls and recordings remain open.


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


### EA-01 reported completion (bounded local increment)

The [completion workflow](demo-lab/EXECUTIVE-COMPLETION.md) adds terminal operator-reported completion to an existing reviewed synthetic local task. It binds the current revision, source access, review and task generation; preserves historical completion through later access changes; and rejects duplicate effects, silent reopening and new calendar exports for completed tasks. Completion after the supplied start time does not authorize rescheduling. Real work verification, authenticated actors, explicit reopening/replanning, inbox/calendar providers and recordings remain open. This is depth for the existing EA-01 entry, not another project or completion of its full flagship.
