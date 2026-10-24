# ECOM-03 — Catalog & Inventory Reconciliation

**Complexity:** Advanced  
**Context:** Illustrative Shopify, ERP, and warehouse integration  
**Artifacts:** [Runnable implementation](build/README.md)

## Job to be done

Reconcile sellable inventory and catalog identity across Shopify, the ERP, and the warehouse without overwriting a correct value when systems disagree.

## Flow

`Scheduled snapshots → normalize SKU/location keys → compare three sources → apply authority matrix → write safe corrections → quarantine ambiguous conflicts → verify downstream state → audit`

## System boundary

The warehouse owns on-hand quantity, the ERP owns reserved and inbound quantities, and Shopify owns storefront publication state. The reconciler derives sellable quantity and coordinates corrections; it does not become a fourth inventory system.

## Technical core

The implementation is a three-way reconciliation engine with field-level source authority, staleness checks, tolerance bands, and an idempotent correction key. It distinguishes `aligned`, `safe_correction`, and `quarantine` instead of treating every mismatch as an update.

## Hard constraint

No inventory write is allowed if authoritative inputs are stale, a SKU mapping is missing, or two sources claim authority for the same field.

## Decision and tradeoff

Use a field-level authority matrix instead of “latest timestamp wins.” This requires governance up front, but avoids a delayed warehouse event overwriting a valid reservation or storefront safety buffer.

## Reliability and cost controls

- Snapshot watermarks detect partial extracts.
- Corrections use `sku + location + source_versions` as an idempotency key.
- A post-write read verifies Shopify state before closing the incident.
- Large quantity deltas and negative sellable values are quarantined.
- Batch size and write rate are bounded per market to respect API limits.

## What was cut

Automatic creation of unknown SKUs was excluded. Mapping a new product identity has accounting, tax, fulfillment, and merchandising consequences outside the reconciler’s authority.

## Acceptance tests

1. Aligned records produce no write.
2. A fresh warehouse/ERP pair safely corrects stale Shopify stock.
3. Missing mappings or stale authoritative data produce quarantine records.
4. Replaying a reconciliation window cannot duplicate a correction.


## Engineering amendment — 8 September 2026

Revision 2026-09-08: Python artifacts were linted/formatted and local demos rerun. UTC defaults and usage timestamp normalization were repaired where applicable. Original n8n/API/database execution remains a separate acceptance gate; prior narrative production claims are not verified by local checks. See the root portfolio audit and the project showcase package for current evidence.
