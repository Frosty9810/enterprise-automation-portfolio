export type DepartmentId = "sales" | "deals" | "marketing" | "operations" | "intelligence" | "customer" | "back-office";

export type Department = {
  id: DepartmentId;
  code: string;
  name: string;
  accent: string;
  purpose: string;
  guardrail: string;
  nextDepartment: string;
  knowledgeTags: string[];
  jobs: string[];
};

export type Agent = {
  id: string;
  departmentId: DepartmentId;
  department: string;
  number: number;
  name: string;
  mission: string;
  permission: string;
  guardrail: string;
  knowledgeTags: string[];
  nextDepartment: string;
};

export type KnowledgeRecord = {
  id: string;
  domain: string;
  title: string;
  detail: string;
  source: string;
  updated: string;
  tags: string[];
};

export const departments: Department[] = [
  {
    id: "sales", code: "01", name: "Sales", accent: "#ef6b4a",
    purpose: "Turn a defined market into qualified, contextualized conversations.",
    guardrail: "No contact is enrolled without fit evidence, consent basis, deduplication, and a deliverability check.",
    nextDepartment: "Deals", knowledgeTags: ["customer", "product", "market"],
    jobs: ["ICP Strategist", "Segment Scorer", "Territory Mapper", "Importer Prospect Finder", "Distributor Prospect Finder", "Retailer Prospect Finder", "Lead Deduplicator", "Company Enricher", "Contact Enricher", "Buying Signal Monitor", "Fit Scorer", "Cold Email Drafter", "Personalization Researcher", "Sequence Planner", "Deliverability Checker", "Call Briefing Agent", "Objection Mapper", "Follow-up Scheduler", "CRM Hygiene Agent", "Handoff Packager", "Sales Forecast Input Agent"],
  },
  {
    id: "deals", code: "02", name: "Deals", accent: "#f5b83d",
    purpose: "Move qualified interest through a controlled commercial decision process.",
    guardrail: "No quote or term is final until margin, inventory, delivery feasibility, and approval thresholds pass.",
    nextDepartment: "Operations", knowledgeTags: ["customer", "product", "finance", "policy"],
    jobs: ["Reply Classifier", "Intent Scorer", "Qualification Checker", "Meeting Scheduler", "Meeting Prep Agent", "Discovery Note Structurer", "Proposal Scope Writer", "Landed Cost Proposal Agent", "Quote Validator", "Terms Risk Checker", "Deal Follow-up Agent", "Negotiation Brief Agent", "Deal Desk Router", "Pipeline Stage Agent", "Stalled Deal Detector", "Mutual Close Plan Agent", "Won Deal Handoff", "Deal Debrief Agent"],
  },
  {
    id: "marketing", code: "03", name: "Marketing", accent: "#b7ca39",
    purpose: "Convert product and market evidence into measurable demand programs.",
    guardrail: "Every claim must map to an approved product fact, source, or measured campaign result.",
    nextDepartment: "Sales", knowledgeTags: ["product", "market", "customer"],
    jobs: ["Performance Analyst", "Attribution Auditor", "Campaign Diagnostician", "Content Strategist", "Product Story Writer", "Video Script Writer", "Carousel Architect", "Case Study Builder", "Email Campaign Writer", "SEO Opportunity Mapper", "Keyword Clusterer", "Content Repurposer", "Social Distributor", "Publishing Scheduler", "Creative QA Agent", "Brand Voice Reviewer", "Competitor Content Monitor", "Offer Test Designer", "Landing Page Reviewer", "Marketing Report Agent"],
  },
  {
    id: "operations", code: "04", name: "Operations", accent: "#23a47b",
    purpose: "Move goods and data from approved purchase order to verified inventory.",
    guardrail: "No shipment advances when required documents, compliance fields, or exception ownership are missing.",
    nextDepartment: "Customer", knowledgeTags: ["supplier", "product", "logistics", "customs", "policy"],
    jobs: ["Purchase Order Intake", "Supplier Onboarding", "Supplier Compliance Checker", "Product Master Data Agent", "HS Code Assistant", "Incoterm Checker", "Freight Quote Comparator", "Shipment Planner", "Booking Coordinator", "Document Pack Validator", "Commercial Invoice QA", "Packing List QA", "Bill of Lading QA", "Customs Readiness Agent", "Duty Estimate Agent", "Landed Cost Calculator", "ETA Monitor", "Shipment Exception Detector", "Warehouse Arrival Planner", "Inventory Sync Agent", "Quality Inspection Agent", "Incident Commander", "Operations Status Reporter", "Operations Handoff Agent"],
  },
  {
    id: "intelligence", code: "05", name: "Intelligence", accent: "#319acb",
    purpose: "Convert external signals into prioritized, sourced operating decisions.",
    guardrail: "A signal cannot become a recommendation without source provenance, recency, and confidence labels.",
    nextDepartment: "Operations", knowledgeTags: ["supplier", "market", "logistics", "customs", "risk"],
    jobs: ["Company Research Agent", "Supplier Research Agent", "Competitive Intelligence Agent", "Market Mapper", "Country Risk Monitor", "Regulatory Signal Monitor", "Commodity Price Monitor", "FX Exposure Monitor", "Shipping Lane Monitor", "Port Congestion Monitor", "Sanctions Screener", "Product Trend Scout", "Demand Signal Monitor", "Tender Monitor", "Opportunity Synthesizer", "Weekly Intelligence Brief", "Alert Prioritizer"],
  },
  {
    id: "customer", code: "06", name: "Customer", accent: "#7779dc",
    purpose: "Resolve customer needs using the same order and logistics facts as operations.",
    guardrail: "No promise may exceed the verified inventory, shipment status, commercial terms, or service policy.",
    nextDepartment: "Deals", knowledgeTags: ["customer", "product", "logistics", "policy"],
    jobs: ["Ticket Classifier", "Support Deflection Agent", "Order Status Agent", "Shipment Explanation Agent", "Returns Triage", "Claims Intake Agent", "SLA Monitor", "Customer Health Scorer", "Churn Risk Agent", "Renewal Signal Agent", "Upsell Signal Agent", "Voice of Customer Analyst", "Complaint Root Cause Agent", "Knowledge Gap Detector", "Customer Success Briefing", "Community Moderator", "Review Response Agent", "Escalation Router", "Customer Report Agent"],
  },
  {
    id: "back-office", code: "07", name: "Back Office", accent: "#b36bc1",
    purpose: "Keep cash, contracts, controls, and reporting aligned with physical operations.",
    guardrail: "No payment, contract change, or journal entry is executed without deterministic validation and approval evidence.",
    nextDepartment: "Operations", knowledgeTags: ["finance", "supplier", "policy", "customer"],
    jobs: ["Invoice Generator", "Invoice Matcher", "Accounts Receivable Agent", "Payment Reminder Agent", "Accounts Payable Agent", "Three-Way Match Agent", "Expense Categorizer", "Cash Flow Forecaster", "Margin Monitor", "FX Reconciliation Agent", "Tax Pack Prep Agent", "Contract Extractor", "Contract Risk Agent", "Renewal Calendar Agent", "Vendor Payment Approval", "Monthly Close Checklist", "Finance Report Agent", "Audit Pack Builder"],
  },
];

const permissionByDepartment: Record<DepartmentId, string> = {
  sales: "Read CRM and market records; draft only; no autonomous enrollment or outbound send.",
  deals: "Read CRM, pricing, and inventory; draft updates; approval required for quotes and terms.",
  marketing: "Read approved product and campaign data; create drafts; publishing requires review.",
  operations: "Read operational systems; prepare and validate records; external bookings require approval.",
  intelligence: "Read approved public/internal sources; create sourced alerts; no unsourced recommendations.",
  customer: "Read customer and order context; draft responses; refunds and promises require approval.",
  "back-office": "Read finance and contract data; prepare transactions; no autonomous money movement.",
};

export const agents: Agent[] = departments.flatMap((department) =>
  department.jobs.map((job, index) => ({
    id: `${department.id}-${String(index + 1).padStart(3, "0")}`,
    departmentId: department.id,
    department: department.name,
    number: index + 1,
    name: job,
    mission: `${job} converts a defined ${department.name.toLowerCase()} input into a reviewable handoff with evidence and an explicit next owner.`,
    permission: permissionByDepartment[department.id],
    guardrail: department.guardrail,
    knowledgeTags: department.knowledgeTags,
    nextDepartment: department.nextDepartment,
  }))
);

if (agents.length !== 137) {
  throw new Error(`Agent registry must contain exactly 137 agents; received ${agents.length}.`);
}

export const knowledgeRecords: KnowledgeRecord[] = [
  { id: "KB-SUP-01", domain: "Supplier", title: "Pacific Components — approved supplier profile", detail: "Approved for electrical accessories. Standard lead time: 32 days. MOQ: 500 units. Quality inspection required before balance payment.", source: "Supplier master / reference fixture", updated: "2026-08-01", tags: ["supplier", "product", "policy"] },
  { id: "KB-SUP-02", domain: "Supplier", title: "Andina Textiles — conditional supplier profile", detail: "Conditional approval. Pre-shipment sample required for every new SKU. Payment terms capped at 30% deposit until three accepted lots.", source: "Supplier master / reference fixture", updated: "2026-07-18", tags: ["supplier", "policy", "risk"] },
  { id: "KB-PRD-01", domain: "Product", title: "SKU ELEC-440 product record", detail: "Universal travel adapter, target landed-cost ceiling USD 8.40, retail channel, HS candidate 8536.69 subject to broker confirmation.", source: "Product master / reference fixture", updated: "2026-08-12", tags: ["product", "customs", "finance"] },
  { id: "KB-PRD-02", domain: "Product", title: "SKU HOME-210 product record", detail: "Stackable storage set, 12 units per carton, volumetric weight governs current air quotes, sea freight preferred above 180 cartons.", source: "Product master / reference fixture", updated: "2026-08-10", tags: ["product", "logistics", "finance"] },
  { id: "KB-LOG-01", domain: "Logistics", title: "Shenzhen → Arica routing policy", detail: "Default mode: ocean LCL. Planning lead time: 38–46 days port-to-port plus 4–7 days customs and inland transfer. Escalate after 48 hours without milestone update.", source: "Lane playbook / reference fixture", updated: "2026-08-15", tags: ["logistics", "supplier", "customer"] },
  { id: "KB-LOG-02", domain: "Logistics", title: "Shipment exception severity matrix", detail: "Critical: customs hold, missing original document, cargo damage, or ETA slip over 7 days. Critical events require an owner and customer communication plan within 2 hours.", source: "Incident policy / reference fixture", updated: "2026-08-11", tags: ["logistics", "policy", "customer", "risk"] },
  { id: "KB-CUS-01", domain: "Customs", title: "Classification and duty rule", detail: "HS suggestions are advisory only. A licensed broker confirms classification before declaration. Duty estimates must show source, base value, and excluded taxes.", source: "Customs SOP / reference fixture", updated: "2026-08-09", tags: ["customs", "policy", "finance"] },
  { id: "KB-FIN-01", domain: "Finance", title: "Commercial approval thresholds", detail: "Quotes below 18% gross margin require finance review. Supplier commitments above USD 25,000 require dual approval from Finance and Operations.", source: "Approval policy / reference fixture", updated: "2026-08-05", tags: ["finance", "policy", "supplier"] },
  { id: "KB-FIN-02", domain: "Finance", title: "Landed-cost calculation standard", detail: "Landed cost includes unit cost, origin charges, freight, insurance, duty, brokerage, inland transport, and non-recoverable tax. Assumptions must be listed separately.", source: "Finance SOP / reference fixture", updated: "2026-08-06", tags: ["finance", "logistics", "customs", "product"] },
  { id: "KB-CST-01", domain: "Customer", title: "Distributor service level", detail: "Acknowledge order-status questions within 4 business hours. Do not promise arrival dates beyond the latest verified carrier milestone plus customs buffer.", source: "Customer policy / reference fixture", updated: "2026-08-03", tags: ["customer", "logistics", "policy"] },
  { id: "KB-MKT-01", domain: "Market", title: "Retail channel positioning", detail: "Primary buyer values dependable stock, documented compliance, and predictable replenishment over lowest unit price. Approved claims must cite product master evidence.", source: "Market brief / reference fixture", updated: "2026-07-30", tags: ["market", "customer", "product"] },
  { id: "KB-RSK-01", domain: "Risk", title: "Agent action control policy", detail: "AI output is advisory. External messages, bookings, payments, contract changes, refunds, and destructive data writes require deterministic validation and human approval.", source: "AI control standard", updated: "2026-08-20", tags: ["risk", "policy", "finance", "customer", "supplier"] },
];

const playbooks: Record<DepartmentId, string[]> = {
  sales: ["Validate target fit against the ICP", "Enrich only the fields required for the next decision", "Prepare a contextual message or call brief", "Package evidence and route qualified interest to Deals"],
  deals: ["Classify commercial intent and missing qualification data", "Check pricing, margin, inventory, and approval thresholds", "Prepare the next commercial artifact", "Route the reviewed handoff to Operations"],
  marketing: ["Ground the brief in approved product and market evidence", "Create the channel-specific artifact", "Run claim, brand, and accessibility checks", "Publish only after review and feed response signals to Sales"],
  operations: ["Validate required order, supplier, product, and shipment fields", "Apply logistics, customs, and finance rules", "Identify exceptions and assign an owner", "Produce the operational record and customer-ready handoff"],
  intelligence: ["Collect recent sources and preserve provenance", "Separate observed signals from inference", "Score impact, confidence, and time horizon", "Route only actionable, sourced alerts to the owning department"],
  customer: ["Identify the customer, order, and service obligation", "Retrieve the latest verified operational facts", "Prepare a policy-compliant answer or escalation", "Capture the outcome and route commercial signals to Deals"],
  "back-office": ["Match the financial or contractual record to source evidence", "Apply thresholds, segregation of duties, and reconciliation rules", "Prepare the transaction or report for approval", "Record the audit trail and notify the operational owner"],
};

export function executeAgent(agentId: string, task: string) {
  const agent = agents.find((item) => item.id === agentId);
  if (!agent) throw new Error("Unknown agent identifier.");
  const cleanTask = task.trim();
  if (cleanTask.length < 8) throw new Error("Describe a concrete task in at least 8 characters.");

  const evidence = knowledgeRecords
    .filter((record) => record.tags.some((tag) => agent.knowledgeTags.includes(tag)))
    .slice(0, 3);
  const routingConfidence = Math.min(0.96, 0.82 + ((agent.number % 8) * 0.02));

  return {
    runId: `RUN-${agent.departmentId.toUpperCase()}-${String(Date.now()).slice(-6)}`,
    mode: "deterministic-reference",
    status: "ready_for_review",
    agent: { id: agent.id, name: agent.name, department: agent.department },
    task: cleanTask,
    summary: `${agent.name} prepared a reviewable ${agent.department.toLowerCase()} work packet for: “${cleanTask}”`,
    steps: playbooks[agent.departmentId],
    evidence,
    decision: `Proceed to human review because the required ${agent.department.toLowerCase()} evidence is present; execution remains inside the agent's permission boundary.`,
    constraint: agent.guardrail,
    handoff: { owner: agent.nextDepartment, artifact: `${agent.name} evidence packet`, state: "awaiting_review" },
    routingConfidence,
    createdAt: new Date().toISOString(),
  };
}
