# MED-01 Referral Completeness and Authorization Staff Queue

Status: **Populated — bounded local build; hosted integration and PostgreSQL execution pending.**

Fictional payer checklists route missing documents, unknown payers and missing consent to administrative review.

**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._
**Real Build Artifacts:** [Runbook and build files →](build/README.md)

## Durable synthetic administrative desk

Start the local lab and open `http://127.0.0.1:5680/referral?project=MED-01`. The [referral runbook](../../REFERRAL.md) covers closed fixture intake, fictional payer checklists, consent holds, independent packet review and a durable local staff queue. Run `node demo-lab/run-referral.mjs` for reproducible synthetic acceptance.

The desk accepts supplied fixture selections, not names, uploaded records or clinical text. Technical command metadata is not a PHI detector; never enter real patient data. Actor and consent-proof labels are synthetic, not authenticated identities or real consent evidence. The fixed clock is not live monitoring. Administrative completeness does not determine care eligibility, coverage or insurance authorization. The wider MED-01 flagship remains partial. The older n8n checklist example below retains its separate no-external-action contract.

## Business flow

Referral → fictional payer checklist → administration review.

## Review materials

- [44-section SOP](SOP.md)
- [Recording script](walkthrough-script.md)
- [Build runbook](build/README.md)


---
*Part of the Enterprise Automation Portfolio. See [project build index](../README.md).*
