# CON-01 walkthrough script

Status: **Populated — recording pending.**

**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._

## Narration and screen cues (3–5 minutes)

1. Open CON-01 in the local dashboard. Say: “Expired certificates and stale or self-approved change orders route to review. A hash-linked approval record accompanies the result. This is a local synthetic build with explicit human review.”
2. Show the workflow graph and trace: Change amount and version → independent approval checks → release review. Explain that the five-node n8n wrapper executes source over the local API and hands a synthetic contact to the local GHL simulator.
3. Run the demo and inspect actual saved node evidence. Change the amount or requester to invalidate approvals; inspect the hash-linked evidence.
4. Open source and run `node demo-lab/project-builds/CON-01/build/demo.js`. Explain one accepted case and one rejected or review case.
5. Show proposed schema relationships. Say: “This PostgreSQL model is supplied as an integration artifact; the running lab uses SQLite. I am not presenting this as a deployed PostgreSQL integration.”
6. Close with the remaining delivery gates: real authenticated intake, hosted provider acceptance, a domain owner’s approval and measured business results.

Keep this recording pending until the video actually exists and its link is added to the central index.
---
*Part of the Enterprise Automation Portfolio. See [project build index](../README.md).*
