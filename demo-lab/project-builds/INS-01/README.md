# INS-01 Loss Intake and Evidence Review Queue

Status: **Populated — bounded local build; hosted integration and PostgreSQL execution pending.**

Loss-date, missing-evidence and duplicate signals route to adjuster review without approving or denying coverage.

**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._
**Real Build Artifacts:** [Runbook and build files →](build/README.md)

## Durable administrative slice

Open `/industry/insurance?project=INS-01` in the local lab or read the [executable desk runbook](../../INSURANCE.md). It adds registered source intake, tenant-bound supplied policy/evidence manifests, consent-bound independent review, exact/ambiguous duplicate reconciliation and one durable SQLite adjuster-queue row per business loss. Revocation clears review and assignment atomically. Policy-date exceptions route to an adjuster; coverage, fraud and payment remain undecided. Exact repeated source events cannot edit loss consent; recover their primary case instead.

[Reproducible CLI](../../run-insurance.mjs) exercises assignment, revocation, regrant, fresh review and generation 2 of the same queue row. Full FNOL channels, actual policy interpretation, insurer adapters, authentication, operational monitoring and video remain open. Actor/proof labels are fixtures, not authenticated staff or verified real consent.

## Business flow

Loss intake → dates and evidence checks → adjuster review.

## Review materials

- [44-section SOP](SOP.md)
- [Recording script](walkthrough-script.md)
- [Build runbook](build/README.md)


---
*Part of the Enterprise Automation Portfolio. See [project build index](../README.md).*
