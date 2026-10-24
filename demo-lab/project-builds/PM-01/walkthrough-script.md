# PM-01 walkthrough script

Status: **Populated — recording pending.**

**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._

## Narration and screen cues (3–5 minutes)

1. Open PM-01 in the local dashboard. Say: “A gas-leak fixture triggers deterministic emergency escalation; routine work requires access review. This is a local synthetic build with explicit human review.”
2. Show the workflow graph and trace: Tenant issue → emergency or routine triage → operator/access/vendor review. Explain that the five-node n8n wrapper executes source over the local API and hands a synthetic contact to the local GHL simulator.
3. Run the demo and inspect actual saved node evidence. Compare emergency escalation, missing access and approved access. Dispatch stays disabled.
4. Open source and run `node demo-lab/project-builds/PM-01/build/demo.js`. Explain one accepted case and one rejected or review case.
5. Show proposed schema relationships. Say: “This PostgreSQL model is supplied as an integration artifact; the running lab uses SQLite. I am not presenting this as a deployed PostgreSQL integration.”
6. Close with the remaining delivery gates: real authenticated intake, hosted provider acceptance, a domain owner’s approval and measured business results.

Keep this recording pending until the video actually exists and its link is added to the central index.
---
*Part of the Enterprise Automation Portfolio. See [project build index](../README.md).*
