# ChronosRank synthetic temporal comparison

This is a bounded local diagnostic for the unfinished [ChronosRank research blueprint](../47%20Automation%20Blueprints/2026%20Research-to-Production/02-chronosrank.md). A separate AI specialist authors the [event corpus](chronosrank-evaluation-corpus.json), [query-intent labels](chronosrank-evaluation-labels.json) and [data guide](CHRONOSRANK-EVALUATION-DATA.md) before seeing the evaluator's results. These are fictional operational memories and synthetic judgments, not human-reviewed truth, a blind external benchmark or training evidence.

Open `/memory-evaluation?project=ChronosRank` from the [memory workbench](CHRONOSRANK.md). Loading the page reads metadata only. An explicit run appends each case's supplied events to a fresh in-memory SQLite ledger and compares actual ChronosRank retrieval with a recorded-visible but temporally blind lexical baseline. It does not write the normal workbench memory histories, call a model or contact a provider.

## Reproduce

From the repository root with Node.js 24 and existing demo-lab dependencies:

```powershell
node demo-lab/run-chronosrank-evaluation.mjs
node --test demo-lab/chronosrank-evaluation.test.mjs demo-lab/chronosrank-evaluation-ui.test.mjs demo-lab/chronosrank-evaluation-http.test.mjs
node demo-lab/server.mjs
```

The full repository gates are `python scripts/check_quality.py` and `npm --prefix demo-lab run govern`. Record their actual outputs separately; these commands are not a claim that unrun checks passed. No API key or paid model is required.

## Controlled comparison

Both methods use the same query, requested tenant/entity, supplied as-of instant, integer lexical threshold, output limit and event stream. Both hide memories recorded after the query time and records belonging to other tenants/entities. Tenant labels and timestamps are supplied local inputs, not authenticated identity or trusted wall time.

- **ChronosRank:** the existing ledger filters future-valid, expired and superseded memories before lexical ranking, including exclusive expiration and no predecessor revival after successor expiry. The evaluator calls its real append/retrieve/history/audit APIs without changing the engine.
- **Temporally blind lexical:** the baseline reads actual ledger history and respects recorded knowledge, tenant and entity. It deliberately ignores validFrom, configured expiry, supersession and explicit expiration events. It is a transparent control policy, not a recommended deployment or a claim about BM25, dense retrieval or another trained system.

Both normalize with Unicode NFKC, use distinct letter/number tokens, score `floor(100 * matching query tokens / query tokens)`, apply the same threshold and lexical-ID tie order, and abstain when distinct normalized texts tie at the highest qualifying score. These are lexical percentages, not calibrated confidence. ChronosRank can still retrieve the wrong context or abstain on a useful fact when lexical relevance is misleading; those failures remain visible.

The complete case timeline is shown beside the query. Receipt/audit heads and counts refer to the query tenant; the supplied timeline can also contain other tenants to test isolation. Exact selected text and source quotes remain inspectable. Events are ingested in their valid per-tenant recorded order before the query; historical as-of filtering is performed by the actual engine. No natural-language fact extraction, causal reasoning model or generated answer runs.

## Label and metric meaning

Each label names the expected retrieved/abstained decision, useful memory IDs, temporally forbidden IDs and rationale. Gold memories must belong to the requested tenant/entity. For a retrieved intent, any nonempty selected subset made entirely of gold memories counts as applicable-only context recall. Recovering every gold memory is not required for that case metric; recall separately exposes missed relevant records. Selecting an irrelevant record counts as wrong recall even when another selected record is useful. An abstention intent has no gold memories.

Temporal-forbidden labels enumerate the requested tenant/entity memories that the author judged ineligible at the supplied time. The report counts selected IDs overlapping that label set, both as memories and affected cases. This measures the authored annotations; zero overlaps on this small set is not a general expiry, safety or authorization guarantee. Semantically irrelevant but temporally valid memories count as wrong recall, separately from temporal-forbidden recall.

Case agreement, decision agreement, applicable-only recall among retrieved intents, false recall on abstention intents, false abstention and wrong/forbidden selection counts all retain their denominators. Correct empty abstentions are not presented as useful retrieved answers. Micro context precision/recall sum useful, selected and gold ID counts across cases; zero denominators are null/n/a, not perfect scores. The report exposes every case and all disagreement filters.

## Reproducibility and export

The report records implementation, corpus, label, policy and stable report hashes. Source identity includes the existing core and its imported fixture module as well as the evaluator and challenge files. The stable report identity excludes measurement time and avoids random request identities. The runner checks relevant bytes before and after work; changed loaded code/data requires restart and a new run.

The UI validates report content and relationships, compares current/loaded identities and rechecks the catalog before export. Pending or failed identity reads clear current proof displays; changed source or failed run clears export authority. A downloaded file cannot be recalled. Hashes are local byte identities, not external signatures, human acceptance or a security boundary against a privileged operator.

## API and scope still open

GET `/api/memory-evaluation/catalog` exposes the one fixed suite. POST `/api/memory-evaluation/run` accepts exactly `{"suiteId":"chronosrank-independent-v1"}` under existing numeric-loopback Host/Origin and intent/body limits. Arbitrary corpora, labels, timestamps, file/database paths, provider settings and credentials are not caller inputs. All data remains public synthetic fixtures; no private correspondence or real personal data is accessed.

The original research plan remains partial: memory extraction, vector retrieval, trained reranker/distillation, calibrated abstention, external human-reviewed datasets, model comparisons, concurrent p95 measurement, authenticated provenance and live provider acceptance are not implemented by this diagnostic. Publish unfavorable outcomes with the method and labels; do not silently tune a fixture to improve a score or claim production accuracy from it.


## Observed local diagnostic outcome

The frozen corpus `8320366d78b7f5bd7caa31a856bae656eed8b6fb4be75d9dee4f3e858d628131` and labels `6394e9bbbcbde6b0a9f060119f9c5a2f344ba058bd70c042d5fd22acde2e98ef` contain 16 cases: eight retrieved intents and eight abstention intents. The initial explicit local run measured these counts. They describe this authored diagnostic set, not production quality or an external model comparison.

| Measure | ChronosRank | Temporal-blind lexical |
|---|---:|---:|
| Case intent agreement, including abstentions | 14 / 16 | 8 / 16 |
| Retrieved/abstained decision agreement | 15 / 16 | 10 / 16 |
| Applicable-only recall among retrieved intents | 7 / 8 | 6 / 8 |
| Recall on an abstention intent | 1 / 8 | 6 / 8 |
| False abstention on a retrieved intent | 0 / 8 | 0 / 8 |
| Non-gold selected memories / affected cases | 2 / 2 | 8 / 8 |
| Labeled temporally forbidden selections / affected cases | 0 / 0 | 6 / 6 |
| Useful selected IDs / all selected IDs | 8 / 10 | 7 / 15 |
| Useful selected IDs / gold IDs | 8 / 9 | 7 / 9 |

ChronosRank's two mismatches are retained: a stronger lexical distractor refers to a different exercise, and an unequal-score pair contains negated/conditional permission rather than an unconditional assignment. The existing engine does not understand those semantic distinctions. A temporal-filtering result must not be presented as causal reasoning, professional approval or permission to act. The baseline's forbidden selections demonstrate the cost of its deliberately omitted temporal rules on these supplied cases, not a finding about another production retrieval system.

Correct empty abstentions are included in case/decision agreement but excluded from applicable-only recall among retrieved intents. Returning an irrelevant memory alongside a relevant one still fails the applicable-only metric; useful-ID recall separately shows missed relevant context. Record the actual implementation and stable report hashes with quoted results, and preserve every disagreement instead of tuning this frozen challenge.
