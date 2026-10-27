# Dockside text intake: exact supplied fields and reviewed delivery

This bounded adapter derives the existing [Dockside queue](DOCKSIDE.md) extraction fields from a small, documented text layout. It reads the supplied string only. It is not OCR, an SLM, arbitrary invoice understanding, source authenticity verification or permission to approve, pay or deliver anything. All examples are public synthetic records.

## Reproduce

Requires Node.js 24 with the built-in SQLite module:

```powershell
node --test demo-lab/dockside-text.test.mjs demo-lab/dockside-core.test.mjs
node demo-lab/run-dockside-text.mjs
```

The CLI uses an in-memory queue and scripted fictional reviewer to demonstrate one parsed invoice through the existing local receiver. Its review is test setup, not human acceptance. The browser text mode previews without saving a queue job, then requires an explicit save before the usual independent review and delivery controls can be used. The existing supplied-JSON mode remains available and does not acquire a general claim that its extraction matches its text.

## Strict text layout

Use these exact ordered prefixes and spaces:

```text
DOCKSIDE TEXT 1
Kind: invoice
Vendor: vendor-acme
Reference: INV-TEXT-001
Issued-On: 2026-10-26
Currency: USD
Note: Café dispatch 😀
Line: item-widget | 2 | 1250 | 2500
Line: item-bolt | 3 | 100 | 300
Total-Minor: 2800
```

`Kind` is `invoice` or `packing-list`. `Note` is optional and, when present, occurs between `Currency` and the first `Line`. Its nonempty Unicode text is preserved as source context, not added to the extraction schema. Every document has one through 50 `Line` records and a final `Total-Minor`. Blank, repeated, reordered, unknown and trailing unconsumed lines are rejected. An instruction or HTML line cannot be silently skipped. A note remains literal data and is never executed.

Identifiers use bounded ASCII letters, numbers, period, underscore and hyphen, starting with a letter or number. Dates must be real `YYYY-MM-DD` calendar days from 2000 through 2099. Currency is USD. Integer strings are `0` or a nonzero ASCII digit followed by digits: signs, negative zero, decimal notation, exponents, grouping and leading zeros are rejected. Quantities are positive and at most 1,000,000; unit prices are at most 1,000,000,000 minor units; line and document totals are at most 1,000,000,000,000. Exact BigInt arithmetic checks quantity times unit price and the aggregate total. Packing-list monetary fields must all be zero. Item identifiers cannot repeat.

Input is limited to 10,000 UTF-16 code units and 16,000 UTF-8 bytes; note text is at most 1,000 UTF-16 code units. LF and CRLF are accepted, including at most one terminal line ending. Mixed accepted line endings are preserved. Tabs, lone CR, unpaired UTF-16 surrogates and unsupported controls are rejected. No spelling, Unicode or whitespace normalization repairs the input. Browser textarea editing can produce LF; the preview identifies the string actually submitted rather than pretending it is an unchanged uploaded file.

## Exact source evidence

`parseDocksideText(text)` returns `extraction`, an optional `note`, exact `spans`, consumed `lines`, source lengths, `sourceHash`, `parserHash` and `previewHash`. Field spans are half-open absolute UTF-16 and UTF-8 value ranges, excluding their label and delimiter. `line` is one-based. Consumed line ranges include their original line ending; their `text` omits it and `eol` identifies it. Together those ranges cover the complete supplied string.

The parser's `sourceHash` is SHA-256 of raw UTF-8 source bytes. The existing core's receipt `sourceHash` hashes the JSON-encoded source string. These are distinct domains and must not be compared as the same digest. The deterministic preview hash covers the complete parsed result except its own `previewHash`. The parser identity covers the loaded parser implementation, documented grammar and fixed example; current source drift stops a loaded parser until restart. These are local byte identities, not signatures or authenticity claims.

The server accepts text preview as exactly `{text}`. Text submission accepts the original `commandId`, `tenant`, `actor` and `document:{id,version,text}` plus `expectedParserHash`. It derives extraction again from that original text and rejects caller-supplied extraction or extra success, approval, provider and path controls. No file or URL is fetched. Parser errors do not echo a matched source value. A saved receipt preserves original document text and derived fields under the existing immutable content hash.

A parse proves only compliance with this supplied layout. Vendor and item membership remain tenant-specific core checks; a syntactically valid unknown identifier can parse and then become a retained `rejected` queue receipt. A valid parsed job remains `awaiting-review`. A different configured reviewer must compare the original text and fields and approve their exact content hash before the local receiver can execute. Tenant, actor and reviewer labels are demonstration selectors, not authenticated people.

## Persistence and remaining scope

No core schema or receipt provenance format is changed by this adapter. The text preview and expected parser identity protect the current text submission path. Ordinary persisted Dockside receipts bind original source text, extraction and the core's implementation/configuration; they do not attest which parser produced a historical job or persist a signed parser passport. Parser-only revisions do not automatically make every existing manual or parsed core job stale. Re-evaluate source correspondence during review and do not infer historical parser acceptance from an ordinary receipt after restart.

The existing queue still controls immutable revisions, replay, independent review, offline retry, uncertain delivery reconciliation and local receiver idempotency. A parse or saved job is not a delivery confirmation. The [independently authored functional cases](DOCKSIDE-TEXT-CASES.md) retain both parser rejections and syntactically accepted registry rejections; they are not OCR accuracy or model-quality labels.

Arbitrary supplier documents, OCR, trained extraction, calibrated confidence, authenticated review, external source authenticity, invoice/tax correctness, real ERP integration, hardware measurements, key management and production acceptance remain open. Use synthetic/public source text only under this portfolio's current local scope.