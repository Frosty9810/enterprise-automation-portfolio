# Portfolio inspiration review: Anthropic, OpenAI/Codex and independent builders

Reviewed September 12, 2026. Three AI research specialists covered complementary groups; the coordinator checked additional primary pages and prioritized applications to this portfolio. These are selected relevant practitioners, not an objective ranking of the best engineers. Recommendations below are design judgments, not claims that Gabriel built the referenced work.

## Main decision

Deepen the three flagship demonstrations before increasing the project count. The current portfolio already includes 27 automation demonstrations, 20 Life and data tools and nine engineering prototypes. Its next improvement should make one meaningful engineering decision easier to see, reproduce and explain. Additional visual polish should clarify this evidence.

## Anthropic-associated practitioners

### Boris Cherny — precise ownership and engineering investigation

His [own About page](https://borischerny.com/about/) identifies him as an Anthropic software engineer and the creator of Claude Code. His personal writing is distinct from company documentation. The [ES Modules investigation](https://borischerny.com/javascript,/typescript/2024/06/19/ES-Modules-Are-A-Mess.html) develops a concrete technical problem, explains ways of measuring it and links supporting artifacts.

**Apply:** Write an engineering investigation for the portfolio's real evidence-history defect: a project disappears after another accumulates more than 100 runs; show the reproduction, the bounded-history tradeoff, the separate latest-result query and the regression test. This is stronger evidence of engineering judgment than another generic claim about automation efficiency.

**Do not infer:** using Codex or Claude to assist development establishes neither company affiliation nor integration of their agent SDKs.

### Chris Olah — diagrams that teach a mechanism

His [About page](https://colah.github.io/about.html) describes Anthropic cofounding and former OpenAI interpretability work. His [LSTM explanation](https://colah.github.io/posts/2015-08-Understanding-LSTMs/) builds an explanation through consistent visual notation and individual operations. This is an established educational example, not current model-selection guidance.

**Apply:** Let the visitor follow one example record through an actual local workflow. Use consistent visual roles for input, rule, decision and output. For ECOM-01, distinguish its business decision from the separate synthetic CRM contact handoff. A continuous-looking arrow must not imply that product output becomes a CRM record when it does not.

**Acceptance:** Every shown value comes from an identified fixture or execution record; the selected node opens the corresponding rule and result; unknown or unexecuted stages are labeled.

### Nelson Elhage — reproducible artifacts and honest scope

His [personal site](https://nelhage.com/) lists Anthropic as previous work. Do not label him a current Anthropic employee. It separates professional contributions, personal tools and writing. [livegrep](https://github.com/livegrep/livegrep/) provides a concrete tool and build information. His [LLVM build article](https://blog.nelhage.com/post/building-llvm-in-90s/) explains configuration, measurement and constraints.

**Apply:** Put a compact reproduction card beside each flagship: fixture, exact command, source fingerprint, recorded time, output artifact and limitations. Distinguish startup time, engine time and business impact. Keep the observed 63.9-second SAAS-03 run alongside its faster recheck rather than selecting only the favorable measurement.

## OpenAI/Codex-associated example

### Calvin French-Owen — a technical story with a human author

His [About page](https://calv.info/about) states he worked at OpenAI during 2024–2025 helping launch Codex. Treat this as former employment. His [writing index](https://calv.info/) separates dated engineering observations and broader interests; its coding-agent observations are his personal experience, not independent comparative benchmarks.

**Apply:** Add a brief author perspective to each flagship: the problem being solved, the implemented contribution that can be demonstrated, the alternative considered and the remaining uncertainty. Keep personal interests and useful human tools visible in the wider portfolio rather than converting everything into enterprise language.

**Acceptance:** Historical ownership comes from Gabriel's account or source history. Never invent dates, collaborators, client outcomes or firsthand opinions to fill the narrative.

### Dominik Kundel — predictable paths to a real artifact

His [personal bio](https://dkundel.com/) identifies OpenAI Developer Experience and SDK work, corroborated by his [About repository](https://github.com/dkundel/about-me). His [writing](https://dkundel.com/writing/) and [speaking](https://dkundel.com/speaking/) connect specific projects, talks, code and playful interests.

**Apply:** Use the same Present / Run / Inspect actions on each flagship. A recording link should appear only when an actual recording exists; the existing presentation is a valid alternative. Add a concise author comment explaining one real implementation choice.

### Andrej Karpathy — separate explanation from implementation depth

This is a deliberate revisit of a previously reviewed reference. His [personal timeline](https://karpathy.ai/) identifies historical OpenAI work, not current employment. [micrograd](https://github.com/karpathy/micrograd) connects a compact implementation with usage, notebooks and correctness checks.

**Apply:** Provide an accessible explanation followed by the inspectable computation. Tiny Learning Lab is the natural fit, but its single logistic neuron must retain its modest scope. Do not imply micrograd was incorporated or that the example demonstrates large-model training.

### Separate company reference: the Codex repository

The [official Codex repository](https://github.com/openai/codex) offers source, quickstart and supporting build/contribution documentation. Adapt the reproducibility pattern, not its identity. A local client, Codex-assisted development and a real Codex SDK integration are three different claims.

### Additional Calvin source

The research agent also inspected [Calvin's project collection](https://calv.info/projects), which connects personal frustrations, approaches, collaborator credit and candid outcomes. This strengthens the recommendation for a factual why / contribution / lesson section, including human-centered examples beyond business operations.

## Independent practitioner examples

Independent here means this research lane is separate from the two company-associated lanes; it does not assert that these practitioners have no employer or affiliations.

### Vincent Warmerdam — approachable interactive experiments

His [apps collection](https://koaning.io/apps/) and [wigglystuff repository](https://github.com/koaning/wigglystuff) connect small interactive tools with explanations and documentation.

**Apply:** Add scenario controls to ClaimProof and Action Ledger before the full JSON editor. A reviewer can select an approved source, an unapproved source or a different-tenant source. A retry example can switch between success, confirmed pre-write failure and uncertain acknowledgement. Each control must change the actual evaluator input and invalidate old results.

**Acceptance:** Keyboard-operable controls, visible current input, reproducible export, and no stale success after editing. Reuse the current local implementation; adopting a notebook framework is unnecessary for these controls.

### Jay Alammar — one question per visual

His [visual explanations](https://jalammar.github.io/) and [Ecco project](https://github.com/jalammar/ecco) organize technical exploration around interpretable questions and linked examples. The GitHub-hosted blog identifies itself as frozen and points to newer writing; use the established explanation patterns without calling it a current project feed.

**Apply:** Replace generic graph headings with questions such as “Why was this change held?” and “Why did the retry avoid a second write?” Put the answer, source rule and trace next to the graph.

**Acceptance:** Text labels supplement color, graph state agrees with the result, and no interface implies access to hidden model reasoning. Ecco is a reference; it has not been integrated here.

### Peter Bloem — progressive technical depth

His [Transformers from scratch walkthrough](https://peterbloem.nl/blog/transformers) proceeds through intuition, diagrams, small code fragments and a larger experiment.

**Apply:** Structure a flagship as business situation → important decision → small annotated function → complete source → tests → limits. In Repair Studio, explain the event identity map before showing the complete candidate. In Tiny Learning Lab, show the weight update and its effect on measured loss.

**Limit:** The research agent could read the article but could not verify its linked Codeberg and pinned GitHub code fetches. Those repositories were not installed or executed.

### Additional coordinator reference: Andrey Petrov

His [personal project list](https://shazow.net/) gives short descriptions with direct tool or source links and visibly distinguishes retired items. This is a broader software portfolio reference, not evidence of AI specialization.

**Apply:** Give every portfolio item a clear lifecycle label and direct next action. Keep a working demo, a reconstructed example, an original source export and a proposal visibly distinct.

## Governor prioritization

These are approved directions for a subsequent implementation cycle, not completed changes in this research turn.

| Priority | Proposed change | Existing target | Evidence required before approval |
|---|---|---|---|
| 1 | Three-state scenario controls | ClaimProof, Action Ledger | Evaluator input changes; stale result clears; adverse case works; keyboard flow passes |
| 2 | One-record process walkthrough | ECOM-01 and one engineering flagship | Values match source/run; separate business and CRM data; node-to-rule links resolve |
| 3 | Reproduction card | ECOM-01, ShelfSense, Repair Studio | Fixture, command, source identity, timestamp and output match; fixture timings labeled |
| 4 | Engineering investigation | Evidence-history repair | Show the failing condition, fix and independent regression; preserve limitations |
| 5 | Progressive source explanation | Repair Studio, Tiny Learning Lab | Short explanation accurately describes the code; full source remains accessible |
| 6 | Lifecycle and contribution clarity | All collections | No invented ownership or production status; clear retired/proposed/demo distinctions |

## Concrete flagship presentation treatments

**ECOM-01 — protect a product fact.** Open with the actual bundled fact and attempted change. Show which rule holds it, then inspect the code. Show the n8n wrapper separately from the original source export. End with the recorded local handoff and its exact limits. Do not mix an illustrative 500-to-750 ml story with a fixture using different values without an explicit label.

**ShelfSense — a grocer reviews a supplier sheet.** Place “Pack: 12” beside the proposed value 24. Explain the discrepancy in one sentence. Correct the value; approval must be reset by the edit. Show the blocked and approved states side by side only if both have identifiable recorded inputs. PDF parsing, OCR and model extraction remain future work.

**Repair Studio — a duplicate event changes stock twice.** Show initial stock, first event and repeated ID. Explain the baseline failure. Show the identity check in the candidate, the actual test output, and why per-call memory is insufficient for a production distributed service. Attribute development assistance accurately; do not call this a Codex SDK product.

## Agent review rule for the next cycle

Implementation agents may adapt presentation mechanisms, not copy branding or imply inherited accomplishments. Independent reviewers should test one normal case, one rejection and one stale-evidence case for each affected flagship. The governor should hold changes if the diagram and source disagree, if contribution claims lack support, or if a polished screen implies a capability that is still proposed. Automated checks support this decision; they cannot establish recruiter preference or production model quality.

## Research boundaries

Public pages and repository documentation were reviewed. These authors' programs were not executed, benchmark claims were not rerun, and no dependencies were installed or code copied. Affiliation statements are scoped to the cited primary pages and date reviewed. This document records inspiration and an implementation backlog; it does not change the site or add completed projects.
