# AtlasGraph: local structured evidence traversal

This executable slice compiles supplied, reviewed JSON into a durable SQLite knowledge graph. It searches approved pages, reads exact source text, follows references in both directions and collects evidence across a bounded graph. The included shipment scenario needs two links to reach the approval policy. Its documents and business rules are synthetic examples.

This is an implementation of a **bounded part** of the [AtlasGraph blueprint](../47%20Automation%20Blueprints/2026%20Research-to-Production/01-atlasgraph.md). PDF/email extraction, model-selected tool calls, semantic/vector retrieval, distributed ingestion, PostgreSQL, production authorization and measured comparisons against retrieval baselines remain pending. A passing local fixture does not establish production accuracy or reproduce the paper's results.

## Run

Requires Node.js 24 or later with `node:sqlite` available. No provider key, remote API or paid service is used.

```powershell
cd demo-lab
node --test atlasgraph.test.mjs
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {openAtlasGraph} from './atlasgraph-core.mjs'; const f=JSON.parse(readFileSync('atlasgraph-example.json','utf8')); const g=openAtlasGraph(); try { console.log(g.compile(f.compile)); console.log(JSON.stringify(g.answer(f.answer),null,2)); } finally { g.close(); }"
```

Use `openAtlasGraph('path/to/graph.sqlite')` for persistence, or `atlasGraph(existingDatabaseSync)` when a host owns the SQLite connection. The latter does not close the supplied database. The server/UI integration supplies a fixed database path; request bodies never choose database paths.

## Input and tools

`atlasgraph-example.json` contains `{compile, answer}` payloads. Compilation replaces the tenant's current **whole snapshot**; it is not an incremental patch. Omitted sources leave the current graph while immutable historical versions remain stored. Recompiling an older snapshot deliberately restores that older current state; there is no monotonic version ordering rule.

Each source has `id`, `version`, `title`, boolean `approved` and `pages`. A page has `id`, `title`, `text`, optional `claims: [{key,value}]` and optional `references: [{to,relation,quote}]`. Claim values must occur exactly in that page's text. A reference quote must occur exactly in its source text and name the target page ID. Both endpoints must exist in the same snapshot and belong to approved sources. The compiler derives links only from these explicit references; it does not infer relations. These checks establish provenance and structure, **not the truth or semantic correctness of a human-supplied claim/relation**.

The service exposes:

- `compile(payload)`: validates the whole snapshot, checks immutable source versions and activates it atomically.
- `search({tenant,query,limit?})`: bounded lexical term search, returning scored exact text excerpts.
- `read({tenant,id})`: an approved page with its immutable source version/hash.
- `follow({tenant,id})`: both incoming and outgoing explicit references, including exact supporting quotes.
- `answer({tenant,question,startId,requiredClaims,maxHops?,evidenceBudgetBytes?,requestId?})`: breadth-first traversal from a supplied start page. It checks all pages in the bounded reachable neighborhood before returning exact required claim values and source texts. The free-text question is a ledger label; callers explicitly select the required claim keys. There is no natural-language understanding or generated decision.
- `receipt({tenant,id})` and `history({tenant})`: replayable evidence receipts, with the original traversal and exact source texts, plus a current `stale` flag.
- `errors({tenant})`, `recordError({tenant,receiptId?,message,correction?})` and `reviewError({tenant,id,status,note})`: persistent manual correction queue. Review status is `accepted` or `rejected`; accepting a proposal does not edit sources. Apply a reviewed correction using a new source version and compile again.

Tenant values are **unauthenticated local labels** that isolate queries in this store. They are not identity verification or an authorization boundary against someone who can choose another tenant label. `approved` is likewise caller-supplied local review state. The service must not be exposed as a production multi-tenant API without real authentication and approval controls.

## Evidence and failure behavior

A successful answer returns exact `claims`, complete visited-page text `citations`, and a `trace` of traversal steps with supporting references. Citations include the source ID, immutable version and SHA-256 source-content hash. A source's metadata, approval, pages, claims and references all contribute to that hash. Reusing a source ID/version with changed content is rejected and the current graph remains untouched.

The evidence budget is **UTF-8 bytes of the JSON-encoded citations array**, measured with `Buffer.byteLength`. It does not measure tokens, the entire HTTP response, traversal metadata or model context. The default is 12,000 bytes; the maximum is 24,000 bytes. This does not claim compliance with the blueprint's 8,000-token requirement. `requiredEvidenceBytes` records the attempted evidence size. On overflow, no citation text or answer claims are returned; `evidenceBytes` measures the empty citations array (`2` bytes).

Missing required claims, conflicting exact values for the same required key, a missing start page, incomplete traversal at the hop limit, or evidence overflow cause `status: "abstained"`, a reason and a pending Error Book record. The traversal is deliberately conservative: even if the selected claims were found, an unvisited neighbor beyond the hop limit causes abstention. Conflicts are detected only among the selected required keys in the reachable approved graph; this is not a general contradiction detector.

`requestId` replays the original exact query; reusing it for a different normalized request is rejected. After any current graph change, an old receipt is marked stale rather than recomputed. Repeating the same request ID returns that original stale evidence. Use a new ID to evaluate current sources. Reverting to the identical old snapshot makes its receipts current again. SHA-256 identifies content; these are not signed, tamper-proof audit records against a database administrator.

Limits are 12 sources, 32 pages per snapshot, 8,000 characters per page, 12 claims and six references per page, six hops, eight required claim keys and 240,000 UTF-8 input bytes. Search accepts up to 200 characters and returns at most 20 matches. History and the Error Book return the most recent 50 records each; storage retention/pagination are not implemented. Payloads reject unknown fields, malformed IDs, duplicate records and prototype-related keys. All statements bind values rather than interpolate user input.

## Checked behavior

The local test suite executes the supplied two-hop scenario and verifies exact citations/budget measurement, bidirectional traversal, cycles, hop limits, missing evidence, contradictory claims, quote/target validation, unapproved-page exclusion, tenant query separation, source-version conflicts with transactional rollback, exact replay, stale receipts after revision, malformed/oversized input and real file-backed SQLite restart of sources, receipts and manual correction review.

The next blueprint work is authenticated source review, real source adapters, semantic retrieval/tool planning and an independently labeled multi-hop evaluation against explicit baselines. No production comparison, F1 improvement, token saving, live customs acceptance or autonomous source correction is claimed here.


## Separately authored local evaluation

Open `/research-evaluation?project=AtlasGraph` or follow the [evaluation runbook](ATLASGRAPH-EVALUATION.md). A separately authored synthetic challenge set and labels now compare this existing graph engine with an explicit flat lexical baseline. Both start from the same approved corpus and lexical query; no expected answer or gold start page is passed to retrieval. The experiment still supplies required claim keys, source approval and authored links. It does not implement semantic question parsing or establish source truth.

Per-case decisions, exact values, selected pages, traversal, byte budgets and disagreements stay visible. Failed cases remain part of the report. A separate AI fixture author froze the labels before reading evaluator output; that is not external human labeling, a blind benchmark or training evidence. Read the method and denominators before comparing aggregate results. The full research blueprint and independent external/model/provider acceptance remain unfinished.
