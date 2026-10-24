# Local verification

## Latest Windows run — 5 October 2026

The real local n8n run passed **26 of 27** showcase wrappers, including ECOM-01, and the RE-01 replay check passed. SAAS-03 failed because Windows Application Control blocked a native SciPy extension. The overall result is **failed**, preserved in [execution evidence](../reports/n8n-local-executions.json). Sixteen original exports passed node/version/credential-class compatibility inspection; this does not execute those complete workflows.

The quality gate passed 19 Python tests, 77 interactive Node tests, artifact validation, lint, format, generated showcase checks and n8n Code-node tests. Fifteen of sixteen Python demo entry points passed; the same native-library block keeps the complete gate failed. See [quality.json](../reports/quality.json).

Evidence records are dated snapshots of hashes captured at execution time on the Windows host. Compare those hashes before applying an old result to changed source or generated artifacts. Generated contact-planner snippets now normalize CRLF to LF for reproducible Windows/Linux generation.

## Historical run — 9 September 2026

- **23/23 showcase wrappers executed successfully in n8n 2.38.1.** Each invokes its real source demo, validates a synthetic contact, performs an HTTP upsert to the simulator and verifies the result.
- **Replay passed:** RE-01 preserved the contact identity and total contact count.
- **16/16 original exports have supported node classes, versions and credential types** in the installed n8n registry. This is compatibility inspection, not execution of those original full workflows.
- **Simulator/extra-scenario tests passed:** validation, update preservation, 20 concurrent duplicate requests, location boundary, 401, version mismatch, 429/Retry-After, cross-origin rejection and uncertain-write reconciliation; plus maintenance and commitment behavior.

- **161 shared handoff checks passed** across 23 projects (seven cases each).
- **24 expected-output cases passed** for CON-01, MED-01, LEGAL-01 and INS-01. Their assertions also execute inside each new n8n domain step.
- **Eight integration tests passed**, covering the original simulator behavior, activity/failure recovery, artifact allowlists, new scenarios and shared acceptance.

## Preserved evidence

- [Expansion evaluation cases](../reports/expansion-evaluations.json)
- [Coverage of all numbered sections](../reports/portfolio-coverage.json)
- [Actual n8n execution results](../reports/n8n-local-executions.json)
- [Original node compatibility](../reports/original-node-compatibility.json)
- [Native n8n security audit](../reports/n8n-security-audit.json)
- [Repository quality gates](../reports/quality.json)
- [Local HTTP/SQLite benchmark](../reports/local-api-benchmark.json)

The isolated simulator benchmark completed 3,000 requests at concurrency 1, 8 and 32 with zero errors and exactly 100 unique contacts after repeated upserts. At concurrency 32, this run measured about 11 ms p95. It uses in-memory SQLite and loopback HTTP; it excludes disk durability, n8n and hosted GHL latency. Repeat with `node demo-lab/benchmark.mjs`; it does not add benchmark contacts to the presentation database.

The native n8n audit identifies **92 HTTP Request/Code nodes** under its official risky-node category (four per demo). They are expected components of this local lab, and remain reported; this is not a clean security certification. The audit requested credentials, database, filesystem and nodes categories. Instance/network exposure and dependency vulnerability auditing were not part of that command.

The lab binds to loopback, accepts only cataloged project IDs, runs source demos without provider credentials, bounds request bodies and runs one workflow at a time. Its fixed demo credential is not a production authentication design. GHL here is a narrow API simulator; native GHL objects, OAuth, campaigns and real account duplication policy remain unverified.

The n8n CLI does not include a stable execution ID in the returned raw document here; the lab records its own run ID, timestamps, source hash and workflow hash. No missing provider ID is invented.

## Remaining checks

Hosted GHL requires a designated test sub-account and credential binding. Original full workflows require their original provider/database fixtures and dataflow repairs. Videos require recording or accessible source URLs. Browser UI interaction testing was stopped by the computer-use tool's URL verification policy; local HTTP/runtime checks succeeded.

---
Part of the [local demo lab](README.md).
