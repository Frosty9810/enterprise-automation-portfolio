# CON-01 Subcontractor Readiness and Change Approval Review

Status: **Populated — bounded local build; hosted integration and PostgreSQL execution pending.**

Expired certificates and stale or self-approved change orders route to review. A hash-linked approval record accompanies the result.

**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._
**Real Build Artifacts:** [Runbook and build files →](build/README.md)

## Durable local ledger

Open `http://127.0.0.1:5680/construction?project=CON-01` after starting the lab. The [construction runbook](../../CONSTRUCTION.md) covers supplied document provenance, independent compliance review, expiry/readiness holds, versioned change orders and local budget commitments. Run `node demo-lab/run-construction.mjs` for reproducible synthetic acceptance.

The ledger uses SQLite and a fixed synthetic scenario clock. Actor labels are not authentication. It does not parse real PDFs, verify an issuer, authorize site work or make payments. The older n8n decision example below remains separate; its `releaseAllowed: false` does not describe the new local commitment operation. The full CON-01 industry flagship remains partial.

## Business flow

Change amount and version → independent approval checks → release review.

## Review materials

- [44-section SOP](SOP.md)
- [Recording script](walkthrough-script.md)
- [Build runbook](build/README.md)


---
*Part of the Enterprise Automation Portfolio. See [project build index](../README.md).*


## Reviewed full local reversal

The [reversal runbook](../../CONSTRUCTION-REVERSAL.md) adds a separate proposal and independent manager/finance reviews before one linked negative cost entry restores the exact local budget amount. The original positive posting stays in history. Run `node demo-lab/run-construction-reversal.mjs` and inspect the existing construction desk. Current document holds remain in force; this does not cancel a real contract, alter the supplied schedule or issue a payment/refund.
