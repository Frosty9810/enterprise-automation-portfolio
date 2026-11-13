# MKT-01 build

- `ad_control.py` normalizes pacing/ROAS and emits evidence-backed, approval-only recommendations.
- `n8n-workflow.json` ingests platform snapshots, calls the policy service, persists the result, and opens an approval task.
- `schema.sql` stores immutable snapshots, recommendations, approvals, and action receipts.

Run `python ad_control.py`. Fixtures are synthetic; live Meta/Google credentials are not included.

## Canonical snapshot contract

The Python reference accepts nonblank platform/campaign identifiers and finite, nonnegative integer/float metrics, excluding booleans and coercible strings. Budget and elapsed ratio must be positive; elapsed ratio and attribution completeness must be at most one. These are canonical gross snapshot inputs: refunds/negative adjustments need a separate reconciliation contract.

Invalid inputs or unrepresentable derived ratios produce `data_quality_review` before recommendations, with JSON-safe snapshot values, an explicit reason, no analysis key and no derived metrics. Incomplete attribution retains precedence over optimization. Both review outcomes require human approval; every result explicitly denies automatic budget changes. Zero spend remains an undefined ROAS with a defined pacing ratio, rather than an invented return.

A positive numerator that underflows to a zero ROAS/pacing quotient is unrepresentable and held; genuine zero revenue/spend retains its defined behavior. Integral floats are canonicalized through their exact integer value, including values above 2^53, so equivalent inputs share a key and rounded display strings cannot collide with a different integer. Recompute any cached ad-v2 identities created from affected large integral floats before comparison; this remains an analysis fingerprint, not provider-action authority.

`analysis_version: ad-review-v2` and the versioned `idempotency_key` cover all decision-relevant fields, including budget, elapsed time, baseline ROAS and attribution completeness. Equivalent integer/float values share an identity. This key identifies the full local analysis snapshot; it does not prove event identity or prevent duplicate provider actions. Consumers of the previous four-field key must migrate/recompute cached analysis identities.

Run `python -m unittest discover -s tests -p test_ad_metric_contract.py -v` from the repository root. The n8n export, database adapter and live Meta/Google acceptance are separate implementations; they are not certified by these local Python checks.

## Run the synthetic n8n review workflow

Import [n8n-fixture-workflow.json](n8n-fixture-workflow.json) into n8n and execute the Manual Trigger. From the repository root with the demo lab dependencies installed, the equivalent local commands are:

```powershell
node demo-lab/n8n.mjs import:workflow --input="13 Marketing Agencies/MKT-01 Multi-Channel Ad Operations Control Plane/build/n8n-fixture-workflow.json"
node demo-lab/n8n.mjs execute --id=PortfolioMkt0011 --rawOutput
```

Inspect the four items from **Route for review**. The underpacing fixture requests optimization review, incomplete attribution requests data quality review, healthy metrics route to monitoring, and string-valued spend requests data quality review. The workflow accepts integer cents and basis points within explicit bounds. It rejects invalid rows before deriving ratios, and every result sets automatic budget changes to false.

This manual fixture workflow runs three JavaScript Code nodes and uses bundled data. It covers a bounded subset of the ad review policy. The Python reference also handles its broader numeric snapshot contract and analysis fingerprints. The existing scheduled provider workflow, live advertising sources, persistence and approval-queue integration have their own setup and acceptance requirements.
