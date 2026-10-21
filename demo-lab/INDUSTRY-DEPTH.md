# Maintenance dispatch and executive decision register

These are deeper, runnable local components for PM-01 and EA-01. They extend the original bounded scenarios; they do not establish that either complete industry flagship has shipped to a client.

## PM-01: a residential property operator

A synthetic tenant reports a dripping kitchen tap. The operator needs an approved plumber who can complete a sixty-minute visit within the tenant's approved access window. `maintenanceDispatch` checks deterministic emergency rules first, calculates ticket age and SLA breach, then intersects tenant access, approved vendor availability, required skill, duration and the evaluation timestamp. The earliest eligible appointment wins, with vendor identity as a stable tie-break. A human dispatcher must still approve it. Missing access, insufficient overlap and emergencies route to distinct review queues.

The fixture produces a noon-to-1 p.m. appointment proposal and exposes an already-breached routine SLA. No vendor is contacted, no appointment is reserved and `dispatchAllowed` remains false. This demonstrates rules before model calls, operational constraints, reproducible scheduling and an explicit human handoff. Exact interval boundaries, impossible dates, duplicate vendor IDs and unapproved vendors are tested.

Emergency keyword matching is a transparent demonstration, not comprehensive safety classification. Production expansion still needs validated emergency intake, tenant/lease records, approval authentication, transactional booking conflict protection, vendor APIs, durable work orders, escalation delivery and operator takeover verification. The component does not claim those capabilities.

## EA-01: a small executive operations team

A synthetic meeting commitment enters a SQLite decision register only when the assistant principal is included in the source access-control list. The source-plus-item identity prevents duplicate replay. Changed content under an existing identity produces a review event and preserves the original entry. Commitments and decisions share the register; confirmation requires an owner-matching attestation. A changed confirmation is treated as a conflicting version requiring review, rather than silently modifying an existing entry.

`openDecisionRegister(filename)` creates durable tables, a compound primary key, status constraints and an owner/status index. `ingest` validates the complete permitted batch before writing and commits entries and events together. Tests close and reopen a real temporary database to prove replay protection survives restart. The in-memory evaluator separately executes six explicit checks and never claims persistence from an in-memory run.

**Trust boundary:** `allowedReaders`, `principal`, `sourceId` and `confirmedBy` must come from a trusted connector or local configuration, not requester-supplied message fields. This demo accepts trusted synthetic inputs; it does not authenticate identities or verify provider ACLs. `entries()` and `events()` are internal operator interfaces, not permission-filtered public endpoints. Do not expose them directly to untrusted callers. Denied source bodies are neither parsed nor stored. Cross-source deduplication is intentionally excluded because similar text from different meetings can describe distinct obligations.

Production expansion still needs authenticated mailbox/calendar ingestion, connector-supplied sender/attendee permissions, permission-aware retrieval, revocation enforcement, authenticated confirmation transitions, due dates, follow-up delivery, retention controls and audit administration. No external message or model call is performed. Caller-supplied ACLs are useful fixtures, not evidence of a deployed authorization system.

## Run and integrate

```powershell
node --test demo-lab/industry-depth.test.mjs
```

`evaluateIndustryDepth('PM-01')` and `evaluateIndustryDepth('EA-01')` return `{projectId, evaluation: {passed, total, cases}, result, externalActions: 0}`. Each case contains `name` and boolean `passed`; a failing case also includes `error`. Integrations should check `passed === total`. Unsupported IDs throw.

For a durable synthetic demo, create `openDecisionRegister('.runtime/decision-register.sqlite')` from the demo-lab directory, ingest `depthFixtures.register`, inspect `entries()` and always call `close()`. Ensure the parent runtime directory already exists. The evaluator itself intentionally uses an isolated in-memory database so repeated acceptance checks are deterministic. The local store is independent of the GHL simulator and demonstrates a system-of-record boundary; it is not a hosted GHL integration.
