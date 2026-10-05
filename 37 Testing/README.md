# Quality gates and benchmark evidence

Status: local quality suite implemented. Passing gates have explicitly bounded scope.

Run `python scripts/check_quality.py` with requirements-dev.txt installed and Node 24 on PATH. Every check retains its own exit code in [quality.json](../reports/quality.json); a later successful command cannot mask an earlier failure.

| Gate | Evidence | Does not prove |
|---|---|---|
| Python lint/format | Ruff policy in ruff.toml | Security certification |
| Python behavior tests | Policy, graph-validator and timestamp regressions | Complete branch coverage of all projects |
| Python demos | All 16 scripts execute with provider credentials removed | Live API or trained-model validity |
| n8n structure | 33 exports; unique nodes and trigger reachability | n8n runtime/credential compatibility |
| Embedded JavaScript tests | Actual code from each new export executes | Full original business workflow behavior |
| Generated output drift | Catalog/source/exports remain synchronized | Live GHL setup |
| Planner CPU benchmark | 100,000 synthetic calls after warmup, batch mean distribution | Per-request p95, API latency, n8n throughput or concurrency |

The benchmark's 1 ms p95 batch-average ceiling is a generous regression smoke budget. Results include hardware/runtime, iterations, measurement date and exclusions. Do not advertise local throughput as GHL processing capacity. The measured output is [handoff-benchmark.json](../reports/handoff-benchmark.json).

Ruff preserves existing str/Enum rendering by excluding UP042. Two optional backend exception boundaries retain broad catches with local rationale and explicit fallback output. These exceptions are visible rather than hidden behind a blanket pass claim.

Both PORT / OS copies received separate application checks on 8 September 2026: the private application passed 97 tests, type checking, lint and build; public IMP-01 passed type checking, lint and build. Browser accessibility, load, dependency vulnerability scanning, PostgreSQL execution and live platform acceptance were not completed.

CI runs artifact, lint, format, generation, Python behavior, embedded JavaScript and CPU gates. The full local runner additionally runs the sixteen demo entry points. See the [audit](../PORTFOLIO-AUDIT-2026-09-08.md) for remaining release gates.

---
Part of the [Enterprise Automation Portfolio](../README.md).

## Real n8n local integration gate

The [local lab verification](../demo-lab/VERIFICATION.md) adds 19 actual n8n executions, original-node compatibility inspection, local simulator failure tests and a native n8n audit. The audit retains its 76 HTTP/Code node findings. CI now has a separate n8n integration job.
