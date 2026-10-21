# OPS-01 ClearSlot Booking Handoff Recovery Desk

New bounded implementation for a fictional business.

## Business workflow

Audience: Service business operators.
Input: An event identity, HTTP status, attempt count and write certainty.
Output: A retry delay or reconciliation and operator queue.
This build proposes recovery steps; it does not schedule appointments or execute background retries.

## Engineering decision

Treat uncertain writes separately from retryable failures and stop at an attempt limit.

Source: ../../business-expansion.mjs. Tests: ../../business-expansion.test.mjs. Workflow: ../../workflows/OPS-01.json. GHL setup proposal: ../../blueprints/OPS-01.json.

## Operate and recover

Start the local lab and select OPS-01. Run the demo, then inspect the business evaluation cases before the separate contact result. The server persists run evidence in SQLite. The synthetic contact replay reuses email/location identity; business actions themselves are not executed or made idempotent by that contact key.

On a failed run, preserve its error and inspect the source output. Correct the input or configuration and rerun; do not treat an unknown external result as permission to repeat a side effect. No external action worker is included.

## Verification

5 bundled business cases plus independent boundary checks in the test file. These are authored fixtures, not production performance evidence. Run node --test demo-lab/business-expansion.test.mjs from the repository root.

## Outcome to measure

Unresolved handoff age and duplicate booking incidents. No client baseline or improvement is claimed.

## Remaining integration work

Connect the intended source system in a dedicated test environment, enforce authenticated ownership, implement durable event/version controls and observe recovery under real provider failures. Proposed vendor mappings require provider-specific verification.
