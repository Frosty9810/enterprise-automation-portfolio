# ECOM-04 build

The [SOP](../SOP.md) is backed by a deterministic-first router with PII redaction.

## Files

- `support_router.py` — redacts common identifiers before classification, applies policy routes, and computes SLA deadlines.
- `n8n-workflow.json` — receives helpdesk events, redacts/normalizes them, writes the route, and sends bounded context to the appropriate queue.
- `schema.sql` — ticket event hashes, route decisions, SLA timers, escalations, and outcome labels.

## Run

```powershell
python support_router.py
```

The source message is not retained in the result; only a redacted classifier input and decision metadata are emitted. In production, the helpdesk keeps the original ticket and the automation database stores the minimum operational record.
