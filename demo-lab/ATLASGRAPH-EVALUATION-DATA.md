# AtlasGraph independent synthetic evaluation data

This is a 16-case **AI-authored synthetic diagnostic challenge**, authored by a specialist separate from the evaluator implementation. It is not human-reviewed ground truth, an external held-out dataset, a natural-language model benchmark, a measured production result, or reproduction of any paper. Every organization, case, role, assignment and operational rule is fictional. No private/client data, real provider or paid service is used.

The [corpus](atlasgraph-evaluation-corpus.json) and [labels](atlasgraph-evaluation-labels.json) were authored together from the existing [compiler schema and retrieval contract](ATLASGRAPH.md). The author inspected compilation requirements but did not run or inspect new evaluator outputs before freezing them. Validation at freeze checks only schemas, source/claim/reference integrity and successful independent compilation of each snapshot. It does not establish retrieval quality. The coordinator records the exact file hashes; subsequent label/data changes require an explicit rationale and new evidence, never silent tuning to improve a method's result.

## Fixed comparison protocol

Every case supplies the same approved/unapproved source snapshot, query, requested exact claim keys and byte policy to both compared methods. Graph retrieval starts at the top lexical result and follows the existing bounded graph behavior. Flat retrieval reads up to the specified number of lexical matches. The normal policy is two hops, three flat pages and 12,000 UTF-8 bytes of the JSON-encoded complete citations array. Explicit boundaries use zero hops/one flat page or a 256-byte citation budget. These are diagnostic settings, not tuned optimums or token-budget claims.

No value is inferred from business prose or supplied by an LLM. Each encoded claim's value occurs verbatim in its source page text. The query is at most 200 characters. Each case compiles separately into a new local snapshot, within the actual 12-source/32-page limits; source IDs/versions are fixture identities and tenant labels are unauthenticated local labels.

## Label meaning

`expectedStatus: supported` means the intended query can be justified by the admissible approved supplied evidence under the stated diagnostic intent. It is **not** a prediction that graph retrieval succeeds. Disconnected useful pages, a stronger glossary seed, an irrelevant longer auxiliary chain and split required claims deliberately retain supported labels even when a method cannot recover them. Failures must remain in reported results rather than being relabeled as successful abstention.

`expectedStatus: abstained` means the intended query must be held because approved facts are missing or contradictory, the fixed lexical protocol has no seed, or an explicit reachability/citation-budget boundary prevents supplying admissible evidence. Such labels have empty `expectedClaims` and `goldEvidencePageIds`. A no-seed label does not mean a source fact is false; the rationale distinguishes retrieval-policy uncertainty from absence of facts. The zero-hop case also sets flatLimit to one and makes its index the only lexical match, so the intended hold is documented for both methods. The byte case has full source text exceeding 256 bytes before metadata, without estimating an evaluator's particular response.

For supported cases, `goldEvidencePageIds` names the semantically relevant source pages: direct factual support plus supplied path/context needed to bind a generic assertion to its fictional case. Corroborating applicable pages can all be relevant; reading every listed page is not always necessary to answer a direct fact. Irrelevant audit cycle notes, glossary/statistics pages and records scoped to a different case are not gold evidence merely because a traversal visits them. The rationale explains each choice. These are authored relevance judgments, not external truth or proof that an arbitrary source relation is semantically correct.

Evidence recall/precision therefore describes overlap with this particular relevance scheme; it is not an all-purpose measure of answer correctness. The context-decoy case intentionally exposes limitations of exact-key aggregation: an approved page for a different case can reuse the key without justifying that value for the selected case. The author does not remove such cases when a method lacks contextual understanding.

## Challenge inventory

| Case | Intended diagnostic |
|---|---|
| arrival-route | Two-hop binding from a case through supplied terms to a generic route-owner record |
| purchase-controls | Two requested exact facts on a second-hop control page |
| disconnected-renewal | Applicable approved lexical evidence without an explicit graph edge |
| auxiliary-chain | Direct supported claim with a longer irrelevant audit neighborhood; conservative traversal can honestly abstain |
| contextual-decoy | Same required key on an approved training page scoped to another fictional case |
| glossary-seed | Stronger lexical glossary seed without a useful reference, alongside a supported record |
| incoming-cycle | Incoming evidence link and cycle without duplicate factual support |
| conflicting-current | Two admissible current-looking values with no supplied resolution rule |
| unapproved-only | Sole requested value appears in an unapproved draft |
| missing-owner | Approved context contains no required assignment |
| no-lexical-seed | Correct underlying fact has no term match to the fixed query |
| zero-hop-hold | No claim on the only lexical index and zero permitted graph hops/one flat read |
| citation-budget-hold | Complete citation cannot fit an explicit 256-byte policy |
| agreeing-records | Same exact scoped value on two relevant approved pages |
| split-disconnected | Two required supported facts on disconnected lexical records |
| unapproved-conflict | An unapproved conflicting draft cannot replace or poison direct approved support |

## Scope still open

This challenge supplies evidence for a bounded comparison only. Independent human label review, external unseen corpora, real extraction, semantic/vector retrieval, a trained reranker, model-driven tool selection, source authorization and representative domain outcome evaluation remain open. Claim matching here does not establish actual customs, legal, medical, insurance or other professional acceptance. Do not claim statistical significance, an F1 gain, production accuracy, general retrieval superiority or reduced tokens from these fixtures. Publish observed failures, method definitions, source/data hashes, limitations and the exact reproduction command with any resulting report.
