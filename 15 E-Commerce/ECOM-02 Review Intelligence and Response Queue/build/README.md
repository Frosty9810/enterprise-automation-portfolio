# ECOM-02 build

The [SOP](../SOP.md) is backed by a runnable rules-first review router and an importable workflow.

## Files

- `review_router.py` — returns queue, priority, SLA, automation permission, and explainable reasons.
- `n8n-workflow.json` — receives a review, evaluates safety before AI, records the decision, and branches to escalation or response approval.
- `schema.sql` — idempotent review events, decisions, response approvals, product issue clusters, and publication receipts.

## Run

```powershell
python review_router.py
```

The fixtures cover a safe five-star review, a safety concern, and a product defect. A production classifier may enrich language and theme labels, but cannot override the safety gate or publishing permission.
