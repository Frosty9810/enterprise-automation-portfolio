# SaaS

> Status: **Populated** — 4 of a planned 15–20 projects delivered (2 Intermediate, 2 Advanced), each with a verified real build

## Purpose

Enterprise automation projects for SaaS companies across trial conversion, billing operations, and customer success. All four projects below share the same illustrative deployment context so the architecture reads as one coherent system rather than disconnected demos — they share a common usage-event data pipeline and increasingly plug into each other. Each project is backed by a real, working build (importable n8n workflow, runnable script, executable SQL schema) — see each project's `/build/` folder.

## Reference Deployment Context

**Atlas Metrics** — a B2B product analytics SaaS company, ~1,800 active accounts, hybrid seat + metered-usage pricing, product-led-growth motion with sales-assist for high-intent accounts, 14-day free trial.

This is an illustrative reference scenario, not a documented real client engagement — see [`49 Internal Standards`](../49%20Internal%20Standards/README.md) Sections 2 and 9 for why. What makes each project real is its `/build/` folder, not the client name.

## Projects

| ID | Project | Tier | Tool Stack | Real Build | Video |
|---|---|---|---|---|---|
| [SAAS-01](SAAS-01%20Trial-to-Paid%20Conversion%20and%20Usage%20Nurture%20Engine/SOP.md) | Trial-to-Paid Conversion & Usage-Triggered Nurture Engine | Intermediate | n8n, HubSpot, Close CRM, Stripe, PostgreSQL | [build/](SAAS-01%20Trial-to-Paid%20Conversion%20and%20Usage%20Nurture%20Engine/build/README.md) ✅ verified | Pending |
| [SAAS-02](SAAS-02%20Automated%20Dunning%20and%20Failed-Payment%20Recovery%20Engine/SOP.md) | Automated Dunning & Failed-Payment Recovery Engine | Intermediate | Make.com, Stripe, HubSpot, Twilio, Close CRM, QuickBooks Online | [build/](SAAS-02%20Automated%20Dunning%20and%20Failed-Payment%20Recovery%20Engine/build/README.md) ✅ verified | Pending |
| [SAAS-03](SAAS-03%20Churn%20Prediction%20and%20Proactive%20CS%20Intervention%20System/SOP.md) | Churn Prediction & Proactive Customer Success Intervention System | Advanced | n8n, Python/scikit-learn, Claude API, PostgreSQL, Close CRM, HubSpot | [build/](SAAS-03%20Churn%20Prediction%20and%20Proactive%20CS%20Intervention%20System/build/README.md) ✅ verified | Pending |
| [SAAS-04](SAAS-04%20Usage-Based%20Billing%20Reconciliation%20and%20RevRec%20Pipeline/SOP.md) | Usage-Based Billing Reconciliation & Revenue Recognition Pipeline | Advanced | n8n, Stripe, PostgreSQL, QuickBooks Online, Slack | [build/](SAAS-04%20Usage-Based%20Billing%20Reconciliation%20and%20RevRec%20Pipeline/build/README.md) ✅ verified | Pending |

"✅ verified" means: the n8n workflow JSON was parsed and its node graph confirmed fully connected, the Python script was actually executed and produced correct output (SAAS-03's model was trained and scored live using real scikit-learn/SHAP), and the SQL schema was parsed against a real PostgreSQL grammar parser — not just visually inspected.

## How These Projects Connect

SAAS-01 and SAAS-03 share the same underlying usage-event pipeline, applied pre- and post-conversion respectively. A payment failure surfaced by SAAS-02 is itself an input signal into SAAS-03's churn model. SAAS-04 reconciles the same usage data that feeds SAAS-01's scoring against what Stripe actually invoices, and shares its QuickBooks Online integration pattern with SAAS-02.

## Remaining Backlog

11–16 additional projects remain to reach the 15–20 target for this vertical (e.g., product-led onboarding orchestration, expansion/upsell signal detection, NPS-triggered advocacy workflows, multi-tenant provisioning automation, support ticket triage with Claude). Add to [`MASTER-INDEX.md`](../MASTER-INDEX.md) as they're scheduled.

---
*Part of the Enterprise Automation Portfolio. See root [README.md](../README.md) for navigation.*
