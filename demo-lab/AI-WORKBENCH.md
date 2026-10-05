# AI Engineering Workbench

Nine local engineering prototypes, separate from the 27 automation demonstrations and 20 Life and data tools. Open `/engineering` on the running local portfolio server. They are original implementations of bounded infrastructure patterns; no repository code was copied and no external models or tools run.

## Projects and presentation route

**ENG-01 ClaimProof:** Start with the bakery product brief. Run the fixture: one exact excerpt passes, a changed quantity requires semantic review, and a cross-tenant source is held. Edit a source approval to false and rerun. Explain why citation existence does not establish truth. Quote validation uses exact substrings; claim validation requires exact equality with that quote. It does not assess paraphrases or authenticate the supplied tenant.

**ENG-02 Action Ledger:** Run a simulated reservation whose acknowledgement is lost after a write. The repeat is held for reconciliation, and an unapproved request is blocked. Change the first outcome to success to show duplicate suppression. Change a repeated amount to show a conflicting payload. The tool allowlist contains only `reserve-demo-units`. There is no actual reservation, payment, durable ledger or authenticated approver. Each run starts fresh.

**ENG-03 Eval Observatory:** The default candidate fixes inventory but regresses on returns. Aggregate accuracy remains 2/3 for both versions, while case-level comparison reveals the regression and a latency exception. Edit candidate outputs and latency values to explore release gates. These are supplied fixtures, not live timing or model responses. The nearest-rank p95 is computed from supplied candidate latencies; three cases provide no statistical generalization.

## Sources and design decisions

- [Anthropic agent evaluation guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): inspired separate outcome checks and per-case regressions. The local implementation uses code graders only and makes no claim to reproduce Anthropic evaluations.
- [LangChain local deep researcher](https://github.com/langchain-ai/local-deep-researcher): inspired making the evidence behind research outputs inspectable. ClaimProof is a verifier; it does not search the web, orchestrate research or run Ollama.
- [Hugging Face tool reference](https://huggingface.co/docs/smolagents/reference/tools): inspired explicit tool boundaries. Action Ledger is an original finite simulation, not a smolagents integration.

Sources reviewed during this build. No source benchmark scores, branding or production claims are imported into the portfolio.

## Files and verification

- `workbench-core.mjs`: three pure domain functions with schema checks and explicit limits.
- `workbench-ui.mjs`: editable JSON, decision inspection, calculated comparison bars and downloadable input/result evidence.
- `workbench.html` and `workbench.css`: standalone responsive editorial workspace.
- `workbench.test.mjs`: independent expected outcomes, duplicate/uncertain replay, invalid inputs and UI recovery tests.

Run `node --test demo-lab/workbench.test.mjs` from the portfolio root. Downloaded reports contain user-entered fixtures; review them before sharing. The page does not store inputs or send them externally.

## Next implementation boundary

An optional local model adapter, durable state, authenticated approvals, wider task datasets and calibrated semantic grading would deepen these systems. They are not implemented or implied by the current demos. The present value is visible, executable engineering behavior around potential model outputs, not a model-performance claim.

## Broader portfolio research

See [seven-practitioner comparison and Codex build roadmap](ENGINEER-PORTFOLIO-RESEARCH.md). It covers official Codex SDK guidance, public projects, six proposed builds and acceptance criteria. Six bounded local versions are now implemented; full model/SDK integrations remain proposed. See [implementation scope and presentation guide](ENGINEERING-BUILD-REVIEW.md).
