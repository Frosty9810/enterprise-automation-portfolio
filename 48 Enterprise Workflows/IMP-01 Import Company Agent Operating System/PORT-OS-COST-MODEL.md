# PORT / OS — Cost Model, TCO, Unit Economics, and Pricing Guide

> **Pricing snapshot date:** 2026-08-25
> **Default planning currency:** USD, with vendor-native EUR retained where applicable
> **Purpose:** Estimate customer total cost, PORT / OS delivery cost, run cost, commercial price and margin without hiding assumptions.
> **Important:** Public list prices change by country, billing term, tax, promotion, usage and contract. Reconfirm vendor quotes before every proposal.

## 1. Executive cost conclusion

AI tokens are rarely the largest cost of a serious PORT / OS deployment. The dominant costs are usually:

1. discovery and process correction;
2. CRM/ERP licenses and implementation;
3. connector build and maintenance;
4. data cleanup and historical reconciliation;
5. human review, support and exception handling;
6. reliability, security, monitoring and audit controls;
7. only then, model and workflow execution usage.

This matters commercially. PORT / OS should not be priced as “API cost plus a small markup.” It creates value by reducing fragmented labor, failures, delays, margin leakage and management uncertainty while making the customer's existing software more useful.

## 2. The five cost layers

| Layer | What it includes | Cost behavior | Who normally pays |
|---|---|---|---|
| Existing business systems | CRM, ERP, accounting, WMS, carrier/broker tools, help desk | seats, modules, annual contracts, partner services | customer directly |
| PORT / OS platform | hosting, database, queues, storage, secrets, monitoring, backups | fixed base plus tenant/volume growth | included or passed through |
| Automation and AI | n8n/Make/Zapier, model tokens, OCR, search, enrichment, messaging | event/tool/token/credit usage | metered with caps |
| Delivery and change | discovery, mapping, connector/workflow build, QA, training, documentation | one-time and change-request labor | setup/project fee |
| Operations | support, incident response, evaluation, optimization, vendor changes | monthly labor and SLA capacity | managed-service fee |

## 3. CRM and operating-platform pricing snapshot

The plans below are reference points for architecture discussions, not equivalent bundles. A $40 CRM seat and a $175 enterprise CRM seat do not provide the same functionality, governance, support or operational depth.

| Platform | Public reference plan(s) | Public list-price snapshot | Cost notes for PORT / OS |
|---|---|---:|---|
| Salesforce Sales Cloud | Starter / Pro / Enterprise / Unlimited / Agentforce 1 Sales | $25 / $100 / $175 / $350 / $550 per user/month | Enterprise/API/automation needs and add-ons can materially change TCO; implementation is separate |
| HubSpot Sales Hub | Starter / Professional / Enterprise | $20 / $100 / $150 per seat/month | Product catalog lists $1,500 Pro and $3,500 Enterprise onboarding; hubs, credits and extra seats add cost |
| Dynamics 365 Sales | Professional / Enterprise / Premium | $65 / $105 / $150 per user/month | Supply Chain, Finance, Power Platform capacity and partner implementation are separate |
| Zoho CRM | Standard / Professional / Enterprise / Ultimate, annual | $14 / $23 / $40 / $52 per user/month | Local taxes/add-ons apply; Inventory, Books, Flow or Zoho One may be better suite comparisons |
| Odoo | Standard / Custom, annual snapshot | $24.90 / $49 per user/month | Standard includes all apps on Odoo Online; Custom adds API, Studio, multi-company and alternative hosting; localization/implementation separate |
| Pipedrive | Lite / Growth / Premium / Ultimate, annual | $14 / $39 / $59 / $79 per seat/month | LeadBooster, Campaigns and usage top-ups can add cost |
| monday CRM | Basic / Standard / Pro, annual | $12 / $17 / $28 per seat/month | Minimum seat rules, automation/API/AI allowances and country pricing matter |
| Close | Solo / Essentials / Growth / Scale, annual | $9 / $35 / $99 / $139 per user/month | Monthly prices are higher; calling/SMS and extra AI usage are variable; custom objects appear at Scale in current comparison |
| HighLevel | Starter / Unlimited / Agency Pro | $97 / $297 / $497 per month | Account/sub-account model, not per-seat; telecom, email and premium AI usage apply |
| Airtable | Team / Business, annual | $20 / $45 per editor/month | Read-only users are not charged on these plans; limits and enterprise governance affect fit |
| SAP Business One | Partner quote | Quote-based | Licenses, localization, database/hosting, partner implementation and support must be quoted |
| NetSuite | Sales quote | Quote-based | Edition, modules, users, implementation and annual contract determine TCO |
| CargoWise / Descartes | Sales quote | Quote-based | Specialist logistics/trade products; price depends on products, transactions and contract |

### 3.1 Illustrative monthly seat comparison

This table multiplies a representative tier by seats. It is intentionally **not** a feature-equivalent comparison and excludes tax, onboarding, implementation, add-ons and usage.

| Platform and representative tier | 10 users | 25 users | 50 users |
|---|---:|---:|---:|
| Salesforce Enterprise ($175) | $1,750 | $4,375 | $8,750 |
| HubSpot Sales Hub Professional ($100) | $1,000 | $2,500 | $5,000 |
| Dynamics 365 Sales Enterprise ($105) | $1,050 | $2,625 | $5,250 |
| Zoho CRM Enterprise ($40) | $400 | $1,000 | $2,000 |
| Odoo Custom ($49) | $490 | $1,225 | $2,450 |
| Pipedrive Premium ($59) | $590 | $1,475 | $2,950 |
| monday CRM Pro ($28) | $280 | $700 | $1,400 |
| Close Growth ($99) | $990 | $2,475 | $4,950 |
| Airtable Business ($45) | $450 | $1,125 | $2,250 |
| HighLevel Unlimited | $297 flat reference | $297 flat reference | $297 flat reference |

HighLevel's line is not directly comparable because its public packaging uses agency/sub-accounts and unlimited users. Usage and add-ons remain separate.

## 4. Workflow and infrastructure pricing snapshot

| Component | Public reference | Snapshot | Planning interpretation |
|---|---|---:|---|
| n8n Cloud Starter | 2,500 workflow executions | €20/month billed annually | prototype/small pilot |
| n8n Cloud Pro | 10,000 executions | €50/month billed annually | small production team |
| n8n Business | 40,000 executions, self-hosted license | €667/month billed annually | governance/collaboration; infrastructure still separate |
| n8n Community Edition | self-hosted | software license $0 | requires engineering/operations; confirm license and feature fit |
| Make Core | 10,000 credits | $12/month | each module action generally consumes credits; AI-provider behavior can differ |
| Make Pro | 10,000 credits | $21/month | priority execution and stronger controls |
| Make Teams | 10,000 credits | $38/month | collaboration and templates |
| Zapier Professional | 750 tasks reference | $19.99/month billed annually | task-based usage; verify chosen capacity and app requirements |
| Vercel Pro | managed web deployment | $20/month with $20 included resource credit | front end/API; seats and overage can add cost |
| Supabase Pro | managed Postgres/auth/storage | $25/month | extra projects/compute, storage, PITR and custom domain add cost |
| Cloudflare Workers Paid | edge/serverless base | $5/month minimum | 10M requests/month included in current standard plan; related storage priced separately |

### Architecture cost decision

- Use **Make** when speed, broad SaaS connectivity and client-visible no-code maintenance dominate.
- Use **n8n** when custom logic, execution-level charging, code nodes and deployment control dominate.
- Use **Zapier** for smaller front-office automations when its native app experience outweighs task cost.
- Use a code service/queue for high-volume event processing, strict transactions, complex state or vendor-neutral product logic. The visual workflow tool coordinates; it should not become the only application runtime.

## 5. AI model cost model

Never hardcode one model into the commercial offer. Store rates in a dated configuration and calculate cost per run.

### 5.1 Formula

```text
model_cost =
  (uncached_input_tokens / 1,000,000 × input_rate)
  + (cached_input_tokens / 1,000,000 × cached_input_rate)
  + (output_tokens / 1,000,000 × output_rate)
  + tool_call_costs

agent_run_cost = model_cost + workflow_cost + data_provider_cost + allocated_infrastructure

fully_loaded_run_cost = agent_run_cost + human_review_minutes × loaded_review_cost_per_minute
```

### 5.2 OpenAI planning rates

Official OpenAI documentation on the research date lists these text-token rates per one million tokens:

| Model | Input | Cached input | Output | Recommended PORT / OS work |
|---|---:|---:|---:|---|
| GPT-5.4 nano | $0.20 | $0.02 | $1.25 | extraction, classification, ranking and low-risk sub-tasks |
| GPT-5.4 mini | $0.75 | $0.075 | $4.50 | harder drafting, normalization and bounded analysis |
| GPT-5.4 | $2.50 | $0.25 | $15.00 | exceptional complex reasoning, not routine high-volume work |

Regional processing and long-context rules may add cost. Search, computer use, OCR, embeddings and third-party tools can add separate charges. Reconfirm against [official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5.4), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) and [GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano).

### 5.3 Anthropic planning note

Anthropic's current pricing should be stored in the same configurable rate table. Its published list-price materials distinguish model, standard/batch processing, cache writes/hits and sometimes regional inference. Never assume a Claude subscription includes API use. Reconfirm on the [Anthropic API pricing page](https://www.anthropic.com/pricing#api).

### 5.4 Illustrative model-routing month

Assumptions:

- 20,000 total agent/workflow runs;
- 70% deterministic with no model call;
- 25% GPT-5.4 nano, 4% GPT-5.4 mini, 1% GPT-5.4;
- each AI run averages 2,500 uncached input and 400 output tokens;
- no cache, search, vision, OCR, embedding or provider charges included.

| Tier | Runs | Input tokens | Output tokens | Calculated model cost |
|---|---:|---:|---:|---:|
| Deterministic | 14,000 | 0 | 0 | $0.00 |
| GPT-5.4 nano | 5,000 | 12.5M | 2.0M | $5.00 |
| GPT-5.4 mini | 800 | 2.0M | 0.32M | $2.94 |
| GPT-5.4 | 200 | 0.5M | 0.08M | $2.45 |
| **Total** | **20,000** | **15.0M** | **2.4M** | **$10.39** |

This is a calculation example, not a forecast. A ten-times token stress case would be roughly $103.90 before tools. It demonstrates why routing and deterministic logic can keep language-model cost small, while human review and integrations may remain substantial.

### 5.5 Human review comparison

If 3,000 of those runs require 90 seconds of review:

```text
3,000 × 1.5 minutes = 4,500 minutes = 75 review hours
```

At a loaded internal cost of $8, $15 or $30/hour, review costs $600, $1,125 or $2,250. The workflow should therefore optimize reviewer minutes and correction rate, not only tokens.

## 6. Build-cost scenarios

The ranges below are planning hypotheses for scope decisions. They are not quotations.

### 6.1 Delivery hours by maturity

| Scope | Hours | Includes | Excludes |
|---|---:|---|---|
| Discovery and operational diagnosis | 40–80 | process, systems, data, risks, baseline, pilot design | production build |
| Controlled one-workflow pilot | 160–260 | 1–2 integrations, queue, 5–10 agents, approvals, tests, weekly review | full platform/multi-tenancy |
| Production single-tenant control tower | 500–900 | canonical model, 3–6 integrations, reliability, security, observability, runbooks | self-service SaaS |
| Reusable multi-tenant managed platform | 1,200–2,200 | tenant isolation, packs, provisioning, metering, billing/admin, multiple adapters | every enterprise compliance certification |

### 6.2 Labor-cost sensitivity in EUR

The 30–60 EUR/hour range aligns with the target freelance market in the associated portfolio context. A final quote should use the delivery team's actual rate and taxes.

| Scope | At €30/hour | At €45/hour | At €60/hour |
|---|---:|---:|---:|
| 160-hour pilot | €4,800 | €7,200 | €9,600 |
| 260-hour pilot | €7,800 | €11,700 | €15,600 |
| 500-hour production build | €15,000 | €22,500 | €30,000 |
| 900-hour production build | €27,000 | €40,500 | €54,000 |
| 1,200-hour multi-tenant build | €36,000 | €54,000 | €72,000 |
| 2,200-hour multi-tenant build | €66,000 | €99,000 | €132,000 |

Do not quote all engineering hours as one undifferentiated build. Separate discovery, implementation, integration, QA/security, enablement and managed operation.

### 6.3 Where the implementation hours go

| Workstream | Typical share | Why it matters |
|---|---:|---|
| Discovery, process and source-authority mapping | 10–15% | prevents automating an undefined or contradictory process |
| Data cleanup, schema and integrations | 20–30% | usually the largest uncertainty |
| Workflow, agent and policy implementation | 25–35% | visible product behavior |
| Cockpit/dashboard and operator UX | 10–15% | determines adoption and review time |
| Testing, evaluation, security and failure handling | 15–25% | determines whether it is safe to run continuously |
| Documentation, training and launch | 5–10% | determines takeover and sustained use |

## 7. Monthly run-cost scenarios

These are budget envelopes excluding the customer's CRM/ERP licenses and excluding PORT / OS support labor.

| Component | Portfolio demo | Controlled pilot | Single-tenant production | Multi-tenant managed platform |
|---|---:|---:|---:|---:|
| Web/API hosting | $0–20 | $20–75 | $50–300 | $300–2,000 |
| Database/auth/storage | $0 | $25–100 | $100–500 | $500–3,000 |
| Workflow/orchestration | $0–50 | $20–200 | $100–1,000 | $500–4,000 |
| Queue/cache/scheduled jobs | $0 | $0–50 | $25–250 | $200–1,500 |
| Observability/error tracking | $0 | $0–100 | $100–500 | $500–2,500 |
| Backups/secrets/security | $0 | $10–75 | $50–300 | $250–1,500 |
| Model and AI tools | $0–25 | $25–300 | $100–1,500 | $500–8,000 |
| Messaging/OCR/enrichment | $0 | $25–300 | $100–2,000 | $500–10,000 |
| **Indicative total** | **$0–95** | **$100–1,200** | **$625–6,350** | **$3,250–32,500** |

Wide ranges are deliberate. An email-and-spreadsheet pilot and a high-volume document/compliance platform are different products. A proposal must replace these bands with event volumes and vendor quotes.

## 8. Four customer adoption paths

### Path A — Overlay the existing CRM/ERP

**Best for:** established importer or any company with systems employees already use.
**Cost profile:** lowest migration cost; higher adapter/coordination complexity.
**Buy:** existing CRM/ERP licenses, PORT / OS setup, connectors, managed operation.
**Avoid:** duplicating ledgers or rebuilding working screens.

### Path B — SMB suite foundation with Zoho or Odoo

**Best for:** Bolivian or regional SMB whose current stack is spreadsheets plus disconnected tools.
**Cost profile:** lower seat cost, meaningful configuration/localization/training.
**Decision:** Odoo when purchasing/inventory/accounting depth dominates; Zoho when CRM/front-office breadth and fast SaaS setup dominate.

### Path C — Enterprise foundation with Dynamics, Salesforce, SAP or NetSuite

**Best for:** larger business with governance, scale and vendor standards.
**Cost profile:** licenses and partner implementation dominate; PORT / OS must justify itself through cross-system operations, simpler UX, evidence and agent governance.
**Avoid:** recreating native ERP posting or CRM capabilities.

### Path D — PORT / OS managed vertical platform

**Best for:** design partners who want importer control-tower outcomes without owning the technical platform.
**Cost profile:** setup plus monthly platform/support/usage.
**Provider risk:** support and integration labor can destroy margin unless packs and boundaries are standardized.

## 9. Customer TCO calculator

### 9.1 Twelve-month formula

```text
year_1_tco =
  discovery_and_setup
  + data_migration_cleanup
  + integration_build
  + 12 × (
      CRM_ERP_licenses
      + PORT_OS_platform_fee
      + infrastructure
      + automation_AI_usage
      + support_SLA
      + customer_internal_admin
    )
  + contingency
  + applicable_taxes
```

Recommended contingency:

- 10% when APIs, data and volumes are proven;
- 15–20% when one major integration or data source is uncertain;
- do not fixed-price an unknown legacy integration—make discovery a paid gate.

### 9.2 Required calculator inputs

| Input | Unit |
|---|---|
| Full CRM/ERP users by product/tier | seats |
| Editors/reviewers/viewers | seats by license class |
| Source events by type | events/month |
| Workflow steps or executions | credits/executions/month |
| AI calls by agent/model | calls and tokens/month |
| Documents by page/type | pages/month |
| Enrichment/search/message volume | calls/messages/month |
| Storage and retention | GB/month and months |
| Peak concurrency and SLA | executions/second; support hours |
| Human review and exception rate | cases × minutes |
| Support/change capacity | hours/month |
| Tax, payment and currency assumptions | percent/rate/source date |

## 10. Value and ROI model

PORT / OS should be funded when conservative attributable value exceeds full cost and the control improvement matters.

```text
monthly_recoverable_value =
  manual_hours_avoided × loaded_hourly_cost
  + preventable_delay_storage_demurrage
  + document_rework_avoided
  + margin_leakage_detected
  + cash_acceleration_value
  + avoidable_tool_cost_retired

conservative_value = monthly_recoverable_value × confidence_factor

net_monthly_value = conservative_value - full_monthly_PORT_OS_cost

ROI = net_monthly_value / full_monthly_PORT_OS_cost

payback_months = one_time_cost / net_monthly_value
```

### Value-evidence rules

- Use the customer's payroll/load assumptions, not generic salary claims.
- Use actual historical delay, storage, demurrage, rework and error records.
- Count time saved only if it can be reassigned or capacity increases.
- Do not count the same benefit in two categories.
- Use 25–50% confidence for weak baseline data and increase it only after pilot evidence.
- Report control benefits separately when monetary attribution is not defensible.

## 11. PORT / OS commercial pricing architecture

### 11.1 Recommended price components

| Component | Covers | Pricing method |
|---|---|---|
| Paid diagnosis | process map, source authority, risk/baseline and pilot plan | fixed fee |
| Setup/implementation | data model, integrations, workflows, agents, tests, training | fixed milestones or time-and-materials |
| Platform fee | tenant, cockpit, event/audit, standard packs and core support | monthly base |
| Workflow pack | importer operations, support, finance, sales, etc. | monthly per active pack |
| Usage | model, OCR, enrichment, messages and extraordinary executions | included allowance + metered overage |
| Premium integration | custom/legacy/high-maintenance connector | setup + monthly maintenance |
| SLA/support | response hours, incident coverage, review and optimization | monthly tier or retained hours |

### 11.2 Bolivia launch-package hypotheses

Keep the ranges from the B2B playbook until interviews and the first pilot produce evidence:

| Package | Starting hypothesis | Margin requirement |
|---|---:|---|
| Operational Diagnosis | Bs 1,800–3,500 one-time | scope to one process and decision-ready pilot plan |
| Controlled Pilot | Bs 8,500–15,000 setup + Bs 1,900–3,500/month | cap integrations, runs, support hours and one team |
| Operations Control Tower | Bs 18,000–35,000 setup + Bs 4,500–8,500/month | standardize up to three workflows and defined support |
| Dedicated Company OS | from Bs 40,000 setup + Bs 9,000/month | price custom connectors and SLA separately |

These are discovery hypotheses, not conversions from USD. Quote in the legally and commercially appropriate currency, state the exchange-rate source/date where relevant, and obtain Bolivian accounting/legal advice for taxes, invoicing and cross-border services.

### 11.3 International managed-platform hypotheses

| Package | Setup hypothesis | Monthly hypothesis | Boundary |
|---|---:|---:|---|
| One controlled workflow | $3,000–8,000 | $750–1,500 | 1 team, 1–2 standard integrations, capped usage |
| Department control tower | $10,000–30,000 | $2,000–6,000 | 3–6 workflows, dashboards, business-hours support |
| Dedicated operating layer | $30,000+ | $6,000+ | multiple departments, custom integrations/governance/SLA |

Validate willingness to pay before productizing. Price must be tied to scope, complexity and value, not the number of displayed agents.

## 12. Provider unit economics

### 12.1 Gross-margin formula

```text
monthly_contribution = customer_monthly_revenue
  - allocated_infrastructure
  - model_tool_usage
  - third_party_pass_through
  - direct_support_and_operations_labor

gross_margin = monthly_contribution / customer_monthly_revenue
```

### 12.2 Example managed customer

Assumptions:

- monthly revenue: $2,500;
- infrastructure allocation: $250;
- model/tool usage: $100;
- third-party pass-through absorbed: $150;
- direct support: 5 hours × $25 loaded cost = $125.

```text
monthly contribution = 2,500 - 250 - 100 - 150 - 125 = $1,875
gross margin = 1,875 / 2,500 = 75%
```

If support rises to 20 hours, direct support becomes $500 and gross margin falls to 60%. The early warning is not token spend; it is customer-specific operational labor.

### 12.3 Break-even example

If reusable product development cost is $30,000 and monthly contribution per customer is $1,875:

```text
break-even customer-months = 30,000 / 1,875 = 16
```

That could mean one customer for 16 months, four customers for four months, or eight customers for two months, before sales/admin/tax costs. Use a cohort model rather than assuming all customers arrive on day one.

### 12.4 Margin guardrails

- Keep third-party usage visible per tenant and workflow.
- Include a usage allowance, hard budget alert and documented overage rule.
- Set included support hours and a change-request boundary.
- Charge maintenance for custom connectors whose upstream vendor can change.
- Do not subsidize a customer's poor data indefinitely; define cleanup ownership.
- Review gross margin by customer monthly, not only company-wide.
- Pause expansion when a workflow fails quality/reliability gates even if the customer requests more agents.

## 13. Cost-control architecture

| Control | Implementation |
|---|---|
| Deterministic-first routing | rule table marks tasks that need no model |
| Smallest sufficient model | evaluator-approved routing tiers; complex model only after confidence/risk gate |
| Prompt caching | stable policy/knowledge prefix with cache-aware provider adapter |
| Retrieval budget | top-k, token cap, dedupe, freshness and classification filters |
| Output schemas | constrained structured output; retry only invalid fields where possible |
| Batch/asynchronous work | reports, enrichment and nonurgent analysis use lower-cost batch paths |
| Per-agent budget | max tokens, tool calls, latency and cost per run |
| Per-tenant budget | daily/monthly soft alert, hard stop or deterministic fallback by risk |
| Circuit breaker | stop repeated provider/upstream failures before cost explosion |
| Idempotency | duplicate events do not create duplicate model calls or external actions |
| Sampling | evaluate risk-based production samples instead of expensive review of everything |
| Data minimization | retrieve only required fields/documents, reducing privacy exposure and tokens |
| Cost attribution | correlation ID joins workflow, model, tool, storage and review cost to outcome |

## 14. Monthly cost dashboard

The operator/admin cockpit should show:

| Dashboard | Metrics |
|---|---|
| Executive cost | MRR, direct cost, gross margin, cost per customer and workflow |
| Usage | runs, executions/credits, tokens, tools, pages, messages, storage |
| Efficiency | accepted packet cost, resolved exception cost, minutes saved/reviewer minutes |
| Routing | deterministic/nano/mini/frontier share and fallback rate |
| Reliability | failed/retried/dead-letter runs, upstream outage cost, reprocessing cost |
| Quality | acceptance/correction/escalation by agent and model |
| Budget | actual vs tenant/agent/vendor budget, forecast and overage risk |
| Support | hours/customer, incident count, change requests and unplanned work |

### Cost anomaly alerts

- daily cost > 2× trailing 14-day weekday average;
- agent cost/run > budget for 20 runs or 30 minutes;
- retries > 3% or one correlation chain repeats;
- model-tier mix shifts upward by > 10 percentage points;
- human review minutes increase while accepted quality does not;
- vendor credits/limits cross 70%, 85% and 95%;
- customer gross margin falls below contract target for two periods.

## 15. Proposal cost checklist

Before sending a price, verify:

- [ ] customer, entity, country and invoicing currency;
- [ ] CRM/ERP plans, user classes and existing contract dates;
- [ ] exact integrations, authentication, API availability and rate limits;
- [ ] historical volume, peak, payload/document sizes and retention;
- [ ] workflow steps/executions and model/tool assumptions;
- [ ] source data quality and cleanup ownership;
- [ ] approval roles, reviewer minutes and supported hours;
- [ ] migration/backfill and reconciliation requirements;
- [ ] security, data residency, audit and deletion requirements;
- [ ] acceptance tests, shadow period and rollback;
- [ ] setup milestones, monthly scope, included usage and overages;
- [ ] support/change allowance and premium connector maintenance;
- [ ] tax, FX and payment processing reviewed by qualified advisors;
- [ ] 15–20% uncertainty allowance for any unproven integration;
- [ ] proposal explicitly labels every estimate versus vendor quote.

## 16. Official price sources

- [Salesforce Sales Cloud pricing](https://www.salesforce.com/sales/cloud/)
- [Salesforce sales add-ons](https://www.salesforce.com/sales/pricing/add-ons/)
- [HubSpot product and services catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)
- [Dynamics 365 Sales pricing](https://www.microsoft.com/en/dynamics-365/products/sales)
- [Zoho CRM price calculator](https://www.zoho.com/crm/zohocrm-pricing-calculator.html)
- [Odoo pricing](https://www.odoo.com/pricing)
- [Pipedrive pricing](https://www.pipedrive.com/en/pricing/professional-crm)
- [monday CRM pricing](https://monday.com/crm/pricing)
- [Close pricing](https://close.com/pricing)
- [HighLevel pricing](https://www.gohighlevel.com/pricing)
- [Airtable pricing](https://airtable.com/pricing)
- [n8n pricing](https://n8n.io/pricing/)
- [Make pricing](https://www.make.com/en/pricing)
- [Zapier pricing](https://zapier.com/pricing)
- [Vercel pricing](https://vercel.com/pricing)
- [Supabase pricing](https://supabase.com/pricing)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [OpenAI model pricing documentation](https://developers.openai.com/api/docs/models/gpt-5.4)
- [Anthropic API pricing](https://www.anthropic.com/pricing#api)

## 17. Recommended financial decision

For the first design partner, sell a paid diagnosis and controlled pilot. Keep the customer's existing CRM/ERP, connect only the minimum sources needed for one measurable workflow, cap usage and support, and instrument every run from day one.

Do not build the multi-tenant platform before the pilot proves four numbers:

1. monthly cases and exception volume;
2. accepted work-packet rate and reviewer minutes;
3. attributable value or control improvement;
4. direct monthly cost and support hours.

Those four numbers determine the real product, price and market more reliably than a speculative infrastructure estimate.
