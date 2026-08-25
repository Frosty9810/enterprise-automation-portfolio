# Real Estate

> Status: **Populated** — 4 of a planned 15–20 projects delivered (2 Intermediate, 2 Advanced), each with a verified real build

## Purpose

Enterprise automation projects for brokerages, agents, and real estate investment operations — residential and commercial. All four projects below share the same illustrative deployment context so the architecture reads as one coherent, evolving system rather than disconnected demos. Each project is backed by a real, working build (importable n8n workflow, runnable script, executable SQL schema) — see each project's `/build/` folder.

## Reference Deployment Context

**Harborview Realty Partners** — a 140-agent residential brokerage operating 6 offices in a mid-size metro market.
**Harborview Commercial Advisors** — Harborview's commercial (CRE) division, ~18 brokers across office/industrial/retail, running on Salesforce rather than the residential division's Close/GoHighLevel stack — a deliberate platform-selection decision documented in RE-04.

This is an illustrative reference scenario, not a documented real client engagement — see [`49 Internal Standards`](../49%20Internal%20Standards/README.md) Sections 2 and 9 for why. What makes each project real is its `/build/` folder, not the client name.

## Projects

| ID | Project | Tier | Tool Stack | Real Build | Video |
|---|---|---|---|---|---|
| [RE-01](RE-01%20Speed-to-Lead%20Response%20and%20Drip%20Nurture%20Engine/SOP.md) | Speed-to-Lead Response & Multi-Channel Drip Nurture Engine | Intermediate | GoHighLevel, n8n, Twilio, Close CRM, PostgreSQL | [build/](RE-01%20Speed-to-Lead%20Response%20and%20Drip%20Nurture%20Engine/build/README.md) ✅ verified | Pending |
| [RE-02](RE-02%20Transaction%20Coordination%20and%20Compliance%20Automation/SOP.md) | Transaction Coordination & Compliance Document Automation | Intermediate | Make.com, Dotloop, Close CRM, Twilio, PostgreSQL, Google Workspace | [build/](RE-02%20Transaction%20Coordination%20and%20Compliance%20Automation/build/README.md) ✅ verified | Pending |
| [RE-03](RE-03%20AI-Powered%20Lead%20Qualification%20and%20Scoring%20Engine/SOP.md) | AI-Powered Buyer/Seller Lead Qualification & Cross-Platform Scoring Engine | Advanced | Claude API, n8n, GoHighLevel, Close CRM, PostgreSQL, Slack | [build/](RE-03%20AI-Powered%20Lead%20Qualification%20and%20Scoring%20Engine/build/README.md) ✅ verified | Pending |
| [RE-04](RE-04%20CRE%20Deal%20Pipeline%20and%20Comp%20Analysis%20Automation/SOP.md) | Commercial Real Estate Deal Pipeline & AI Comp Analysis Automation | Advanced | n8n, Claude API, Salesforce, PostgreSQL, AWS S3 | [build/](RE-04%20CRE%20Deal%20Pipeline%20and%20Comp%20Analysis%20Automation/build/README.md) ✅ verified | Pending |

"✅ verified" means: the n8n workflow JSON was parsed and its node graph confirmed fully connected, the Python script was actually executed and produced correct output, and the SQL schema was parsed against a real PostgreSQL grammar parser — not just visually inspected.

## How These Projects Connect

RE-01 captures and nurtures inbound leads; RE-03 sits directly downstream of RE-01 and adds AI-driven intent classification and scoring on top of the same lead flow; qualified deals that go under contract flow into RE-02 for transaction coordination. RE-04 is a separate, Salesforce-based engagement for Harborview's commercial division, cross-referenced but architecturally independent.

## Remaining Backlog

11–16 additional projects remain to reach the 15–20 target for this vertical (e.g., listing syndication, open-house-to-close automation with voice AI, referral/past-client reactivation, property valuation model automation, luxury concierge workflows). Add to [`MASTER-INDEX.md`](../MASTER-INDEX.md) as they're scheduled.

---
*Part of the Enterprise Automation Portfolio. See root [README.md](../README.md) for navigation.*
