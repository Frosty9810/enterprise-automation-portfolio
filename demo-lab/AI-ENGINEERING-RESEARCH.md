# AI engineering research and implementation decisions

Research checked September 10, 2026. Primary papers, maintainer repositories and official documentation were opened directly. Paper abstracts and repository documentation were reviewed; this is not a reproduction of their experiments, a systematic literature review, or an audit of their source code. Dates below distinguish paper publication from this review date. No external benchmark or framework installation is claimed by this document.

The portfolio already has business rules, local n8n execution, source artifacts and a CRM simulator. The strongest next step is to connect retrieved evidence, proposed actions, authorization, durable state and evaluation in a single inspectable run. The implementation choices below are our recommendations inferred from the sources, not claims made by their authors about this portfolio.

## 12 primary research entries

### 1. Evaluate final business state: tau-bench

**Published June 17, 2024.** The paper evaluates policy-following tool agents using annotated final database states and repeated-trial reliability. A plausible response is insufficient if the resulting state is wrong. [Paper](https://arxiv.org/abs/2406.12045).

**Apply here:** For OPS-01, assert that a recovered booking has one durable handoff and no duplicate customer record. For CRM-01, compare approved fields with the actual stored revision. Track first-attempt success separately from success after recovery. Repeating deterministic fixtures is a replay check; it does not estimate model reliability.

### 2. Use the maintained tau benchmark, with version control

**Repository reviewed September 10, 2026; July 2026 grading update documented.** The original [tau-bench repository](https://github.com/sierra-research/tau-bench) now warns that its tasks are outdated. The maintained [tau2-bench repository](https://github.com/sierra-research/tau2-bench) presents tau-three, including knowledge and voice evaluation. Its README identifies a banking-knowledge grading change that makes results before version 1.0.1 incomparable with later results. It also requires Python >=3.12 and <3.14. The repository identifies an MIT license.

**Apply here:** Store dataset revision, fixture hash, evaluator version and model configuration in every evaluation report. Use a separate compatible environment if integrating the actual benchmark; the portfolio's Python 3.14 environment cannot satisfy that stated constraint. Do not copy a leaderboard score onto these business demos.

### 3. Connect retrieval to actions: tau-Knowledge

**Published March 4, 2026.** This benchmark combines unstructured knowledge retrieval with policy-constrained tool actions and verifiable state changes. Its banking domain is a research environment, not evidence of financial-product suitability. [Paper](https://arxiv.org/abs/2603.04370).

**Apply here:** In EA-01 and a support knowledge assistant, display the selected source, its version, the policy rule extracted from it, and the resulting permitted action. Include two similar documents with different business scopes and a case with no relevant source. Abstain when the required evidence is missing. Evaluate both correct evidence selection and correct final action.

### 4. Test hostile content at the tool boundary: AgentDojo

**Published June 19, 2024.** AgentDojo studies agents receiving untrusted tool data and provides an extensible environment for prompt-injection evaluation. Its [maintainer repository](https://github.com/ethz-spylab/agentdojo) identifies an MIT license and cautions that the package API can change. [Paper](https://arxiv.org/abs/2406.13352).

**Apply here:** AGT-01 should receive a synthetic support article containing a request to change its tool permissions. The authorization layer must retain its original policy, with a recorded denial and unchanged external state. Test benign articles too. Detecting one phrase does not establish general prompt-injection resistance; permission enforcement belongs outside model-generated text.

### 5. Re-test defenses across attack variants

**Published June 9, 2026; arXiv preprint.** The authors evaluate automated injection methods within AgentDojo and report that attack effectiveness and transfer depend on the attacker/target models and setting. This is evidence against assuming that passing one attack set proves broad robustness. [Paper](https://arxiv.org/abs/2606.10525).

**Apply here:** Maintain a local, synthetic adversarial fixture set with conflicting instructions, forged authority and attempted cross-account actions. Report attack-case counts and benign false rejections separately. Keep these tests bounded to the simulator. A deterministic gate test can prove its own denied-action invariant; it cannot measure untested model behavior.

### 6. Separate retrieval quality from answer quality: Ragas

**Published September 26, 2023; revised April 28, 2025.** Ragas separates the quality of retrieved context, faithfulness to that context and generated-answer quality. Its research includes reference-free evaluation methods. [Paper](https://arxiv.org/abs/2309.15217).

**Apply here:** Give a knowledge demo separate counters for source retrieval, citation validity, unsupported-answer rejection and final-task correctness. Start with independently labeled fixtures and deterministic citation checks. A valid document ID is not proof that a generated sentence is supported by that document.

### 7. Add repeatable evaluation experiments: Ragas repository

**Repository reviewed September 10, 2026.** The older explodinggradients URL redirects to [vibrantlabsai/ragas](https://github.com/vibrantlabsai/ragas). The repository describes evaluation metrics, test-data generation and feedback loops, and identifies Apache-2.0 licensing.

**Apply here:** Export questions, retrieved contexts, answers, references and run IDs into a stable dataset so a later Ragas adapter can compare model variants. Preserve human labels and reviewer disagreements. Model-based evaluators incur provider dependencies and can themselves be wrong; calibrate against human-reviewed examples before using their score as a release gate. An export file alone is not a completed Ragas integration.

### 8. Compare retrieval baselines before adding infrastructure: pgvector

**Repository reviewed September 10, 2026.** [pgvector](https://github.com/pgvector/pgvector) supports exact and approximate vector search in PostgreSQL. Its README explains that filtering after approximate-index scanning can reduce returned results and describes iterative scanning. The [license file](https://github.com/pgvector/pgvector/blob/master/LICENSE) contains the permissive PostgreSQL license text and notice requirements.

**Apply here:** Start with a small, deterministic lexical search over cleaned project documents, then compare vector retrieval on the same labeled questions. Measure recall at a stated k, latency and irrelevant-source retrieval. Enforce source/account access before producing the answer. Do not claim a lexical scorer uses embeddings or that an unexecuted SQL schema proves pgvector deployment.

### 9. Turn model changes into reviewable evaluations: Promptfoo

**Repository and security policy reviewed September 10, 2026.** [Promptfoo](https://github.com/promptfoo/promptfoo) provides configurable evaluation and CI tooling and identifies MIT licensing. Its [security policy](https://github.com/promptfoo/promptfoo/security) states that user configurations and code-based evaluators are trusted code, not a sandbox. Configured cloud/provider features can send data to those services.

**Apply here:** Use named test cases with JSON-schema checks, permitted tool lists, grounding assertions and explicit failure thresholds. Compare a candidate model/prompt against a recorded baseline. Keep provider use explicit and synthetic examples self-contained. Do not repeat a blanket claim that all evaluation data always stays local; that depends on the selected providers and features.

### 10. Link traces to evaluation evidence: Langfuse

**Repository reviewed September 10, 2026.** [Langfuse](https://github.com/langfuse/langfuse) documents tracing, prompt versions, datasets and evaluation workflows. Its README states MIT licensing except for the enterprise folders. Self-hosting is supported, but the documented infrastructure is additional to this portfolio's current local server.

**Apply here:** Retain a trace/run ID, parent-child operations, latency, prompt/configuration hash, evaluator result and redacted error reason. Make failures reproducible from the fixture ID. Record actual token counts only when a real provider reports them; label calculated costs as estimates with a pricing date. Existing n8n timings are orchestration measurements, not LLM token or cost measurements.

### 11. Use current observability conventions: OpenTelemetry GenAI

**Official documentation reviewed September 10, 2026.** The [former GenAI documentation page](https://opentelemetry.io/docs/specs/semconv/gen-ai/) explicitly redirects readers to the [GenAI semantic-conventions repository](https://github.com/open-telemetry/semantic-conventions-genai). That repository covers spans, metrics and events for GenAI and MCP, identifies Apache-2.0 licensing and still shows a schema-URL TODO.

**Apply here:** Design a versioned internal trace record now; map it to a pinned convention version when implementing an exporter. Include explicit operation type and parent IDs rather than parsing narrative log text. Do not claim OpenTelemetry compliance merely because a JSON object has a trace ID. Validate a real exporter against the adopted schema and collector before using that label.

### 12. Keep tool authentication and destinations explicit: MCP guidance

**Documentation version November 25, 2025; checked September 10, 2026.** The official [MCP security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices) covers confused-deputy behavior, token audience validation, forbidden token passthrough and SSRF defenses, including redirect-target validation.

**Apply here:** For a future MCP adapter, bind each tool call to an authenticated principal and policy, use intended-audience tokens and restrict destinations. Separate a model's proposed arguments from the validated arguments executed by the tool. The current local demo credential is not evidence of OAuth/MCP authorization. This document cites the guidance as a design reference; no SDK license was assessed here.

## Implementation order for this portfolio

These are proposed acceptance requirements, not a statement that each feature already exists.

| Priority | Concrete business capability | Required proof |
|---|---|---|
| 1 | Source-grounded support response | Relevant, permitted source IDs; ambiguous and no-answer cases; citations tied to saved source versions |
| 1 | Agent action authorization | Unknown tool, excess budget, cross-account and missing-review attempts cause no mutation; permitted requests still work |
| 1 | Reliable handoff/recovery | Retry preserves one business object; crash/restart can reconcile a recorded attempt with final state |
| 2 | Evaluation workbench | Frozen fixture versions, separate domain/transport/grounding results, reproducible failing input and evaluator version |
| 2 | Observability | Run-to-node trace, real measured durations, explicit model/simulator mode and errors linked to their source |
| 3 | Optional model experiment | Configurable provider with bounded calls; offline mode still works; provider failure and malformed output tested |
| 3 | Retrieval infrastructure comparison | Same labeled corpus/questions for lexical and vector methods; recall and latency measured under documented conditions |

For PM-01, CON-01, MED-01, LEGAL-01 and INS-01, keep domain decisions deterministic where there is an explicit policy. AI may help extract or summarize input, while missing information and high-impact decisions route to a person. Domain-specific validation and deployment evidence remain separate from generic model evaluation.

## What a hiring reviewer should be able to inspect

Show one business request, the exact input, the selected evidence, the workflow path, an authorized action and the final stored state. Then deliberately run a rejected or failed case and show why it did not corrupt state. Finish with one measurable tradeoff: latency versus retrieval quality, strict review versus unnecessary escalation, or retry success versus duplicate prevention.

The case study should name the personally delivered components, source of the cleaned business scenario, tested boundaries and remaining integration work. Report local measurements as local measurements. Do not substitute benchmark authors' results for this implementation's tests, generated fixtures for independent validation, or a simulator result for hosted GoHighLevel acceptance.

## Research-to-code provenance

Record each adopted idea with its source URL, access date, local implementing file, test command and result artifact. For a dependency, also pin its version and preserve required notices. Paper licensing and code licensing are separate; repository license labels above were inspected, but transitive dependencies, model weights and datasets were not comprehensively audited. No source code or benchmark dataset was copied during this research task.
