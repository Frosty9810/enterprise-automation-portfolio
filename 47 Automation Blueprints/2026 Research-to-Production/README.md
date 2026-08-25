# Five Research-to-Production AI Engineering Projects

> **Status:** Blueprint-ready. These are reference projects, not client engagements. Resume impact bullets contain placeholders until measured by a completed implementation.

## Research themes

### 1. Retrieval is becoming an active reasoning process

Flat vector search is no longer enough for long-running agents. Current work adds document compilation, graph traversal, temporal and causal reranking, persistent correction, and explicit evidence-sufficiency decisions.

### 2. Model quality must be measured on the hardware and workload that will run it

Quantization, pruning, and distillation can improve a benchmark while hurting real latency, class balance, or output compliance. Strong 2026 projects therefore treat model optimization as a systems problem: accuracy, memory, throughput, energy, and failure behavior are measured together.

### 3. Security and privacy must sit between the model and its tools

Production agents ingest untrusted content, hold persistent state, and can trigger external actions. The strongest designs use explicit trust boundaries, information-flow policies, local de-identification, least-privilege tools, and adversarial evaluation rather than relying on a system prompt.

## Selected projects

| Project | Core skill | Research basis |
|---|---|---|
| [AtlasGraph](01-atlasgraph.md) | Agentic RAG and graph retrieval | [LLM-Wiki, arXiv:2605.25480](https://arxiv.org/abs/2605.25480) |
| [ChronosRank](02-chronosrank.md) | SLM distillation and reranking | [MemReranker, arXiv:2605.06132](https://arxiv.org/abs/2605.06132) |
| [TrustGate](03-trustgate.md) | AI agent security | [RTBAS, arXiv:2502.08966](https://arxiv.org/abs/2502.08966) |
| [DocksideSLM](04-docksideslm.md) | Edge inference and compression | [Large Models for Small Devices, arXiv:2608.15693](https://arxiv.org/abs/2608.15693) |
| [VeilRAG](05-veilrag.md) | Privacy-preserving RAG | [SEAG, arXiv:2608.12675](https://arxiv.org/abs/2608.12675) |

## Portfolio rule

Each project must prove five things before it is called complete:

- **A flow:** a user or system moves from a concrete input to a measurable outcome.
- **A system:** the implementation has components, boundaries, state, and operational ownership.
- **A hard constraint:** the build works within a rule that cannot be prompted away.
- **A defensible decision:** the chosen architecture names the rejected alternative and tradeoff.
- **A killed feature:** scope discipline is visible, with a feature removed and the reason recorded.

