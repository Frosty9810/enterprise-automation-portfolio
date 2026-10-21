# MKT-01 build

- `ad_control.py` normalizes pacing/ROAS and emits evidence-backed, approval-only recommendations.
- `n8n-workflow.json` ingests platform snapshots, calls the policy service, persists the result, and opens an approval task.
- `schema.sql` stores immutable snapshots, recommendations, approvals, and action receipts.

Run `python ad_control.py`. Fixtures are synthetic; live Meta/Google credentials are not included.

## Canonical snapshot contract

The Python reference accepts nonblank platform/campaign identifiers and finite, nonnegative integer/float metrics, excluding booleans and coercible strings. Budget and elapsed ratio must be positive; elapsed ratio and attribution completeness must be at most one. These are canonical gross snapshot inputs: refunds/negative adjustments need a separate reconciliation contract.

Invalid inputs or unrepresentable derived ratios produce `data_quality_review` before recommendations, with JSON-safe snapshot values, an explicit reason, no analysis key and no derived metrics. Incomplete attribution retains precedence over optimization. Both review outcomes require human approval; every result explicitly denies automatic budget changes. Zero spend remains an undefined ROAS with a defined pacing ratio, rather than an invented return.

`analysis_version: ad-review-v2` and the versioned `idempotency_key` cover all decision-relevant fields, including budget, elapsed time, baseline ROAS and attribution completeness. Equivalent integer/float values share an identity. This key identifies the full local analysis snapshot; it does not prove event identity or prevent duplicate provider actions. Consumers of the previous four-field key must migrate/recompute cached analysis identities.

Run `python -m unittest discover -s tests -p test_ad_metric_contract.py -v` from the repository root. The n8n export, database adapter and live Meta/Google acceptance are separate implementations; they are not certified by these local Python checks.
