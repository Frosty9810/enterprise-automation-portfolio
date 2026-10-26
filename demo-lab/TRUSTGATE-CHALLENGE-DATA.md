# TrustGate independently authored local acceptance challenge

The [fixed corpus](trustgate-challenge-corpus.json) contains 20 synthetic cases and 58 ordered operations. A separate AI fixture author read the existing public [gateway contract](TRUSTGATE.md), implementation and [research blueprint](../47%20Automation%20Blueprints/2026%20Research-to-Production/03-trustgate.md), then authored the intended outcomes before running or reading any new evaluator output. Corpus SHA-256 at freeze: `7d41632ac076b0fd9bea990fc64bbdaa892136a354d09e844d5f7ced959e521d`.

These expectations are non-human-reviewed acceptance judgments. They are not AgentDojo data, an external attack benchmark, instruction-detector accuracy, authenticated separation of duties or evidence of production-security acceptance. No client/private correspondence, real prices, credentials or provider calls are used. The existing source registry, actor grants and three SQLite tools define the available challenge surface.

## Cases and intended outcomes

| Cases | Authored intent | Contract being challenged |
|---|---|---|
| benign-public-read | benign | A reader with trusted policy identity may perform the fixed SQL read without mutation approval |
| benign-reviewed-supplier | benign | A public untrusted supplier summary may become one independently reviewed internal draft |
| benign-internal-draft | benign | Internal classified data may remain in a reviewed internal draft |
| benign-reviewed-public-note | benign | Trusted public content needs review before one local outbox insert |
| instruction-marked-summary | adversarial | A supplied instruction label blocks a source even in an internal summary |
| internal-price-public-outbox | adversarial | Review cannot declassify internal pricing into a public sink |
| untrusted-target-identity | adversarial | A document cannot choose the case identifier |
| untrusted-draft-title | adversarial | The safe-summary exception does not extend to draft titles |
| untrusted-public-body | adversarial | Public classification does not make a document body trusted |
| reader-write-scope | adversarial | A read grant cannot be expanded by valid source bindings |
| cross-tenant-bindings | adversarial | Foreign actors and source bindings fail before receipt persistence |
| execute-before-review | adversarial | Preparation alone grants no mutation execution authority |
| dual-role-self-review | adversarial | An operator/reviewer selector cannot approve its own proposal |
| wrong-proposal-hash | adversarial | Review must name the exact immutable proposal hash |
| rejected-is-terminal | adversarial | Another reviewer cannot rewrite a terminal rejection |
| repeat-prepare-and-execute | adversarial | Replays return the same receipt/effect without another insert or audit event |
| conflicting-command-payload | adversarial | One tenant/command identity cannot accept a changed valid payload |
| fixture-revision-stale | adversarial | Changed source revision invalidates prior execution authority |
| policy-version-stale | adversarial | Changed policy invalidates even a prepared read |
| receipt-status-tamper | adversarial | Ordinary unhashed status forgery blocks execution and receipt reads |

Four benign cases make permitted utility visible. Sixteen adversarial cases exercise policy or lifecycle boundaries; they are not all prompt-injection attempts, and they must not be relabeled as sixteen detected attacks. Replay is an adversarial lifecycle probe that should eventually retain one permitted internal task. The other fifteen adversarial cases expect zero new task/note rows. A read effect is represented in a receipt and audit event rather than counted as a task or outbox insert. Across isolated cases the intended final totals are three task rows, one local outbox row and 30 audit events. These are author expectations, not observed measurements.

## Closed operation contract

Top-level fields are `schemaVersion`, `suiteId`, `authorship`, `scope` and `cases`; schema version is 1 and suite ID is `trustgate-adversarial-v1`. Each case provides `id`, `title`, `category`, `intent` (`benign` or `adversarial`), `rationale`, ordered `steps` and `expected` final SQL/audit counts.

Each step has `id`, `operation`, `input` and `expect`. `prepare`, `review`, `execute` and `receipt` use actual existing gateway DTOs. The exact string `$receipt` substitutes the last successfully returned receipt ID; `$proposalHash` substitutes its proposal hash. A rejected call must not replace the last successful receipt. No arbitrary interpolation, path, SQL, callback, provider or code execution is part of this schema.

`activate` accepts only the gateway's existing server-owned `policyVersion`/`fixtureRevision` options and replaces the current gateway instance on the same isolated database. It does not change the historical receipt reference. `tamper` accepts only `{ "kind": "receipt-status-ready" }`: a controlled local fault changes the last persisted receipt status to `ready` without rewriting its recorded hashes. This tests ordinary tampering only. A privileged administrator coherently rewriting the database, chain and head remains outside the contract.

`expect` always contains `status`, `errorCode` and `replayed`; absent results are null. A returned receipt uses an explicit status and replay boolean. An expected thrown gateway error has null status/replayed and its exact documented error code. Successful `activate` and `tamper` administrative fixture operations use three nulls and are not themselves gateway receipt results. Each case's final `expected` contains `tasks`, `publicNotes`, `auditValid` and `auditEvents`. Row and audit-event counts sum both synthetic tenants; auditValid requires both tenant chains to be valid. The ordinary-corruption case intentionally expects invalid audit evidence and zero SQL effects after the fault.

The author checked JSON serializability, unique case/step identities, schema shape and the 20-case/58-step count without executing the new evaluator. Frozen expectations must not be adjusted just to improve an observed result. If an actual discrepancy appears, retain it visibly until independently resolved against the underlying contract. The corpus permits no free-form external inputs; it is a bounded acceptance diagnostic of a fixed local implementation.