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
