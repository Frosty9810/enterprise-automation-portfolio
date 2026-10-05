# IMP-01 Import Company Agent Operating System

**Evidence:** local reference; live acceptance pending. Synthetic scenario, no client outcome claimed.
**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._
**Real Build Artifacts:** [Original source](../../48%20Enterprise%20Workflows/IMP-01%20Import%20Company%20Agent%20Operating%20System) · [n8n demo](n8n-workflow.json) · [GHL setup blueprint](ghl-build.json).

**Executable local integration:** [Run in the local lab](../../demo-lab/README.md) · [Actual n8n workflow](../../demo-lab/workflows/IMP-01.json). This wrapper executes the original demo logic and calls a local GHL simulator. Hosted GHL and the original full business workflow remain separate acceptance gates.

## What to show

Explain one evidence/review boundary; no shipment or payment action.

GHL role: **Commercial counterpart**. Suggested pipeline: Intake → Evidence review → Decision pending → Closed. This setup is a relationship layer; the original project's database retains operational authority.

## Reproduce

From the portfolio root:

```sh
See the flagship source README for its application setup.
node --test tests/ghl-n8n.test.mjs
```

Import this folder's n8n JSON and run the manual trigger. Inspect the valid contact request preview. Change the fixture's `storageConsent` to false and rerun: expect rejection without a request. The JSON has no HTTP node, credentials, public webhook or external effects.

Follow the [shared GHL setup and live acceptance runbook](../../integrations/ghl-n8n/README.md) to bind a test account. The blueprint is not an exported GHL snapshot. Live run IDs, recordings and screenshots remain pending.

## Four-minute walkthrough script

- 0:00–0:30 — State the business problem and the original system of record.
- 0:30–1:30 — Open the original source and demonstrate: Explain one evidence/review boundary; no shipment or payment action.
- 1:30–2:30 — Execute the n8n synthetic preview and inspect the field allowlist and GHL location.
- 2:30–3:15 — Run the rejected-consent and tenant-mismatch tests.
- 3:15–4:00 — Explain the tradeoff: shared deterministic handoff reduces duplicated code; production still needs durable delivery, credentials and acceptance evidence.

## Interview claim

“I can share the IMP-01 reference implementation, its n8n contact-handoff demo, GHL setup blueprint and automated contract tests. The attached evidence uses synthetic inputs; live deployment is a separate acceptance gate.”

---
Part of the [Enterprise Automation Portfolio](../../README.md).
