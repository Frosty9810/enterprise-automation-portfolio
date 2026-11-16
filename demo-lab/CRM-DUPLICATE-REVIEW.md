# F07 CRM duplicate review queue

Run a synthetic contact-batch triage with Node.js 24:

~~~sh
node demo-lab/run-crm-duplicate-review.mjs
node --test demo-lab/crm-duplicate-review.test.mjs
~~~

The queue considers exact trimmed, lowercased email matches within one requested tenant. The fixture produces a two-record preview, a hold for conflicting ownership and consent, and a hold for a three-record cluster. A contact from another tenant, a missing email and an unmatched address are counted separately. The routine validates the entire batch before returning a result, including rows from other tenants. IDs must be unique across all supplied rows.

For a two-record group, record IDs determine a stable preview order. The existing F07 pair checker compares names, owners, consent and editable fields. The queue lists expected revisions, conflicts and the names of fields a preview could fill. The report omits email, name, owner, company and phone fields and patch values. Use opaque synthetic IDs because record IDs appear verbatim. A larger group stays together for manual review because choosing a pair could overlook another conflicting record.

The queue is read-only. The input needs a stable ID per record and the existing F07 record fields. It uses synthetic records, does no fuzzy matching or address-alias inference, and has no Salesforce API connection. Open the local /flagships#F07 page for the separate two-record simulation.
