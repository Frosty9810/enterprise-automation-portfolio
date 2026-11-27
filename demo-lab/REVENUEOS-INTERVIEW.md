# RevenueOS consultant interview walkthrough

Start the repository lab with Node.js 24:

~~~powershell
node demo-lab/server.mjs
~~~

Open http://127.0.0.1:5680/revenueos-interview. The technical control room remains available at /salesforce.

## A five-minute demonstration

1. Open with the business problem. "A CRM change should create a useful next action, with a clear owner and a way to recover if the acknowledgement is lost." Name the workflow you will demonstrate. The records in this page are synthetic.
2. Start a story and inspect the record. For a Lead, explain the qualification rule and proposed owner. For an Opportunity, explain why an overdue proposal needs a next step. For a Case, explain why critical severity requires escalation.
3. Evaluate the proposal. Show the before and proposed fields. Explain that the record is loaded from the local store, and the review binds its expected revision.
4. Acknowledge the fields and record the simulated review. For the Case, choose the lost acknowledgement outcome. Apply the update, show that another attempt is held, then reconcile the saved effect. The displayed count must stay at one.
5. Export the completed receipt. Explain the handover, including who would own the exception queue, which checks would be monitored, and what needs sandbox acceptance.

Use the presenter notes to guide discussion. Select another story for a fresh local run.

## Questions to ask the interviewer

- Which Lead qualification and ownership rules cause the most exceptions today?
- Which Salesforce records and fields are authoritative, and who approves changes?
- How should operations resolve an update whose API acknowledgement is missing?
- What counts as success during sandbox acceptance, and who operates the process afterward?

## Scope of the demonstration

This page calls the existing local Salesforce-shaped engine and persists actual SQLite decisions and effects. The reviewer profile is a fixture selector. Live Salesforce OAuth, metadata, CRUD/FLS, CDC subscription, conditional REST writes and provider reconciliation need authorized sandbox validation. Prototype counts describe the selected run. Production savings or revenue results require separate measurements.
