# Business analysis

> Status: **Populated — requirement traceability and explicitly synthetic value model.**

Translate the [discovery evidence](../02%20Discovery/README.md) into a bounded decision, a counterexample and an observable result. The examples below describe checked-in local behavior; they are not signed client requirements or an assurance of hosted integration.

## Requirement-to-evidence traceability

| Requirement | Existing implementation | Acceptance and adverse boundary | Remaining operational work |
|---|---|---|---|
| Store only an eligible relationship handoff | [Contact planner](../integrations/ghl-n8n/contract.mjs) | [Planner tests](../tests/ghl-n8n.test.mjs): consent/tenant validation and field minimization | Trusted consent provenance, authenticated tenant mapping and retention policy |
| Avoid a second effect after acknowledgement loss | [Durable recovery](../demo-lab/reliability.mjs) | [Recovery tests](../demo-lab/reliability.test.mjs): uncertainty blocks retry; reconciliation observes the committed local effect | Real provider lookup and reconciliation acceptance |
| Hold invoices when evidence is insufficient | [Invoice matcher](../16%20Accounting/ACC-01%20Accounts%20Payable%20Match%20and%20Cash%20Control/build/invoice_matcher.py) | [Invoice tests](../tests/test_invoice_controls.py): duplicate, quantity, monetary and changed-bank controls | Trusted purchase records, durable invoice identity and authenticated approval |
| Propose only a feasible maintenance window | [Industry depth](../demo-lab/industry-depth.mjs) | [Industry tests](../demo-lab/industry-depth.test.mjs): access, approved vendor, interval and emergency cases | Transactional reservations, trusted emergency intake and dispatch authority |
| Prevent stale analysis from being exported | [Flagship receipt controller](../demo-lab/flagship-suite.mjs) | [Receipt tests](../demo-lab/flagship-suite.test.mjs): current source identity and acknowledgement gate | Authenticated reviewers and complete production dependency/provenance model |

Run the listed tests after [local environment setup](../38%20Deployment/README.md); the [review handoff](../REVIEW-HANDOFF.md) supplies full acceptance commands. A green local result accepts only the row's described local behavior.

## Value hypothesis with visible assumptions

Use the canonical [ROI analysis template](../41%20Templates/roi-analysis-template.md). For illustration only, assume 400 tasks/month, six minutes of manual work per task, 40% of tasks eligible for a three-minute reduction and a loaded labor rate of $30/hour:

```text
Gross time reduction = 400 × 0.40 × 3 / 60 = 8 hours/month
Gross labor capacity = 8 × $30 = $240/month
Assumed recurring cost = $90/month
Net monthly benefit = $240 - $90 = $150/month
Assumed one-time cost = $1,200
Illustrative payback = $1,200 / $150 = 8 months
```

These numbers are invented planning inputs, not repository measurements, provider pricing or a client result. Gross labor capacity becomes cash savings only when the operating model supports that conversion. If exception handling consumes the eight hours or recurring cost reaches $240, this example has no positive net benefit and no positive payback period. Measure actual eligible volume, handling-time distributions, rework and operating cost before approving investment.

## Prioritization and release acceptance

Prefer a narrow, frequently occurring decision with visible failure evidence, low data sensitivity and a reversible local outcome. Prioritize broken validation and unresolved serious review findings before new project count. The [project roadmap](../demo-lab/PORTFOLIO-ROADMAP.md) ranks integration work; the [inventory](../PROJECT-INVENTORY.md) separates existing demos from incomplete flagships and blueprints.

For each next slice, record the requirement ID, owner, current behavior, expected behavior, affected source files, one normal case, one adverse case, evidence location and the remaining provider/human acceptance. Keep analysis acknowledgement, operational approval and permission to contact a person as separate requirements.

---
*Part of the [Enterprise Automation Portfolio](../README.md).*
