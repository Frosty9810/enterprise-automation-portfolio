# TrustGate — Information-Flow Control for Tool-Using AI Agents

## Project title and concept

TrustGate sits between an agent and every external action, allowing safe tool calls automatically while escalating only the calls whose integrity or confidentiality cannot be proven. It converts prompt-injection defense from a hopeful instruction into an enforceable runtime policy.

**Paper:** [RTBAS: Defending LLM Agents Against Prompt Injection and Privacy Leakage](https://arxiv.org/abs/2502.08966)

## The flow

`User intent + untrusted content → agent proposes tool call → dependency graph → integrity/confidentiality labels → policy screen → execute, confirm, or block → signed audit event`

The proof is an AgentDojo-style attack suite where malicious supplier emails attempt to change payment details, disclose internal prices, or trigger unauthorized tools while legitimate workflows continue.

## The system

- Tool gateway with JSON Schema contracts and per-tool privilege scopes
- Provenance labels for user input, retrieved content, memory, secrets, and tool outputs
- Dependency graph connecting tool arguments to every information source that influenced them
- Deterministic information-flow policy plus LM-judge and saliency screeners
- Human confirmation queue for unresolved high-impact calls
- Tamper-evident audit log and adversarial replay harness

## Technical core — the hard part

Adapt information-flow control to probabilistic agents. Track which untrusted or confidential values influence a proposed tool call, then implement dependency screeners that decide whether the call preserves integrity and confidentiality. Benchmark attack success rate, benign task completion, false escalation rate, and added latency rather than reporting only prompt-classification accuracy.

## Hard constraint

No model output can directly execute a payment, data export, credential change, or outbound message. Every high-impact sink must pass schema validation, provenance policy, least-privilege authorization, and an idempotency check.

## Defensible decision

Choose block-by-default for sensitive sinks and automatic execution for low-risk reads. This sacrifices some autonomy and adds occasional confirmation friction, but contains the blast radius when a novel prompt injection bypasses the model-based screener.

## Something deliberately killed

Cut unrestricted browser control. A universal browser tool makes a demo look powerful but destroys the ability to reason about privileges; v1 exposes narrow, typed tools with explicit scopes.

## Startup-level implementation

- FastAPI policy gateway with Open Policy Agent rules and signed execution receipts
- LangGraph agent runtime where every tool call passes through TrustGate
- PostgreSQL provenance graph and append-only audit log
- AgentDojo-derived red-team corpus in CI with attack and utility thresholds
- OpenTelemetry traces showing the sources that influenced each argument
- React review console for blocked calls, evidence, approvals, and replay

## Modern stack

Python, FastAPI, LangGraph, Pydantic, Open Policy Agent, PostgreSQL, Redis, OpenTelemetry, AgentDojo, PyTorch for saliency experiments, React, Playwright, Docker, Kubernetes network policies.

## Resume impact bullets

- **Implemented** information-flow control for `[N]` agent tools, reducing prompt-injection attack success from `[X%]` to `[Y%]` while preserving `[Z%]` benign task completion.
- **Designed** a provenance-aware tool gateway with schema validation, least privilege, and idempotency controls across payment, messaging, and data-export actions.
- **Automated** `[N]` adversarial scenarios in CI and surfaced source-to-argument dependency traces, reducing security-review time by `[X%]`.

