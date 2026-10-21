# Local engineering build review — September 11, 2026

This iteration implements six bounded local versions of the research directions. There are now nine engineering demonstrations, alongside 27 automation demonstrations and 20 Life and data tools. These 56 entries are demonstrations/prototypes, not 56 production AI deployments.

## Present these first

1. **Repair Studio (ENG-09):** A duplicate shop delivery event reduces inventory twice. Show baseline.mjs, then candidate.mjs, then the actual Node test output. The candidate deduplicates event IDs, rejects conflicting quantities and validates inventory limits. Five candidate checks pass; the baseline fails. Source SHA-256 values identify the files used in the recorded run. Explain that the in-memory identity map lasts for one call; a real service needs durable idempotency and concurrency control. Built with Codex assistance; no Codex SDK integration is claimed.
2. **ShelfSense (ENG-05):** A supplier text page says a pack contains 12 items while a catalog draft says 24. Run once to show the hold. Change packCount to 12, check the review box, and run again. Only then does the result include the catalog. A conflicting second page prevents release. Source lines must match exactly, not merely contain a shorter number. This is a structured text review desk, not an OCR or model extractor.
3. **Review Bench (ENG-04):** A support lead accepts one answer, rejects an invented storage promise, and leaves another unanswered. The acceptance rate is 1/2 reviewed, not 1/3 or 2/3. Add a rejection reason, change the label, and rerun. The exported canonical datasetSnapshot can be pasted into frozenSnapshot to detect changes. Training/evaluation ID overlap holds the review. Labels remain user-supplied, without an authenticated audit trail.

## Additional demonstrations

- **Comparison Notebook (ENG-06):** Retains failed runs, uses shared trial IDs and case IDs across approaches, and marks missing timing unavailable. Import/export restores inputs; results are recomputed. Provider names and outputs in the default fixture are invented. It does not call Codex, Claude or local models.
- **Recommendation Sketchbook (ENG-07):** An invented travel activity catalog ranks explicit preference words. Show quiet garden, then indoor art. Deterministic ties use IDs. Recall is measured against the entered relevance labels, and missing labels produce unavailable rather than zero. Separate from PaceAtlas's unlocated source.
- **Tiny Learning Lab (ENG-08):** An original logistic neuron executes gradient descent in the browser. The chart plots calculated training and held-out cross-entropy. Numerical gradient error is checked, initialization is fixed, and changing held-out labels does not change the trained parameters. This demonstrates one learning mechanism, not large-model training expertise.

## What was improved in the presentation

Compact nine-project navigation; collapsed raw input; guided review labels and supplier-field corrections; explicit approval reset after editing a field; calculated bars; measured learning-loss chart with a data table; recorded repair logs and source; result export and input restore; direct project hash links; plain scope statements. The current narrow browser viewport was visually inspected, with no horizontal overflow in the checked example. Automated DOM checks cover all nine engineering examples and all existing portfolio examples; this is not a claim of exhaustive device coverage.

## Reproduce the verification

From the Portfolio directory:

```powershell
node demo-lab/verify-repair.mjs
node --test demo-lab/*.test.mjs demo-lab/test.mjs
node demo-lab/benchmark.mjs
# Requires the running local portfolio server and installed local n8n:
node demo-lab/verify.mjs
```

The repair command only runs fixed known files, with a 10-second process limit. It does not accept arbitrary commands, paths or candidate code. The browser displays its recorded evidence and does not rerun operating-system commands. Regenerate evidence after changing any repair source; the regression suite checks source hashes for stale evidence.

The API benchmark measures loopback HTTP plus in-memory SQLite, excluding n8n, hosted GHL, network services and disk durability. The n8n verifier executes local showcase wrappers and the local GHL simulator, not client environments or hosted acceptance.

## Research directions still requiring implementation

The broader proposals remain larger than these local versions. Codex SDK task execution, repository isolation/cancellation in a general agent, real model-backed extraction, OCR, authenticated reviewer histories, field-level gold-set extraction evaluation, embedding comparisons and actual multi-model repeated inference are not implemented. No model integration can be inferred from the assistant used to write this code. The local versions make controls and failure cases inspectable without pretending those integrations exist.

This review completes a bounded build-and-check cycle. There is no unbounded background process or scheduled automation. Rerun the verification commands after substantive changes and fix failures before updating evidence.

## Second review — September 12, 2026

Additional primary references inspected:

| Reference | Observed pattern | Applied change |
|---|---|---|
| [Goku Mohandas / Made With ML](https://madewithml.com/) | Connects product design, data preparation, modeling, tests, versioning and monitoring in one learning path. | Added one reproducible local review command spanning the repair fixture, full regression suite and API benchmark. |
| [Shawn Wang / swyx](https://swyx.io/) | Curated starting points lead into a wider library of writing and projects. His separate portfolio page concerns investments, so it was not treated as a coding-project gallery. | Added a short three-project presentation route ahead of the full engineering list. |
| [Sebastian Raschka](https://sebastianraschka.com/) | Code-focused learning paths, a Start Here entry and separate article/notes collections make technical depth navigable. | Kept inspectable code beside demonstrations and repaired project hash navigation so a presenter can open an exact example. |
| [Evidently library documentation](https://docs.evidentlyai.com/docs/library/overview) | Evaluation reports provide evidence for dashboards and ongoing quality work. This is a tooling reference, not a personal portfolio. | Added a dated verification section with actual command outputs, source hashes, benchmark scope and separately dated n8n evidence. No Evidently dependency was integrated. |

The sources support these observations; applying them to this portfolio is our design judgment. No author rankings, copied layouts, inherited metrics or production claims are implied.

### Repeat the review

Run `node demo-lab/review-portfolio.mjs` from Portfolio, or `npm run review` from demo-lab. The command regenerates fixed repair evidence, runs the full regression suite and measures the local API benchmark. Each child process has a 60-second limit. It writes build-review.json, which the engineering page displays with timestamps. Existing n8n results are explicitly separate and retain their original recording time. Run verify.mjs when fresh n8n acceptance is needed.

The review is intentionally repeatable on demand, not a background promise. Passing unit and interface checks does not establish real model quality, hosted acceptance, accessibility across all devices or recruiter preference. These remain distinct review dimensions.

### Verification outcome

The second review passed 66 Node checks, the fixed repair acceptance and the local API benchmark. The separate full n8n report contains 27 passing demonstrations plus successful duplicate replay. An unusually slow SAAS-03 execution in that report took 63,888 ms, concentrated in its original-business-logic node (63,838 ms). A targeted fresh rerun passed at 2,524 ms engine time; evidence is in reports/saas-03-timing-recheck.json. This shows the delay did not reproduce in that rerun, not a proven root cause or performance guarantee. The original slow measurement remains visible.

Presentation shortcuts were exercised in the browser and selected the correct project, source link and repair output. A desktop screenshot was reviewed. Earlier narrow-view checks covered the supplier correction and measured learning graph; this is representative visual testing rather than exhaustive device coverage.
