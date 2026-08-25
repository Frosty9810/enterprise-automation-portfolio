# MKT-01 build

- `ad_control.py` normalizes pacing/ROAS and emits evidence-backed, approval-only recommendations.
- `n8n-workflow.json` ingests platform snapshots, calls the policy service, persists the result, and opens an approval task.
- `schema.sql` stores immutable snapshots, recommendations, approvals, and action receipts.

Run `python ad_control.py`. Fixtures are synthetic; live Meta/Google credentials are not included.
