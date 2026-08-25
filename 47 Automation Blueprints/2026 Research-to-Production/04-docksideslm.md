# DocksideSLM — Offline Document Intelligence for the Warehouse Edge

## Project title and concept

DocksideSLM extracts and validates invoices, packing lists, and bills of lading on low-cost warehouse hardware even when connectivity is unreliable. It chooses compression based on measured end-device behavior, not model size alone, and falls back safely when confidence or output structure degrades.

**Paper:** [Large Models for Small Devices: Recent Advances and Empirical Analysis of Edge AI Deployment](https://arxiv.org/abs/2608.15693)

## The flow

`Document scan → OCR → local SLM extraction → schema validation → confidence gate → ERP sync or human review → delayed cloud reconciliation`

The proof is a Raspberry Pi or CPU-only device processing a mixed document batch while reporting exact latency, memory, energy, field accuracy, and fallback rates.

## The system

- Local OCR and document-normalization service
- Benchmark harness comparing GGUF quantization, structured pruning, and LoRA recovery
- Schema-constrained SLM inference with per-field confidence
- Offline queue with idempotent synchronization when connectivity returns
- Hardware telemetry for memory, temperature, energy, prefill, and decode latency
- Cloud dashboard comparing models and detecting degenerate class behavior

## Technical core — the hard part

Implement hardware-aware compression evaluation with prefill/decode latency decomposition and task-specific quality checks. A model only wins if it improves the Pareto frontier across field accuracy, balanced accuracy, output compliance, p95 latency, peak memory, and energy; detect cases where compression preserves aggregate accuracy by collapsing toward one class.

## Hard constraint

The primary pipeline must run offline within a 4 GB memory envelope and never write an unvalidated extraction to the ERP. Connectivity, cloud GPUs, and a proprietary API cannot be required for the critical path.

## Defensible decision

Start with Q5_K_M quantization for the compact language model rather than pruning. The paper's results show that pruning can break quantization alignment and worsen deployed latency; pruning remains an experiment only if measured hardware results justify it.

## Something deliberately killed

Cut end-to-end document fine-tuning from v1. Before paying the data-labeling and GPU cost, establish whether prompt/schema engineering plus quantization already meets field-level accuracy and latency targets.

## Startup-level implementation

- Reproducible benchmark runner across x86 CPU, GPU, and Raspberry Pi
- llama.cpp/GGUF inference service with JSON-schema constrained decoding
- ONNX OCR pipeline and local SQLite job queue
- Prometheus node metrics and a Grafana model-comparison dashboard
- Signed model registry with rollback and over-the-air update manifests
- Golden document set with corruption, skew, multilingual text, and missing fields

## Modern stack

PyTorch, llama.cpp, GGUF, ONNX Runtime, OpenVINO, Qwen compact models, PaddleOCR or DocTR, FastAPI, SQLite, Prometheus, Grafana, MLflow, Docker, Raspberry Pi 5, Tailscale for secure fleet access.

## Resume impact bullets

- **Deployed** an offline document-intelligence pipeline on `[hardware]`, processing `[N]` pages per minute within `[X] GB` peak memory and `[Y] W` power.
- **Benchmarked** quantization and pruning across accuracy, class balance, output compliance, and prefill/decode latency, selecting a model that reduced p95 latency by `[X%]` without field-accuracy regression.
- **Prevented** invalid ERP writes with schema-constrained decoding, confidence gates, and an idempotent offline queue, routing only `[X%]` of documents to human review.

