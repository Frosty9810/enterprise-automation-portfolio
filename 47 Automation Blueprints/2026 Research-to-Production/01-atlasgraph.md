# AtlasGraph — A Self-Correcting Knowledge Compiler for Operations

## Project title and concept

AtlasGraph turns policy manuals, supplier documents, customs rules, and internal SOPs into a linked operational knowledge system that an agent can search, read, traverse, and correct. Instead of returning the nearest text chunks, it follows evidence paths and stops only when the answer is supported by an auditable chain of sources.

**Paper:** [Retrieval as Reasoning: Self-Evolving Agent-Native Retrieval via LLM-Wiki](https://arxiv.org/abs/2605.25480)

## The flow

`Document/API ingestion → page compiler → entity and relation linking → search/read/follow tools → evidence sufficiency check → cited answer → error-book correction`

The proof is a multi-hop question that dense RAG misses—for example, connecting a supplier's Incoterm, a customs restriction, and an internal approval threshold—while AtlasGraph returns the correct decision and source path.

## The system

- Versioned ingestion workers for PDF, email, CSV, and API sources
- A compiler that produces structured pages, stable IDs, summaries, and bidirectional links
- Hybrid retrieval using lexical search, dense vectors, and graph traversal
- Tool interfaces for `search`, `read`, `follow_link`, and `record_error`
- An evidence ledger storing the path, source version, confidence, and final answer
- An Error Book that queues failed paths for human review and recompilation

## Technical core — the hard part

Implement the paper's retrieval-as-reasoning loop rather than wrapping a vector database. Documents must be compiled into structured pages; links must be traversable in both directions; the agent must choose among search, read, and follow operations; and failed retrieval paths must become persistent correction records. Evaluate it on multi-hop questions against dense RAG and GraphRAG baselines using answer F1, citation precision, path length, and token cost.

## Hard constraint

Every operational answer must fit within an 8,000-token evidence budget and include stable citations to versioned source records. If evidence is insufficient or contradictory, the system must abstain instead of filling the gap with model knowledge.

## Defensible decision

Use PostgreSQL with pgvector plus explicit relation tables instead of adding Neo4j initially. This gives weaker native graph ergonomics but reduces operational complexity, keeps transactions and source versions in one system, and is sufficient while the graph remains below tens of millions of edges.

## Something deliberately killed

Cut automatic ontology generation from the first release. It looks impressive, but an unstable ontology makes links and evaluations impossible to compare; v1 uses a small reviewed schema and adds ontology evolution only after retrieval metrics are stable.

## Startup-level implementation

- Distributed document compilation with Ray workers and idempotent ingestion jobs
- FastAPI retrieval service with streaming tool traces and Redis result caching
- PostgreSQL/pgvector evidence store with immutable document versions
- React investigation console showing the answer, traversal graph, citations, and Error Book
- OpenTelemetry traces, Prometheus latency/cost metrics, and a golden multi-hop evaluation suite
- GitHub Actions for ingestion fixtures, link-integrity checks, and retrieval regression tests

## Modern stack

Python 3.12, PyTorch, FastAPI, Pydantic, Ray, PostgreSQL, pgvector, Qdrant optional benchmark adapter, LangGraph, Redis, OpenTelemetry, Prometheus, Grafana, React, Vite, Docker, Modal for batch GPU compilation.

## Resume impact bullets

- **Engineered** an agent-native retrieval system that compiled `[N]` operational documents into linked evidence pages, improving multi-hop answer F1 by `[X]` points over a dense-RAG baseline.
- **Reduced** retrieval token cost by `[X%]` by implementing explicit search/read/follow tools with evidence-sufficiency stopping and Redis caching.
- **Built** a self-correction Error Book and versioned citation ledger that reproduced `[X%]` of production answers from their exact source path during regression testing.

