# MKT-01 — Multi-Channel Ad Operations Control Plane

**Flow:** `Meta/Google snapshots → canonical metrics → attribution-quality gate → pacing/anomaly analysis → recommendation → approval → audit`  
**System:** Ad platforms remain systems of record; PostgreSQL owns normalized snapshots, decisions, approvals, and action receipts.  
**Hard constraint:** No workflow credential can mutate budget without a separate human approval token.

## Technical core

The implementation normalizes incompatible platform metrics, derives spend pacing against elapsed campaign time, and compares ROAS to a trailing baseline. Recommendations include evidence and confidence, not just an alert.

## Decision and tradeoff

Use a canonical metric contract and rules-based anomaly gate before optional AI explanation. This sacrifices some channel-specific nuance but produces comparable, testable signals.

## Reliability

Snapshots are versioned by platform, account, campaign, date, and source revision. Partial extracts are rejected, zero-attribution windows are marked unknown rather than treated as zero performance, and recommendation/action credentials are separated.

## What was cut

Automatic budget reallocation was cut because attribution lag can make a mathematically plausible recommendation financially unsafe.

## Acceptance tests

- Under-pacing and material ROAS decline produce a review recommendation.
- Low attribution completeness blocks a spend recommendation.
- A replayed snapshot cannot create a duplicate action.
- Model unavailability does not prevent deterministic anomaly detection.

## Takeover

Platform adapters, metric definitions, attribution thresholds, and approval policy are versioned independently. Replace an adapter without changing downstream decisions.


## Engineering amendment — 8 September 2026

Revision 2026-09-08: Python artifacts were linted/formatted and local demos rerun. UTC defaults and usage timestamp normalization were repaired where applicable. Original n8n/API/database execution remains a separate acceptance gate; prior narrative production claims are not verified by local checks. See the root portfolio audit and the project showcase package for current evidence.
