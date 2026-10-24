# Implemented AI engineering patterns

This local implementation applies the separation of retrieval and answer evaluation discussed in [Ragas](https://arxiv.org/abs/2309.15217), and the evidence-to-action framing of [tau-Knowledge](https://arxiv.org/abs/2603.04370). It does not reproduce their benchmarks. See the [12-entry research review](AI-ENGINEERING-RESEARCH.md) for sources, dates, license observations and dependency constraints.

| Pattern | Working local artifact | Evidence and boundary |
|---|---|---|
| Source-scoped retrieval | engineering-evals.mjs | Approved tenant-filtered lexical lookup; no embeddings or LLM |
| Abstention | engineering-evals.mjs | Unknown and tied queries abstain; seven authored cases |
| Citation integrity | engineering-evals.test.mjs | Exact approved source text required; not semantic grounding |
| Versioned evaluation | engineering-evals.mjs | Dataset version plus dataset and corpus SHA-256 fingerprints |
| Traceable evaluation | engineering-evals.mjs | Per-case trace ID and local duration; no OpenTelemetry exporter |
| Tool and budget review | business-expansion.mjs AGT-01 | Allowlist and estimated-cost gate; no actual tool invocation |
| Durable state and replay | industry-depth.mjs EA-01 | SQLite close/reopen tests, atomic batches, conflict preservation |
| Business scheduling constraints | industry-depth.mjs PM-01 | Vendor skill, access overlap, SLA and human dispatch review |
| Recovery controls | business-expansion.mjs OPS-01 | Explicit boolean certainty, bounded attempts, reconcile-before-retry |
| Shareable build artifacts | project-builds | Ten runnable scripts, copied workflows, proposed PostgreSQL schemas and SOPs |

## Local acceptance

Run `node --test demo-lab/*.test.mjs demo-lab/test.mjs` and `node demo-lab/project-builds/verify.mjs` from the repository root. With the lab running, `node demo-lab/verify-ai-engineering.mjs` records real n8n runs for changed projects. The SQLite commitment register contains only a fixed trusted synthetic fixture. Tests use an isolated register or temporary database.

## Deliberately separate evidence

Structural SQL checks are not PostgreSQL engine acceptance. Local simulator checks are not hosted GHL acceptance. Repeating deterministic fixtures is not repeated-trial LLM reliability. The source documents are trusted synthetic corpus entries; these tests do not establish general prompt-injection resistance. All videos remain pending recording.

## Next local implementation work

Complete the broader industry behaviors still listed in COMPLETION-ROADMAP.md, add independently labeled model evaluation data before running a model benchmark, and add provider-specific adapter contracts without claiming live provider execution. External benchmark dependencies should use an isolated compatible runtime. The maintained tau repository currently excludes the portfolio Python 3.14 version, as documented in the research review.
