# Source review and next builds

## What was reviewed

The local source implementations, roadmap, generated packages, installed n8n 2.38.1 node classes, CLI execution results and the following official written sources were reviewed. The owner confirmed these are cleaned versions of client builds; the new local evidence uses synthetic inputs.

| Source | Reviewed material | Applied decision |
|---|---|---|
| [n8n evaluation introduction](https://blog.n8n.io/introducing-evaluations-for-ai-workflows/) | Written article and its linked quickstart/webinar listings | Retain concrete inputs, outputs and deterministic checks alongside timings |
| [n8n evaluation and monitoring playbook](https://blog.n8n.io/production-ai-playbook-evaluation-and-monitoring/) | Written guidance | Separate pre-release checks from future operating monitoring; do not equate one successful run with reliability |
| [HighLevel workflow builder walkthrough](https://help.gohighlevel.com/support/solutions/articles/155000001254-workflow-builder-walkthrough) | Testing and save/publish guidance | Hosted acceptance needs a test contact, execution logs and correct triggers; saving a build is not publishing it |
| [HighLevel custom webhook guide](https://help.gohighlevel.com/support/solutions/articles/155000003305/) | Payload/auth and troubleshooting guidance | Exercise HTTP status, headers and payload mapping before connecting a hosted account |

The n8n article links **n8n Evaluation quickstart** and **From Prompt to Production: Smarter AI with Evaluations**. Those are a useful next viewing queue; the video contents were not watched or transcribed in this task. Article-derived findings above are not attributed to video content.

The supplied Instagram saved collection remains unread. Public retrieval failed, and the signed-in browser tool stopped because it could not verify the current URL sufficiently to enforce its policy. Direct public reel URLs were requested. No Instagram recommendation was silently substituted with an invented summary.

## Built now from the repository backlog

| New bounded demo | Demonstrated behavior | Why it adds value |
|---|---|---|
| PM-01 maintenance triage | Emergency phrases bypass ordinary access routing and require a human emergency operator; routine work waits for access confirmation | Different from another lead-scoring pipeline; shows deterministic rules before tool actions |
| EA-01 commitment review | Replays deduplicate, conflicting identities fail, unauthorized items are excluded and uncertain commitments wait for owner review | Shows provenance/permission and duplicate-handling discipline without sending messages |

Both are in [extra-scenarios.mjs](extra-scenarios.mjs), tested in [test.mjs](test.mjs), and have actual n8n workflows in `workflows/`. They are local additions, not historical client engagements or full flagship implementations.

## Next implementation priorities

1. **RE-01 original workflow dataflow repair:** reproduce the empty Postgres lookup, preserve canonical fields across HTTP/database nodes, replace ambiguous fuzzy identity merges with a reviewed duplicate path, and verify the real GHL endpoint/field mappings in a test location. Acceptance: a new lead and replay each complete with one correct contact and consistent audit state.
2. **PM-01 full work-order lifecycle:** extend the bounded demo with persisted access windows, vendor capability matching, human dispatch receipts and SLA expiry. Acceptance: an expired access window blocks dispatch and an emergency always reaches the human queue.
3. **EA-01 evidence-backed intake:** attach source IDs and owner confirmation to incoming commitments, with versioned corrections. Acceptance: changed source content invalidates stale confirmation and private source items never enter an unauthorized queue.
4. **CON-01 subcontractor expiry/change-order ledger:** implement document expiry and approval revisions before expanding into higher-complexity regulated verticals. Acceptance: a superseded document or changed amount invalidates the previous approval.

Do not add more nominal project folders merely to increase the count. Each next build should add a distinct operation, an executable failure case and a recording-ready path.

---
Part of the [local demo lab](README.md).

The owner has now deferred the video review; it is parked until a later request. The current delivery focuses on local demos.
