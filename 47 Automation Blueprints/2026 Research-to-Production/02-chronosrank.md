# ChronosRank — A Reasoning-Aware Memory Layer for Long-Running Agents

## Project title and concept

ChronosRank gives agents useful long-term memory instead of a pile of semantically similar notes. A compact reranker understands temporal order, cause and effect, conversation context, and entity references, then returns only the memories that are actually needed for the current task.

**Paper:** [MemReranker: Reasoning-Aware Reranking for Agent Memory Retrieval](https://arxiv.org/abs/2605.06132)

## The flow

`Conversation/event stream → memory extraction → vector candidate retrieval → reasoning-aware reranker → calibrated threshold → agent context → outcome feedback`

The proof is a sequence of ambiguous operational requests where generic similarity retrieval chooses the wrong customer or outdated decision while ChronosRank selects the causally and temporally correct memory.

## The system

- Event-sourced memory ingestion with entity, timestamp, provenance, and retention metadata
- Qdrant candidate retrieval for high-recall top-k selection
- A 0.6B cross-encoder reranker exposed through a batched inference service
- Calibration service that chooses thresholds by task and cost of false recall
- Offline training/evaluation pipeline and online drift dashboard
- Feedback capture from agent outcomes without silently rewriting history

## Technical core — the hard part

Reproduce the multi-stage distillation mechanism: multi-teacher pairwise comparisons produce soft labels; pointwise binary cross-entropy shapes calibrated scores; and InfoNCE contrastive learning separates hard negatives. Construct memory-specific training data for temporal constraints, causal reasoning, coreference, and multi-turn disambiguation, then compare a 0.6B model against BM25, dense retrieval, a generic reranker, and a larger model.

## Hard constraint

The reranker must stay below a measured p95 latency budget under concurrent load and must not retrieve expired or superseded memories. Accuracy without calibrated abstention does not pass.

## Defensible decision

Use a two-stage retrieve-then-rerank architecture instead of asking a large model to search the full memory store. The tradeoff is added training and serving complexity, but candidate recall remains cheap and the small reranker gives predictable latency and costs.

## Something deliberately killed

Cut autonomous memory deletion. The system may mark a memory superseded or expired, but destructive deletion requires a retention policy and audit workflow; clever forgetting is not worth losing provenance.

## Startup-level implementation

- Dataset builder using Ray Data and reproducible hard-negative mining
- PyTorch/Hugging Face training with MLflow experiments and calibration reports
- ONNX Runtime or TensorRT inference with dynamic batching behind FastAPI
- Qdrant memory store, Redis hot-candidate cache, and PostgreSQL event ledger
- Grafana dashboard for MAP, NDCG, calibration error, p95 latency, and drift
- Load tests that vary memory size, dialogue length, and concurrent agents

## Modern stack

PyTorch, Transformers, Accelerate, Ray Data, MLflow, Qdrant, PostgreSQL, Redis, FastAPI, ONNX Runtime, TensorRT-LLM, Prometheus, Grafana, Docker, Modal.

## Resume impact bullets

- **Trained** a `[0.6B]` reasoning-aware memory reranker with pairwise, BCE, and InfoNCE distillation, improving NDCG@10 by `[X%]` on temporal and causal retrieval tasks.
- **Deployed** a dynamically batched ONNX inference service sustaining `[N]` requests per second at `[X] ms` p95 latency under a `[N]-memory` corpus.
- **Reduced** irrelevant agent context by `[X%]` through calibrated retrieval thresholds and supersession-aware filtering, lowering downstream model token usage by `[Y%]`.

