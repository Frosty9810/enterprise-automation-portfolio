# Product governance: a decision you can inspect

Open **http://127.0.0.1:5680/product-governance** after following the [lab setup](README.md). Create the root `.venv` and install `requirements-dev.txt` before starting the server. This case runs the original ECOM-01 Python policy through a bounded, credential-free subprocess; it is not a second JavaScript imitation of the policy.

## A three-minute demonstration

1. Evaluate the faithful Spanish translation. Compare material, dimensions and warranty with the source.
2. Select **Invented number** and evaluate. Keeping the old numbers while adding an unsupported number is blocked. Try changing the title too.
3. Select **Changed warranty** or **Unsupported claim**. Inspect the specific reason instead of a generic success animation.
4. Return to the faithful draft, inspect it, acknowledge the review and record a reviewer label. Download the JSON handoff.
5. Edit the candidate: the visible review clears. A different payload requires a new receipt and review. Change a source fact without increasing its revision to see a conflict; increase the revision to invalidate old exports.

## Engineering decisions

| Principle | Implementation | Evidence |
| --- | --- | --- |
| One policy authority | Original Python implementation receives bounded JSON over stdin | Adapter and HTTP tests run the actual subprocess |
| Validate at the boundary | Field types, length, locale, warranty and safe integer revision | Boolean warranties and malformed fields are rejected |
| Protect facts | Exact protected-field comparison; numeric token preservation and introduced-token rejection in title and description | Independent counterexamples in Python tests |
| Bind approval to content | Receipt SHA-256 includes the full canonical input and policy hash | Candidate edits produce different receipts |
| Reject stale authorization | Export checks current source revision/hash and current policy hash | Old source and changed policy export tests |
| Idempotent replay | Identical evaluations and repeated same-label reviews retain original records | Replays add no duplicate audit events |
| Durable atomic writes | SQLite transactions and foreign keys retain decisions, reviews and hash-linked events | Database close/reopen test |
| Handle UI races | Draft generation guard rejects responses received after an edit | Browser DOM regression test |
| Make limits visible | Interface shows scope, policy hash, protected values, reasons and history | Inspectable case, not an impact claim |

## What the handoff means

Export is `reviewed_local_draft`, with `externalActions: 0`. It does not publish a product, call Shopify, invoke an LLM, send a message or prove production acceptance. The reviewer is a local demonstration label, not an authenticated identity. Hash linkage helps inspect consistency; a database administrator can rewrite local records. This is not a signed or tamper-proof compliance archive.

The policy compares numeric token sets, not semantic quantities, translated number words, ordering, unit conversions or multiplicity. It recognizes a small English claim list, not every unsupported claim in every language. An allowlisted locale passing the original policy still requires an explicit review in this showcase. Production work needs authenticated roles, a reviewed multilingual policy, authoritative source revisions, provider integration, controlled publication and recovery tests.

## Source and verification

- [Original policy](../15%20E-Commerce/ECOM-01%20Multi-Market%20Product%20Content%20Governance/build/localization_engine.py)
- [Durable review adapter](product-governance.mjs)
- [API and browser regression tests](product-governance.test.mjs)
- [Independent policy counterexamples](../tests/test_product_governance.py)

Run `node --test demo-lab/product-governance.test.mjs` from the repository root. Run the complete quality gate with `.venv/Scripts/python.exe scripts/check_quality.py` on Windows or `.venv/bin/python scripts/check_quality.py` on Linux. Node 24 and installed lab dependencies are required.
