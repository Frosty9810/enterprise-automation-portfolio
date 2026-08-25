# ACC-01 — Accounts Payable Match & Cash Control

**Flow:** `Invoice intake → duplicate check → supplier/PO resolution → invoice/PO/receipt match → tolerance policy → approval queue → ERP draft → cash forecast → audit`  
**System:** The ERP owns vendors, POs, receipts, and posted liabilities; this service owns extraction evidence, match decisions, approvals, and draft receipts.  
**Hard constraint:** The workflow credential may create a draft payable but cannot release payment.

## Technical core

The three-way matcher compares quantity, unit price, tax, currency, and totals using configured absolute/percentage tolerances. Every exception points to the exact failed dimension.

## Decision and tradeoff

Use deterministic matching after document extraction. A model can extract ambiguous invoice fields, but it cannot decide whether a financial variance is acceptable.

## Reliability

Invoice fingerprints combine supplier, invoice number, currency, amount, and date. Missing receipts, duplicate fingerprints, bank-detail changes, and tolerance failures always enter segregated review queues.

## What was cut

Automatic payment release was cut. It collapses extraction, approval, and treasury authority into one failure domain and violates segregation of duties.

## Acceptance tests

- Exact and within-tolerance matches create draft-payable recommendations.
- Duplicate invoices and bank-detail changes are blocked.
- Missing PO/receipt evidence creates a named exception.
- Approval actor cannot be the ingestion service account.

## Takeover

Tolerance tables, approver matrix, supplier risk flags, and accounting-period rules are versioned outside extraction prompts.
