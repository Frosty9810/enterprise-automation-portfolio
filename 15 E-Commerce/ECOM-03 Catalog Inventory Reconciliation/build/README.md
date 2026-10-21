# ECOM-03 build

This is a runnable three-way reconciler for the [SOP](../SOP.md), not a diagram-only integration.

## Files

- `reconciliation_engine.py` — authority-aware derivation, staleness and tolerance gates, correction idempotency, and quarantine decisions.
- `n8n-workflow.json` — scheduled snapshot orchestration, decision branch, Shopify correction, post-write verification, and audit.
- `schema.sql` — SKU maps, source snapshots, reconciliation runs, conflicts, corrections, and verification receipts.

## Run

```powershell
python reconciliation_engine.py
```

The fixtures demonstrate aligned data, a safe correction, a large-delta quarantine, and a missing-map quarantine. Production adapters should page source APIs into immutable snapshots before invoking the same policy.

## Python intake and action identity

Before derivation, SKU/location/source versions must be nonblank strings, quantities must be nonnegative integers within PostgreSQL INTEGER range, snapshot age must be a nonnegative integer number of minutes and mapping must be an actual boolean. Booleans as quantities, fractions, negative values, NaN/infinity and coercible strings raise ValueError; derived values outside the schema's INTEGER range also fail intake. Adapters must catch these errors and retain a minimized intake-error receipt for review without issuing a correction. Invalid intake produces no decision or action key and cannot be inserted into the existing decisions table as a valid reconciliation result.

Valid records retain the existing policy: ages up to 30 minutes and absolute deltas up to 100 are eligible for a correction proposal; stale, unmapped, negative-sellable and excessive-delta records are quarantined. Every result declares `automatic_write_allowed: false`. The `safe_correction` label describes the local policy proposal, not authentication, source verification or permission to call Shopify. Snapshot age, versions and mapping are still supplied evidence that a real adapter must verify.

`correction_key` now uses `inventory-v2-` plus SHA-256 over an unambiguous JSON tuple of the opaque SKU, location, warehouse/ERP versions and derived target. Identifiers containing colons cannot alias another tuple. Repeated authoritative targets have the same key even if the observed Shopify quantity changes; do not reuse an immutable source version for changed content. The evaluation timestamp is intentionally fresh and is not part of action identity.

Keys differ from the legacy 20-character hash. Before using v2 against an existing provider or receipt store, reconcile historical pending/applied corrections and map their receipts to v2 identities; never replay old actions merely because the key format changed. No migration, PostgreSQL runtime or provider write is performed by this reference. The separate n8n export requires adapter alignment and provider acceptance. From the repository root run `python -m unittest discover -s tests -p test_inventory_input_contract.py -v`.
