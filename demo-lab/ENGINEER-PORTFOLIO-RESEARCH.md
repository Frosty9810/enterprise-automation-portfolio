> Implementation update: six bounded local versions are now available. The full integrations described below remain a roadmap. See [build review](ENGINEERING-BUILD-REVIEW.md) for exact implemented scope and limitations.

# Portfolio research and next flagship builds

Research reviewed September 2026. This is a curated comparison of public practitioner sites and original project references, not a ranking of the “best” engineers. Recommendations below are our design judgments. Referenced accomplishments belong to their authors; they are not portfolio claims for Gabriel.

## What the portfolio needs next

The current portfolio has breadth: 27 automation demos, 20 human-centered browser tools and three AI engineering infrastructure prototypes. The next useful step is depth: one real coding-agent workflow, an evaluated model-backed data task, and a human feedback loop. More deterministic examples alone would not demonstrate model integration or production ownership.

Preserve the current local-only phase. Using Codex as the development assistant is different from integrating the Codex SDK into a product. Running a local SDK process does not by itself make model inference offline. No new model calls, packages, credentials, repository clones or deployments were performed in this research update.

## Practitioners and what to learn from their work

| Primary source | What was observed | Adaptation for our portfolio |
|---|---|---|
| [Simon Willison](https://simonwillison.net/about/) and [LLM](https://github.com/simonw/llm) | Public writing connected to a usable CLI/library; the project supports multiple model providers and local options, with stored prompt/response workflows. | Give a flagship a reproducible command, a recorded run and a short engineering note. Make provider choice visible instead of branding every example around one vendor. |
| [Eugene Yan](https://eugeneyan.com/) | His site connects writing, speaking and selected prototypes, including AlignEval, AI Reading Club and Obsidian Copilot. | Use a “Try it / How it works / What changed” structure. Pair each important demo with a concise evaluation and design write-up. |
| [Hamel Husain and Shreya Shankar on minimum viable evals](https://hamel.dev/blog/posts/evals-faq/whats-a-minimum-viable-evaluation-setup.html) | Their guidance starts with expert review of outputs and error analysis before elaborate evaluation infrastructure. | Add a reviewer queue, failure taxonomy and editable rubric before another synthetic score dashboard. |
| [Shreya Shankar](https://www.sh-reya.com/) and [DocETL project](https://github.com/ucbepic/docetl) | Public work links database and human-AI research; DocETL provides an LLM-powered data-processing project reference. | Build document extraction with provenance, correction and re-evaluation, rather than only showing a generated answer. |
| [Chip Huyen](https://huyenchip.com/) | The site connects production AI writing, teaching and concrete micro-tools such as lazynlp. | Explain deployment constraints, data quality, latency and operational cost alongside the feature. Keep a small tool useful on its own. |
| [Jason Liu](https://jxnl.co/) and [Instructor](https://python.useinstructor.com/) | The site connects practical AI systems writing with structured-output tooling. | Show typed extraction, invalid-output handling and explicit retry limits. Do not treat valid JSON as correct facts. |
| [Andrej Karpathy](https://karpathy.ai/) and [micrograd](https://github.com/karpathy/micrograd) | A compact implementation makes a fundamental mechanism inspectable, with source directly available. | Add one educational project where the visitor can follow the computation. Favor understanding over copying a large framework. |
| [Official Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk) and [TypeScript source](https://github.com/openai/codex/tree/main/sdk/typescript) | The SDK documents programmatic coding tasks and continued/resumed threads. The guide distinguishes SDK coding automation from the app-server path for custom clients. | Build a reviewable coding workflow with task, patch and test evidence. Select SDK versus app server based on whether the product needs task execution or a custom approval/history client. |

The dynamic AlignEval landing page returned only its loading shell in the text fetch. Its existence and placement were confirmed from Eugene’s site; its interactive behavior was not tested. No visual claims about that app are inferred from the shell.

## Prioritized builds

### 1 Repository Repair Studio

**Purpose:** Help a small team review a coding-agent fix before accepting it. A synthetic example repository contains a known bug, such as a duplicate booking being written twice.

**Proposed implementation:** A task specification and fixed repository revision feed a Codex SDK adapter. A bounded working copy contains the proposed patch. The runner collects actual test output, command exits, changed files and timing. A separate review decision records whether the patch is accepted. Local fixture replay remains explicitly separate from a live Codex run.

**Showcase:** A four-step view: reproduce the bug, inspect the diff, examine checks, decide. Include failed attempts and the human’s correction. Explain why a passing test alone may leave a requirement unmet.

**Acceptance:** The baseline fails the intended test; a valid fix passes that test and existing regressions; attempts outside the allowed repository are rejected; cancellation is handled; the final report ties evidence to an exact source revision. Record actual model/service identity and elapsed time only when measured. No automatic merge or deployment.

**Inspiration:** Official Codex SDK plus Simon Willison’s executable tools and engineering notes. **Status:** Proposed, not implemented. Highest priority for showing concrete Codex integration.

### 2 Review Bench

**Purpose:** Let a domain expert correct an assistant’s errors and see whether a revision actually improves the same task.

**Proposed implementation:** Extend Eval Observatory with imported traces, accept/reject labels, reason categories and rubric versions. Freeze one evaluation split before iterating. Compare a rule baseline and a model candidate, showing disagreements and unreviewed cases separately.

**Showcase:** Label a wrong product answer, explain the failure category, rerun a revised approach, and show both fixes and regressions. Never silently label unreviewed rows as passes.

**Acceptance:** Stable IDs and dataset fingerprints; reproducible export/import; missing labels excluded from accuracy denominators; split overlap detected; rubric changes versioned. If a model judge is added, compare it against human labels rather than assuming its judgment is ground truth.

**Inspiration:** Hamel Husain, Shreya Shankar and Eugene Yan. **Status:** Proposed extension; current ENG-03 only grades supplied exact labels.

### 3 ShelfSense Document Desk

**Purpose:** A small food retailer receives mixed-format supplier sheets. Extract pack sizes, storage text and product identifiers into a reviewable catalog draft.

**Proposed implementation:** Start with invented, clearly legible documents and text extraction. Preserve document/page references and raw excerpts. Add a typed model extraction adapter only after selecting the permitted runtime. Validate units and required fields, show ambiguous fields, and require approval before any catalog export. OCR is a separate capability to verify, not an assumed parser feature.

**Showcase:** Compare a document page with extracted fields, correct a pack-size error, and export the reviewed record. Link this to ECOM-01 fact protection and inventory workflows.

**Acceptance:** Gold labels for a fixed test set; field-level precision/recall; missing and contradictory fields visible; provenance checks; malformed structured outputs rejected; bounded retries. Do not infer allergens, food safety or regulatory compliance from incomplete text.

**Inspiration:** Instructor, DocETL and Chip Huyen’s systems orientation. **Status:** Proposed. Strongest fit for Gabriel’s CPG/retail applications.

### 4 Local Model Comparison Notebook

**Purpose:** Compare different permitted models on the same narrow task, such as routing an inventory exception, without moving the goalposts.

**Proposed implementation:** Provider-neutral request/result records, versioned prompts, actual per-run usage where available, and a no-network replay mode. Explicitly distinguish local inference from a locally running client for a remote service.

**Acceptance:** Identical case IDs and rubric, repeated trials, missing metadata marked unavailable, cost estimates separated from billed usage, failed requests retained. No “best model” claim from a tiny sample.

**Inspiration:** Simon Willison’s LLM tooling and Eugene Yan’s evaluation work. **Status:** Proposed. Add after Review Bench makes labeling useful.

### 5 Recommendation Sketchbook

**Purpose:** Help a reader choose articles or a traveler compare activities using explicit preferences and an explainable baseline.

**Proposed implementation:** Start with a small synthetic catalog and keyword baseline. Add embeddings only as an evaluated comparison. Let the visitor inspect why an item ranks and how a changed preference affects it.

**Acceptance:** Fixed relevance labels, recall at k and ranking comparison, deterministic tie handling, empty-query behavior, source attribution and no fabricated preference learning.

**Inspiration:** Eugene Yan’s recommendation projects and Karpathy’s inspectable educational implementations. **Status:** Proposed. Travel use remains separate from the unlocated PaceAtlas source.

### 6 Tiny Learning Lab

**Purpose:** Make one small neural model understandable: visualize forward computation, gradients and learning on a toy dataset.

**Proposed implementation:** An original minimal model or a clearly attributed licensed educational dependency. Show train/test separation and inspectable parameters. Use a simple problem whose limitations can be explained.

**Acceptance:** Numerical gradient checks, fixed-seed reproducibility, training/test separation and charts drawn from measured losses. No claim that a toy model establishes large-model training expertise.

**Inspiration:** micrograd’s compact, inspectable approach. **Status:** Proposed; useful educational complement, lower hiring priority than the first three.

## Visual and editorial changes to adopt

1. Lead with three flagships; keep the broad library accessible below them. A project count should not be the main proof of ability.
2. Give each flagship one clear user and one concrete task. Separate the story from the raw trace, while making both one click away.
3. Show a failing example next to its corrected result. Use real run data, not decorative performance numbers.
4. Add a dated engineering note: requirement, baseline, decision, failure, evidence, next limitation. Link to actual files and immutable revisions when available.
5. Use screenshots from the actual product, with responsive layouts and diagrams from real data. Do not copy another engineer’s identity or present their work as Gabriel’s.
6. Label attribution precisely: built with Codex assistance; Codex SDK integrated only when it actually is; Claude assistance only where confirmed. Keep inference provider separate from development tooling.

## Reuse policy and present status

This update adds research and a prioritized roadmap, not six completed products. The current three workbench demos remain deterministic. The reviewed repositories are candidate references; no dependencies were installed or code copied. Before reuse, inspect the exact revision, license, dependency footprint and local compatibility. Benchmark claims and author reputations are not inherited by a derivative project.


## Expanded agent research

See [the three-agent inspiration review](ENGINEER-INSPIRATION-AGENT-REVIEW.md) for ten practitioner references (including one deliberate revisit and one broader software reference), a separate Codex company reference, and prioritized acceptance criteria. This is research, not a completed implementation batch.
