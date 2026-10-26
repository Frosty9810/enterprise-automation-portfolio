# TrustGate: a local tool gateway with reviewed SQLite effects

TrustGate turns a source-bound proposal into a durable receipt, checks a fixed policy, and executes one of three real local SQL operations. It demonstrates a bounded part of the TrustGate research blueprint. It does not implement an agent framework, model-based instruction detection, external tools, authentication, or a production security gateway.

## Run and inspect

Node.js 24 or newer is required for `node:sqlite`; the runtime currently emits its experimental SQLite warning.

```sh
node demo-lab/run-trustgate.mjs
node demo-lab/trustgate-fixtures.mjs
node --test demo-lab/trustgate.test.mjs
```

The fixture run prepares six synthetic cases. Three execute: a public policy query, an internal supplier-summary review draft, and a public note staged in a **local SQLite outbox**. Three remain blocked: internal pricing in a public sink, an instruction-marked document, and an untrusted target case identifier. The resulting database contains one internal task, one local note, and 11 chained audit events. Nothing is published or sent.

The standalone fixture runner uses an in-memory database. The web lab's TrustGate view uses the server-owned gateway and exposes proposals, source provenance, independent review, effects, receipt history and audit verification. All displayed people, organizations, policy text, delivery data and prices are synthetic fixtures.

## The three tools

| Tool | Required bound arguments | Actual effect | Review |
| --- | --- | --- | --- |
| `read-public-policy` | `policyId` | Parameterized SQL query of the fixed public policy row | Read-only; may execute after preparation |
| `create-review-task` | `caseId`, `title`, `summary` | SQL insert into the internal draft table | Independent configured local reviewer |
| `stage-public-note` | `caseId`, `title`, `body` | SQL insert into the local public outbox | Independent configured local reviewer |

The registry contains no generic callback, shell, browser, URL, email, network, payment or provider tool. Proposals cannot add a tool or supply free argument values. Each argument must bind to one existing string value in the fixed server-owned source registry. Unknown fields, prototype-related keys, unknown sources, incomplete schemas and cross-tenant bindings fail before a proposal is persisted.

Each binding resolves to its value and records the source ID, key, source hash, trust, classification and instruction flag. Target case and policy identifiers require trusted user intent. Untrusted document content is permitted only as a summary inside an independently reviewed internal draft. Instruction-marked sources remain blocked in every argument. Internal-classified values cannot enter either public sink. A reviewer cannot override these policy blocks.

## Durable lifecycle

```js
import { openTrustGate } from './demo-lab/trustgate-core.mjs';

const gateway = openTrustGate('trustgate.sqlite');
try {
  const proposal = gateway.catalog().scenarios.find((item) => item.id === 'reviewed-task').proposal;
  const prepared = gateway.prepare({ ...proposal, commandId: 'local-reviewed-task-001' });
  const reviewed = gateway.review({
    tenant: prepared.tenant,
    receiptId: prepared.id,
    reviewer: 'acme-reviewer',
    decision: 'approve',
    note: 'Synthetic supplier summary checked against the displayed source.',
    expectedHash: prepared.proposalHash,
  });
  const executed = gateway.execute({ tenant: reviewed.tenant, receiptId: reviewed.id });
  console.log(executed.effect, gateway.verifyAudit({ tenant: prepared.tenant }));
} finally {
  gateway.close();
}
```

`prepare` produces `blocked`, `pending_review` or `ready`. A mutation can become `ready` only after an independent reviewer approves its immutable proposal hash. Rejection is terminal. The actor cannot approve their own proposal, even when the configured actor also has a reviewer role. Reviews contain the proposal and policy hashes; review decisions cannot be rewritten.

**Actor and reviewer selections are demonstration selectors, not authenticated identities.** Anyone who can operate this local demo can select a configured identity. The independent-review rule illustrates the state transition; it is not evidence of two authenticated humans or separation of duties in production.

Execution checks the current implementation, policy configuration, source snapshot, grants, review and audit integrity again. It resolves arguments and provenance again rather than trusting stored proposal data. The transaction uses `BEGIN IMMEDIATE`; the receipt update, SQL effect and audit append either commit together or roll back together. The tenant and command ID form a unique identity. Repeating an identical command reuses the receipt; changing its payload under the same identity fails. Repeating execution returns the recorded effect without another insert or audit event.

File-backed storage preserves prepared reviews, effects and replay across process restarts. Two independent processes executing the same approved receipt serialize through SQLite and produce one effect. This demonstrates one local SQLite database, not cross-service exactly-once delivery.

## Configuration and evidence integrity

The optional factory settings are server-owned `policyVersion` and `fixtureRevision` (`v1` or `v2`). They are not HTTP proposal inputs. A new configuration activates its hash in that database, making receipts from a different configuration stale. The fixture revision changes the registered public source text. An old gateway instance cannot keep writing after another instance activates a different configuration.

The implementation hash is captured when the module loads and checked against the actual module file during use. Editing that file blocks execution and prevents a new factory from presenting the old loaded implementation as current. A process restart loads the new code; receipts prepared under the old code remain stale. This covers this gateway implementation and its fixed registry, not arbitrary upstream application code or every file in the repository.

Every preparation, review and execution appends a SHA-256 hash-chained event. Verification checks chain order, stored head, complete receipt hashes, immutable proposal hashes, command-envelope columns, recorded effect bodies and the fixed SQL policy content. Ordinary direct SQL edits, deleted audit tails, forged approval fields, altered source bindings, modified effects and malformed persisted records fail integrity checks and prevent further preparation, review or execution in that tenant.

The chain is **not a signature, authorization mechanism or protection against a database administrator who rewrites the records, chain and head coherently**. Runtime configuration and the database remain trusted local storage. Receipt, history and state reads verify integrity inside a consistent SQLite read transaction and refuse altered records. Raw audit events and `verifyAudit` remain available for diagnosis. Integrity and freshness are separate: an intact historical receipt may still have `stale: true` after configuration or code changes, and must not be presented as current authorization.

## Programmatic interface

`trustGate(db, options?)` uses a caller-owned `DatabaseSync` and never closes it. `openTrustGate(path = ':memory:', options?)` owns its database and supplies `close()`.

| Method | Input or output |
| --- | --- |
| `catalog()` | Tools, actors, sources, scenarios, scope, active policy hash/version and fixture revision |
| `prepare({ tenant, commandId, actor, tool, bindings })` | Source-bound proposal; each binding is `{ sourceId, key }` |
| `review({ tenant, receiptId, reviewer, decision, note, expectedHash })` | `approve` or `reject` a pending mutation |
| `execute({ tenant, receiptId })` | Execute an eligible receipt or return its existing effect |
| `receipt({ tenant, receiptId })` | One receipt with computed `stale` and `replayed` flags |
| `history({ tenant })` | `{ receipts }` |
| `state({ tenant })` | `{ tasks, publicNotes }` |
| `audit({ tenant })` | `{ events }` |
| `verifyAudit({ tenant })` | `{ valid, errors, eventCount, headHash }` |

Receipts include tenant, command ID, actor, tool, bindings, resolved arguments, field provenance, status, policy reasons, proposal hash, policy hash, review and any actual effect. The two supported demo tenants are `acme` and `beta`. This is logical tenant filtering in a local demo with visible selectors, not authenticated tenant isolation.

The targeted suite covers the legitimate lifecycle, field provenance, tool scopes, cross-tenant requests, schema/prototype rejection, classification and instruction policies, self-review and approval bypass, immutable review hashes, rejection, repeat commands, receipt/effect/audit tampering, SQL policy drift, transaction rollback, real file restart, concurrent processes and policy/source/code drift. Re-run tests and the repository governor after changes; a checked-in description is not fresh execution evidence.

## Still pending in the full blueprint

Authenticated users and reviewers, tamper-resistant remote audit storage, production tenancy and operational limits, trusted ingestion of real source labels, end-to-end agent taint tracking, an instruction detector or model screener, adversarial benchmark evaluation, external tool connectors, provider acceptance and production deployment remain unimplemented. No model calls, benchmark scores, provider outcomes or production security results are claimed by this slice.

## Fixed synthetic challenge

The [separately AI-authored acceptance challenge](TRUSTGATE-CHALLENGE.md) runs actual benign/adversarial command sequences in disposable SQLite databases and exposes each expected versus observed result. Open `/tool-challenge?project=TrustGate` or run `node demo-lab/run-trustgate-challenge.mjs`. This tests fixed declared policies; it does not complete general injection detection or external security acceptance.
