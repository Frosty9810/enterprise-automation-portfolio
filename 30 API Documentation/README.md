# Local lab API reference

> Status: **Populated — implemented loopback API; no public service or provider authentication.**

Base URL: `http://127.0.0.1:5680`. The [server implementation](../demo-lab/server.mjs) is authoritative. Start it using the [local runbook](../38%20Deployment/README.md). All examples use synthetic data.

## Request boundary

- Every request needs Host `127.0.0.1:<actual-listening-port>`; `localhost`, another hostname or a wrong port is rejected with 403.
- A supplied Origin must equal the same numeric-loopback HTTP origin. Foreign/null Origin and `Sec-Fetch-Site: cross-site` are rejected with 403 for reads and writes. Origin may be absent for local CLI clients.
- POST requires `X-Demo-Client: local-showcase`. This is an intent marker, not a secret or authenticated identity.
- Send JSON for POST. The reader accepts an empty body as `{}`, parses JSON and rejects payloads above 32,768 bytes. Parsing/size errors return 400. The server does not enforce a JSON Content-Type.
- Non-GET/non-POST methods return 405 after the Host/Origin boundary. Invalid or authority-changing request targets return 400.

The service has no user login, tenant authorization layer or public webhook authentication. Other local processes can supply these headers. Do not expose it beyond loopback or submit private evidence. Verify the boundary with [HTTP adverse-case tests](../demo-lab/http-boundary.test.mjs).

## Read routes

All routes below use GET. Normal JSON responses use `Cache-Control: no-store`.

| Route | Result |
|---|---|
| `/health` | `{status: "ok", mode: "local-demo"}` |
| `/api/projects` | Automation catalog, engine label, simulator mode and workflow busy flag |
| `/api/project-inventory` | Unified array of collection entries with ID, status, scope and destination link |
| `/api/research/catalog` | Five research tracks; AtlasGraph, TrustGate, ChronosRank and DocksideSLM are partial local builds; VeilRAG is blueprint-only |
| `/api/trustgate/catalog` | Closed tool schemas, server-held synthetic sources, actor grants and runnable proposal scenarios |
| `/api/chronosrank/catalog` | Local memory scope, synthetic event stream and retrieval example |
| `/api/dockside/catalog` | Supplied-extraction schemas, local reviewer labels and synthetic document scenarios |
| `/api/research/example` | Bundled AtlasGraph input object containing `compile` and `answer` examples |
| `/api/research/blueprint?project=<name>` | Allowlisted blueprint text for AtlasGraph, ChronosRank, TrustGate, DocksideSLM or VeilRAG; unknown name gives 404 |
| `/api/showcase/:id` | Project presentation/profile; unknown ID gives 404 |
| `/api/artifacts/:id/:key` | Allowlisted attachment download; unknown artifact gives 404 |
| `/api/activity` | Current workflow activity and busy state |
| `/api/contacts` | Stored local simulator contacts |
| `/api/runs` | Most recent 100 runs, latest run per project and history limit |
| `/api/workshop/projects` | Automation passports and current source snapshots |
| `/api/flagships/catalog` | Twelve-system catalog, listed source manifests and evaluation history |
| `/api/flagships/example/:id` | Current synthetic fixture; unknown/stale source gives 400 |
| `/api/flagships/source/:id/:index` | Allowlisted source text, zero-based artifact index; invalid selection gives 404 |
| `/api/salesforce/config` | Allowed local scenarios and explicit scope |
| `/api/salesforce/state?run=<runId>` | One local Salesforce-shaped run; invalid run gives 400 |
| `/api/product/example` | Product policy's synthetic input |
| `/api/product/audit` | Local product review history and unauthenticated-label scope |
| `/api/governance` | Current automated governor evidence, including stale-source status |
| `/build-review.json` | Recorded review JSON; unavailable report gives 404 |

The server separately serves the root studio, `/projects` (unified inventory), `/research` (AtlasGraph workbench and research status), `/flagships`, `/salesforce`, `/workshop`, `/engineering`, `/product-governance` and allowlisted static assets. `/research?project=<name>` selects a named track. This table documents the data API; arbitrary repository files are not downloadable routes.

## Mutation routes

All routes below use POST and the intent header. Fields name the server's dispatch contract; use the linked controller and example routes for complete domain validation.

| Route(s) | JSON body / local behavior |
|---|---|
| `/api/flagships/evaluate` | `toolId`, `input`; save analysis receipt for F01–F12 |
| `/api/flagships/run-all` | `{}`; execute authored acceptance across twelve systems |
| `/api/flagships/review` | `receiptId`, `actor`; acknowledge current analysis |
| `/api/flagships/export` | `receiptId`; require current source and prior acknowledgement |
| `/api/workshop/submit` | `projectId`, `event`; validate and save minimized handoff |
| `/api/workshop/review` | `receiptId`, `reviewer`; local label acknowledgement |
| `/api/workshop/execute` | `receiptId`, `outcome`; simulated success, `timeout_before` or `timeout_after` |
| `/api/workshop/reconcile`, `/api/workshop/export` | `receiptId`; reconcile uncertainty / export confirmed local completion |
| `/api/salesforce/start` | `scenario`; normal, consent_hold, field_denied or stale_event |
| `/api/salesforce/full-run` | `{}`; scripted full local demonstration |
| `/api/salesforce/evaluate` | `runId` and supplied `event`, or `recordId` to generate a synthetic event |
| `/api/salesforce/review` | `receiptId`, `profile`; only the simulated revops-reviewer profile can approve |
| `/api/salesforce/execute` | `receiptId`, `outcome`; bounded local effect simulation |
| `/api/salesforce/reconcile`, `/api/salesforce/export` | `receiptId`; recovery / evidence export |
| `/api/salesforce/change` | `runId`, `recordId`; simulate an intervening record change |
| `/api/product/evaluate` | Full input from `/api/product/example`; original Python policy and durable draft receipt |
| `/api/product/review` | `receiptId`, `reviewer`; source/revision-bound acknowledgement |
| `/api/product/export` | `receiptId`; current reviewed draft only |
| `/api/domain/:id` | `{}`; execute one synthetic domain demo |
| `/api/run/:id` | `{}`; run local n8n wrapper and store result/timeline |
| `/contacts/upsert` | Narrow contact simulator contract below |

Controllers: [flagship receipts](../demo-lab/flagship-suite.mjs), [recovery](../demo-lab/reliability.mjs), [Salesforce-shaped adapter](../demo-lab/salesforce-core.mjs), [product policy adapter](../demo-lab/product-governance.mjs). A 200 may represent a business hold/rejection; inspect the returned decision/status. Review labels and simulated permission profiles grant no real operational authority.

## AtlasGraph research operations

These POST routes use the same Host/Origin, intent-header and 32,768-byte HTTP body boundary. They dispatch to the [AtlasGraph controller](../demo-lab/atlasgraph-core.mjs). TrustGate has a separate gateway described below; ChronosRank has its own memory API; DocksideSLM has a document queue API; VeilRAG has no runnable API. The [example JSON](../demo-lab/atlasgraph-example.json) supplies complete compile/answer payloads. Compile its `compile` object first, then submit its `answer` object.

| Route | JSON fields and result |
|---|---|
| `/api/research/compile` | `tenant`, `sources`; each source has `id`, `version`, `title`, `approved`, `pages`. Each page requires `id`, `title`, `text`; optional `claims: [{key,value}]` and `references: [{to,relation,quote}]`. Returns compiled snapshot hash and counts |
| `/api/research/search` | `tenant`, `query`, optional `limit` (default 10, range 1–20); lexical matching over approved page IDs/titles/text |
| `/api/research/read` | `tenant`, `id` (page ID); return one approved page and snapshot identity |
| `/api/research/follow` | `tenant`, `id` (page ID); return incoming/outgoing authored links and their supporting quote |
| `/api/research/answer` | `tenant`, `question`, `startId`, `requiredClaims`; optional `maxHops` (default 2, range 0–6), `evidenceBudgetBytes` (default 12,000, range 256–24,000), `requestId`; persist supported/abstained evidence receipt |
| `/api/research/history` | `tenant`; most recent 50 receipts, including current `stale` flags |
| `/api/research/errors` | `tenant`; most recent 50 Error Book entries |
| `/api/research/receipt` | `tenant`, `id` (receipt ID); retrieve original evidence with current staleness/replay flags |
| `/api/research/record-error` | `tenant`, `message`; optional `receiptId`, `correction`; create a pending manual error record |
| `/api/research/review-error` | `tenant`, `id` (pending error ID), `status` (`accepted` or `rejected`), `note`; record review with `sourceChanged: false` |

Tenant labels and approval flags are supplied data, not authenticated permissions. Compilation checks unique identities, immutable source versions, exact claim substrings and reference quotes naming existing approved target pages. It accepts up to 12 sources and 32 pages total. A changed source version/content produces a different snapshot; old receipts remain inspectable with `stale: true`. Exact query replay retains its original evidence; use a fresh request ID to collect current evidence after source changes. Reusing an ID for a different query fails.

The `answer` operation collects deterministic graph evidence for explicit claim keys. It returns `supported` or abstains for missing start/evidence, contradictory claims, hop limit or evidence-byte budget; it does not generate or semantically verify an answer. The budget measures serialized UTF-8 citation bytes, not model tokens. Abstention creates a pending Error Book entry. Accepting a correction does not edit sources; compile a reviewed new source revision separately. Controller validation errors, absent tenant/page/receipt and identity conflicts are returned by this HTTP adapter as **400 `{error}`**, rather than exposing the controller's internal error codes as HTTP statuses. An unknown research POST operation returns 404. See [core adverse tests](../demo-lab/atlasgraph.test.mjs) and [UI interaction tests](../demo-lab/research-ui.test.mjs).

## DocksideSLM local document queue

Open `/dockside` for the [document queue](../demo-lab/DOCKSIDE.md). GET `/api/dockside/catalog` supplies executable synthetic `scenarios[].input`. POST one input to `/api/dockside/submit`; invalid extraction is retained as a rejected receipt and cannot reach the receiver. These routes share the Host/Origin, intent-header and 32,768-byte body boundary. Controller errors return 400 `{error}`; unknown operations return 404.

| POST route suffix under `/api/dockside/` | Input |
|---|---|
| `submit` | `{commandId,tenant,actor,document:{id,version,text},extraction:{kind,vendorId,reference,issuedOn,currency,lines:[{itemId,quantity,unitPriceMinor,lineTotalMinor}],totalMinor}}` |
| `review` | `{tenant,receiptId,reviewer,expectedHash,decision:"approve" or "reject",note}` |
| `sync` | `{tenant,receiptId,receiverProfileId:"online" or "offline" or "lose-response"}` |
| `reconcile`, `receipt` | `{tenant,receiptId}` |
| `history`, `state`, `audit`, `verify-audit` | `{tenant}` |

The local receiver modes are closed fault simulations. They do not set arbitrary success flags or contact an ERP. Delivery is an actual SQLite receiver insert tied to the approved content. Offline attempts preserve queued work; a lost response requires receiver reconciliation before current delivery evidence is confirmed. Repeating an identical submission preserves its receipt, while changed intent under the same ID is rejected. Review labels are fixture selectors rather than authenticated users. The supplied extraction is not generated from the document: OCR, SLM inference, trusted source verification and edge measurements remain unimplemented. See [HTTP behavior and boundary tests](../demo-lab/dockside-http.test.mjs).

## ChronosRank local memory operations

Open `/chronosrank` for the workbench. GET `/api/chronosrank/catalog` supplies `scope` and an `example` with `events` and `retrieval`. POST the example events to `/api/chronosrank/append` in order, then its retrieval object to `/api/chronosrank/retrieve`. These routes share the loopback, intent-header and body-size boundary above. All local controller errors return 400 `{error}`; unknown operations return 404.

| POST route suffix under `/api/chronosrank/` | Exact input |
|---|---|
| `append` — remember | `{commandId,tenant,kind:"remember",memoryId,entity,text,provenance:{sourceId,quote},recordedAt,validFrom,expiresAt}` |
| `append` — supersede | Same memory fields with `kind:"supersede"` and `supersedes` naming a memory of the same tenant/entity |
| `append` — expire | `{commandId,tenant,kind:"expire",memoryId,recordedAt}` |
| `retrieve` | `{requestId,tenant,entity,query,asOf,threshold,limit}` |
| `receipt` | `{tenant,receiptId}` |
| `feedback` | `{commandId,tenant,receiptId,outcome:"useful" or "not-useful",note}` |
| `history`, `audit`, `verify-audit` | `{tenant}` |

Timestamps use canonical UTC milliseconds, such as `2026-10-22T12:00:00.000Z`; `expiresAt` is null or a canonical timestamp. `threshold` is an integer from 1 to 100 measuring exact query-token coverage, not a calibrated probability; `limit` is an integer from 1 to 10. Retrieval applies the supplied `asOf` time to both known events and validity intervals. Caller-supplied tenant/entity labels and provenance do not authenticate a user or verify external truth. The local source quote must contain the supplied memory text exactly.

Each tenant has a knowledge watermark: the latest recorded event time or saved retrieval `asOf`, whichever is later. New memory events cannot precede it; a query into the future advances it. This local ingestion policy prevents later backdating into previously observed windows. It does not establish a trusted wall clock. Append the example timeline before trying its future query cases; unchanged commands can still replay after the watermark advances.

Commands and retrieval request IDs are immutable within their tenant: an identical repeat replays its original record, and conflicting payloads are rejected. Saved receipts identify their original ledger snapshot; they do not become a new answer when later memory arrives. Feedback records a supplied judgment without modifying memory or training a model. See [the full memory contract and limitations](../demo-lab/CHRONOSRANK.md) and [HTTP adverse-case tests](../demo-lab/chronosrank-http.test.mjs). No trained reranker, vector store, authenticated service, provider call or latency result is exposed by this API.

## TrustGate local tool operations

Open `/trustgate` for the [local gateway](../demo-lab/TRUSTGATE.md). It runs three fixed tools: `read-public-policy` queries a synthetic policy in SQLite; `create-review-task` writes an internal review draft; `stage-public-note` writes a synthetic note into a local SQLite outbox. The outbox has no sender or Internet publication mechanism. All POST routes use the same loopback, origin, intent-header and body-size checks as the rest of the lab.

| Route | JSON fields and result |
|---|---|
| `/api/trustgate/prepare` | `tenant`, `commandId`, `actor`, `tool`, `bindings`; each required argument binds `{sourceId,key}`. Resolves values from the server-held registry, records immutable intent and returns `blocked`, `pending_review` or `ready`; replay returns the existing receipt |
| `/api/trustgate/review` | `tenant`, `receiptId`, `reviewer`, `decision` (`approve` or `reject`), `note` (1–500 characters), `expectedHash` (exact `proposalHash`); requires a different registered local reviewer in the same tenant. Only pending mutations may be reviewed |
| `/api/trustgate/execute` | `tenant`, `receiptId`; rechecks the saved proposal, current policy/source identity, audit integrity and required review, then performs one local tool effect atomically. Repeat execution returns the saved effect |
| `/api/trustgate/receipt` | `tenant`, `receiptId`; original saved receipt with current staleness metadata, after stored integrity checks |
| `/api/trustgate/history` | `tenant`; saved local receipts after stored integrity checks |
| `/api/trustgate/state` | `tenant`; actual internal tasks and locally staged public notes after stored integrity checks |
| `/api/trustgate/audit` | `tenant`; linked local audit events |
| `/api/trustgate/verify-audit` | `tenant`; verifies audit linkage and consistency with saved receipts/effects |

Preparation cannot supply free argument values, source classifications, grants or approval flags. Every tool argument must name a registered source/key; the gateway derives the value and label. Internal values cannot enter a public sink, instruction-marked sources are blocked, and untrusted documents cannot select case identity. A safe untrusted summary is accepted only for an internal draft that still requires review. All mutations require a hash-bound review. Reusing a command ID for different intent fails. Changed source/configuration/code makes older receipts stale; use a new command after restarting when implementation changed.

The fixed `acme`/`beta` tenants and actor/reviewer IDs are **unauthenticated fixture selectors**, not a multi-tenant identity service. Instruction labels are registered synthetic markers, not automated prompt-injection detection. The local SHA-256 audit chain detects inconsistent records against its stored head; it is not a signed external witness or protection against an administrator rewriting the complete database. The controller's internal error codes are returned by this HTTP adapter as **400 `{error}`**. Unknown TrustGate operations return 404. See [HTTP boundary and execution tests](../demo-lab/trustgate-http.test.mjs) and [core tests](../demo-lab/trustgate.test.mjs).

## Runnable analysis example

In PowerShell, with the server running:

```powershell
$labBase = 'http://127.0.0.1:5680'
$labHeaders = @{ 'X-Demo-Client' = 'local-showcase' }
$labExample = Invoke-RestMethod "$labBase/api/flagships/example/F12"
$labBody = @{ toolId = 'F12'; input = $labExample } | ConvertTo-Json -Depth 30
$labReceipt = Invoke-RestMethod "$labBase/api/flagships/evaluate" -Method Post -Headers $labHeaders -ContentType 'application/json' -Body $labBody
$labReview = @{ receiptId = $labReceipt.receiptId; actor = 'Local demo reviewer' } | ConvertTo-Json
Invoke-RestMethod "$labBase/api/flagships/review" -Method Post -Headers $labHeaders -ContentType 'application/json' -Body $labReview
$labExport = @{ receiptId = $labReceipt.receiptId } | ConvertTo-Json
Invoke-RestMethod "$labBase/api/flagships/export" -Method Post -Headers $labHeaders -ContentType 'application/json' -Body $labExport
```

Expected export authority: `reviewed_local_analysis_only`, with zero external actions. Export before review or after a listed source change fails. Restart after changing loaded source, then reevaluate current evidence rather than reusing an old receipt. [HTTP receipt tests](../demo-lab/flagship-http.test.mjs) reproduce source links and review/export boundaries.

## Contact simulator and errors

Only `POST /contacts/upsert` additionally requires `Authorization: Bearer LOCAL_DEMO_ONLY` and `Version: v3`. That literal is a public local-demo sentinel, not a real provider credential. Body: `locationId: DEMO_LOCATION`, syntactically valid email, optional firstName/lastName/source; all other fields are rejected. The simulator normalizes email and preserves the same ID for the location/email pair. See [simulator tests](../demo-lab/test.mjs).

`X-Demo-Fault: rate-limit` returns 429 with `Retry-After: 1` before a write; `timeout-after-write` delays acknowledgement 1.5 seconds after the committed write. A client timeout alone does not prove zero effect. The [hosted handoff runbook](../integrations/ghl-n8n/README.md) documents the separate provider acceptance boundary; never reuse this sentinel as provider authentication.

| Status | Implemented meaning |
|---|---|
| 400 | Bad target/body or caught domain/controller error, including unknown receipt, invalid state or stale evidence |
| 401 | Missing/wrong simulator credential on contact upsert |
| 403 | Host/Origin/cross-site boundary or missing POST intent header |
| 404 | Unknown route/project/artifact; unavailable recorded review |
| 405 | Method outside GET/POST |
| 409 | Another n8n workflow is running |
| 422 | Contact simulator location/email/text/field validation |
| 429 | Shared evaluator/domain concurrency limit, or simulated contact rate limit |
| 500 | n8n execution failure, persisted with failure timeline |

Error envelopes generally contain `error`; n8n failures also include `timeline`. The service has no generalized provider retry client. Domain workers share a limit of two concurrent evaluations; only one local n8n workflow runs at a time. Inspect errors and reconcile uncertain outcomes rather than blindly replaying POST.

---
*Part of the [Enterprise Automation Portfolio](../README.md).*
