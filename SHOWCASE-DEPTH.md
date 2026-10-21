# Automation portfolio: showcase depth and acceptance boundaries

The catalog contains 27 local automation demos. Seventeen reuse cleaned reference business builds; ten are new bounded examples. A synthetic reconstruction can explain shipped-work patterns without exposing a customer's system, but it is not evidence that the reconstruction itself was deployed for that customer.

## Start with depth

| Case | What a visitor can inspect | Remaining production acceptance |
| --- | --- | --- |
| ECOM-01 product governance | Editable source/candidate, original Python checks, immutable receipts, local review, stale-source/policy rejection, exported handoff | Multilingual semantic policy, authenticated reviewers, authoritative catalog ingestion, controlled storefront publication |
| PM-01 maintenance dispatch | Access-window and approved-vendor scheduling constraints, SLA handling, exception queues | Trusted tenant records, transactional booking, dispatch authorization and vendor delivery |
| EA-01 executive decision register | Durable atomic ingestion, replay handling, conflicting versions, owner confirmation | Connector-supplied ACLs, identity authentication, permission-aware retrieval and follow-up delivery |
| ACC-01 payable controls | Invoice matching, review reasons and explicit payment-release restriction | Trusted accounting/bank connectors, independent authorization and recovery acceptance |
| RE-01 lead handoff | Original scoring logic, actual local n8n wrapper, minimal contact planner, replay-safe simulator upsert | Authorized CRM account, provider contract acceptance and delivery verification |

Use [Product governance](demo-lab/PRODUCT-GOVERNANCE.md) as the main recruiter walkthrough. Use [industry depth](demo-lab/INDUSTRY-DEPTH.md) and [local integration boundaries](demo-lab/README.md) to explore the other cases.

## Principles across the automation collection

Every showcase should state its business problem, actor, inputs, decision, exception path, inspectable output and acceptance boundary. Bundled synthetic fixtures, executable artifacts, workflow exports, source hashes and saved execution evidence make a case reproducible. Shared contact-planner tests cover strict storage consent, tenant/project isolation, minimal fields and absence of communication authority. The simulator exercises retries, duplicate replay and uncertain writes. Original workflows and local wrappers are explicitly distinguished.

Do not substitute the presence of a README, passing graph validation or a simulator run for full provider acceptance. SQL schemas still require database migration/runtime checks. Historical outcomes require source-backed evidence; local timings and synthetic scenarios establish only their stated scope. Videos remain pending until recorded.

## Verification for this revision

The local quality report records 19 passing Python regression tests and 77 passing interactive Node regression tests, plus passing artifact, lint, format, generation and n8n Code-node contract checks. Fifteen of sixteen original Python demo entry points pass on this Windows host. SAAS-03 cannot load SciPy's native extension because Windows Application Control blocks the DLL; the complete gate correctly remains failed. See [quality.json](reports/quality.json) for commands' results, rather than treating this narrative as a permanent badge.

Original n8n workflows are not proven by the wrapper results. Current local engine evidence is recorded separately in [n8n-local-executions.json](reports/n8n-local-executions.json), with scope, per-project status and source hashes. Account-dependent acceptance remains open. Private development documents, environment files, runtime databases and dependency directories do not belong in a public release.
