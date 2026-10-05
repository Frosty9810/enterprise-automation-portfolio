# Gabriel Acosta — automation engineering portfolio

**Start with the interactive product-governance case:** [walkthrough and engineering boundaries](demo-lab/PRODUCT-GOVERNANCE.md). After local setup, open `http://127.0.0.1:5680/product-governance` to edit a translation, inspect the original Python policy, record a review and export the exact reviewed draft. Synthetic inputs make the workflow shareable without client records.

See [showcase depth and acceptance boundaries](SHOWCASE-DEPTH.md) for the strongest cases, collection-wide principles and the current verification limitation.

Business workflows built with n8n, Python and TypeScript, with GoHighLevel relationship handoffs and explicit human review boundaries.

**[Explore all 17 project packages →](showcase/README.md)**

## Recommended presentation route

1. **ECOM-01 — Automation:** inspect protected-fact rules, the n8n wrapper and local CRM handoff.
2. **ShelfSense (ENG-05) — Human review:** correct the supplied pack size against its source before approval.
3. **Repair Studio (ENG-09) — Coding evidence:** compare the known bug, Codex-assisted candidate and actual tests.

The same route appears on the portfolio landing page. Additional automation case studies follow.

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

The original 50 numbered sections remain available for architecture, SOPs and operating material. [MASTER-INDEX.md](MASTER-INDEX.md) separates populated references from placeholders; [COMPLETION-ROADMAP.md](COMPLETION-ROADMAP.md) tracks unfinished work. Five research-to-production concepts remain blueprints.

GitHub: [Frosty9810](https://github.com/Frosty9810). A [profile README draft](github-profile/README.md) is ready for review.

---
Part of the Enterprise Automation Portfolio.

## Run the local showcase

The [local demo lab](demo-lab/README.md) contains 27 automation demonstrations for local n8n. GHL is a local API simulator. See [verification evidence](demo-lab/VERIFICATION.md) and [source review / next builds](demo-lab/RESEARCH-AND-NEXT-BUILDS.md).

The separate **Life and data** collection adds [20 interactive browser-local prototypes](demo-lab/HUMAN-COLLECTION.md): six data-analysis tools, three travel tools, four community-care tools and seven everyday-life tools. Each includes editable invented examples, calculated charts and downloadable results. These are bounded working prototypes, not production products or additional n8n deployments. PORT / OS links to its existing public engineering example; PaceAtlas AI's original source remains unverified, and the travel prototypes are separate new work.

## September 10 business build expansion

The local catalog now contains 27 runnable demos. See [new builds and the remaining section audit](demo-lab/EXPANSION-PLAN.md). Four new fictional-business implementations cover wholesale replenishment, agency CRM handoff, support-agent permissions and booking handoff recovery. Each has local n8n execution evidence; hosted vendor acceptance remains separate.


## Specialist/governor workflow

See [PORTFOLIO-AGENTS.md](PORTFOLIO-AGENTS.md) for the reusable Codex delegation workflow. Run `npm run govern` in demo-lab for parallel local cross-check workers and a snapshot-bound governor decision. The engineering page displays the result. AI critique and deterministic checks are explicitly separate; approval does not authorize deployment.
