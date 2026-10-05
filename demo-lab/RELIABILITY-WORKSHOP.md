# Reliability workshop

Run the existing local lab and open `/workshop`. It exposes business passports for all 27 automation projects and a durable shared contact-handoff lifecycle. Domain policy remains separate: follow **Open business demo** to execute the relevant domain module or local n8n wrapper.

1. Select a project and submit a synthetic event. Strict consent, tenant/project identity and contact validation precede storage. Extra contact notes are discarded.
2. Inspect the minimal proposed payload and source hashes; acknowledge and record a reviewer label. Labels are not authenticated accounts.
3. Simulate success, a confirmed failure before an effect, or a lost acknowledgement after a local effect.
4. A confirmed failure permits one retry. Two failed attempts stop. An uncertain outcome blocks another attempt until reconciliation confirms the existing local effect.
5. Export confirmed evidence. Changed source components block review, replay, execution, reconciliation and export; create a fresh event for the current revision.

SQLite stores intents, unique per-intent effects and append-only application events. Immediate transactions preserve atomic local state transitions. Restart retains receipts and uncertainty. Repeated event identities retrieve the original receipt; changed minimized payloads conflict. No network provider is called. This verifies one persisted local effect per intent, not distributed exactly-once delivery or authenticated authorization.

Source manifests hash the explicitly listed business source, handoff contract, wrapper and available deeper evaluators, plus the reliability controller and passport manifest. They do not discover the complete transitive dependency graph. Byte hashes may differ across line-ending conversions. Use the exact checkout bytes when comparing receipts.

`node --test demo-lab/reliability.test.mjs demo-lab/workshop-ui.test.mjs` verifies project coverage, rejection without storage, duplicate/change handling, retry limits, unresolved reconciliation, restart, source invalidation, HTTP boundaries and browser state.

## Invoice controls strengthened in the same release

ACC-01 now rejects boolean, negative and nonfinite monetary/quantity values; validates required identities and a syntactically valid uppercase currency code; checks purchased quantity as well as received quantity; and uses decimal tolerance comparisons. Duplicate identity is now supplier plus invoice number, excluding mutable amount and currency. **Previously generated fingerprints use a different scheme and require reindexing from their source invoices before adopting this version.** The local sample has no persisted invoice ledger. Currency support, credit-note policies, authenticated bank-change approval and actual payment release remain outside this demonstration.

See [the ranked project roadmap](PORTFOLIO-ROADMAP.md) for the next flagships.
