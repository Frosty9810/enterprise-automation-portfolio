# Dockside independently authored strict text-parser fixtures

The [functional case corpus](dockside-text-cases.json) contains 16 complete public synthetic source strings and independently authored expectations. A separate AI fixture author read the existing [Dockside contract](DOCKSIDE.md) and the frozen `DOCKSIDE TEXT 1` grammar before running or reading any new parser output. Corpus SHA-256 at freeze: `ba8b471f4557740ad690a88dec63808ee1e5c73b7d8a4743efdbe524c2f50fc3`.

These are synthetic functional acceptance judgments, not human-verified invoice truth, OCR/extraction-model quality labels, confidence scores or real purchase/payment approval. Every organization, actor, item, amount and document identifier is a public invented fixture. No private document, provider, file path, upload or paid model is used.

## Frozen grammar

The exact first line is `DOCKSIDE TEXT 1`. It is followed in order by `Kind: `, `Vendor: `, `Reference: `, `Issued-On: ` and `Currency: ` lines. An optional `Note: ` line precedes one through fifty `Line: ` records. The final record is `Total-Minor: `. Item lines use exactly `itemId | quantity | unitPriceMinor | lineTotalMinor` after the prefix. Unknown, duplicate, missing, reordered or blank lines are not silently repaired.

Kinds are `invoice` or `packing-list`; currency is USD. IDs use the existing bounded ASCII identifier syntax. Numeric tokens are canonical unsigned decimal integers (`0` or a nonzero digit followed by digits), not floats, signs, exponents or leading-zero alternatives. Quantity is positive and bounded; price and total limits match the existing Dockside contract. Exact integer products and the document sum must agree. Packing-list monetary fields are zero. Dates must be real days in the supported 2000–2099 range. Item IDs cannot repeat within a document.

LF and CRLF strings and an optional single terminal EOL are supported. Lone CR, unsupported controls and ill-formed UTF16 are rejected. A note can contain supplied Unicode text but cannot alter the grammar, extraction, registry or review policy. The source stays a supplied string; no Markdown/HTML rendering, code execution, PDF reading, OCR or language inference is part of this format.

## Expected cases

| Case | Parser expectation | Existing core expectation |
|---|---|---|
| invoice-lf-unicode-note | Parsed; exact Unicode note and spans | Awaiting independent review |
| invoice-crlf-two-items | Parsed; CRLF and no final EOL retained | Awaiting independent review |
| packing-list-zero-money | Parsed; zero monetary fields retained | Awaiting independent review |
| unknown-vendor-core-hold | Parsed; unknown ASCII vendor retained exactly | Rejected by tenant registry |
| unknown-item-core-hold | Parsed; unknown ASCII item retained exactly | Rejected by tenant registry |
| reordered-headers | `invalid_text` | No submission implied |
| duplicate-header | `invalid_text` | No submission implied |
| unknown-review-instruction | `invalid_text` | No text-supplied approval exists |
| leading-zero-quantity | `invalid_text` | No submission implied |
| exponent-price | `invalid_text` | No submission implied |
| line-product-mismatch | `invalid_text` | No submission implied |
| document-sum-mismatch | `invalid_text` | No submission implied |
| impossible-calendar-date | `invalid_text` | No submission implied |
| packing-list-nonzero-money | `invalid_text` | No submission implied |
| duplicate-item-lines | `invalid_text` | No submission implied |
| unpaired-utf16 | `invalid_text` | No submission implied |

There are five intended successful parses and eleven parser rejections. Only three parsed documents use registered acme values; even those must remain awaiting independent review. The two unknown-registry cases intentionally separate text syntax from business authorization. No fixture intends automatic approval, receiver delivery or a real accounting result.

## Functional labels and exact evidence

Each case supplies `text`, a rationale and `expected` fields. For successful parses, `extraction` contains independently derived typed fields, `note` preserves the exact optional note, and `coreStatus` describes submission to the existing acme core using its configured operator selector. Rejections have `errorCode: invalid_text`, no extraction and no expected core submission. Labels do not override parser or core behavior; retain and investigate any actual disagreement rather than tuning a fixture to obtain a passing score.

Expected `spans` are in source order and identify exact value substrings, excluding their field prefixes and separators. Field paths are `kind`, `vendorId`, `reference`, `issuedOn`, `currency`, optional `note`, each `lines[index].itemId`, `.quantity`, `.unitPriceMinor`, `.lineTotalMinor`, and `totalMinor`. `line` is one-based. UTF16 and UTF8 offsets are absolute and half-open. Accented words and emoji deliberately make the two offset systems differ.

Expected `lines` preserve the complete source layout. Their `text` excludes the line terminator; `eol` stores the original terminator separately. Each line's end offset includes its EOL, so consecutive line ranges cover the entire original source without gaps. The final CRLF example deliberately omits a terminal EOL. The author derived these ranges directly from the literal source layout without calling the new parser.

The expected parser `sourceHash` is SHA-256 of the raw supplied string encoded as UTF8. It is distinct from the existing Dockside core's hash of a JSON-serialized string; neither domain should be relabeled as the other. These are identities of supplied strings, not original scanned file bytes, supplier signatures or source authenticity. The invalid surrogate case uses JSON escape notation to reconstruct an invalid JavaScript string and expects rejection rather than silent UTF8 replacement.

Parsing/preview should not write a job, grant review or create a receiver effect. The integration must bind the exact derived extraction and original text through its actual submission path, then preserve independent exact-hash review and the existing local delivery/recovery rules. Those integration, persistence, replay and adverse cases require separate actual tests; this authored corpus alone does not prove them.