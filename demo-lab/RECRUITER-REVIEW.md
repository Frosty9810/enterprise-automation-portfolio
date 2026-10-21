# Portfolio review through a hiring lens

The strongest showcase lets a recruiter understand the problem quickly and lets an automation lead inspect the implementation. A list of tools or a successful contact upsert alone does not establish the depth of the original business system.

## What a reviewer needs to see

| Review stage | Evidence to show | Current portfolio support |
| --- | --- | --- |
| First 30 seconds | Who the system serves, the problem, the delivery scope | Project brief, challenge, delivery-status label |
| Next 90 seconds | Trigger, decisions, integrations, exception paths | Source-derived workflow diagram, tool responsibilities, decision summary |
| Technical review | Readable implementation, constraints, failure handling | Source and workflow downloads, evaluation results, execution history |
| Verification | What actually ran, when, against what system | Saved local n8n evidence, node durations, source fingerprints; explicit GHL simulator boundary |
| Ownership review | Your contribution, team boundaries, delivery dates and tradeoffs | Tradeoff prompts exist; project-specific historical ownership and dates still need factual completion |
| Impact review | Baseline, observed result, measurement period and attribution | Blank planning worksheet; no verified client ROI claim |

## Changes applied across the showcase

- All 23 projects have a graphical local n8n execution workflow.
- The 16 available original n8n exports have a separate source diagram with their actual nodes and connections. Missing original exports are not invented.
- Node selection exposes tool type and outgoing edges. Local nodes can show evidence from the selected saved run; original nodes remain source-only.
- Branch labels, zoom controls and keyboard selection make larger workflows easier to inspect.
- The overview introduces the business problem, engineering evidence and a suggested review sequence before detailed logs.
- Presentations and downloadable case studies include the workflow diagram alongside tool roles and verification boundaries.

## Recommended featured projects

| Project | What to demonstrate | What to explain |
| --- | --- | --- |
| ECOM-01 | A content decision that is allowed and one that is blocked | Why governance belongs before publishing; how the rules can be inspected independently of n8n |
| CON-01 | Valid and invalid intake scenarios from the bounded demo | Which checks are deterministic, where review is required, and what remains outside the build |
| SAAS-03 | Source output and the saved local execution | How intervention decisions are produced; which model and outcome claims are actually supported |
| IMP-01 | TypeScript agent-system source and its local demo | Agent responsibilities, handoff boundaries and how outputs are checked |

Use three or four featured projects for a focused introduction. Keep the full catalog available for industry-specific follow-up. Similar five-node adapters should not be presented as 23 completely different engineering achievements; the original domain logic and original workflow designs supply the differentiation.

## A practical walkthrough

1. State the user's problem and the bounded outcome in one sentence.
2. Show the original diagram when available. Follow one input through a decision and an integration boundary.
3. Switch to the executed-demo diagram and explain exactly what the local demonstration covers.
4. Run the project. Show a business decision, saved node evidence and contact identity verification.
5. Inspect a rejection or exception case from the available evaluations. Do not suggest every original branch was executed.
6. Open the source for the most important rule and explain one alternative you considered.
7. Close with your factual contribution and the next production verification step.

## Evidence still worth adding

For each featured project, supply a short factual account of your role, collaborators, delivery period and one decision you personally made. Add a measured business result only with its baseline, sample size or volume, period and calculation. If those records are unavailable, use an explicitly labeled demonstration outcome.

A hosted GoHighLevel test-location walkthrough would substantiate actual contact, pipeline and workflow behavior beyond the local simulator. Full original n8n executions would substantiate branches and integrations beyond the five-node local wrapper. Neither is established by the current local demo.

The current quality reports and automated DOM tests are useful technical evidence, but they are not a substitute for deployment reliability, production monitoring or a browser accessibility audit. Present their tested scope and recorded results rather than an unsupported universal benchmark score.
