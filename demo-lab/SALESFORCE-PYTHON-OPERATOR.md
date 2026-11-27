# Python operator for RevenueOS

The Python client calls the existing local Salesforce desk. It validates run, object and receipt identities and emits a concise result. It uses Python's standard library.

Start the Node.js 24 lab in one terminal:

~~~sh
node demo-lab/server.mjs
~~~

In another terminal, prepare a Case proposal and replay the event:

~~~sh
python integrations/salesforce-revenueos/revenueos_operator.py --object Case
~~~

The default run creates one synthetic proposal and verifies the same receipt on exact retry. It records zero effects. Lead and Opportunity work through the same interface.

To exercise an explicitly approved synthetic update:

~~~sh
python integrations/salesforce-revenueos/revenueos_operator.py --object Case --approve-demo --outcome timeout_after
python integrations/salesforce-revenueos/revenueos_operator.py --object Opportunity --approve-demo --outcome timeout_before
python integrations/salesforce-revenueos/revenueos_operator.py --object Lead --approve-demo --outcome success
~~~

The first command reconciles the saved effect after a lost acknowledgement. The second retries a confirmed pre-write failure once. The third demonstrates ordinary completion. Each starts a new synthetic run and replays its final receipt to check that it retains one effect.

The approval flag records the fixed local reviewer profile. It is scripted fixture acceptance. It does not identify or authenticate a Salesforce user.

## Consultant discussion

Use n8n to make orchestration visible to operations. Use Python for a repeatable diagnostic tool with explicit inputs, response validation and exit codes. Keep the business policy in the authoritative service so the two clients cannot invent different Lead qualification or escalation rules.

The client accepts only a numeric port on 127.0.0.1. It has bounded request timeouts and rejects redirects. It takes no org URL, OAuth token or source-record overrides. An unexpected response identity stops the client.

Live Salesforce connectivity requires a separate adapter with authenticated access, metadata mapping, supported conditional requests and provider reconciliation. The report describes the selected local run with synthetic records.
