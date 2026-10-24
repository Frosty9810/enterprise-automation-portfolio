# Five reel references: research and portfolio decisions

Reviewed 5 October 2026. Six supplied links contain five unique posts. Direct web fetches failed, but all five post pages opened in the browser and their captions were read. The Archify repository link was also visible in a creator comment. This is a caption/documentation review, not a complete audio transcription or a claim to have inspected every video frame. Earlier September recommendations are historical context, not substitutes for this review.

## What each reference contributes

| Post | Observed subject | Transfer to this portfolio | Priority |
| --- | --- | --- | --- |
| [donimas / DeFS0Fes8yu](https://www.instagram.com/p/DeFS0Fes8yu/) | Model and effort selection, verification and escalation; caption explicitly identifies its example as simulated | Add a measured model-routing experiment to Eval Observatory, with verifier failures, bounded escalation and total cost per accepted result | High, after evaluation criteria exist |
| [marc.kaz / DeFGs1_sk3Y](https://www.instagram.com/p/DeFGs1_sk3Y/) | REA toolkit for investigating application behavior, binaries and reconstruction through CLI/MCP | Build an evidence-led reconstruction case using our own old/new automation versions: observed behavior, expected behavior, differences and unknowns | Later; adopt the investigation method first |
| [github_dev / Dc_auq4E_Ma](https://www.instagram.com/p/Dc_auq4E_Ma/) | PaperGym research-plan training and evaluation | Separate inputs from evaluation criteria; show criterion-level outcomes and versioned demonstration/regression sets | High |
| [ajsahni.ai / Dc9n3pWyiSq](https://www.instagram.com/p/Dc9n3pWyiSq/) | A six-department agent office with subscription-based/headless operation; actual setup is gated behind a comment request | Give an operations desk explicit work states, role permissions, handoff contracts and reviewer responsibilities | Medium; role separation must work before adding model workers |
| [justinmendez.ai / DclksZuoDtx](https://www.instagram.com/p/DclksZuoDtx/) | Visual explanations of codebases and systems; creator identifies Archify | Add source-linked architecture and decision-path views, including blocked paths and trust boundaries | High for presentation |

These are our engineering recommendations. They are not claims that the creators proposed these exact business cases or that the cited tools are already installed.

## Primary-source checks

**Model routing:** Anthropic documents an effort/quality/cost tradeoff and recommends measuring on the actual workload. Its cost guide compares effort settings and single-model baselines before adding multi-model coordination. Thus a router is an experiment to validate, not a guaranteed saving. The reel's illustrative dollar amounts are not portfolio measurements. Sources: [effort](https://platform.claude.com/docs/en/build-with-claude/effort), [cost and intelligence](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence).

**REA:** The [maintainer documentation](https://github.com/morluto/rea) describes local investigations with evidence, limitations, behavior comparisons and reconstruction checks. It explicitly distinguishes decompiled pseudocode from original source and says Windows Ghidra operations are unavailable. That makes its investigation/evidence method a better immediate fit than installing a native-binary toolchain on this Windows portfolio. No REA provider was installed or run.

**PaperGym:** The [paper](https://arxiv.org/abs/2608.31119) derives questions and criteria from different parts of scientific papers and uses rubrics in training and reward. The [linked repository](https://github.com/ZJU-REAL/PaperGym) is the correct research project; another similarly named PaperGym exists, so attribution matters. The scientific benchmark's reported results do not establish our workflow quality. We should borrow rubric separation, not its scores or a claim of having replicated its training.

**Archify:** Its [English documentation](https://github.com/tt-a1i/archify/blob/main/README_EN.md) describes interactive standalone HTML, source-linked maps and authored path exploration. A map can explain declared relationships; it does not prove that a path executed. Our existing workflow renderer already derives nodes and connections from exports. Archify should earn adoption by improving layout, source navigation and portability over that baseline, rather than duplicating it.

**Departmental office:** The caption does not provide the actual repository, task contracts, authentication or execution configuration. We cannot verify the gated system or subscription savings from that page. The transferable idea is separation of responsibilities; a departmental label alone adds no capability.

## A concrete next showcase: evaluated routing for product drafts

Extend ECOM-01 alongside ENG-03 Eval Observatory. A visitor should inspect how a proposed translation is generated, checked and either accepted for review, escalated or stopped. Generation and authorization remain separate: neither a stronger model nor a successful retry may override a failed protected-fact check.

1. Freeze a small synthetic catalog with stable product/revision identities and scenario-family labels. Keep demonstrations separate from regression examples. Public examples are public regression cases, not secret holdouts; real client records remain private.
2. Version the rubric before testing: protected facts, unsupported claims, output shape, language quality and review requirement. Existing numeric-token checks are limited, so semantic/language criteria require validated reviewers or separately calibrated evaluation.
3. Compare a rules-only baseline, a single-model baseline across effort settings, and a bounded routing policy on the same cases and trials. Label fixture replay separately from real provider runs.
4. Record every attempt: provider/model, effort, prompt and rubric version, input/output hashes, actual usage, pricing date, elapsed time, verification outcome and escalation reason. Failed attempts and verifier costs belong in the totals.
5. Stop on missing/invalid evidence, exhausted budget or escalation limit. Export a draft only after the exact candidate receives its required review. Reconcile any uncertain external action instead of blindly retrying it.
6. Show case-level fixes and regressions alongside accepted count, total cost, cost per accepted result, escalation rate and measured latency. When nothing is accepted, cost per accepted result is undefined, not zero.

Acceptance: malformed outputs cannot pass; a more expensive model cannot bypass policy; repeated delivery cannot create duplicate publication authority; changed source/policy invalidates review; exhausted budget stops; missing usage or price data is shown as unavailable; paired comparisons retain errors and missing trials. Claims of lower cost require observed results under an unchanged evaluation protocol.

Live provider work would need configured credentials and an explicit run budget. Neither is required to document this design, and no paid calls have been made during this research.

## Presentation improvements with immediate value

- **Decision-path map:** show Source → Generator → Fact checker → Review → Draft export. Selecting a failed check highlights its blocked branch and opens the actual source location. Label the diagram as architecture; label any execution overlay with its recorded run ID.
- **Role and authority cards:** Author may propose, verifier may reject, reviewer may attest, exporter may produce a reviewed draft. Publishing is a separate permission that this local showcase does not possess.
- **Reconstruction evidence:** pair an old behavior with a corrected behavior, retain outputs and identify precisely what was observed. Use our owned synthetic examples instead of requiring a customer's inaccessible deployment.

Recommended order: strengthen Eval Observatory's rubric and evidence schema, connect it to a bounded routing experiment, improve source/path diagrams, then deepen an operations desk. REA installation and the gated agent-office stack are not prerequisites.
