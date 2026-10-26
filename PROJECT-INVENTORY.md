# Complete portfolio inventory and missing work

Updated October 26, 2026 against public main `39483e707e2fd3a38af0d4b5c25aafe93fadc2c3`. **The portfolio is not complete.** This inventory separates available local implementations, remaining flagship/research scope and open pull requests. Catalog presence is not provider acceptance, deployment, a recorded video or a production result.

## Why projects appear missing

1. Public main includes the unified catalog, all five partial research builds, all six bounded industry desks below and the AtlasGraph synthetic comparison. PRs #31–#36 are merged into the checked main commit. Use `/projects` for the full discovery surface; the six industry desks are existing implementations, not missing projects or new catalog entries.
2. Build Studio starts with selected automation cases. Its **All projects** filter covers the 27 automation demos, not the other collections. Life and data, AI engineering and Twelve systems have their own navigation.
3. All five research tracks have partial local implementations; none completes its full research blueprint. The six industry entries also have durable local workflows. Their remaining gaps concern wider business scope, authentication, real integrations and acceptance, not absence of those local desks.
4. Open the local `/projects` page for a searchable inventory with direct project selection across all collections. It lists 73 entries: the original 68 catalog views plus five research tracks. All five research entries are partial local builds; counts are not completion claims.

## Open improvements, not yet on checked main

At this October 26 snapshot, the following PRs are **open and unmerged**. All three required CI jobs are green on each listed head. These changes can be reviewed on their branches; their behavior is not included in the main-based implementation claims above or below. CI does not establish external/provider or production acceptance.

| Pull request | Checked head | Proposed bounded improvement | Scope still open |
|---|---|---|---|
| [#37 — ChronosRank comparison](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/37) | `dddd5ac` | Separately AI-authored synthetic temporal-versus-blind lexical diagnostic | Human-reviewed external labels, vector retrieval, trained reranker and calibrated abstention |
| [#38 — TrustGate challenge](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/38) | `dc75a4c` | Authored local policy/review/replay/tamper acceptance cases | Authenticated agent/tool integration, instruction detection, signed remote receipts and external adversarial acceptance |
| [#39 — VeilRAG variant guard](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/39) | `e8134d1` | Conservative rejection of remaining NFKC/lowercase-equivalent declared-literal variants | Automatic entity detection, full Unicode case folding, decoding, authenticated providers and general privacy guarantees |

These are improvements to existing research entries, not three additional projects. Reconcile this table after merges; do not treat the initial gap list or this open-PR snapshot as permanent.

## Coverage by collection

| Collection | Entries found | How to open after starting the local lab | Boundary |
|---|---:|---|---|
| Automation / Build Studio | 27 | Root page, All projects or Explore the lab | Includes all 17 original showcase projects plus ten bounded examples |
| Life and data | 20 | Root navigation: Life and data | Editable browser-local prototypes; no live datasets or hosted APIs |
| AI engineering workbench | 9 | `/engineering` | Deterministic local examples and recorded repair evidence; no paid model integration |
| Twelve business systems | 12 | `/flagships` | Distinct local decision views; some extend/reuse automation engines |
| Research tracks | 5 | `/research`; `/trustgate`; `/chronosrank`; `/dockside`; `/veilrag` | Five partial local builds; full research/provider acceptance remains open |

These are **73 listed entries: 68 established catalog views plus five research tracks**. The five research tracks add partial runnable local builds; their wider blueprints remain unfinished. They are not 73 independent production products. The 17 original showcase packages are a subset of the 27 automation entries. Salesforce/product/recovery dedicated pages and IMP-01 registry entries are not counted as additional projects.

## Automation: all 27 entries

The source path and local wrapper JSON were checked for every row. Open the root lab, select All projects, then choose the ID. Existing wrapper CI evidence is separate from this presence audit.

| ID | Project | Source |
|---|---|---|
| RE-01 | Speed-to-Lead Response and Drip Nurture Engine | [Inspect](07%20Real%20Estate/RE-01%20Speed-to-Lead%20Response%20and%20Drip%20Nurture%20Engine/build/README.md) |
| RE-02 | Transaction Coordination and Compliance Automation | [Inspect](07%20Real%20Estate/RE-02%20Transaction%20Coordination%20and%20Compliance%20Automation/build/README.md) |
| RE-03 | AI-Powered Lead Qualification and Scoring Engine | [Inspect](07%20Real%20Estate/RE-03%20AI-Powered%20Lead%20Qualification%20and%20Scoring%20Engine/build/README.md) |
| RE-04 | CRE Deal Pipeline and Comp Analysis Automation | [Inspect](07%20Real%20Estate/RE-04%20CRE%20Deal%20Pipeline%20and%20Comp%20Analysis%20Automation/build/README.md) |
| REC-01 | Candidate Consent Matching and Interview Operations | [Inspect](12%20Recruiting/REC-01%20Candidate%20Consent%20Matching%20and%20Interview%20Operations/build/README.md) |
| MKT-01 | Multi-Channel Ad Operations Control Plane | [Inspect](13%20Marketing%20Agencies/MKT-01%20Multi-Channel%20Ad%20Operations%20Control%20Plane/build/README.md) |
| SAAS-01 | Trial-to-Paid Conversion and Usage Nurture Engine | [Inspect](14%20SaaS/SAAS-01%20Trial-to-Paid%20Conversion%20and%20Usage%20Nurture%20Engine/build/README.md) |
| SAAS-02 | Automated Dunning and Failed-Payment Recovery Engine | [Inspect](14%20SaaS/SAAS-02%20Automated%20Dunning%20and%20Failed-Payment%20Recovery%20Engine/build/README.md) |
| SAAS-03 | Churn Prediction and Proactive CS Intervention System | [Inspect](14%20SaaS/SAAS-03%20Churn%20Prediction%20and%20Proactive%20CS%20Intervention%20System/build/README.md) |
| SAAS-04 | Usage-Based Billing Reconciliation and RevRec Pipeline | [Inspect](14%20SaaS/SAAS-04%20Usage-Based%20Billing%20Reconciliation%20and%20RevRec%20Pipeline/build/README.md) |
| ECOM-01 | Multi-Market Product Content Governance | [Inspect](15%20E-Commerce/ECOM-01%20Multi-Market%20Product%20Content%20Governance/build/README.md) |
| ECOM-02 | Review Intelligence and Response Queue | [Inspect](15%20E-Commerce/ECOM-02%20Review%20Intelligence%20and%20Response%20Queue/build/README.md) |
| ECOM-03 | Catalog Inventory Reconciliation | [Inspect](15%20E-Commerce/ECOM-03%20Catalog%20Inventory%20Reconciliation/build/README.md) |
| ECOM-04 | Support Routing and SLA Control | [Inspect](15%20E-Commerce/ECOM-04%20Support%20Routing%20and%20SLA%20Control/build/README.md) |
| ACC-01 | Accounts Payable Match and Cash Control | [Inspect](16%20Accounting/ACC-01%20Accounts%20Payable%20Match%20and%20Cash%20Control/build/README.md) |
| CS-01 | Support Quality and Knowledge Feedback Loop | [Inspect](17%20Customer%20Support/CS-01%20Support%20Quality%20and%20Knowledge%20Feedback%20Loop/build/README.md) |
| IMP-01 | Import Company Agent Operating System | [Inspect](48%20Enterprise%20Workflows/IMP-01%20Import%20Company%20Agent%20Operating%20System/README.md) |
| PM-01 | Maintenance operations with access and reviewed local dispatch | [Runbook](demo-lab/MAINTENANCE.md) |
| EA-01 | Source-bound executive follow-up with reviewed local tasks | [Runbook](demo-lab/EXECUTIVE.md) |
| CON-01 | Compliance and reviewed local change-order commitments | [Runbook](demo-lab/CONSTRUCTION.md) |
| MED-01 | Synthetic referral completeness, consent and reviewed staff queue | [Runbook](demo-lab/REFERRAL.md) |
| LEGAL-01 | Synthetic matter/conflict and supplied-date administrative desk | [Runbook](demo-lab/LEGAL.md) |
| INS-01 | Synthetic loss packet and reviewed local adjuster queue | [Runbook](demo-lab/INSURANCE.md) |
| INV-01 | Bolt Supply Wholesale Reorder Desk | [Inspect](demo-lab/business-expansion.mjs) |
| CRM-01 | Studio North Agency Account Handoff | [Inspect](demo-lab/business-expansion.mjs) |
| AGT-01 | DeskPilot Support Agent Permission Gate | [Inspect](demo-lab/business-expansion.mjs) |
| OPS-01 | ClearSlot Booking Handoff Recovery Desk | [Inspect](demo-lab/business-expansion.mjs) |

The six industry rows link their existing durable desks. Older checklist/rules fixtures and copied contact-handoff workflows remain separate compatibility examples; they do not execute the new desks’ full local business lifecycles. Route and remaining-scope details are listed below.

## Life and data: all 20 entries

| ID | Project | Collection | Bundled example |
|---|---|---|---|
| LIFE-01 | Room for Life | Everyday life | [Input/output](demo-lab/human-examples/LIFE-01.json) |
| LIFE-02 | Shared Table | Everyday life | [Input/output](demo-lab/human-examples/LIFE-02.json) |
| LIFE-03 | Pantry First | Everyday life | [Input/output](demo-lab/human-examples/LIFE-03.json) |
| TRIP-01 | Gentle Day | Travel and belonging | [Input/output](demo-lab/human-examples/TRIP-01.json) |
| TRIP-02 | Pack Light | Travel and belonging | [Input/output](demo-lab/human-examples/TRIP-02.json) |
| TRIP-03 | Your Way There | Travel and belonging | [Input/output](demo-lab/human-examples/TRIP-03.json) |
| LIFE-04 | Together Time | Everyday life | [Input/output](demo-lab/human-examples/LIFE-04.json) |
| LIFE-05 | Book Nest | Everyday life | [Input/output](demo-lab/human-examples/LIFE-05.json) |
| LIFE-06 | Little Lessons | Everyday life | [Input/output](demo-lab/human-examples/LIFE-06.json) |
| CARE-01 | Care Circle | Community care | [Input/output](demo-lab/human-examples/CARE-01.json) |
| CARE-02 | Neighbour Hours | Community care | [Input/output](demo-lab/human-examples/CARE-02.json) |
| LIFE-07 | Second Life | Everyday life | [Input/output](demo-lab/human-examples/LIFE-07.json) |
| DATA-01 | Water Notes | Data stories | [Input/output](demo-lab/human-examples/DATA-01.json) |
| DATA-02 | Energy Diary | Data stories | [Input/output](demo-lab/human-examples/DATA-02.json) |
| CARE-03 | Story Keep | Community care | [Input/output](demo-lab/human-examples/CARE-03.json) |
| CARE-04 | Access Notes | Community care | [Input/output](demo-lab/human-examples/CARE-04.json) |
| DATA-03 | Time Lens | Data stories | [Input/output](demo-lab/human-examples/DATA-03.json) |
| DATA-04 | Every Voice | Data stories | [Input/output](demo-lab/human-examples/DATA-04.json) |
| DATA-05 | Small Steps | Data stories | [Input/output](demo-lab/human-examples/DATA-05.json) |
| DATA-06 | Near Enough | Data stories | [Input/output](demo-lab/human-examples/DATA-06.json) |

## AI engineering: all nine entries

| ID | Project | Local route |
|---|---|---|
| ENG-01 | ClaimProof | `/engineering#ENG-01` |
| ENG-02 | Action Ledger | `/engineering#ENG-02` |
| ENG-03 | Eval Observatory | `/engineering#ENG-03` |
| ENG-04 | Review Bench | `/engineering#ENG-04` |
| ENG-05 | ShelfSense | `/engineering#ENG-05` |
| ENG-06 | Comparison Notebook | `/engineering#ENG-06` |
| ENG-07 | Recommendation Sketchbook | `/engineering#ENG-07` |
| ENG-08 | Tiny Learning Lab | `/engineering#ENG-08` |
| ENG-09 | Repair Studio | `/engineering#ENG-09` |

## Twelve-system views

See [implementation and integration boundaries](demo-lab/TWELVE-SYSTEMS.md). These are not twelve additional industry flagship completions.

| ID | System | Local route |
|---|---|---|
| F01 | Salesforce RevenueOS | `/flagships#F01` |
| F02 | Incident & Recovery Console | `/flagships#F02` |
| F03 | Evidence-grounded Support Desk | `/flagships#F03` |
| F04 | Routing Evaluation Lab | `/flagships#F04` |
| F05 | Accounts Payable Review Desk | `/flagships#F05` |
| F06 | Source-linked Architecture Explorer | `/flagships#F06` |
| F07 | Salesforce Data Quality Studio | `/flagships#F07` |
| F08 | Product Governance Desk | `/flagships#F08` |
| F09 | Consent-aware Journey Simulator | `/flagships#F09` |
| F10 | Usage-to-Invoice Ledger | `/flagships#F10` |
| F11 | Commitments & Scheduling Board | `/flagships#F11` |
| F12 | Owned-code Reconstruction Challenge | `/flagships#F12` |

## Research builds and remaining blueprint work

The five source documents exist under [Research-to-Production](47%20Automation%20Blueprints/2026%20Research-to-Production/README.md). [AtlasGraph's local build](demo-lab/ATLASGRAPH.md) compiles structured JSON into immutable source versions, follows a bidirectional graph, abstains on missing/conflicting/over-budget evidence and persists receipts/corrections in SQLite. [TrustGate's local build](demo-lab/TRUSTGATE.md) resolves arguments from server-held synthetic sources, applies integrity/confidentiality policy, requires review for writes and executes three narrow SQLite tools with durable receipts and a hash-linked audit. [ChronosRank's local build](demo-lab/CHRONOSRANK.md) stores temporal memory events, filters expired/superseded facts, scores deterministic token matches and saves retrieval receipts with feedback. These are bounded implementations, not completion of their full research blueprints. [DocksideSLM's local build](demo-lab/DOCKSIDE.md) validates supplied structured extraction, requires local review and demonstrates durable offline delivery to an idempotent synthetic receiver. [VeilRAG's local build](demo-lab/VEILRAG.md) aliases declared exact literals across supplied frames, encrypts the reversible map and checks a synthetic child fixture before explicit restoration. Its conservative NFKC/lowercase declared-variant guard rejects remaining normalized variants rather than rewriting them; full case folding, encodings and undeclared information remain uncovered. It is not automatic entity detection or a general privacy guarantee.

| Project | Blueprint | Missing implementation scope |
|---|---|---|
| AtlasGraph — partial local build | [Design](47%20Automation%20Blueprints/2026%20Research-to-Production/01-atlasgraph.md) | A separately AI-authored synthetic graph-versus-flat-lexical diagnostic comparison is available ([runbook](demo-lab/ATLASGRAPH-EVALUATION.md)); source adapters, semantic/vector retrieval, model-selected tools, authentication and independently measured external multi-hop benchmarks remain open |
| ChronosRank — partial local build | [Design](47%20Automation%20Blueprints/2026%20Research-to-Production/02-chronosrank.md) | A separately AI-authored synthetic temporal-versus-blind-lexical comparison is available ([runbook](demo-lab/CHRONOSRANK-EVALUATION.md)); distillation/reranker training, vector candidate retrieval, calibrated abstention and external/model retrieval comparisons remain open |
| TrustGate — partial local build | [Design](47%20Automation%20Blueprints/2026%20Research-to-Production/03-trustgate.md) | Authenticated agent/tool integration, complete runtime provenance, signed remote receipts, LM/saliency screeners and independent adversarial acceptance |
| DocksideSLM — partial local build | [Design](47%20Automation%20Blueprints/2026%20Research-to-Production/04-docksideslm.md) | OCR/SLM extraction, actual edge-model compression, hardware execution, measured quality/latency and real ERP acceptance |
| VeilRAG — partial local build | [Design](47%20Automation%20Blueprints/2026%20Research-to-Production/05-veilrag.md) | Automatic entity detection, authenticated retrieval/provider integration, production key management and independently measured privacy/utility evaluation |

TrustGate depth update: the [separately AI-authored synthetic tool-policy challenge](demo-lab/TRUSTGATE-CHALLENGE.md) now measures actual policy/review/replay effects against fixed expectations. External human-reviewed adversarial acceptance and the broader integration/security requirements above remain open.

## Six industry flagships still partial

All six desks below are available on the checked main commit. Each uses actual local SQLite effects with synthetic fixtures, while the broader end-to-end requirements in [COMPLETION-ROADMAP.md](COMPLETION-ROADMAP.md) remain open. Actor/reviewer labels are demonstration selectors, not authenticated people or professional approval.

| ID | Available bounded local depth and route | Remaining flagship scope |
|---|---|---|
| [PM-01 — Property Management](demo-lab/project-builds/PM-01/README.md) | [Maintenance runbook](demo-lab/MAINTENANCE.md), `/maintenance?project=PM-01`: registered intake, deterministic emergency holds, occupant access grants, independent exact-hash review, appointments and local receiver recovery | Full lease lifecycle, authenticated occupants/vendors, live monitoring/escalation, real property/provider acceptance and recordings |
| [CON-01 — Construction](demo-lab/project-builds/CON-01/README.md) | [Construction runbook](demo-lab/CONSTRUCTION.md), `/construction?project=CON-01`: supplied-document receipts, readiness holds, versioned manager/finance reviews and an atomic budget commitment ledger | Real legacy email/PDF ingestion and issuer checks, authenticated roles, full contract amendments, real site/accounting/schedule integration and recordings |
| [MED-01 — Medical](demo-lab/project-builds/MED-01/README.md) | [Referral runbook](demo-lab/REFERRAL.md), `/referral?project=MED-01`: closed synthetic intake, fictional payer checklists, consent/revocation holds, independent packet review and one durable staff queue row | Secure real intake, actual document classification, authenticated access and consent governance, EHR/payer/provider integration and recorded acceptance; no clinical or insurance-authorization decision is implemented |
| [LEGAL-01 — Legal](demo-lab/project-builds/LEGAL-01/README.md) | [Legal runbook](demo-lab/LEGAL.md), `/industry/legal?project=LEGAL-01`: pinned fictional parties, normalized alias/relationship checks, exact/ambiguous holds, independently reviewed local matters and supplied-date calendar rows | Actual source ingestion and a complete conflict graph, qualified professional review, jurisdiction/statutory date rules, authenticated roles, real calendar/platform integration and recordings; fixture review is not legal clearance |
| [INS-01 — Insurance](demo-lab/project-builds/INS-01/README.md) | [Insurance runbook](demo-lab/INSURANCE.md), `/industry/insurance?project=INS-01`: closed loss/evidence fixtures, duplicate reconciliation, consent-bound independent routing review, assignment and revocation holds in one local adjuster queue | Real multi-channel FNOL, claimant/consent verification, authenticated roles, insurer/adjuster adapters, monitoring and recorded acceptance; no coverage, fraud or payment decision is implemented |
| [EA-01 — Executive Assistants](demo-lab/project-builds/EA-01/README.md) | [Executive runbook](demo-lab/EXECUTIVE.md), `/industry/executive?project=EA-01`: supplied source versions, an access-control simulation, independent fingerprint review, durable local tasks and revoke/regrant review invalidation | Authenticated inbox/meeting ingestion and sender/attendee policies, cross-channel commitment/follow-up lifecycle, live calendar/timezone reconciliation, production storage/privacy review, provider acceptance and recordings |

The medical, legal and insurance examples retain synthetic-data and human-review boundaries. Their closed fixture catalogs do not establish authentic consent, professional decisions or real-world permissions. Fixed scenario clocks support reproducible examples, not background deadline or SLA monitoring. All six remain partial; no new project or production completion is claimed by this reconciliation.

## All 50 numbered sections

The reconciled [master index](MASTER-INDEX.md) declares **17 populated, 33 partial and 0 pending placeholders**. Populated describes repository content, not production completion. Nine placeholder READMEs were replaced with concrete source-linked material: seven local-reference sections are populated; Make.com and Zapier remain partial translation/acceptance plans. Their native workflows and provider execution are still unimplemented. Earlier label corrections for existing Prompt Library and Database Schemas evidence add no new implementation. The 137-entry IMP-01 registry is not 137 independent applications.

The nine replaced placeholders now contain the following material:

- [00 Executive Summary](00%20Executive%20Summary/README.md): public brief and concrete review cases.
- [02 Discovery](02%20Discovery/README.md): ownership/failure worksheet tied to the actual handoff.
- [03 Business Analysis](03%20Business%20Analysis/README.md): requirements, acceptance and illustrative assumptions.
- [04 Automation Framework](04%20Automation%20Framework/README.md): implemented architecture and tool-selection boundaries.
- [22 Make.com](22%20Make.com/README.md): partial native translation and acceptance plan.
- [23 Zapier](23%20Zapier/README.md): partial native translation and acceptance plan.
- [30 API Documentation](30%20API%20Documentation/README.md): implemented loopback contracts and executable examples.
- [38 Deployment](38%20Deployment/README.md): local setup, persistence, validation and recovery; no production deployment claim.
- [42 Client Deliverables](42%20Client%20Deliverables/README.md): public synthetic evidence and takeover checklist.

Other partial sections still need platform-specific adapters, canonical prompt/schema catalogs, operational libraries, authentication, provider acceptance or curated evidence. Per-project SQL does not complete a database-schema catalog; a recording script does not constitute a recorded walkthrough. All 26 indexed SOP videos remain pending recording.

## Reconciliation and next work

- The original presence audit matched the collection registries, automation source/wrapper paths and all 20 human fixture files. This update retains the 73-entry count and maps the six existing industry desks to their actual runbooks and routes.
- All six standalone industry acceptance CLIs were rerun successfully for this reconciliation: `run-maintenance.mjs`, `run-construction.mjs`, `run-referral.mjs`, `run-legal.mjs`, `run-insurance.mjs` and `run-executive.mjs` under `demo-lab`. They exercise local synthetic effects, not provider acceptance or professional decisions. Exact results belong in the delivery log and PR evidence.
- The unified inventory and AtlasGraph comparison are already on main. This documentation change adds no runtime feature. Open PRs #37–#39 remain separately identified above; no merge or deployment is performed by this update.
- Next: resolve feedback on those open improvements before duplicating their work; then select a bounded remaining industry, integration or evaluation dependency from the linked runbooks. Authentication, trusted source ingestion, external/model or hardware measurements, platform-native acceptance and recorded walkthroughs require their own evidence.

## Other GitHub projects and privacy

The public owner-repository endpoint was checked on October 26, 2026 and returned 13 public repositories: this portfolio, its profile README and 11 other repositories. Those 11 are not automatically portfolio-ready builds; only public names/URLs were checked, not their source quality or completeness. [Review the public repository list](https://github.com/Frosty9810?tab=repositories) separately before curating imports. PaceAtlas is not in that public list; original source/demo integration remains unverified. Its independent TRIP-01–TRIP-03 prototypes are not represented as PaceAtlas features. PORT / OS links to the existing public IMP-01 example; private code and client files were not inspected or copied.

## Earlier implementation audit

These retained notes describe the earlier delivery. The current continuation queue is in Reconciliation and next work above.

- Matched all four registries, every automation source/wrapper path and all 20 human fixture files.
- Executed the 20 human and nine engineering bundled fixtures. This is local fixture evidence, not a new full n8n/provider run or a semantic benchmark.
- Compared public main with the showcase branch and reconciled all 50 section labels against current linked artifacts.
- Added the unified in-app inventory/deep links across all five collections and a partial AtlasGraph build. Tests cover destination selection, compiler persistence, adverse evidence, stale exports and local HTTP boundaries. See [AtlasGraph reproduction](demo-lab/ATLASGRAPH.md); exact-head validation belongs in the delivery log and PR evidence.
- Next: externally review and broaden the separately authored AtlasGraph synthetic comparison, extend TrustGate's independent adversarial cases, externally review and broaden the separately authored ChronosRank temporal challenge, or continue the six industry flagship flows. Provider/authentication, hardware/model measurements and recording acceptance remain separate.
- The prior showcase and its seven child changes are on main. New research PRs remain subject to review/backlog controls; this delivery does not merge or deploy them.
