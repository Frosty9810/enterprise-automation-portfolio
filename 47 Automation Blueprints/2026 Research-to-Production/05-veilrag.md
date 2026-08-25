# VeilRAG — A Privacy Proxy for External Language Models

## Project title and concept

VeilRAG lets a company use strong external models without sending customer names, supplier identities, account numbers, or confidential deal terms to the provider. A local model replaces sensitive entities with consistent aliases before generation and restores only authorized values after the response returns.

**Paper:** [Privacy-Preserving RAG by Concealing Sensitive Information from External LLMs](https://arxiv.org/abs/2608.12675)

## The flow

`Query + retrieved documents → local sensitive-entity detection → alias table → sanitized external generation → output leak scan → authorized re-identification → audit record`

The proof is a leakage benchmark that measures both answer utility and the percentage of sensitive entities hidden from the external generator.

## The system

- Local entity detector for people, companies, identifiers, prices, addresses, and custom secrets
- Per-request alias vault with deterministic within-session replacements
- Sanitization proxy for query, retrieved context, tool arguments, and conversation history
- External model adapter that never receives the alias table
- Output scanner and policy-controlled re-identification service
- Privacy/utility benchmark, leakage dashboard, and immutable audit events

## Technical core — the hard part

Implement the paper's Sensitive Entity Alias Generator pattern: detect all sensitive spans, generate semantically compatible aliases, preserve cross-document coreference, and reconstruct authorized outputs without revealing the mapping to the external model. Evaluate entity-hiding recall, false masking, answer correctness, reconstruction accuracy, latency, and attacks that try to infer alias mappings.

## Hard constraint

The external model endpoint must receive zero direct identifiers from protected classes. The alias table remains local, encrypted, short-lived, and inaccessible to the generator process; a failed leak scan blocks the response.

## Defensible decision

Use local reversible aliasing instead of fully homomorphic encryption or sending raw context under a contractual promise. Aliasing provides weaker formal guarantees than cryptography but is deployable with current model APIs, preserves semantic utility, and can be measured continuously.

## Something deliberately killed

Cut free-form re-identification by the language model. Restoration is deterministic and policy-controlled; allowing the model to reconstruct identities would collapse the trust boundary the system exists to enforce.

## Startup-level implementation

- Local compact NER/SLM service with domain-specific entity taxonomy
- FastAPI privacy proxy and Vault-backed ephemeral alias maps
- Qdrant retrieval with document-level access control before sanitization
- Presidio and custom detectors as deterministic defense-in-depth
- Red-team suite for direct leaks, quasi-identifiers, coreference, and encoded output
- Dashboard for privacy recall, utility, blocked responses, and per-provider exposure

## Modern stack

PyTorch, Transformers, Microsoft Presidio, FastAPI, Pydantic, HashiCorp Vault, Qdrant, PostgreSQL, OpenTelemetry, Prometheus, Grafana, Docker, Kubernetes, external OpenAI/Anthropic-compatible adapters.

## Resume impact bullets

- **Built** a privacy-preserving RAG proxy that concealed `[X%]` of protected entities from external model providers while retaining `[Y%]` answer accuracy.
- **Implemented** consistent cross-document aliasing and policy-controlled re-identification for `[N]` entity classes with `[X%]` reconstruction accuracy.
- **Reduced** sensitive-data exposure across `[N]` model requests by combining local NER, deterministic detectors, output leak scans, and short-lived encrypted alias maps.

