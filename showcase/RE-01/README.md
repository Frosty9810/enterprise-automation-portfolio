# RE-01 Speed-to-Lead Response and Drip Nurture Engine

**Evidence:** local reference; live acceptance pending. Synthetic scenario, no client outcome claimed.
**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._
**Real Build Artifacts:** [Original source](../../07%20Real%20Estate/RE-01%20Speed-to-Lead%20Response%20and%20Drip%20Nurture%20Engine) · [n8n demo](n8n-workflow.json) · [GHL setup blueprint](ghl-build.json).

**Executable local integration:** [Run in the local lab](../../demo-lab/README.md) · [Actual n8n workflow](../../demo-lab/workflows/RE-01.json). This wrapper executes the original demo logic and calls a local GHL simulator. Hosted GHL and the original full business workflow remain separate acceptance gates.

## What to show

Show lead scoring and the contact preview; do not send a drip.

GHL role: **Buyer relationship**. Suggested pipeline: New inquiry → Qualified → Assigned → Closed. This setup is a relationship layer; the original project's database retains operational authority.

## Reproduce

From the portfolio root:

```sh
python "07 Real Estate/RE-01 Speed-to-Lead Response and Drip Nurture Engine/build/lead_scoring.py"
node --test tests/ghl-n8n.test.mjs
```

Import this folder's n8n JSON and run the manual trigger. Inspect the valid contact request preview. Change the fixture's `storageConsent` to false and rerun: expect rejection without a request. The JSON has no HTTP node, credentials, public webhook or external effects.

Follow the [shared GHL setup and live acceptance runbook](../../integrations/ghl-n8n/README.md) to bind a test account. The blueprint is not an exported GHL snapshot. Live run IDs, recordings and screenshots remain pending.

## Four-minute walkthrough script

- 0:00–0:30 — State the business problem and the original system of record.
- 0:30–1:30 — Open the original source and demonstrate: Show lead scoring and the contact preview; do not send a drip.
- 1:30–2:30 — Execute the n8n synthetic preview and inspect the field allowlist and GHL location.
- 2:30–3:15 — Run the rejected-consent and tenant-mismatch tests.
- 3:15–4:00 — Explain the tradeoff: shared deterministic handoff reduces duplicated code; production still needs durable delivery, credentials and acceptance evidence.

## Interview claim

“I can share the RE-01 reference implementation, its n8n contact-handoff demo, GHL setup blueprint and automated contract tests. The attached evidence uses synthetic inputs; live deployment is a separate acceptance gate.”

---
Part of the [Enterprise Automation Portfolio](../../README.md).
