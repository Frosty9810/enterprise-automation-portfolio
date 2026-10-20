# Dunning proposal replay contract

The Python state machine is a local planner. `advance_case` records each proposed cadence stage once in the returned case. Persist that case before evaluating it again. Repeated ticks leave its history unchanged; earlier cadence ticks cannot regress it. Suspended, recovered and paused cases propose no additional work. A tick before the failure proposes nothing. Both naive timestamps (legacy demos) and aware timestamps are accepted, but their awareness must match.

An Enterprise case proposes CSM creation only when it has neither a task ID nor a recorded creation proposal. This also covers a first tick arriving after day 14. The Enterprise stage continues to defer suspension to a human. Missed earlier email stages are not backfilled when the first tick arrives later in the cadence.

The returned action and audit entry represent a **proposal**, not a provider receipt. This does not provide exactly-once email, SMS, CRM task creation or subscription writes. Production delivery needs atomic state/outbox persistence, provider idempotency, delivery receipts, explicit retry/reconciliation and authorization. If a proposal fails remotely, reconcile its receipt and retry through that delivery layer rather than resetting the cadence state. The n8n export is a separate implementation and has not been changed or accepted against providers by this patch.

From the repository root, run `python -m unittest discover -s tests -p test_dunning_replay.py -v`. Tests cover stage replays, stale ticks, future failures, Enterprise receipts, late first ticks, terminal states, input immutability and timezone mismatch.
