# AtlasGraph synthetic policy comparison

This is a reproducible local diagnostic for the unfinished [AtlasGraph research blueprint](../47%20Automation%20Blueprints/2026%20Research-to-Production/01-atlasgraph.md). A separate AI fixture author supplies the [corpus](atlasgraph-evaluation-corpus.json) and [labels](atlasgraph-evaluation-labels.json), with rationale and [authorship notes](ATLASGRAPH-EVALUATION-DATA.md). The fixture author freezes them before seeing evaluator results. They are synthetic challenge cases, not an external held-out dataset, a human-reviewed benchmark, training evidence or a claim about production retrieval quality.

Open `/research-evaluation?project=AtlasGraph` from the [existing workbench](ATLASGRAPH.md). Loading the page does not run an experiment. The explicit run recomputes both methods in fresh in-memory SQLite databases and shows every observed failure. It does not change saved workbench sources or receipts, call a provider, parse a question with a model or access private documents.

## Reproduce

From the repository root using Node.js 24 and the existing demo-lab dependencies:

```powershell
node demo-lab/run-atlasgraph-evaluation.mjs
node --test demo-lab/atlasgraph-evaluation.test.mjs demo-lab/atlasgraph-evaluation-ui.test.mjs demo-lab/atlasgraph-evaluation-http.test.mjs
node demo-lab/server.mjs
```

The full repository checks are `python scripts/check_quality.py` and `npm --prefix demo-lab run govern`. Record the actual output and exact source identities when they run; the existence of this runbook does not claim unrun tests or external acceptance. No API key or paid model is required.

## Two explicit policies

Both policies use the same supplied approved sources, query, required claim keys and per-case UTF-8 evidence budget. The expected labels do not choose a start page or feed retrieval. Approval, required keys and graph links remain supplied structured inputs: neither method infers them from natural language.

- **Graph:** existing AtlasGraph lexical search chooses its top-ranked page. The existing graph engine follows incoming and outgoing authored references up to the case's hop bound. It inspects the entire reachable neighborhood before deciding. Missing keys, conflicting exact values, an incomplete neighborhood or excess evidence bytes hold the result.
- **Flat lexical:** the same existing lexical search selects the case's top K approved pages. The baseline reads those pages without following links, and checks their required keys, conflicting exact values and evidence bytes. It cannot certify that unselected pages contain no contradiction. That limitation can produce a false supported answer and remains visible in the report.

Search ranks and ties use the existing engine. Normal cases use two graph hops, three flat pages and a 12,000-byte budget; explicit boundary cases document other settings. The algorithms can inspect different numbers of pages. This is not a matched-latency, matched-token or equal-compute experiment. Supplied links give the graph information the flat policy does not use; top K can find a disconnected relevant page the graph misses. Neither method is required to win.

Evidence bytes are `Buffer.byteLength(JSON.stringify(citations), 'utf8')` using page ID, source ID, source version/hash and exact page text. The budget excludes search/index scans, claim/traversal metadata and the whole HTTP response. It is not a model token cost or the blueprint's token-budget acceptance. On abstention, attempted bytes and the empty returned array are reported separately.

## Scores and honest denominators

Each label names the intended decision, exact required values, relevant evidence page IDs and rationale. Decisions and values are scored separately. A case is correct only when its decision and, for a supported answer, its exact key/value map match. A supported answer with wrong values remains a wrong answer even if the decision category matches. False support, false abstention and wrong answers are retained alongside the totals.

Evidence precision/recall measure page-ID set overlap against these authored evidence labels. They do not establish citation truth, semantic entailment or general retrieval quality. The report exposes the intersection, returned and gold counts; a zero denominator is `null`, not a fabricated perfect score. Context/path pages are labeled according to the fixture author's stated rule. Unapproved pages are excluded by the actual engine.

Aggregate counts include every case. The UI also exposes each policy's selected pages, exact claims, attempted/returned bytes, path or rank, expected intent and failure. A reported policy failure does not mean the experiment runner failed: keeping disagreement visible is the purpose. Labels must not be changed after looking at results just to improve a score; any genuine correction needs a new documented dataset version and rationale.

## Evidence identity and export

The report records implementation, corpus, label and policy hashes. Its stable report hash excludes the measurement timestamp and avoids random AtlasGraph receipt IDs/timestamps. Repeated runs against the same files should reproduce the same content identity. These hashes identify local bytes; they are not signatures or proof of independent human approval.

The process checks loaded source identity before and after evaluation. If relevant files change, restart and run again. The catalog exposes current identity/staleness; the UI clears old authority on a failed/stale run and checks the catalog again before export. Export contains supplied synthetic evidence and measured local outcomes only. A downloaded report cannot be recalled or converted into evidence for a changed implementation.

## API and remaining work

GET `/api/research-evaluation/catalog` returns the one allowed suite and its source identities. POST `/api/research-evaluation/run` accepts exactly `{"suiteId":"atlasgraph-independent-v1"}` under the lab's normal Host/Origin and intent-header boundary. Arbitrary corpora, labels, files, database paths, provider names and model credentials are not input fields. Actor authentication is not implemented; keep the lab on numeric loopback.

The full blueprint stays partial. External reviewed datasets, semantic/vector baselines, model-selected tools, real source adapters, calibrated answer quality, authenticated source review, production cost/latency and provider acceptance remain open. This slice supplies inspectable local comparison mechanics and separately authored diagnostic labels without claiming those wider results.


## Observed local diagnostic outcome

On the frozen 16-case corpus `33fcf73b100ba4b3d7039313df43dbb7af205a430c3eca93ca437652c1ab48c3` and labels `34ef2f604b4d4dd56c406005fb1c73d5fa146bf330c27e758a6603f99456db42`, the explicit local run produced these counts. There are ten supported intents and six abstention intents. These are observations on this authored set, not population estimates or evidence of general superiority.

| Measure | Graph expansion | Flat lexical |
|---|---:|---:|
| Exact case agreement, including abstention intents | 12 / 16 | 13 / 16 |
| Exact supported answers among supported intents | 6 / 10 | 7 / 10 |
| False abstentions | 4 | 3 |
| False supported answers / wrong supported values | 0 / 0 | 0 / 0 |
| Relevant returned page IDs / all returned page IDs | 13 / 14 | 10 / 17 |
| Relevant returned page IDs / gold page IDs | 13 / 18 | 10 / 18 |
| Total returned citation-array UTF-8 bytes | 3,330 | 4,166 |
| Total attempted citation-array UTF-8 bytes | 9,166 | 10,746 |

The flat method has higher case agreement on this particular challenge. Graph traversal succeeds on the two multi-hop cases that flat retrieval misses. It abstains on the disconnected renewal, glossary-seed and split-disconnected cases, and its conservative hop-completeness guard holds the auxiliary-chain case. Flat retrieval also abstains on the contextual decoy because its selected records carry conflicting exact keys. These disagreements and their rationale remain inspectable; neither labels nor policies were adjusted to turn failures into passes.

Re-run the CLI and record its implementation/report hashes with any quoted result. Exact supported-answer counts exclude empty abstention maps; the report also exposes a separate exact-claim-map count that includes empty abstentions. Empty citation arrays use two JSON bytes, so totals include abstention overhead. No time, token saving, F1 improvement or business outcome was measured.
