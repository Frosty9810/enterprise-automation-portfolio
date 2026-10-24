# Local setup and release-review runbook

> Status: **Populated — reproducible local setup and review; production deployment pending.**

This runbook starts the synthetic portfolio lab. It does not deploy a public service, authorize a merge or establish hosted integrations. Use the exact branch/commit being reviewed; [REVIEW-HANDOFF](../REVIEW-HANDOFF.md) records the PR dependency order and acceptance boundaries.

## Prepare an isolated checkout

Preserve unfinished changes in any existing checkout. Use a clean clone/worktree of the public portfolio branch you intend to review, confirm its origin, and record its commit before generating evidence:

```powershell
git remote get-url origin
git rev-parse HEAD
git status --short
```

The public origin is `https://github.com/Frosty9810/enterprise-automation-portfolio.git`. Do not copy another project's private files into this checkout.

## Install and start locally

The [CI workflow](../.github/workflows/validate-portfolio.yml) uses Python 3.14 and Node 24. From the repository root, after installing those runtimes:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
npm ci --prefix demo-lab --no-audit --no-fund
npm start --prefix demo-lab
```

If PowerShell activation is unavailable under local policy, invoke `.\.venv\Scripts\python.exe` explicitly for Python commands. The lab expects the repository-root `.venv` path when starting its Python subprocesses. On Bash, activate with `source .venv/bin/activate`. The dependency lockfile pins n8n; preserve the repository's npm configuration. No provider credentials are needed for local fixtures.

Open [all portfolio projects](http://127.0.0.1:5680/projects), [the lab](http://127.0.0.1:5680), [twelve systems](http://127.0.0.1:5680/flagships), [research builds](http://127.0.0.1:5680/research?project=AtlasGraph), [recovery workshop](http://127.0.0.1:5680/workshop) or [Salesforce-shaped local demo](http://127.0.0.1:5680/salesforce). The inventory shows partial and blueprint-only tracks explicitly. Use the numeric address: the [HTTP boundary](../30%20API%20Documentation/README.md) rejects alternate Host authorities and foreign origins.

In a second terminal, check readiness:

```powershell
Invoke-RestMethod 'http://127.0.0.1:5680/health'
```

Expect `status: ok` and `mode: local-demo`. Stop the foreground server with Ctrl+C. If the port is occupied, identify and coordinate with its owner before stopping anything.

## Reproduce review evidence

From the root with the environment installed, select the checks relevant to the changed scope. Full local acceptance is:

```powershell
.\.venv\Scripts\python.exe scripts/check_quality.py
npm run govern --prefix demo-lab
node demo-lab/run-flagships.mjs
node demo-lab/run-salesforce.mjs
```

With the lab running and no competing n8n editor/CLI execution, the separate wrapper checks are:

```powershell
node demo-lab/verify.mjs
node demo-lab/audit-originals.mjs
```

The [quality runner](../scripts/check_quality.py) checks artifacts, Python policies, lint/format, generated packages, Node regression, benchmark and examples; it does not itself run all n8n wrappers. The [governor](../PORTFOLIO-AGENTS.md) validates an unchanged source snapshot and automated local role reports. CI separately validates the public IMP-01 site's lint, type and build checks. Inspect generated report diffs and retain the exact source commit with each result. Do not edit a report to manufacture approval.

## Local state and recovery

The server creates `demo-lab/.runtime/ghl-simulator.sqlite` and related runtime files, including SQLite WAL/SHM files while open; the EA-01 demo can create a separate decision-register database. AtlasGraph source versions, snapshots, receipts and Error Book records share the server's SQLite database. n8n's local state also lives under `demo-lab/.runtime/`. This directory, `.venv/`, `node_modules/` and `.env` files are ignored by [Git rules](../.gitignore). Reports under `reports/` can be tracked, so inspect their content before publication.

For a local backup, stop the server and n8n processes cleanly before copying the entire runtime directory to a private backup location outside the public repository. Keep synthetic runtime data and operator account state private; do not commit a database or credentials. No production database migration, backup scheduler or restore guarantee is implemented here.

To return to an older code revision, preserve current work and use a separate clean checkout. Existing receipt/source hashes can be stale under another revision. Keep the original runtime backup and use a fresh synthetic runtime when reproducing that revision; there is no automatic cross-version runtime migration. Source changes require restart and fresh analysis/review before export.

## Remaining release acceptance

A production release still needs authenticated roles, secret storage, TLS/network design, provider sandbox acceptance, deployment infrastructure, migration/restore rehearsal, monitoring, incident ownership and explicit approval. The [completion roadmap](../COMPLETION-ROADMAP.md) and [project inventory](../PROJECT-INVENTORY.md) track those gaps. Local green checks, ready PRs and scheduled delivery do not authorize deployment.

---
*Part of the [Enterprise Automation Portfolio](../README.md).*
