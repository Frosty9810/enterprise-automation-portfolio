# Specialist showcase review — September 8, 2026

## Improvements implemented

- All 19 projects now have a specific engineering decision, evidence pointer, three-minute presenter outline and proposed business metric.
- Tools & Architecture explains the responsibilities of the business language, n8n, GHL, SQLite, applicable PostgreSQL artifacts, and development assistants. Original workflow node inventories are read directly from the source exports.
- Source, runnable workflow, original export, schema and blueprint downloads are limited to a source-derived allowlist. Available artifacts vary by project.
- Nine-part presentations and case studies explain engineering decisions, tools and outcome evaluation. Failed or missing runs now receive an appropriate conclusion instead of success language.
- Codex's contribution to this refresh is stated. Historical Claude Code attribution and optional Claude API integrations are distinguished from demonstrated runtime model calls.

## Presenting the work

Choose a project that matches the audience's industry. Spend 30 seconds on the operational problem, 45 seconds on the implementation decision, 75 seconds running and explaining the evidence, and 30 seconds on the proposed business outcome and next acceptance step. Share the exported case study and supporting source artifact.

For engineers, open the source and original node inventory, explain the five-node demo wrapper versus the full original workflow, and discuss a failure or replay case. For business stakeholders, emphasize the decision improved, the result produced, and who reviews exceptions.

## Highest-value remaining evidence

1. Capture hosted GHL test-location acceptance: synthetic contact write, same-identity replay, validation rejection and rate-limit/timeout recovery. The current lab uses a simulator.
2. Repair and execute original workflow paths, starting with RE-01's previously identified empty-lookup and item-preservation risks. Wrapper success does not resolve them.
3. Add expected-output assertions for normal and adverse cases across original business programs. Successful process execution is a narrower claim.
4. Record short walkthroughs using the presenter notes and retain the source revision and execution evidence used in each recording.
5. Establish business baselines before publishing improvements. UI outcome metrics are proposals; local engine timings do not establish client ROI.

## Checks in this revision

Six integration tests passed, including inventories and artifact downloads for all 19 projects, invalid artifact paths, activity, concurrency rejection, failure recovery and CRM contract cases. All 23 existing quality gates passed. Dashboard JavaScript was syntax-checked. No visual browser test was performed. The business algorithms and n8n execution path were unchanged; the prior 19-project report remains the real-engine evidence.
