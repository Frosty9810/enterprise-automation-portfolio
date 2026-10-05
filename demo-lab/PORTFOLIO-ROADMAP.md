# Portfolio roadmap — October 2026

The strongest direction is revenue operations with trustworthy automation: Salesforce, evidence-based decisions, resilient event processing and human review. The twelve local systems are now built; prioritize live acceptance for three lead cases.

All twelve rows now have executable synthetic demonstrations in the [twelve-system hub](TWELVE-SYSTEMS.md). The table below preserves the broader integration targets; it is not a claim that those targets are complete. Live sandbox acceptance, authentication, real model costs, blind datasets and provider evidence remain pending. None is presented as shipped client work.

| Rank | Project | New or extension | Showable deliverable | Completion evidence |
|---|---|---|---|---|
| 1 | Salesforce RevenueOps Control Room | New flagship; extends CRM-01 | Account/opportunity timeline, routing explanation, stale-version hold, owner review and sandbox update receipt | Duplicate and out-of-order events, reconnect recovery, unauthorized tenant rejection, field-level access and sandbox integration tests |
| 2 | Automation Incident & Recovery Console | Extend OPS-01 and this workshop | Operator queue with uncertain writes, dead letters, controlled replay and correlated trace | Restart recovery, retry cap, verified provider reconciliation, no duplicated effects and fault-injection report |
| 3 | Evidence-grounded Support Desk | Extend AGT-01, CS-01, ECOM-04 | Answer with cited source passages, abstention and reviewed escalation | Held-out questions, tenant isolation, citation accuracy, malicious-document tests and human error review |
| 4 | AI Routing Evaluation Lab | Extend engineering bench | Side-by-side cheap-first and escalation policies on ECOM-01/AGT-01 tasks | Versioned labeled dataset; quality, abstention, p50/p95 latency, actual token cost and budget stops; deterministic fixtures before paid calls |
| 5 | Accounts Payable Review Desk | Extend ACC-01 and SAAS-04 | Invoice/PO/receipt comparison, changed-bank hold, variance explanation and immutable review trail | Independent malformed input and duplicate tests, currency/unit handling, revised-document holds and no unapproved payment release |
| 6 | Source-linked Architecture Explorer | New portfolio utility | Read-only map from each business decision to module, workflow node, test and execution receipt | Every link resolves; source revisions invalidate stale evidence; authored connections visibly differ from observed execution |
| 7 | Salesforce Data Quality & Merge Preview | New | Explain duplicate candidates and preview a reversible merge plan in a sandbox | Conflicting owner/consent records, false-positive dataset, protected fields, idempotent plan and recovery from partial failure |
| 8 | Product Content Governance Desk | Extend ECOM-01 | Localized product review with protected facts, revision-aware review and export | Expand independent counterexamples, locale/units policy, conflicting source revisions and authenticated reviewer separation |
| 9 | Consent-aware Customer Journey Simulator | Extend REC-01, RE-01 and SAAS-01 | Explain eligible transitions, suppressed communication and consent history | Expired/revoked consent, late events, retention policy, repeat deliveries and channel-specific authority tests |
| 10 | Usage-to-Invoice Ledger | Extend SAAS-04 | Usage ingestion, period-close reconciliation, late adjustment and variance queue | Duplicate usage IDs, exact monetary rounding, period/timezone boundaries, negative adjustments and ledger balancing |
| 11 | Commitments & Scheduling Review Board | Extend EA-01 and PM-01 | Versioned commitments, conflict explanations and dispatcher decisions | Conflicting duplicate provenance, timezone/DST cases, cancelled reservations, access constraints and durable audit |
| 12 | Owned-code Reconstruction Challenge | New research demonstrator | Reconstruct a small module you own; explain recovered behavior against original tests | License/ownership evidence, isolated execution, held-out behavioral tests and disclosed failure cases; defer Windows Ghidra integration |

## Three delivery phases

1. **Demonstrate:** deterministic fixture data, clear actor and business decision, independent adverse cases, source passport, visible limitations and exportable receipt. The current workshop provides the shared handoff portion for 27 projects.
2. **Integrate:** use one authorized sandbox; authenticate reviewers; test actual API contracts, limits, reconnects and reconciliation. Record provider evidence separately from simulation. Start with Salesforce RevenueOps and recovery.
3. **Measure:** publish a reproducible case study with dataset/source versions, failures, measured outcomes and a short narrated demonstration. Report business savings only when observed and attributable.

## Technical foundations and inspiration

- Durable recovery and replay: [Temporal workflow execution](https://docs.temporal.io/workflow-execution). This portfolio has a small local SQLite lifecycle, not a deployed Temporal system.
- Correlating executions: [OpenTelemetry traces](https://opentelemetry.io/docs/concepts/signals/traces/). Real distributed trace ingestion remains a proposed extension.
- Evaluate model quality and cost before routing: [Anthropic cost and intelligence guidance](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence). No cost-saving percentage is assumed.
- The supplied reels are assessed with primary repository links in [the research notes](REEL-RESEARCH-2026-10-05.md). Architecture mapping and evaluation-first routing are the best near-term fits; multi-agent offices and reconstruction infrastructure are later experiments.

## Shared release standard

Every project needs a credible purpose, an explicit input contract, minimized data, separate proposal and execution authority, repeat-event handling, uncertain-outcome handling, bounded retries, independent adverse tests, current source evidence, understandable UI and a reproducible setup. A passing shared contact-handoff test does not prove the underlying domain policy or hosted workflow is production-ready.

The next integration to complete is **Salesforce RevenueOps Control Room** in an authorized sandbox. Then connect one real recovery provider and independently evaluate the support dataset. See [the implemented matrix](TWELVE-SYSTEMS.md) for exact local boundaries.
