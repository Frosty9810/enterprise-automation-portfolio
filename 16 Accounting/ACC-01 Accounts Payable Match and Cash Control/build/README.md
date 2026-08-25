# ACC-01 build

- `invoice_matcher.py` implements duplicate, bank-change, receipt, price, tax, and arithmetic controls.
- `n8n-workflow.json` receives extracted invoice data, invokes matching, records the decision, and creates either an ERP draft or exception.
- `schema.sql` stores fingerprints, evidence, decisions, approvals, and draft receipts.

Run `python invoice_matcher.py`. It never exposes a payment-release operation.
