# Gabriel Acosta — automation engineering portfolio

**[Complete project inventory and missing work](PROJECT-INVENTORY.md)** — open the local `/projects` page to search all 73 named entries: 27 automation demos, 20 life/data tools, nine engineering prototypes, twelve-system views and five research tracks. The collections share components; all five research entries have partial local builds. The unified catalog and the first three research builds are on main. New partial builds are reviewed in feature PRs.

**[PM-01 maintenance operations](demo-lab/MAINTENANCE.md)** — open `http://127.0.0.1:5680/maintenance?project=PM-01` for synthetic tenant intake, deterministic emergency holds, access windows, independently reviewed vendor proposals and recoverable local receiver delivery. The clock is a fixed scenario; labels are not authentication and operator-reported completion is not a verified property visit. The full industry flagship remains unfinished.

**[AtlasGraph local build](demo-lab/ATLASGRAPH.md)** — open `http://127.0.0.1:5680/research?project=AtlasGraph` to compile versioned synthetic pages, follow a two-hop evidence path, inspect exact citations and retain failed paths for correction. SQLite restart/replay and stale evidence are tested; semantic retrieval, real source adapters and research baseline comparisons remain pending.

**[MED-01 synthetic referral desk](demo-lab/REFERRAL.md)** - open `http://127.0.0.1:5680/referral?project=MED-01` to inspect fictional document checklists, consent holds, independent packet review and a durable local staff queue. Inputs select supplied synthetic fixtures; the fixed clock is not live monitoring. This administrative example makes no clinical, coverage or insurance-authorization decision. The full industry milestone remains partial.

**[TrustGate local tool gateway](demo-lab/TRUSTGATE.md)** — open `http://127.0.0.1:5680/trustgate` to resolve tool arguments from registered synthetic sources, inspect policy holds, review proposed writes and execute three narrow SQLite tools. Outbound providers and authenticated agent integration remain outside this partial research build.

**[ChronosRank local memory workbench](demo-lab/CHRONOSRANK.md)** — open `http://127.0.0.1:5680/chronosrank` to append synthetic memory events, retrieve as of a chosen time, inspect excluded facts and preserve source receipts with feedback. Token-overlap scores are deterministic; no trained reranker or calibrated probability is claimed.

**[DocksideSLM local document queue](demo-lab/DOCKSIDE.md)** — open `http://127.0.0.1:5680/dockside` to validate supplied synthetic document fields, review exact content and exercise offline/retry/reconciliation against a local receiver. OCR, learned extraction, real ERP and edge-hardware measurements remain outside this partial build.

**[VeilRAG local alias boundary](demo-lab/VEILRAG.md)** — open `http://127.0.0.1:5680/veilrag` to alias explicitly declared literals, inspect sanitized child-fixture transport and request local restoration. The reversible map is encrypted; protocol metadata remains plaintext. No automatic detection, external provider or general privacy guarantee is claimed.

**[Twelve executable business systems](demo-lab/TWELVE-SYSTEMS.md)** — open `http://127.0.0.1:5680/flagships` to explore Salesforce operations, recovery, grounded support, routing evaluation, invoice controls, architecture evidence, merge previews, product governance, consent, billing, scheduling and reconstruction. Cross-check all twelve, edit evidence and export reviewed local analysis. These are synthetic local demonstrations; live integration and business-impact acceptance remain separate.

**[RevenueOS — Salesforce control room](demo-lab/SALESFORCE-REVENUEOPS.md)** is the new local flagship: lead assignment, opportunity follow-up and case escalation, with reviewed field changes, revision checks and durable recovery. Open `/salesforce` in the lab and run the full demonstration. The 27 n8n demos remain a separate collection; this flagship performs local SQLite record updates and makes no hosted Salesforce calls.

**[Reliability workshop for all 27 automation projects](demo-lab/RELIABILITY-WORKSHOP.md)** — open `/workshop` in the local lab to explore business passports, reviewed handoffs, duplicate events, timeout recovery and source-bound evidence. See the [integration roadmap](demo-lab/PORTFOLIO-ROADMAP.md) for the remaining depth work.

**Start with the interactive product-governance case:** [walkthrough and engineering boundaries](demo-lab/PRODUCT-GOVERNANCE.md). After local setup, open `http://127.0.0.1:5680/product-governance` to edit a translation, inspect the original Python policy, record a review and export the exact reviewed draft. Synthetic inputs make the workflow shareable without client records.

See [showcase depth and acceptance boundaries](SHOWCASE-DEPTH.md) for the strongest cases, collection-wide principles and the current verification limitation.

Business workflows built with n8n, Python and TypeScript, with GoHighLevel relationship handoffs and explicit human review boundaries.

**[Explore all 17 project packages →](showcase/README.md)**

## Recommended presentation route

1. **Salesforce RevenueOS:** run Lead, Opportunity and Case decisions; inspect reviewed patches and revision holds.
2. **Incident Recovery:** show an uncertain write reconciled without duplicating the local effect.
3. **Accounts Payable:** compare invoice/PO/receipt evidence, then demonstrate duplicate or changed-bank holds.

The twelve-system hub connects these cases; the landing page also retains product governance and the engineering prototypes. Additional automation case studies follow.

**New: [AI Engineering Workbench](demo-lab/AI-WORKBENCH.md)** — open `http://127.0.0.1:5680/engineering` for ClaimProof, Action Ledger and Eval Observatory. The expanded collection now has nine local engineering prototypes, including guided human review, supplier-field correction, recorded repair tests and a measured learning chart. They add editable fixtures, decision traces and exportable results for evidence validation, controlled tool actions and regression comparison. They use deterministic code and make no live-model performance claim.

| Project | What you can inspect | Engineering discussion |
|---|---|---|
| [RE-01 · Lead operations](showcase/RE-01/README.md) | Lead scoring, original workflow, GHL contact preview | Identity normalization, dataflow and delivery limits |
| [ECOM-01 · Product content governance](showcase/ECOM-01/README.md) | Protected-fact checks and blocked-change examples | Policy enforcement before publishing |
| [ACC-01 · Invoice controls](showcase/ACC-01/README.md) | Matching, duplicate/bank-change rejection | Separate draft preparation from payment authority |
| [IMP-01 · PORT / OS](showcase/IMP-01/README.md) | Public deterministic agent prototype and review architecture | Source evidence and human authorization |

## What is built

Sixteen business reference projects contain n8n workflow JSON, runnable Python and PostgreSQL schemas. IMP-01 adds a TypeScript application. Each of the 17 showcase packages includes an additional **synthetic n8n contact-request preview**, a project-specific **GHL setup blueprint**, source links and a recording script.

The new previews use one tested JavaScript planner and make no external requests. They are not full GHL deployments or native snapshots. Original business workflows still need live n8n/database/provider acceptance; the audit records known gaps. No client engagement, production result, recorded video or ROI is implied by these synthetic examples.

## Review the engineering

- [Current PR stack, reproduction steps and review handoff](REVIEW-HANDOFF.md)
- [n8n exports and operating guidance](21%20n8n/README.md)
- [GoHighLevel setup and integration boundary](24%20GoHighLevel/README.md)
- [Claude Code / Codex project examples](20%20Claude%20Code/README.md)
- [Quality checks and measured limits](37%20Testing/README.md)
- [Dated portfolio and GitHub audit](PORTFOLIO-AUDIT-2026-09-08.md)
- [Recorded/pending walkthrough index](32%20SOP%20Library/video-index.md)

## Run locally

Use Python 3.14 and Node 24 for the recorded toolchain:

~~~sh
python -m venv .venv
# Activate .venv for your shell, then:
python -m pip install -r requirements-dev.txt
python scripts/check_quality.py
~~~

The runner preserves independent exit codes, strips provider credentials from demo environments and writes [quality evidence](reports/quality.json). The [CPU benchmark](reports/handoff-benchmark.json) describes its synthetic workload and exclusions.

## Deeper library

The original 50 numbered sections remain available for architecture, SOPs and operating material. [MASTER-INDEX.md](MASTER-INDEX.md) distinguishes populated references from partial sections; [COMPLETION-ROADMAP.md](COMPLETION-ROADMAP.md) tracks unfinished work. All five research designs remain available: All five have partial local implementations; their model, hardware, provider and full research requirements remain unfinished.

GitHub: [Frosty9810](https://github.com/Frosty9810). [Public profile repository](https://github.com/Frosty9810/Frosty9810).

---
Part of the Enterprise Automation Portfolio.

## Run the local showcase

The [local demo lab](demo-lab/README.md) contains 27 automation demonstrations for local n8n. GHL is a local API simulator. See [verification evidence](demo-lab/VERIFICATION.md) and [source review / next builds](demo-lab/RESEARCH-AND-NEXT-BUILDS.md).

The separate **Life and data** collection adds [20 interactive browser-local prototypes](demo-lab/HUMAN-COLLECTION.md): six data-analysis tools, three travel tools, four community-care tools and seven everyday-life tools. Each includes editable invented examples, calculated charts and downloadable results. These are bounded working prototypes, not production products or additional n8n deployments. PORT / OS links to its existing public engineering example; PaceAtlas AI's original source remains unverified, and the travel prototypes are separate new work.

## September 10 business build expansion

The local catalog now contains 27 runnable demos. See [new builds and the remaining section audit](demo-lab/EXPANSION-PLAN.md). Four new fictional-business implementations cover wholesale replenishment, agency CRM handoff, support-agent permissions and booking handoff recovery. Each has local n8n execution evidence; hosted vendor acceptance remains separate.


## Specialist/governor workflow

See [PORTFOLIO-AGENTS.md](PORTFOLIO-AGENTS.md) for the reusable Codex delegation workflow. Run `npm run govern` in demo-lab for parallel local cross-check workers and a snapshot-bound governor decision. The engineering page displays the result. AI critique and deterministic checks are explicitly separate; approval does not authorize deployment.
