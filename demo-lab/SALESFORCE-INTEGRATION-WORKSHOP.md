# RevenueOS integration workshop

RevenueOS demonstrates three Salesforce consulting problems against a local record store. The n8n workflow prepares proposals from authoritative synthetic records. The existing control room handles explicit review and local execution.

## The Salesforce design

| Workflow | Source evidence in this demo | Proposed fields | Org mapping to validate |
| --- | --- | --- | --- |
| Lead assignment | Score, Employees and StorageConsent | OwnerId | Qualification and consent fields, queue/user ownership, sharing and field permissions |
| Opportunity follow-up | StageName, DaysWithoutNextStep and current NextStep | NextStep | Stage values, business calendar, meaning of stale follow-up and permitted update fields |
| Case escalation | Severity, Priority and current owner | Priority and OwnerId | Severity mapping, escalation queue, routing and authenticated review |

Score, Employees, StorageConsent, DaysWithoutNextStep and Severity are synthetic model fields. An org adapter needs an explicit mapping to actual field API names and allowed values. Local integer revisions model a concurrency precondition. The adapter must read authoritative records and validate the org's supported conditional-write behavior.

The normalized local event has orgId, entityName, recordId, transactionKey, sequenceNumber, replayId, expectedRevision and changeType. Event data identifies the record. The desk computes the patch from its stored record. It never accepts proposed business fields in the event envelope.

## Run the custom n8n pipeline

With Node.js 24 and the pinned demo-lab dependency installed, start the lab:

~~~sh
node demo-lab/server.mjs
~~~

In another terminal:

~~~sh
node demo-lab/n8n.mjs import:workflow --input=demo-lab/salesforce-revenueos-n8n.json
node demo-lab/verify-salesforce-revenueos-n8n.mjs
~~~

The verifier imports and executes the workflow and prints a sanitized summary. Each workflow execution starts one fresh run and prepares three proposals. It then resubmits each exact event and checks the original receipt is retained. This demonstrates repeated delivery within one run. It makes no cross-run deduplication claim.

The workflow stops before approval and execution. Use /salesforce to inspect the control room's review model. These proposals are synthetic and do not write to a Salesforce org.

## Explain the architecture in an interview

Start with the exception. A Lead can be qualified but lack recorded consent. An Opportunity can need an actionable next step while stage and amount remain under sales ownership. A critical Case can require escalation while its update acknowledgement is uncertain.

Show the authoritative input, exact proposal and current revision. Distinguish an event's business identity from its replay position. Explain why an unknown write outcome requires reconciliation before another attempt. Finish with an acceptance plan that includes authenticated permissions, concurrent edits, duplicate delivery, provider errors and operator handover.

## Sandbox acceptance plan

Salesforce replay IDs are opaque stream positions. Store them as supplied and design resynchronization for events outside the retained window. Pub/Sub retains platform and change events for 72 hours. This local normalized pipeline does not subscribe to that service. [Salesforce event durability](https://developer.salesforce.com/docs/platform/pub-sub-api/guide/event-message-durability.html)

For a real REST adapter, verify the supported resource and precondition. Salesforce documents If-Unmodified-Since processing only when data has not changed and a 412 response when the precondition fails. Test the actual object and error path in the authorized org. [Salesforce conditional requests](https://developer.salesforce.com/docs/platform/api-rest/guide/intro-rest-conditional-requests.html)

Agree object access, field mapping, reviewer ownership, error classification and a reconciliation runbook before sandbox acceptance. Record actual API responses separately from this local demonstration.
