# VeilRAG independently authored declared-variant cases

The [fixed cases](veilrag-variant-cases.json) contain 16 complete public synthetic `protect` DTOs and separately authored expectations. A separate AI fixture author read the existing public [exact-alias contract](VEILRAG.md), core and [research blueprint](../47%20Automation%20Blueprints/2026%20Research-to-Production/05-veilrag.md), then authored these cases against the clarified proposed guard contract before running or reading any new guard output. Corpus SHA-256 at freeze: `6bc8a75aede8c4a82b8a2230d1fc7573144d27ad1f1574634cc2b633c57a3b93`.

The guard contract is deliberately narrow: exact alias replacement and restoration stay unchanged. A remaining occurrence whose JavaScript `normalize('NFKC').toLowerCase()` form contains an equivalently transformed declared literal must reject the input instead of silently rewriting the variant. The check covers the full child transport, raw strings and structural labels/keys. It is conservative substring matching, not full Unicode casefold, automatic sensitive-entity detection, semantic equivalence or general privacy protection. Short literals may collide with protocol/alias bytes and cause conservative rejection. The positive overlap fixture uses Ann/Ann Example to keep exact overlap utility separate from incidental hexadecimal alias collisions.

## Authored cases

| Case | Intended outcome | Why |
|---|---|---|
| exact-across-all-surfaces | protected | Exact declared text in query, context, history and nested tool arguments should be aliased consistently |
| exact-longest-overlap | protected | Longest-first replacement should preserve separate exact overlapping declarations |
| case-query-mixed | rejected | A lowercase occurrence survives exact replacement even when an exact occurrence was aliased |
| case-context | rejected | Uppercase protected text remains in context |
| canonical-history | rejected | Decomposed history and composed declaration compare equal after NFKC/lowercase |
| compatibility-nested-argument | rejected | Fullwidth text in nested tool arguments normalizes to the declaration |
| compatibility-ligature | rejected | An ffi compatibility ligature normalizes to the declaration |
| decomposed-declaration-composed-context | rejected | Both declaration and remaining text must be normalized |
| case-argument-key | rejected | A valid ASCII argument key contains a declared case variant and cannot be rewritten |
| case-frame-label | rejected | A fixed frame label contains a declared case variant |
| case-tool-name | rejected | A tool name contains a declared case variant and cannot be rewritten |
| unsupported-percent-encoding | protected, visible counterexample | NFKC/lowercase does not percent-decode |
| unsupported-zero-width | protected, visible counterexample | NFKC/lowercase does not remove an inserted zero-width space |
| unsupported-confusable | protected, visible counterexample | Cyrillic and Latin A are not equated |
| unsupported-full-casefold | protected, visible counterexample | Lowercase sharp S is not treated as SS by this contract |
| unsupported-base64 | protected, visible counterexample | NFKC/lowercase does not decode base64 |

The intended count is nine rejected cases and seven accepted `protected` cases. Five of those accepted cases deliberately retain an unsupported exposed representation. Calling their acceptance a privacy success would be incorrect. `protected` is the existing local lifecycle status, not a security certification. These expectations do not predict unseen inputs or measure detector recall, leakage rate, answer utility or model quality.

## Closed data schema and evidence meaning

Top-level fields are `schemaVersion: 1`, `suiteId: 'veilrag-declared-variant-v1'`, `authorship`, `scope` and `cases`. Each case contains an ID, title, category, complete original `protect` input, rationale and `expected` object. The expected object has `status` (`protected` or `rejected`), `errorCode` (null for acceptance; `declared_literal_variant_leak` for the new variant guard), and `exposedVariants` (the exact unsupported representations expected to remain in accepted sanitized frames). Existing schema/exact-structural validation can separately return `invalid_input`; these cases use valid DTOs so the new supported-variant cases exercise the declared variant guard.

All fixtures use only invented public example identities. No private/client material, real personal data, credentials, paid model or provider is involved. Authoring checks inspect JSON serializability, unique identities, complete DTO structure and expected-count arithmetic without executing the new guard. Raw cases and expectations are frozen before outputs; do not silently alter them to make an observed result pass. Report an actual discrepancy and resolve it independently against the agreed contract.

Input rejection should occur before a new session, encrypted vault or protected event is persisted. Output rejection requires separate actual child-output tests; these input fixtures alone do not prove the output guard, process isolation, restoration, ciphertext integrity or source freshness. A generated result's aliases and hashes are per-run values and are not fixed gold strings here. Exact authorized restoration remains a separate explicit local operation, with synthetic recipient selectors rather than authenticated people.

The full research scope remains incomplete: automatic entity detection, retrieval/provider integration, authenticated identities, production key management, independently reviewed privacy/utility evidence and the external no-identifier constraint are not established. No external transmission is enabled by this fixture suite.