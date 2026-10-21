# Twelve executable business systems

Open **http://127.0.0.1:5680/flagships** after starting the local lab. Each project has editable synthetic evidence, a distinct decision engine, readable results, listed source files, a durable analysis receipt and acknowledgement-gated export. Cross-check all twelve from the interface or reproduce the report:

```sh
node demo-lab/run-flagships.mjs
node --test demo-lab/*.test.mjs demo-lab/test.mjs
```

The acceptance runner performs four checks per project: an independent expected domain result, current listed source evidence with zero external actions, acknowledgement/export, and an adverse boundary. The resulting **12-project / 48-check** report lives in `reports/twelve-project-acceptance.json`. It is authored local acceptance, not a blind benchmark, measured client ROI or production certification. Browser interaction tests independently execute all twelve cards, review/export and stale-response handling.

| ID / system | Business decision and engineering signal | Local result to inspect | Remaining integration work |
|---|---|---|---|
| F01 · Salesforce RevenueOS | Who owns a lead, what follow-up is needed, when a case escalates; tenant and revision controls | Three actual SQLite record effects with reviewed patches; dedicated `/salesforce` experience includes retries and uncertain-write reconciliation | Salesforce sandbox API/event acceptance, authenticated field permissions and reconnect limits |
| F02 · Incident & Recovery | Whether a timeout committed an effect; duplicate-safe recovery | Durable shared handoff moves from uncertain to reconciled without a second effect; `/workshop` provides interactive recovery | Real provider reconciliation, trace ingestion and operational identity |
| F03 · Evidence-grounded Support | Answer from approved tenant sources or escalate | Exact approved excerpts, citation hashes, excluded documents and abstention | Independent larger question set, live retrieval, semantic/injection evaluation; instruction markers are supplied fixtures |
| F04 · Routing Evaluation | Escalate only when verification fails and budget permits | Three labeled scenarios, both-attempt accounting, budget stops and measured local verifier latency | Real model/token costs and latency, blind holdout; scenario units are synthetic |
| F05 · Accounts Payable | Whether invoice, PO and receipt evidence support a payable draft | Actual original Python policy, changed-bank/duplicate/quantity holds | Trusted documents, real ledger concurrency and authenticated approval; no payment release |
| F06 · Architecture Explorer | Which source and observed receipt supports a decision | Twelve source passports, authored wiring distinguished from actual saved evaluations and stale hashes | Automatic full dependency discovery and distributed trace ingestion |
| F07 · Salesforce Merge Preview | Whether exact identity and protected fields allow a safe merge | Fill-only patch on cloned records, archive simulation, exact reversal and intervening-change hold | Salesforce merge/delete behavior, durable record storage and authenticated stewardship |
| F08 · Product Governance | Whether localized text preserves protected facts | Actual original Python policy; `/product-governance` adds source/revision-bound reviewed draft export | Authenticated reviewer separation, locale/unit expansion and hosted publishing acceptance |
| F09 · Consent Journey | Whether a scoped communication would be eligible | Event/known-time history, revoked/expired/conflicting-grant suppression and duplicate checks | Authenticated consent provenance, production retention enforcement and delivery authority |
| F10 · Usage-to-Invoice | Which usage belongs in a closed period or later adjustment | Exact USD integer cents, duplicate suppression, referenced credits and balanced draft journal | Metering source, real ledger/invoicing and accounting-policy review; no invoice is issued |
| F11 · Scheduling Board | Which explicit-offset window meets access, vendor and conflict rules | Active/cancelled commitments, buffers and repeated wall-time distinction, plus original PM/EA industry checks | IANA timezone conversion, durable calendar reservations and authenticated dispatch |
| F12 · Reconstruction Challenge | Whether reconstructed behavior matches the reference | Newly repository-authored module, deliberately broken baseline, corrected candidate and ten public cases | Independent hidden cases and isolated native reconstruction tooling; no client binary, decompiler or AI-generated repair claim |

## Make the portfolio count

Lead interviews with **Salesforce RevenueOS**, **Incident Recovery** and **Accounts Payable**. Together they demonstrate CRM operations, handling uncertain outcomes and financial control boundaries. Use Support and Routing for roles that emphasize AI evaluation, then show the other systems as supporting breadth. Twelve titles alone do not establish depth; the decision, counterexample and execution receipt do.

For each lead case, use a short walkthrough: explain the business failure, show a successful result, introduce one adverse input, inspect the hold/recovery and export its source-bound evidence. The UI gives each system readable domain details rather than making raw JSON the presentation.

The next improvements with the strongest evidence value are an authorized Salesforce sandbox run; provider reconciliation for one real timeout; and an independent support evaluation dataset. Measure assignment correctness, duplicate effects, false approvals, citation errors and operator recovery time before claiming saved time or revenue. No business-impact percentage is currently established.

## Evidence and authority

The shared SQLite layer stores analysis inputs, results, source hashes and acknowledgement history. Acknowledgements retain their original label across restarts and grant **no operational authority**. Source changes invalidate review/export, and changed listed files require a server restart so old loaded code cannot claim a new disk hash. Manifests explicitly list selected implementation/test files; they are not a complete inferred dependency graph.

F01/F02 execute scripted local durable transitions; F07 applies and reverses cloned records. Other tools calculate analysis or drafts. All provider effects remain zero. Do not upload confidential evidence to this unauthenticated local demonstration. The reconstruction reference and candidates are newly authored in this repository; no third-party licensing or shipped-client provenance is asserted. The public regression cases are fully disclosed.
