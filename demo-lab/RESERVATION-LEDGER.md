# Durable local reservation ledger

Backlog item 11: Commitments & Scheduling Review Board. The existing F11 engine evaluates candidate windows. The new SQLite library makes actual **local** reservations with atomic conflict checks, replay receipts, revision-bound cancellation and an audit trail. It does not access a provider calendar or dispatch a vendor.

```sh
node demo-lab/run-reservations.mjs
node --test demo-lab/reservation-ledger.test.mjs demo-lab/reservation-ui.test.mjs
```

At `/flagships#F11`, the first table analyzes the edited candidate slots. A separately labeled, fixed synthetic calendar exercise then reserves a window, holds an overlapping request, replays the original request without a new effect, cancels it and reserves the released window. This exercise creates a fresh in-memory database per evaluation; **it does not reserve the candidate slots**. File-backed restart and competing-process behavior are verified by the separate regression tests, not inferred from this browser exercise.

## Library contract

Pass a caller-owned Node 24 `DatabaseSync` connection to `reservationDesk(db)`. The caller opens/closes the connection and must not wrap calls in an ambient transaction. Tables are prefixed `local_reservation*`. Initialize against a new disposable local database; no existing calendar migration is provided. The library sets foreign keys and a five-second busy timeout, and obtains `BEGIN IMMEDIATE` before checking existing commands/conflicts or writing. Reservation, command receipt and audit writes commit together. An audit failure rolls back all three.

- `reserve({tenant, resourceId, requestId, start, end, asOf, bufferMinutes, reviewed, reviewerLabel})`: bounded nonblank opaque IDs, explicit-offset ISO timestamps, start before end and integer buffer 0–120. A supplied past window is held. Review acknowledgement must be boolean true; a label is required.
- `cancel({tenant, requestId, reservationId, expectedRevision, reviewed, reviewerLabel})`: checks the tenant-scoped reservation and exact positive revision before changing active to cancelled and incrementing its revision. Stale revisions and unknown reservations fail without a receipt/effect. Already-cancelled records with their current revision produce a zero-effect result.
- `state(tenant, resourceId)`: current local records for that scope. `audit(tenant)`: ordered command outcomes and supplied reviewer labels for that tenant. Labels may be identifying; keep this demonstration synthetic.

Each reservation occupies the half-open interval `[start-buffer, end+buffer)`. Touching occupied endpoints are allowed; intersecting intervals on the same tenant/resource are held. Both reservations' buffers count. The lock covers the overlap read and insert, so independently opened processes cannot both win the same window. Cancellation preserves history and releases the occupied interval.

The request key is unique **per tenant across reserve/cancel operations**. A canonical retry, including equivalent timestamp offsets, returns its original receipt with `replayed: true` and `newLocalEffects: 0`. Reusing the key with changed content, review label or operation rejects. Held receipts are historical outcomes: after a conflicting booking is cancelled, submit a new request ID for a fresh decision. Replayed successful receipts also remain historical; use `state()` to inspect current status. `localEffects` counts the original operation; `newLocalEffects` counts this call.

## Evidence and limits

The tests use real file-backed SQLite connections closed/reopened across reserve/cancel, plus two independent Node processes released through a start gate to compete for one window. They cover tenant/resource separation, half-open/buffer boundaries, stale revisions, failed-audit rollback, conflicting replays, malformed/unreviewed requests and zero-effect retries. This is application-level SQLite persistence/concurrency evidence, not crash/power-loss certification or external-calendar acceptance.

Tenant IDs, reviewer labels and `asOf` are supplied by the local caller. They are **not authentication, verified time, access-control credentials or real operational approval**. The browser's separate script uses an explicitly labeled synthetic reviewer. Do not expose this library directly as a production API. IANA timezone conversion, authenticated calendar ownership, retention policy, provider idempotency/reconciliation, process-crash testing and live dispatch remain separate work. All external actions stay zero.
