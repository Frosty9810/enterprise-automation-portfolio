# Local showcase review handoff — October 23, 2026

This batch adds the unified 73-entry project inventory and partial local AtlasGraph, TrustGate and ChronosRank research builds alongside the demonstration phase of the [portfolio roadmap](demo-lab/PORTFOLIO-ROADMAP.md): executable synthetic business decisions, adverse cases, readable evidence and reproducible local checks. Review readiness covers that scope. Hosted integrations, authentication, recordings, business impact and the broader [completion roadmap](COMPLETION-ROADMAP.md) remain separate work.

## Current research delivery

The previous showcase and all seven child changes are integrated into main at `8d3662c1a34e4fe2cbb59665feb4b13337f240a0`. This branch adds the partial local DocksideSLM document queue and reconciles discovery/status text. Review its complete diff and exact-head checks against main. Local checks do not authorize merging, deployment or external-provider access.

## Previous integrated PR stack

| PR | Bounded change | Current integration status |
|---|---|---|
| [#12](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/12) | Unified inventory, three partial research builds, twelve-system showcase and shared reliability/evidence controls | Merged into `main`; includes all seven child changes below |
| [#20](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/20) | Ad metric validation and exact analysis identity | Merged into #12 |
| [#21](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/21) | Consent-gated, duplicate-invariant skill coverage | Merged into #12 |
| [#22](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/22) | UTC trial-window usage/evidence contract | Merged into #12 |
| [#23](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/23) | Inventory input contract and proposal identity | Merged into #12 |
| [#24](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/24) | Source-linked explorer and stale evidence rejection | Merged into #12 |
| [#25](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/25) | Canonical usage ingestion, credits and balanced draft journal | Merged into #12 |
| [#26](https://github.com/Frosty9810/enterprise-automation-portfolio/pull/26) | Durable local reservation ledger and separate UI exercise | Merged into #24, then #12 |

All rows above are now merged. The child links preserve their original bounded diffs and evidence; current main contains them. New research work is delivered through separate feature PRs. Always reconcile GitHub state before continuing a delivery; historical ready status and green checks do not authorize a merge or deployment.

## Reproduce acceptance

Use Python 3.14 and Node 24. From the repository root, create the required environment with `python -m venv .venv`, then activate `.venv` using `.venv\Scripts\Activate.ps1` in PowerShell or `source .venv/bin/activate` in Bash. The suite invokes Python from that exact repository-root `.venv` path. Run `python -m pip install -r requirements-dev.txt` so Ruff is on the activated PATH, then `npm ci --prefix demo-lab --no-audit --no-fund`. Continue from the repository root:

```sh
python scripts/check_quality.py
npm run govern --prefix demo-lab
node demo-lab/run-flagships.mjs
node demo-lab/run-salesforce.mjs
```

The integrated reservation and research builds have additional reproduction commands:

```sh
node demo-lab/run-reservations.mjs
node --test demo-lab/reservation-ledger.test.mjs demo-lab/reservation-ui.test.mjs
node demo-lab/run-chronosrank.mjs
node --test demo-lab/chronosrank-core.test.mjs demo-lab/chronosrank-ui.test.mjs demo-lab/chronosrank-http.test.mjs
node demo-lab/run-trustgate.mjs
node demo-lab/run-dockside.mjs
```

The quality runner covers artifact generation/validation, Python policies, lint/format, handoff contracts, the Node regressions, benchmark and Python examples. The [governor](PORTFOLIO-AGENTS.md) requires one unchanged source snapshot; its approval covers automated local checks. Independent reviewer findings and their closure are recorded separately in PR descriptions. Portfolio CI also runs the public site's lint/type/build checks and all 27 local n8n wrappers plus replay; separate path-filtered agent workflows run their request/evidence tests. Wrapper execution does not establish complete original-workflow or hosted-provider acceptance.

The twelve-system runner must report 12/12 systems and 48/48 checks. Salesforce-shaped acceptance must report its six checks, three SQLite domain effects, restart recovery and reconciliation. The fixed reservation exercise must show a conflict, zero-effect replay, cancellation and released-window replacement. It does not reserve edited candidate slots. Per-branch regression counts differ; recheck the exact commit instead of copying an older count.

Start the lab with `npm start --prefix demo-lab`, then open `http://127.0.0.1:5680/flagships`. Run a successful case, edit an adverse input, inspect the hold/recovery, acknowledge the current source-bound local analysis and export its receipt. DOM interaction tests and dated desktop observations are distinct evidence; neither establishes mobile or accessibility conformance. Use synthetic inputs only.

Reports under `reports/` and `demo-lab/governance-report.json` are regenerated evidence, not permanent certificates. Keep fresh reports with their exact commit when reviewing; inspect generated-file diffs before publishing. Source changes require fresh validation and invalidate affected analysis review/export.

## CI runtime maintenance

All three workflows pin official actions to exact release commits using Node 24:

| Action | Verified release | Pinned commit |
|---|---|---|
| Checkout | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| Node setup | [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| Python setup | [v7.0.0](https://github.com/actions/setup-python/releases/tag/v7.0.0) | `5fda3b95a4ea91299a34e894583c3862153e4b97` |
| Evidence upload | [v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |

Release tags and each pinned `action.yml` were verified against the official repositories. Existing workflow triggers, job permissions, project runtime versions, commands and evidence paths are retained. Action runtime and the Node version selected for a project are separate; the agent-specific jobs retain their explicit Node 22.13.0 target. Future updates must verify release provenance, supported runner/runtime and input compatibility, then pass exact-head CI; do not suppress deprecation warnings by disabling checks.

## Remaining acceptance boundaries

The five research tracks remain partial or unbuilt: AtlasGraph, TrustGate, ChronosRank and DocksideSLM provide bounded local workflows; VeilRAG remains blueprint-only. See [the current inventory](PROJECT-INVENTORY.md) for all 73 entries and the six unfinished industry flagships. ChronosRank uses deterministic token overlap and supplied time/source labels; no trained reranker, calibrated probability or research benchmark is claimed. [Its runbook](demo-lab/CHRONOSRANK.md) documents ingestion watermarks, immutable retries and fresh-request recovery.


The first integration target is an explicitly authorized Salesforce sandbox, followed by one real provider timeout/reconciliation case and an independent support evaluation dataset. Reviewer labels and tenant IDs in the local demos are supplied and unauthenticated. Routing instruction markers are supplied; absent markers do not establish safety. Invoice/payment, hiring, calendar/dispatch and publishing authority remain outside this demonstration.

Before reusing real historical data, reconcile affected analysis identities and ledger contracts: inventory-v2 receipt mapping, ACC-01 invoice identities, affected large-float ad-v2 caches, and malformed/NUL reservation identifiers. Source-manifest changes require fresh current receipts. No production migration, accounting-policy approval, real model/token-cost measurement, provider acceptance or client result is claimed by this batch.
