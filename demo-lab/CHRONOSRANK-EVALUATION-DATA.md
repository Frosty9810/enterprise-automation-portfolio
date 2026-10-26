# ChronosRank independent synthetic evaluation data

This is a 16-case **AI-authored synthetic temporal-memory diagnostic challenge**, designed by a specialist separate from the evaluator implementation. All organizations, teams, source records, assignments and operational questions are fictional. It is not human-reviewed ground truth, an external held-out dataset, a trained-reranker benchmark, a reproduction of a paper or evidence of production accuracy. No private/client documents, live providers or paid services are used.

The [event corpus](chronosrank-evaluation-corpus.json) and [labels](chronosrank-evaluation-labels.json) were authored from the existing [ChronosRank input and temporal contract](CHRONOSRANK.md). The author inspected append validation, supplied-time eligibility and lexical tie behavior. **No new evaluator, baseline or retrieval output was run or read before freezing these files.** Validation uses actual event append/audit, the original query-schema validator in a disposable copy and a separate direct calculation of temporal exclusion annotations. It does not predict or certify either method's retrieval quality. Exact frozen hashes belong in the delivery evidence.

## Comparison protocol

Each case starts with a fresh database and supplies a complete fictional event timeline plus one query. The query has exactly `tenant`, `entity`, `query`, `asOf`, `threshold` and `limit`; the evaluator owns any retrieval request ID. All event commands use the real append schemas, immutable memory IDs and chronologically valid per-tenant knowledge watermarks. A source quote contains its supplied memory text verbatim.

Both compared methods must respect the requested tenant/entity and the knowledge cut: `recordedAt <= asOf`. The temporally blind lexical baseline is deliberately **not** allowed to see unrecorded future knowledge or another tenant's records. It ignores `validFrom`, configured expiry, explicit expiration and supersession, then uses the same NFKC token-overlap score, threshold, limit and distinct-top-text tie abstention as the existing method. The actual ChronosRank implementation additionally applies its documented temporal rules. A historical query can be earlier than later events in the supplied complete timeline; a later effect must not be leaked backward.

The lexical score is an integer fraction of matching query tokens, not probability, calibrated confidence, BM25, vector similarity or model reasoning. Neither method understands negation, causality or the semantic scope of a copied example merely because it passes time and token checks. Those limitations are intentionally represented rather than omitted. Neither method is required to win every case.

## Intent and evidence labels

There are eight `retrieved` intents and eight `abstained` intents. These are the author's intended useful-response judgments, not expected predictions of the algorithm.

- `goldMemoryIds` names temporally admissible records for the requested tenant/entity that are useful for the supplied question. For a retrieved intent, any nonempty returned subset containing only gold IDs counts as matching intent; returning an unrelated record alongside a useful one still fails that case. Returning every equivalent corroborating record is not required. Evidence recall can therefore be less than one even when the returned subset matches intent.
- `forbiddenTemporalMemoryIds` names **every** memory for the requested tenant/entity that is not temporally admissible at `asOf`: unrecorded future knowledge, future validity, configured expiry at or before the query, effective explicit expiration, or an effective direct successor. The predecessor remains superseded even after that successor expires. These are temporal annotations only; a currently valid but semantically irrelevant record is not marked temporally forbidden.
- An abstention intent has no gold IDs. That can mean missing evidence, a temporal hold, an unresolved tie or semantically conditional/negated prose. The rationale distinguishes these reasons. A stronger irrelevant token match is not relabeled as useful just because an engine selects it.

Gold and forbidden sets do not overlap. IDs must exist in the same case and requested tenant/entity; scope outsiders are deliberately absent from both sets. Precision/recall describe ID-set overlap with these authored relevance judgments, not semantic truth or permission to act on a real operational record. Duplicate IDs cannot inflate a denominator. Temporal-error measures should count only emitted forbidden memories, clearly separating examined/excluded history from returned recall.

## Challenge inventory

| Case | Intended diagnostic |
|---|---|
| `scheduled-before-boundary` | A known replacement is not valid yet; the predecessor is still current immediately before the boundary |
| `scheduled-at-boundary` | The replacement applies at exact `validFrom` equality despite weaker lexical overlap |
| `successor-expired-no-revival` | An expired successor leaves the predecessor superseded rather than reviving it |
| `explicit-expiry-equality` | An explicit expiration excludes its target at equality |
| `configured-before-expiry` | The configured record remains admissible one millisecond before exclusive expiry |
| `configured-at-expiry` | Configured expiry excludes at equality |
| `known-future-valid` | A recorded record with future validity cannot be recalled as current |
| `future-knowledge-history` | Both methods exclude knowledge not recorded at a historical query instant |
| `historical-before-explicit-expiry` | An expiration recorded later does not invalidate an earlier historical query |
| `tenant-entity-isolation` | Vocabulary matches from another entity/tenant remain scope outsiders |
| `unicode-equivalent-agreement` | NFKC/case-equivalent texts are corroboration, with either gold subset useful |
| `distinct-top-score-tie` | Distinct current-looking equal-score assignments require a hold without supplied precedence |
| `genuine-no-lexical-match` | A current but unrelated record cannot justify the requested assignment |
| `contextual-lexical-distractor` | A copied exercise can have stronger overlap than the applicable fictional case assignment |
| `unequal-score-causal-ambiguity` | Negated and conditional prose lacks an unconditional approved assignment even without a top-score tie |
| `chain-no-revival` | Expiry of a third generation leaves both predecessors superseded and the successor expired |

The contextual and causal cases intentionally allow honest failures of time-aware lexical retrieval. They must not be removed, rewritten or reclassified after inspecting scores. If a real authoring defect is found, document the reason and issue an explicit dataset version/correction with fresh evidence rather than silently improving the measured method's result.

## Freeze validation and open scope

All 30 supplied events across 16 isolated cases passed actual append and audit. All 16 queries passed the original strict query validator exported only inside a disposable copy; validation did not invoke `retrieve`. A separate direct check confirmed all temporal forbidden sets, gold scope/eligibility, exact schemas, unique case/label IDs, source provenance and per-case joins. The external authoring validation records 207 assertions. These checks establish structural consistency with the supplied contract, not empirical retrieval performance.

An independent human review of relevance and causal intent, external unseen timelines, authenticated source/time provenance, real retention policy, model/reranker/vector comparisons, calibrated confidence, representative performance/cost measurements and provider acceptance remain open. Caller-selected tenant labels and timestamps do not constitute authenticated privacy or a trusted clock. No claim about real executive, medical, legal, insurance or other professional decisions follows from these fictional assignments.
