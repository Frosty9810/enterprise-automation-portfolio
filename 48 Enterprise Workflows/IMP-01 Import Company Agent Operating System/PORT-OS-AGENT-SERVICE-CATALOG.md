# PORT / OS — Personalized 137-Agent Service Catalog

> **Version:** 1.0 design specification
> **Registry alignment:** 21 Sales + 18 Deals + 20 Marketing + 24 Operations + 17 Intelligence + 19 Customer + 18 Back Office = **137 agents**
> **Purpose:** Make every agent understandable, configurable, testable and transferable to another operator or business.

## 1. How to read this catalog

An “agent” in PORT / OS is a narrow service definition, not an autonomous employee. Each row specifies the business event that should invoke it, the work packet it must return, the checks that prevent unsafe or low-quality output, and the dimensions used to personalize it.

The catalog is intentionally business-readable. The production version should store the same definitions as versioned YAML/JSON, validate them with JSON Schema, and display them in the administrator console.

### Universal run states

| State | Meaning |
|---|---|
| `ready_for_review` | Required evidence and checks are present; a named reviewer can act |
| `blocked_missing_evidence` | One or more required sources or fields are absent/stale |
| `approval_required` | The packet is valid but a policy threshold requires authority |
| `exception` | Conflicting data, control failure, upstream outage or out-of-policy condition |
| `completed_no_action` | The agent checked the case and found no justified work |

### What every work packet contains

```text
status · proposed outcome · evidence and freshness · checks · assumptions
confidence · risk level · next action · reviewer · deadline · handoff
agent/config versions · run cost · latency · correlation ID
```

## 2. Personalization shared by all 137 agents

Every service resolves configuration in this order:

`platform → country → vertical → company → department → role → user → task`

The resolved configuration controls:

- business vocabulary and object aliases;
- source systems and authoritative fields;
- language, currency, timezone and calendars;
- thresholds, approval matrix and segregation of duties;
- allowed tools, write destinations and prohibited actions;
- required evidence, freshness and confidence;
- model tier, token/tool budget, timeout and fallback;
- output detail, channel and downstream owner;
- KPI definition, evaluation set and sampling rate.

User preferences can change presentation, never authority. A lower layer cannot override a policy denial inherited from a higher layer.

## 3. Department control profiles

| Department | Default authority | Default reviewer | Primary systems | Core KPIs |
|---|---|---|---|---|
| Sales | Read/enrich/draft; no autonomous enrollment or send | Sales manager or account owner | CRM, enrichment, email, product/market brain | accepted leads, reply rate, conversion, data quality |
| Deals | Prepare meetings, proposals, quotes and stage changes | Account executive, deal desk or finance | CRM, pricing, inventory, contracts | cycle time, win rate, margin, forecast accuracy |
| Marketing | Analyze and draft; publishing requires review | Marketing owner/brand reviewer | analytics, ads, CMS, product brain | qualified demand, CAC, conversion, claim accuracy |
| Operations | Validate and prepare; bookings/declarations require approval | Operations lead, broker liaison or warehouse lead | ERP, WMS, carrier, broker, documents | on-time milestones, exception age, cost variance, document completeness |
| Intelligence | Read/synthesize sourced signals; no unsourced recommendation | Functional owner or risk lead | approved public/internal sources, market/logistics feeds | precision, lead time, source freshness, action acceptance |
| Customer | Retrieve and draft; promises/refunds require approval | Support/CS owner | help desk, CRM, order, shipment and policy data | SLA, resolution, CSAT, reopen rate, promise accuracy |
| Back Office | Prepare/reconcile; no autonomous money movement or posting | Finance controller/legal owner | ERP/accounting, bank/payment, contracts | match rate, DSO, close time, variance, control exceptions |

## 4. Sales — 21 services

Department outcome: turn a defined market into qualified, contextualized conversations. Default hard constraint: no enrollment without fit evidence, lawful/contractual contact basis, deduplication and deliverability checks.

| ID | Agent | Starts with | Produces | Critical checks | Personalized by |
|---|---|---|---|---|---|
| sales-001 | ICP Strategist | growth target, offer and historical wins/losses | versioned ICP with positive/negative criteria | sample size, evidence source, excluded segments, owner approval | vertical economics, geography, order size, sales motion |
| sales-002 | Segment Scorer | ICP plus candidate market segments | ranked segment scorecard and rationale | normalized criteria, missing-data penalty, no protected-trait proxy | strategic weights, market maturity, margin, serviceability |
| sales-003 | Territory Mapper | target segments and geographic coverage | territory/account allocation proposal | duplicates, ownership conflicts, capacity, language/timezone | rep capacity, country, channel, named-account rules |
| sales-004 | Importer Prospect Finder | importer ICP and approved data sources | candidate importer accounts with source links | fit evidence, source terms, dedupe, recency | product category, trade lane, country, company size |
| sales-005 | Distributor Prospect Finder | distributor ICP and channel plan | qualified distributor list | channel fit, territory overlap, active status, provenance | product line, territory, exclusivity, order frequency |
| sales-006 | Retailer Prospect Finder | retail ICP and assortment criteria | retailer/account candidates with assortment fit | active locations, category evidence, dedupe, source date | channel tier, footprint, price point, geography |
| sales-007 | Lead Deduplicator | new/imported lead records | merge candidates and survivor recommendation | exact/fuzzy keys, activity preservation, false-merge threshold | CRM rules, domains, tax IDs, phone normalization |
| sales-008 | Company Enricher | minimally identified company | approved company fields with field-level sources | freshness, source confidence, overwrite policy, data minimization | required fields, provider priority, jurisdiction |
| sales-009 | Contact Enricher | company plus target role | verified contact candidates | role relevance, consent basis, verification, opt-out suppression | buying committee, seniority, country contact rules |
| sales-010 | Buying Signal Monitor | account watchlist and signal definitions | sourced signal event with time horizon | provenance, recency, duplicate event, materiality | signal taxonomy, decay rate, account tier, cadence |
| sales-011 | Fit Scorer | enriched account/contact and ICP version | explainable fit score with missing factors | calibrated thresholds, reason codes, no hidden sensitive features | ICP version, segment weights, disqualifiers |
| sales-012 | Cold Email Drafter | approved lead, offer and evidence | one-to-one draft and subject options | factual claims, tone, unsubscribe requirements, no send | language, role, brand voice, offer, relationship context |
| sales-013 | Personalization Researcher | approved prospect and outreach goal | concise account-specific personalization brief | source validity, relevance, no invasive personal detail | persona, product, trigger event, cultural context |
| sales-014 | Sequence Planner | segment, channel policy and objective | touch sequence with stop conditions | frequency caps, channel permission, timezone, suppression | sales cycle, role, geography, channel mix |
| sales-015 | Deliverability Checker | sender, recipient and proposed sequence | send-risk report and remediation list | domain/authentication, verification, suppression, volume ramp | provider, domain age, region, sender pool |
| sales-016 | Call Briefing Agent | account, contact and meeting/call objective | one-page call brief | latest CRM history, open issues, facts vs hypotheses | rep role, call type, product, time available |
| sales-017 | Objection Mapper | ICP, win/loss notes and call history | objection taxonomy and response evidence | frequency, source sample, approved claims, escalation topics | segment, persona, competitor, product line |
| sales-018 | Follow-up Scheduler | reviewed interaction and next-step commitment | task/cadence proposal | explicit commitment, timezone, duplicate tasks, stop state | owner calendar, account tier, channel, urgency |
| sales-019 | CRM Hygiene Agent | CRM quality schedule or record change | correction queue and quality report | authority per field, merge safety, required fields, audit log | CRM schema, stage, territory, data SLA |
| sales-020 | Handoff Packager | qualified lead or booked meeting | complete Deals handoff packet | qualification minimum, source links, owner, next commitment | deal type, region, account tier, receiving team |
| sales-021 | Sales Forecast Input Agent | pipeline snapshot and verified activity | forecast input with confidence and risks | stage evidence, close-date freshness, double counting, probability policy | forecast method, segment, rep history, seasonality |

## 5. Deals — 18 services

Department outcome: move qualified interest through a controlled commercial decision process. Default hard constraint: no quote or term is final until margin, inventory, delivery feasibility and approval thresholds pass.

| ID | Agent | Starts with | Produces | Critical checks | Personalized by |
|---|---|---|---|---|---|
| deals-001 | Reply Classifier | inbound prospect message | intent, sentiment, requested action and routing | quoted context, ambiguity threshold, unsubscribe detection | language, sales motion, intent taxonomy, priority |
| deals-002 | Intent Scorer | reply plus account/history | explainable commercial-intent score | evidence factors, uncertainty, no auto-disqualification | segment, channel, product, lifecycle stage |
| deals-003 | Qualification Checker | discovery data and qualification framework | pass/gap/disqualifier checklist | mandatory facts, evidence recency, human override | MEDDICC/BANT/custom framework, deal size, region |
| deals-004 | Meeting Scheduler | accepted meeting intent and calendars | compliant time options or booking request | timezone, availability, required attendees, no duplicate | duration, buffers, language, owner, meeting type |
| deals-005 | Meeting Prep Agent | scheduled meeting and deal context | agenda, questions, participants and risk brief | latest history, unresolved support issues, source links | meeting stage, stakeholder role, strategic value |
| deals-006 | Discovery Note Structurer | transcript or notes | structured needs, constraints, commitments and gaps | speaker attribution, fact/hypothesis separation, consent/retention | methodology, CRM fields, language, industry |
| deals-007 | Proposal Scope Writer | approved discovery and solution catalog | scope draft, assumptions, exclusions and acceptance criteria | no invented capability, dependency visibility, owner review | offer pack, SLA, jurisdiction, implementation model |
| deals-008 | Landed Cost Proposal Agent | product, quantity, route and cost assumptions | customer-facing landed-cost scenario | FX/rate timestamps, allocation, exclusions, margin floor | Incoterm, country, product, quote validity, risk buffer |
| deals-009 | Quote Validator | draft quote and source data | validation report and approval state | price book, tax, inventory, margin, arithmetic, expiry | currency, entity, discount authority, product rules |
| deals-010 | Terms Risk Checker | proposed commercial terms and policy | deviations, risk level and legal/finance route | version, jurisdiction, liability/payment thresholds, conflicts | contract type, country, customer tier, legal playbook |
| deals-011 | Deal Follow-up Agent | open deal, last contact and commitments | context-specific follow-up draft/task | next step exists, frequency, open objections, no send | relationship, stage, tone, owner, channel |
| deals-012 | Negotiation Brief Agent | proposal, requested changes and margin model | give/get options and walk-away conditions | approval limits, concession history, delivery feasibility | customer tier, product scarcity, strategic value |
| deals-013 | Deal Desk Router | quote/terms exception | named reviewers, sequence and SLA | value/risk thresholds, segregation, backup approver | entity, region, contract value, exception type |
| deals-014 | Pipeline Stage Agent | validated event/evidence | recommended stage and missing exit criteria | stage policy, irreversible transition, stale evidence | pipeline, deal type, CRM, stage definitions |
| deals-015 | Stalled Deal Detector | pipeline aging and activity | stalled reason, priority and recovery option | stage-specific SLA, seasonality, duplicate alerts | segment, value, stage, rep cadence |
| deals-016 | Mutual Close Plan Agent | committed buyer and target date | shared milestones, owners, dependencies and dates | buyer confirmation, delivery constraints, realistic lead times | procurement process, stakeholders, product, geography |
| deals-017 | Won Deal Handoff | approved closed-won event | complete operations/customer onboarding packet | signed terms, payment condition, SKU/qty, promise, owner | vertical, fulfillment model, CRM/ERP mapping |
| deals-018 | Deal Debrief Agent | won/lost/abandoned deal evidence | structured lessons and improvement actions | representative evidence, no blame inference, owner | outcome, segment, competitor, reason taxonomy |

## 6. Marketing — 20 services

Department outcome: turn approved product and market evidence into measurable demand. Default hard constraint: every claim maps to an approved product fact, source or measured result.

| ID | Agent | Starts with | Produces | Critical checks | Personalized by |
|---|---|---|---|---|---|
| marketing-001 | Performance Analyst | campaign/channel metrics | KPI narrative, drivers and next questions | metric definitions, period comparison, tracking gaps | channel, funnel, attribution window, executive detail |
| marketing-002 | Attribution Auditor | conversion events and tracking configuration | attribution integrity report | duplicate events, missing UTMs, identity gaps, model limits | analytics stack, channel mix, consent regime |
| marketing-003 | Campaign Diagnostician | under/over-performing campaign | ranked causes and controlled tests | adequate sample, confounders, budget/policy constraints | channel, objective, audience, product, market |
| marketing-004 | Content Strategist | business goal, audience and evidence | content plan tied to funnel questions | capacity, differentiation, evidence inventory, measurement | vertical, buyer journey, channel, cadence |
| marketing-005 | Product Story Writer | approved product facts and audience | narrative draft and claim map | every material claim cited, no prohibited promise | market, persona, format, brand voice |
| marketing-006 | Video Script Writer | approved brief and platform constraints | timed script, shots and CTA | claim map, duration, accessibility, rights | platform, language, presenter, product, funnel stage |
| marketing-007 | Carousel Architect | sourced topic and channel | slide-by-slide structure and copy | logical flow, readability, citation and CTA | channel dimensions, audience, language, brand system |
| marketing-008 | Case Study Builder | approved customer evidence and permission | problem/action/result narrative | consent, anonymization, metric proof, no causal overclaim | vertical, audience, format, disclosure policy |
| marketing-009 | Email Campaign Writer | segment, offer and proof | campaign variants and measurement plan | consent, suppression, claims, frequency, links | lifecycle, language, segment, brand, CTA |
| marketing-010 | SEO Opportunity Mapper | site/content/search data | prioritized opportunity map | intent fit, authority, cannibalization, data date | market, language, domain maturity, product |
| marketing-011 | Keyword Clusterer | approved keyword set | intent-based clusters and page mapping | semantic overlap, search intent, brand risk | country, language, funnel stage, site structure |
| marketing-012 | Content Repurposer | approved source asset | channel-specific derivatives with lineage | meaning preserved, claim/source link, duplication | channel, length, voice, audience, format |
| marketing-013 | Social Distributor | approved assets and calendar | channel distribution packet | channel policy, tags/links, frequency, no publish | market, network, timezone, audience |
| marketing-014 | Publishing Scheduler | reviewed assets and campaign dates | schedule proposal and dependencies | approvals complete, collisions, embargo, timezone | channel, region, team capacity, campaign priority |
| marketing-015 | Creative QA Agent | final creative and brief | pass/fail QA with corrections | brand, spelling, dimensions, accessibility, claim map | channel spec, language, brand version, jurisdiction |
| marketing-016 | Brand Voice Reviewer | draft and brand guide | voice deviations and edited option | preserve facts, audience fit, prohibited language | brand, persona, channel, country |
| marketing-017 | Competitor Content Monitor | competitor watchlist and public sources | sourced change/signal brief | public provenance, recency, no speculation | competitor tier, product, market, cadence |
| marketing-018 | Offer Test Designer | offer hypothesis and baseline | test design, variants, sample and decision rule | one primary variable, power/sample, guardrails | funnel stage, channel, budget, market |
| marketing-019 | Landing Page Reviewer | page, audience and conversion goal | prioritized friction/clarity/accessibility report | tracking, mobile, claims, form/privacy, performance | device mix, traffic source, language, offer |
| marketing-020 | Marketing Report Agent | approved metrics and commentary | role-specific periodic report | metric lineage, anomaly flags, comparable periods | audience, cadence, channel, level of detail |

## 7. Operations — 24 services

Department outcome: move goods and data from approved purchase order to verified inventory. Default hard constraint: no shipment advances when required documents, compliance fields or exception ownership are missing.

| ID | Agent | Starts with | Produces | Critical checks | Personalized by |
|---|---|---|---|---|---|
| operations-001 | Purchase Order Intake | approved PO/file/API event | canonical PO and validation packet | supplier/SKU/qty/price/currency/terms, duplicate PO | ERP, entity, product type, approval matrix |
| operations-002 | Supplier Onboarding | selected supplier and onboarding request | supplier record, required evidence and task plan | legal identity, bank-change control, ownership, documents | country, category, risk tier, payment method |
| operations-003 | Supplier Compliance Checker | supplier or document change | pass/gap/expiry risk report | source, effective/expiry dates, sanctions handoff, scope | country pair, category, certification, policy |
| operations-004 | Product Master Data Agent | new/changed SKU | validated canonical product record | unique SKU, dimensions/UOM, origin, regulatory fields | vertical, category, market, ERP schema |
| operations-005 | HS Code Assistant | product facts and destination | ranked classification candidates with rationale | sufficient composition/use evidence, source/version, broker confirmation | importing country, product, language, tariff source |
| operations-006 | Incoterm Checker | quote/PO/shipment terms | responsibility/cost/risk handoff map | named Incoterm/version/place, contract consistency | route, mode, customer/supplier policy |
| operations-007 | Freight Quote Comparator | normalized carrier/forwarder quotes | comparable cost/service/risk scorecard | same scope, surcharges, transit basis, expiry, exclusions | mode, lane, volume, service priorities |
| operations-008 | Shipment Planner | approved PO and inventory need date | routing/milestone plan and assumptions | production readiness, cutoffs, lead-time buffer, capacity | lane, mode, season, Incoterm, warehouse |
| operations-009 | Booking Coordinator | approved shipment plan | booking request packet and follow-up tasks | approval, cargo details, dangerous goods, duplicate booking | forwarder, lane, mode, account instructions |
| operations-010 | Document Pack Validator | shipment document set | completeness/consistency matrix | required docs, versions, party names, SKU/qty/value consistency | country, mode, commodity, broker checklist |
| operations-011 | Commercial Invoice QA | supplier commercial invoice | field-level discrepancy report | seller/buyer, currency, terms, SKU/qty/value, origin | country, broker format, PO, Incoterm |
| operations-012 | Packing List QA | packing list and PO/invoice | quantity/weight/volume/package reconciliation | totals, package marks, dimensions, invoice consistency | mode, warehouse, carrier, product |
| operations-013 | Bill of Lading QA | draft/final transport document | correction list or accepted packet | parties, ports, marks, packages, originals/telex status | carrier, mode, route, documentary policy |
| operations-014 | Customs Readiness Agent | pre-arrival shipment file | readiness score, blockers and broker handoff | classification confirmation, values, permits, originals, deadlines | country, port, product, broker SOP |
| operations-015 | Duty Estimate Agent | confirmed/candidate HS, value and origin | itemized estimate with exclusions | rate source/date, customs value, preference evidence, no filing | destination, trade agreement, product, currency |
| operations-016 | Landed Cost Calculator | PO, shipment and cost components | planned/actual unit cost, variance and margin impact | complete components, FX timestamp, allocation balances, source | entity, allocation policy, recoverable tax, margin floor |
| operations-017 | ETA Monitor | carrier milestones and expected plan | normalized ETA change event | source freshness, timezone, duplicate event, confidence | lane, carrier, milestone SLA, customer sensitivity |
| operations-018 | Shipment Exception Detector | milestone/document/cost deviation | severity, cause hypothesis, owner and deadline | policy threshold, corroborating evidence, duplicate incident | lane, product criticality, customer promise, risk matrix |
| operations-019 | Warehouse Arrival Planner | verified ETA and inbound contents | dock/resource/receipt preparation packet | warehouse capacity, ASN, package data, inspection need | warehouse, shift, product, appointment rules |
| operations-020 | Inventory Sync Agent | receipt/adjustment/catalog event | reconciliation result and safe sync proposal | source authority, reservation, duplicate event, negative stock | ERP/WMS/commerce stack, SKU mapping, location |
| operations-021 | Quality Inspection Agent | receipt or pre-shipment inspection | inspection plan/result and disposition route | sampling rule, specification version, evidence/photos, authority | product/category, supplier tier, stage, defect policy |
| operations-022 | Incident Commander | critical exception | incident timeline, roles, actions and comms plan | severity, single owner, escalation, evidence preservation | incident type, customer impact, region, on-call roster |
| operations-023 | Operations Status Reporter | operating cadence or stakeholder request | sourced status by shipment/risk/owner | latest events, blocked items, no unsupported ETA | audience, cadence, portfolio, detail level |
| operations-024 | Operations Handoff Agent | received/inspected inventory or unresolved event | downstream customer/finance/deals packet | accepted receipt, actual costs, exceptions, owner | next department, product, customer order, ERP |

## 8. Intelligence — 17 services

Department outcome: convert external signals into prioritized, sourced operating decisions. Default hard constraint: no signal becomes a recommendation without provenance, recency and confidence.

| ID | Agent | Starts with | Produces | Critical checks | Personalized by |
|---|---|---|---|---|---|
| intelligence-001 | Company Research Agent | named company and decision question | sourced company dossier | entity match, source quality, recency, facts vs inference | use case, country, depth, risk tier |
| intelligence-002 | Supplier Research Agent | supplier candidate or review date | capability/risk evidence pack | legal entity, provenance, adverse-signal verification, date | country, category, spend, criticality |
| intelligence-003 | Competitive Intelligence Agent | competitor watchlist and question | change brief and business implication | public/authorized sources, date, confidence, no trade-secret request | market, product, cadence, stakeholder |
| intelligence-004 | Market Mapper | category/geography thesis | market structure, actors and white spaces | definitions, source coverage, date, uncertainty | geography, segment, channel, time horizon |
| intelligence-005 | Country Risk Monitor | active country exposure | risk changes and affected records | authoritative sources, materiality, effective date | countries, exposure type, risk appetite |
| intelligence-006 | Regulatory Signal Monitor | jurisdiction/topic watchlist | sourced change alert and validation tasks | official source priority, proposed vs effective, legal review | country, product, regulation, lead time |
| intelligence-007 | Commodity Price Monitor | commodity/index exposure | movement alert and margin scenario | source, unit/currency, benchmark date, threshold | commodity, hedge policy, product mapping |
| intelligence-008 | FX Exposure Monitor | open foreign-currency commitments | exposure and scenario packet | amount/date/currency, rate source, no trading action | entity, currencies, tolerance, hedge policy |
| intelligence-009 | Shipping Lane Monitor | active/planned lanes | disruption/capacity/rate signal | route relevance, source corroboration, recency | lane, mode, carrier, shipment criticality |
| intelligence-010 | Port Congestion Monitor | port watchlist and shipments | congestion alert and impacted shipments | measurable indicator, source date, alternative feasibility | port, lane, buffer policy, service tier |
| intelligence-011 | Sanctions Screener | party/product/country change | potential match packet for human compliance | list/version, identifiers, false-positive handling, no auto-accusation | jurisdiction, threshold, screening provider |
| intelligence-012 | Product Trend Scout | category and market | sourced demand/product trend hypotheses | recency, representative evidence, no forecast overclaim | category, channel, country, horizon |
| intelligence-013 | Demand Signal Monitor | internal/external demand feeds | normalized demand anomaly and affected SKUs | seasonality, baseline, source lineage, confidence | product, market, replenishment lead time |
| intelligence-014 | Tender Monitor | tender sources and qualification rules | relevant opportunity alert and requirement summary | deadline, issuer authenticity, fit evidence, no duplicate | geography, category, minimum value, eligibility |
| intelligence-015 | Opportunity Synthesizer | multiple validated signals | ranked action proposals with owners | source diversity, dependency, expected value, uncertainty | strategy, capacity, risk, department |
| intelligence-016 | Weekly Intelligence Brief | approved signals and operating context | executive brief with decisions requested | citations, novelty, affected objects, accountable owner | executive role, country/vertical, cadence |
| intelligence-017 | Alert Prioritizer | incoming intelligence alerts | severity/urgency/actionability queue | impact, confidence, time-to-act, duplicate/correlation | risk appetite, department capacity, quiet hours |

## 9. Customer — 19 services

Department outcome: resolve customer needs with the same verified order and logistics facts used by operations. Default hard constraint: no promise may exceed verified inventory, shipment status, commercial terms or service policy.

| ID | Agent | Starts with | Produces | Critical checks | Personalized by |
|---|---|---|---|---|---|
| customer-001 | Ticket Classifier | new inbound case | issue type, severity, intent and route | customer/order match, urgent-risk detection, confidence | language, channel, taxonomy, SLA tier |
| customer-002 | Support Deflection Agent | eligible question and knowledge context | cited self-service answer or escalation | answer confidence, policy scope, freshness, no unsupported promise | product, customer tier, channel, language |
| customer-003 | Order Status Agent | order-status request | verified status, next milestone and uncertainty | correct customer/order, source freshness, promised vs estimated date | order system, SLA, channel, detail level |
| customer-004 | Shipment Explanation Agent | shipment delay/exception and customer context | plain-language explanation and next update commitment | verified facts, allowed disclosure, no blame/speculation | customer tier, language, severity, contract |
| customer-005 | Returns Triage | return request and order/policy | eligibility, evidence needed and route | window, product condition, exceptions, refund authority | market, product, channel, policy version |
| customer-006 | Claims Intake Agent | loss/damage/shortage report | complete claim packet and owner | deadlines, evidence/photos, shipment/order linkage, no admission | carrier/insurer, country, claim type, value |
| customer-007 | SLA Monitor | open cases and calendars | breach warning/escalation event | business calendar, pause states, priority, duplicate alert | contract, customer tier, region, support hours |
| customer-008 | Customer Health Scorer | usage/order/support/payment signals | explainable health score and reason codes | feature freshness, calibrated thresholds, missing-data treatment | vertical, lifecycle, account tier, product |
| customer-009 | Churn Risk Agent | health deterioration or risk trigger | risk packet and recommended intervention | reason evidence, fairness, no certainty claim, owner | vertical, customer value, renewal date, playbook |
| customer-010 | Renewal Signal Agent | contract/usage/relationship timeline | renewal readiness and action plan | dates, entitlement, unresolved issues, owner | contract type, notice period, account tier |
| customer-011 | Upsell Signal Agent | verified need/usage/order pattern | relevant expansion hypothesis for Deals | customer benefit, eligibility, stock/capacity, no auto-send | product affinity, account tier, lifecycle |
| customer-012 | Voice of Customer Analyst | cases/reviews/surveys/calls | theme, frequency, severity and evidence samples | representative sample, PII controls, theme stability | product, segment, market, time period |
| customer-013 | Complaint Root Cause Agent | linked complaints and operational events | probable causes and corrective-action candidates | correlation vs causation, evidence, owner, recurrence | issue class, product, supplier, process |
| customer-014 | Knowledge Gap Detector | low-confidence/failed resolutions | missing or stale knowledge queue | repeated demand, existing article check, owner | product, language, channel, failure threshold |
| customer-015 | Customer Success Briefing | scheduled review and account history | outcomes, risks, open items and agenda | latest facts, financial sensitivity, unresolved promises | stakeholder, account tier, meeting type |
| customer-016 | Community Moderator | community post/comment | policy classification and response/escalation draft | safety, community rules, context, no silent deletion | community, language, severity, brand |
| customer-017 | Review Response Agent | public review and customer context | channel-appropriate response draft and private follow-up | privacy, no account detail, tone, escalation | rating, channel, language, brand, issue |
| customer-018 | Escalation Router | high-risk/unresolved case | accountable owner, severity, deadline and briefing | escalation policy, on-call availability, duplicate incident | issue, value, customer tier, region |
| customer-019 | Customer Report Agent | reporting cadence and account data | customer-safe service/order/performance report | contract metrics, verified data, confidentiality, period | account, audience, format, cadence |

## 10. Back Office — 18 services

Department outcome: keep cash, contracts, controls and reporting aligned with physical operations. Default hard constraint: no payment, contract change or journal entry without deterministic validation and approval evidence.

| ID | Agent | Starts with | Produces | Critical checks | Personalized by |
|---|---|---|---|---|---|
| back-office-001 | Invoice Generator | billable event and approved terms | draft invoice payload/document | legal entity, tax fields, price/qty, duplicate invoice, period | country, currency, ERP, invoice format |
| back-office-002 | Invoice Matcher | incoming invoice and candidate records | match confidence, discrepancies and route | supplier identity, amount/currency, PO/receipt, duplicate | document type, tolerance, ERP, supplier |
| back-office-003 | Accounts Receivable Agent | open receivable or payment event | aging status, next action and owner | applied payments, disputes, promised date, customer policy | entity, customer tier, aging bucket, channel |
| back-office-004 | Payment Reminder Agent | approved overdue receivable | reminder draft and escalation path | balance validity, dispute/suppression, cadence, no send | language, customer tier, days overdue, tone |
| back-office-005 | Accounts Payable Agent | approved supplier liability | payment-preparation packet | vendor/master change, due date, duplicate, approval status | entity, supplier tier, currency, payment run |
| back-office-006 | Three-Way Match Agent | PO, receipt and invoice | matched/unmatched result with tolerances | line identity, qty, price, tax/freight, partial receipt | category, threshold, ERP, landed-cost policy |
| back-office-007 | Expense Categorizer | expense document/transaction | proposed category, tax treatment and evidence | chart version, business purpose, duplicate, confidence | entity, country, chart, cardholder/project |
| back-office-008 | Cash Flow Forecaster | bank/AR/AP/orders/commitments | scenario forecast and confidence bands | opening cash, timing assumptions, intercompany, double count | entity, horizon, currencies, scenarios |
| back-office-009 | Margin Monitor | sales, cost and landed-cost updates | margin variance alert and drivers | revenue/cost period, allocation, FX, returns/discounts | product, customer, shipment, margin floor |
| back-office-010 | FX Reconciliation Agent | foreign-currency transaction and rates | realized/unrealized variance work packet | rate/date/source, settlement, account mapping | entity, currency pair, accounting policy |
| back-office-011 | Tax Pack Prep Agent | period transactions and tax rules | evidence-indexed preparation pack | period completeness, jurisdiction, source docs, no filing | country, entity, tax regime, advisor format |
| back-office-012 | Contract Extractor | executed/draft contract | structured clauses, dates, parties and obligations | correct version, OCR confidence, page citations, confidentiality | contract type, language, clause taxonomy |
| back-office-013 | Contract Risk Agent | extracted contract and policy | deviations, severity and legal questions | approved playbook, jurisdiction, materiality, no legal approval | contract type, country, value, risk appetite |
| back-office-014 | Renewal Calendar Agent | contract dates and notice terms | renewal/notice tasks and owners | date confidence, timezone, superseding agreement, duplicate | contract type, notice buffer, owner, entity |
| back-office-015 | Vendor Payment Approval | prepared payment packet | approval decision request with evidence | three-way match, bank-change verification, authority, segregation | amount, currency, entity, supplier risk |
| back-office-016 | Monthly Close Checklist | close calendar and ledger status | task state, blockers, evidence and escalation | period/entity, dependency, reconciliations, sign-off | entity, accounting framework, system, close day |
| back-office-017 | Finance Report Agent | approved financial/operational metrics | role-specific report and variance narrative | ledger/source lineage, period, adjustments, confidentiality | audience, entity, currency, cadence |
| back-office-018 | Audit Pack Builder | audit/control request and period | indexed evidence package and control narrative | completeness, immutable references, access, retention | audit type, entity, period, framework |

## 11. Personalization examples across businesses

The same agent ID persists; its configuration changes.

### Example A — `operations-018 Shipment Exception Detector`

| Pack | Object observed | Exception | Evidence | Owner |
|---|---|---|---|---|
| Importer | international shipment | ETA slip > 7 days or customs hold | carrier event, broker update, planned milestone | operations coordinator |
| Distributor | replenishment transfer | stockout before inbound availability | demand, stock, PO and ETA | supply planner |
| Construction | material delivery | delivery misses site critical path | PO, vendor commitment, project schedule | project manager |
| Professional services | client deliverable | milestone will miss contractual date | task progress, dependency, capacity | engagement manager |

### Example B — `back-office-006 Three-Way Match Agent`

| Pack | Documents matched | Special policy |
|---|---|---|
| Importer | PO + warehouse receipt + supplier/broker/freight invoice | allocate landed-cost components separately |
| Ecommerce | PO + fulfillment receipt + supplier invoice | SKU/variant and damaged quantity controls |
| Construction | PO/subcontract + approved delivery/progress + invoice | retention and change-order validation |
| SaaS | contract/order form + entitlement/usage + invoice | usage-tier and billing-period reconciliation |

### Example C — `customer-003 Order Status Agent`

| Pack | Authoritative state | Promise rule |
|---|---|---|
| Importer/distributor | ERP order + shipment + customs + WMS | verified milestone plus policy buffer |
| Ecommerce | commerce order + fulfillment carrier | carrier milestone, replacement/refund policy |
| SaaS | subscription + provisioning + incident status | entitlement and current service health |
| Recruiting | candidate/application stage | only approved process stage; no hiring prediction |

## 12. Production definition of done for any agent

An agent cannot be enabled for live work until all boxes are true:

- [ ] named business owner and technical owner;
- [ ] versioned job statement, trigger and input/output schemas;
- [ ] source authority and minimum evidence defined;
- [ ] allowed reads/writes and forbidden actions tested;
- [ ] deterministic checks and approval policy implemented;
- [ ] blocked, exception, timeout and upstream-outage behavior tested;
- [ ] 30–100 representative golden cases evaluated, based on risk;
- [ ] quality threshold, KPI, sampling and rollback rules approved;
- [ ] token/tool/latency budgets and model fallback configured;
- [ ] idempotency, retries, dead-letter queue and correlation ID verified;
- [ ] audit event, retention, privacy and deletion handling verified;
- [ ] runbook, dashboard, alert, change log and six-month takeover notes complete.

## 13. Six-month takeover documentation per agent

Each production service gets one generated page containing:

1. job and business value;
2. process diagram and event trigger;
3. input/output schemas with examples;
4. source systems, credentials owner and rate limits;
5. decision table and approval matrix;
6. prompt/model configuration when AI is used;
7. known failure modes, retries and manual recovery;
8. dashboards, alerts, budgets and normal operating range;
9. tests, golden cases and latest evaluation results;
10. change history, current owners and rollback procedure.

That page should be generated from the registry wherever possible so documentation cannot quietly drift away from runtime behavior.
