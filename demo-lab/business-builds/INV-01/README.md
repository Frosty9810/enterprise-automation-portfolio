# INV-01 Bolt Supply Wholesale Reorder Desk

New bounded implementation for a fictional business.

## Business workflow

Audience: Wholesale purchasing teams.
Input: SKU stock, reservations, target and supplier pack size.
Output: Available stock and a proposed reorder quantity.
A buyer reviews the proposal; stale stock must be refreshed and no purchase is sent.

## Engineering decision

Subtract reservations and round replenishment to supplier pack sizes while routing stale stock to refresh.

Source: ../../business-expansion.mjs. Tests: ../../business-expansion.test.mjs. Workflow: ../../workflows/INV-01.json. GHL setup proposal: ../../blueprints/INV-01.json.

## Operate and recover

Start the local lab and select INV-01. Run the demo, then inspect the business evaluation cases before the separate contact result. The server persists run evidence in SQLite. The synthetic contact replay reuses email/location identity; business actions themselves are not executed or made idempotent by that contact key.

On a failed run, preserve its error and inspect the source output. Correct the input or configuration and rerun; do not treat an unknown external result as permission to repeat a side effect. No external action worker is included.

## Verification

5 bundled business cases plus independent boundary checks in the test file. These are authored fixtures, not production performance evidence. Run node --test demo-lab/business-expansion.test.mjs from the repository root.

## Outcome to measure

Buyer review time and stockout frequency. No client baseline or improvement is claimed.

## Remaining integration work

Connect the intended source system in a dedicated test environment, enforce authenticated ownership, implement durable event/version controls and observe recovery under real provider failures. Proposed vendor mappings require provider-specific verification.
