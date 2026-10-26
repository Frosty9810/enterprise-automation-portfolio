# AtlasGraph Markdown source adapter

This is a bounded source-ingestion slice for the unfinished [AtlasGraph blueprint](../47%20Automation%20Blueprints/2026%20Research-to-Production/01-atlasgraph.md). It turns supplied Markdown into exact source pages, previews the resulting evidence with the real compiler in an isolated in-memory database, and explicitly imports a reviewed snapshot into the existing local graph. It does not extract facts or relationships with a model, authenticate a source or implement a complete CommonMark parser.

## Reproduce

From the repository root using Node.js 24 and installed demo-lab dependencies:

```powershell
node demo-lab/run-atlasgraph-markdown.mjs
node --test demo-lab/atlasgraph.test.mjs demo-lab/atlasgraph-markdown.test.mjs demo-lab/atlasgraph-markdown-ui.test.mjs demo-lab/atlasgraph-markdown-http.test.mjs
node demo-lab/server.mjs
```

Open `/research-markdown?project=AtlasGraph` from the existing research workbench. The [public synthetic example](atlasgraph-markdown-example.json) supplies three shipment-policy sources and manually authored claim/reference annotations. The [data guide](ATLASGRAPH-MARKDOWN-DATA.md) explains their authorship and boundaries. Loading or previewing does not import a graph snapshot. Preview runs the actual compiler in a disposable database; only the explicit compile action changes the normal graph.

## Supported text and annotations

The named `markdown-atx-v1` format requires column-zero ATX headings with explicit ASCII IDs, such as `## Release checks {#customs-checks}`. Every heading begins a flat page through the next recognized heading. The title is literal supplied text. Limited three-backtick or three-tilde fenced blocks retain their contents as text; headings inside them do not create pages. Unsupported or ambiguous layouts fail closed. This is a deliberately documented ingestion grammar, not a promise to understand arbitrary Markdown, rendered HTML, PDF, email, attachments or web pages.

Each parsed page has one supplied annotation record with `pageId`, `claims` and `references`. Empty lists are allowed. Claims and links are never inferred from prose. The existing compiler still requires exact claim values and exact reference quotes naming the target page, all target pages present and links between approved sources. Tenant labels and approval booleans are supplied local inputs, not verified identities or professional review.

Raw source strings keep their line endings and Unicode spelling. The adapter preserves the complete source as exact page slices, including headings and fenced text; it records UTF-16 and UTF-8 offsets and a SHA-256 digest of the UTF-8 source. No source normalization or silent text repair occurs. Invalid UTF-16, unsupported line endings, incomplete fences and inconsistent annotations are rejected. The bounded HTTP contract accepts strings and metadata only: no file paths, URLs, executable code, provider credentials or remote fetches.

## Durable source provenance

Optional `source.origin` metadata stores the raw supplied Markdown, its digest and validated page ranges in the existing immutable source-version and snapshot records. The core checks exact raw/page coverage and offsets before writing. That origin participates in the source hash and the existing SQLite transaction; no separate post-compile sidecar is presented as atomic evidence. Read pages and answer citations expose compact origin hash/range metadata rather than duplicating the entire raw document in each citation.

Existing JSON sources without origin retain their previous normalized shape, hashes and behavior. A source ID/version remains immutable: changing Markdown, annotations or origin under an existing version fails and leaves current data untouched. Use a new explicit version for revised evidence. The example uses `markdown-v1` to distinguish it from the original JSON example. Retained raw text is ordinary local SQLite data; this adds no encryption, retention policy or production privacy guarantee.

## Preview, review and whole-snapshot replacement

Preview identity binds the supplied input, parsed compile payload, implementation and the base graph snapshot. The compile request carries the same input and reviewed proof fields; it cannot supply an arbitrary prebuilt preview payload. The server recomputes the proof and checks the current snapshot inside the actual compile transaction. Another graph change requires a fresh preview. An identical target already current can be returned as reused, allowing an unchanged retry after a lost acknowledgement without adding source versions or snapshots.

Compilation replaces the tenant's entire current snapshot, including omission of previously current sources. Inspect the preview and replacement warning before the explicit acknowledgement and compile action. A changed editor invalidates the preview. A failed or uncertain response is not proof that no write happened; retry unchanged intent or inspect current state before preparing a different replacement. Loaded source drift requires restarting and previewing again. These hashes and selectors are local consistency evidence, not signatures, authenticated approval or protection against a privileged operator.

After import, the existing AtlasGraph workbench can search/read/traverse the compiled pages. Choose a fresh answer request ID after a graph change: an older request ID deliberately replays its original, possibly stale receipt. The optional snapshot precondition protects this import path; the existing JSON compile API retains its documented behavior.

## Remaining work

Actual PDF/email extraction, arbitrary Markdown support, trusted connectors, authenticated review, semantic/vector retrieval, model-selected tools, independently measured external comparisons and provider/production acceptance remain open. The adapter compiles supplied annotations; it does not establish document truth, legal/customs correctness or authority to perform a business action. All included examples are public synthetic fixtures.
