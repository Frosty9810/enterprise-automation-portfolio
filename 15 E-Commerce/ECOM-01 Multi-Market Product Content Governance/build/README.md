# ECOM-01 build

This folder is an executable reference implementation of the governance boundary in the [SOP](../SOP.md).

## Files

- `localization_engine.py` — typed source/candidate contracts, idempotency key, protected-fact and unsupported-claim validation, and publish routing.
- `n8n-workflow.json` — importable orchestration graph from Shopify webhook through policy decision, approval, and audit.
- `schema.sql` — PostgreSQL records for source revisions, locale jobs, findings, approvals, and publish receipts.

## Run

```powershell
python localization_engine.py
```

The demo emits one safe Spanish candidate and one blocked German candidate. No key or package is required. In production, replace candidate construction with a schema-constrained OpenAI or Claude adapter; keep the validator and publication credential separate.

## Live configuration

Set Shopify credentials, database credentials, model credentials, locale glossary versions, and publication allowlists in the deployment secret/configuration layer. Never place them in the workflow export.
