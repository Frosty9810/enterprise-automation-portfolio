# Build Studio: presenting a project

The September 9 refinement prioritizes ECOM-01 and CON-01, adds an inspectable source-derived execution map, separates business regression evidence from contact-planner checks, and includes a blank review-time measurement worksheet. Tool roles use a compact table; decision summaries precede raw logs. See [applied reel recommendations](REEL-RECOMMENDATIONS.md) for provenance and remaining limitations.

Run `node --test demo-lab/test.mjs demo-lab/dashboard.test.mjs demo-lab/workflow-graph.test.mjs` after installing the locked dependencies. The dashboard checks use jsdom to exercise all project views and interaction logic; they do not constitute screenshot or browser-rendering QA.

The local dashboard at http://127.0.0.1:5680 now provides a complete project walkthrough for all 23 demos.

1. Select a project or search by name/industry. Each industry has a distinct accent palette.
2. Read **Build story** for the challenge, source implementation, demonstration scope, and proposed GHL relationship pipeline.
3. Select **Run this project**. **Live execution** shows server-observed import, execution, verification, and persistence stages. These are real events, not a simulated progress animation. The interface polls once per second during a run. Individual n8n node results and timings become available after execution finishes.
4. Open **Results & evidence** to inspect source output, fingerprints, engine time, total run time, contact identity, and previous runs. Selecting a historical run changes the evidence used for presentation and export.
5. Open **Tools & Architecture** for tool responsibilities, actual source downloads and the original workflow node inventory. Select **Present the build** for thirteen navigable slides covering challenge, scenario, implementation, engineering decision, tools, GHL design, measured proof, proposed business metric and verification boundaries. Arrow keys navigate; Escape closes.
6. Download the selected run as a standalone HTML case study or evidence JSON. The case study opens without a server, includes all thirteen presentation sections and complete saved evidence, and supports the browser's Print / Save as PDF function.

Each project now includes a three-minute presenter outline. See [SHOWCASE-REVIEW.md](SHOWCASE-REVIEW.md) for the specialist review and remaining evidence gaps.

**Verify all projects** executes every project sequentially and summarizes pass/fail results. The backend rejects concurrent executions. Existing records remain available after failures.

## What the measurements mean

- Engine time comes from n8n's start/stop timestamps.
- Node durations come from n8n's execution data and are available on new runs only.
- Full run time includes local CLI import and startup overhead. It is measured before the final SQLite insert, not at browser response arrival.
- The timeline records orchestration milestones. It does not claim to stream individual n8n node transitions.
- A passing wrapper verifies source-demo execution and contact identity agreement. It does not validate every business branch or complete original production workflows.
- GHL pipeline stages are proposed build configuration, not stages created by the local contact simulator.
- PM-01 and EA-01 are new bounded portfolio demos. No invented client metrics or historical delivery claims are included.

## Validation

The HTTP integration suite covers observed activity, concurrent-run rejection, failure history, recovery, and saved success evidence in addition to the existing local CRM contract checks. Run `node --test demo-lab/test.mjs`.
The real-engine suite is `node demo-lab/verify.mjs` with the lab server running.

## Graphical workflow review

The Overview starts with a recruiter brief and a source-derived n8n diagram. The Architecture view offers **Executed demo** for all 23 projects and **Original build** for the 16 projects with original n8n exports. Diagram nodes retain export positions; connections and branch labels come from the workflow JSON. These are inspectable diagrams, not screenshots of the n8n editor.

Select nodes by mouse or keyboard to inspect their type, outgoing connections and available saved-run timings. Zoom controls support large workflows. Original-build diagrams remain explicitly source-only; passing local wrapper results never mark those original nodes as executed. Presentation and standalone case-study exports include the local workflow diagram.

See [RECRUITER-REVIEW.md](RECRUITER-REVIEW.md) for the hiring review and remaining evidence to collect.

## Recorded data and hiring evidence

Overview now includes run-outcome bars, recent engine-duration bars, selected-run node durations and an inspectable data table. Counts and the median use the selected project's runs within the API's latest 100 portfolio records; recent timings consider the latest eight project runs. Missing or invalid timings are excluded, including null values; real zero durations remain valid. These are local observations, not a production reliability estimate. The selected run controls node charts; historical sample charts retain the loaded history.

An engineering-review table connects the problem, implementation, tool responsibilities, failure checks, regression scope, contribution provenance and remaining acceptance work. Both this table and the data charts appear in presentations and exported HTML case studies. Historical personal ownership and client outcomes remain explicitly unfilled rather than fabricated.

## Project purpose and execution narration

Every project includes its intended users, input category, decision responsibility, output and next review/action boundary. A six-step walkthrough describes the local wrapper separately from the broader project design. This explanation is also included in the presentation and standalone HTML case study.

Execution includes a plain-language explanation of the current server-observed stage. After completion, it identifies the selected saved run, shows the available business decision summary and exposes the complete source output. During execution, charts remain saved observations until the new record arrives. Missing output and failed runs are explicitly identified.
