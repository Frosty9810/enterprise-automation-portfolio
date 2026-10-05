# Gabriel Acosta — automation engineering showcase

Start with RE-01 for lead operations, ECOM-01 for policy enforcement, ACC-01 for finance controls, and IMP-01 for governed agent architecture. Each package links its existing implementation and adds a reproducible n8n/GHL relationship handoff.

There are 17 source-backed projects. The 17 new workflows are **contact preview demos**, distinct from the 16 original business workflows. GHL blueprints are setup instructions, not deployed builds or native snapshots. All recordings and live API acceptance remain pending.

**[Open the local demo lab](../demo-lab/README.md):** real n8n execution now covers these 17 projects plus two new bounded examples. The lab's GHL endpoint is a local simulator. The original builds are cleaned client-work showcase copies, as confirmed by the owner; the current execution evidence uses synthetic fixtures.

| Package | Business project | GHL relationship | Evidence |
|---|---|---|---|
| [RE-01](RE-01/README.md) | Speed-to-Lead Response and Drip Nurture Engine | Buyer relationship | Local demo; live pending |
| [RE-02](RE-02/README.md) | Transaction Coordination and Compliance Automation | Transaction stakeholder | Local demo; live pending |
| [RE-03](RE-03/README.md) | AI-Powered Lead Qualification and Scoring Engine | Qualified lead | Local demo; live pending |
| [RE-04](RE-04/README.md) | CRE Deal Pipeline and Comp Analysis Automation | Deal sponsor | Local demo; live pending |
| [REC-01](REC-01/README.md) | Candidate Consent Matching and Interview Operations | Recruiter client contact | Local demo; live pending |
| [MKT-01](MKT-01/README.md) | Multi-Channel Ad Operations Control Plane | Agency client contact | Local demo; live pending |
| [SAAS-01](SAAS-01/README.md) | Trial-to-Paid Conversion and Usage Nurture Engine | Trial account owner | Local demo; live pending |
| [SAAS-02](SAAS-02/README.md) | Automated Dunning and Failed-Payment Recovery Engine | Billing contact | Local demo; live pending |
| [SAAS-03](SAAS-03/README.md) | Churn Prediction and Proactive CS Intervention System | Customer success contact | Local demo; live pending |
| [SAAS-04](SAAS-04/README.md) | Usage-Based Billing Reconciliation and RevRec Pipeline | Finance account owner | Local demo; live pending |
| [ECOM-01](ECOM-01/README.md) | Multi-Market Product Content Governance | Merchant stakeholder | Local demo; live pending |
| [ECOM-02](ECOM-02/README.md) | Review Intelligence and Response Queue | Merchant review owner | Local demo; live pending |
| [ECOM-03](ECOM-03/README.md) | Catalog Inventory Reconciliation | Inventory operations owner | Local demo; live pending |
| [ECOM-04](ECOM-04/README.md) | Support Routing and SLA Control | Support account owner | Local demo; live pending |
| [ACC-01](ACC-01/README.md) | Accounts Payable Match and Cash Control | Vendor relationship owner | Local demo; live pending |
| [CS-01](CS-01/README.md) | Support Quality and Knowledge Feedback Loop | Support quality owner | Local demo; live pending |
| [IMP-01](IMP-01/README.md) | Import Company Agent Operating System | Commercial counterpart | Local demo; live pending |

## Share and evaluate

- [Engineering evidence and runbook](../37%20Testing/README.md)
- [Claude Code / Codex project examples](../20%20Claude%20Code/README.md)
- [Integration setup and failure behavior](../integrations/ghl-n8n/README.md)
- [GitHub audit and restructuring decisions](../PORTFOLIO-AUDIT-2026-09-08.md)

Generate these packages with `python scripts/build_showcase.py`; CI checks for drift with `--check`. The same tested JavaScript function is embedded into every demo.

---
Part of the [Enterprise Automation Portfolio](../README.md).
