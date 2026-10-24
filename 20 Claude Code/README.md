# Claude Code and Codex project evidence

Status: populated with source-backed examples. This September 2026 portfolio refresh was implemented in Codex. Earlier project authorship is not inferred from the presence of an Anthropic API call.

| Example to share | Concrete artifact | What to demonstrate |
|---|---|---|
| [GHL/n8n contract](../integrations/ghl-n8n/contract.mjs) | Pure JavaScript planner embedded into 17 exports | Consent/type/tenant rejection and a minimized request |
| [Showcase generator](../scripts/build_showcase.py) | Source-derived catalog and reproducible exports | Change the shared contract, regenerate, run drift checks |
| [Validator repair](../scripts/validate_portfolio.py) | Trigger-root graph traversal and malformed JSON handling | An orphan Code node now fails validation |
| [ECOM-01](../showcase/ECOM-01/README.md) | Executable product-content policies | Block a changed protected fact with a precise reason |
| [IMP-01](../showcase/IMP-01/README.md) | Deterministic TypeScript agent reference | Trace a task to evidence and a human review boundary |

## Agentic engineering delivery loop

Define the input/output contract and forbidden effects; inspect existing implementation; add an adversarial acceptance case; implement the smallest change; run targeted tests then repository gates; retain dated results; review before live publication. Keep generated material tied to a source of truth and separate agent suggestions from human authority.

For an interview, show the source and a failing/passing case, explain a tradeoff, then state what has not been measured. The new connector performs no model calls, so it does not incur model tokens; this is not a claim about total workflow cost. Do not present tool authorship as proof of engineering quality.

The [audit](../PORTFOLIO-AUDIT-2026-09-08.md) records that the Instagram collection could not be reviewed. No technique is attributed to an unseen video.

---
Part of the [Enterprise Automation Portfolio](../README.md).
