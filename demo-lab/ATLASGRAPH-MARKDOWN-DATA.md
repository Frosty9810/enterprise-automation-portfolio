# AtlasGraph independently authored Markdown source fixtures

The [three-source example](atlasgraph-markdown-example.json) is a public synthetic Markdown representation of the original [structured shipment example](atlasgraph-example.json). The same supplied evidence connects `shipment` → `customs-checks` → `approval-threshold`, with the exact authored values `DAP`, `signed permit before release` and `operations director approval`. It uses distinct `markdown-v1` source versions so it does not attempt to mutate the original immutable `v1` JSON versions. Tenant and page/source IDs remain stable; importing still replaces the whole current tenant snapshot and requires its explicit review/confirmation boundary.

A separate AI fixture author created the source text, explicit annotations and [functional parser cases](atlasgraph-markdown-cases.json) before running or reading any new Markdown parser output. Example SHA-256 at freeze: `3e472b32b887dbbc02720d480954db1ea2688094241dbc75c95da2acb8f76d2d`. Case corpus SHA-256: `435b467e24e74ddf65008a62f15203003f2e246d7d30bad3df0a9e76591d578a`. These are synthetic functional labels, not human-verified business rules, quality scores, source authentication or real customs acceptance.

## Explicit source contract

The example is a direct `{tenant,sources}` adapter DTO. Each source supplies `id`, `version`, `title`, boolean `approved`, raw `markdown` and `annotations`. Every actual parsed page must have exactly one annotation `{pageId,claims,references}`, including explicit empty arrays when no claims or references are intended. Claims and links are supplied data; prose and Markdown hyperlinks are not semantic extraction instructions. Existing AtlasGraph exact-substring claim/reference checks remain applicable.

Only column-zero ATX headings in the shape `# Title {#stable-id}` through six `#` characters start pages. Every source page has an explicit stable ID. Closed fences of exactly three backticks or exactly three tildes, with an optional supported language label, keep heading-looking lines inside them as raw body text. This is a narrow ingestion grammar, not a Markdown renderer or full CommonMark implementation. Setext layouts, indented/quoted headings, raw HTML blocks, longer/unclosed fences, invalid identifiers and annotation mismatches are intentionally outside its accepted contract.

The supplied shipment source has one leading CRLF blank line, CRLF line endings, a Unicode accented word and an emoji. Its closed backtick fence contains a heading-like `not-a-page` identifier that must not become a graph page. The other business sources use LF. The source title, raw spelling, code units and line endings must remain attributable to the submitted source; neither a line-ending conversion nor Unicode normalization is part of this adapter.

## Functional case labels

The 16 cases contain three accepted source layouts and thirteen malformed or unsupported inputs:

- The full three-source, two-hop business example preserves all original explicit claims and references.
- A two-section source has leading blank lines, Unicode text and a fenced fake heading. The next real heading begins the second section exactly.
- A CRLF source with a supported triple-tilde fence keeps its heading-looking fenced line as text.
- Rejections cover a missing stable ID, duplicate page ID, missing/foreign/duplicate annotation, unclosed fence, Setext layout, indented heading, raw HTML block, blockquote heading, four-character fence, lone carriage return and an unpaired surrogate.

Accepted labels name `pageIdsBySource` and exact `sections`. Each section supplies source/page identity, raw `text`, start/end UTF-16 code-unit offsets and start/end UTF-8 byte offsets in its original source. End offsets are exclusive. Leading blank lines belong to the first raw section. A section extends through the byte/code unit immediately before the next real page heading, or through the original source end. The author derived these offsets from the supplied strings without running the new parser. UTF-16 and UTF-8 offsets intentionally differ around the accented words and emoji.

Rejected labels contain empty expected pages/sections; they must not be counted as successful imports or repaired silently. JSON escape notation in the case file reconstructs the intended Unicode and CRLF strings at parse time. The invalid surrogate case deliberately reconstructs an ill-formed JavaScript string and expects rejection rather than silent UTF-8 replacement. No fixture expectation should be changed merely to improve an observed result.

## Reproduce the intended graph question

After a successful reviewed import, ask the existing engine for required claim keys `incoterm`, `customsRule` and `approval`, starting at `shipment`, with `maxHops: 2` and `evidenceBudgetBytes: 12000`. Use a fresh request ID such as `harbor-md-answer-1`; an old JSON answer request ID replays its original receipt rather than evaluating the new Markdown snapshot. The question text remains a ledger label; no model interprets it.

A recorded Markdown origin should identify the exact raw source hash and page ranges alongside the immutable compiled source version. Those are local byte identities, not signatures, upstream source truth or authentication. Failed parsing/annotation validation must not activate a partial snapshot or leave a partial origin record. Source/version conflicts and stale-base publication require their own actual transactional tests, separately from these authored parser labels.

No external file path, URL fetch, PDF/email/OCR ingestion, executable code block, private document, paid model, provider integration or production authorization is supplied. Rendering, semantic/vector retrieval, model-selected tools, full source adapters and independent external multi-hop acceptance remain open. This fixture demonstrates a bounded explicit Markdown ingestion step, not completion of the AtlasGraph research blueprint.