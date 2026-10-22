# Zapier translation plan

> Status: **Partial — source-backed translation/runbook; no native Zap artifact or provider acceptance.**

Use this section to assess a future Zapier implementation of the existing consent-gated contact handoff. The actual reference is the [pure planner](../integrations/ghl-n8n/contract.mjs), [planner tests](../tests/ghl-n8n.test.mjs) and [durable local recovery controller](../demo-lab/reliability.mjs). No native Zap template/export, connected account or Zapier execution is established by the repository.

## Translate the decision, including the stop path

| Requirement | Acceptance condition for a future native implementation |
|---|---|
| Trusted identity | The connection/configuration selects tenant and project; untrusted trigger data cannot change them |
| Consent before persistence | `storageConsent` must be exactly true; sensitive records and malformed identities stop before a contact write |
| Minimal fields | Only location, normalized email, optional names and source enter the contact plan; omit tags, phone, free text and opt-out changes |
| Explicit ready gate | An invalid plan produces no request, even if the trigger itself succeeded |
| Stable event identity | Persist location/project/event identity and minimized-payload conflict behavior; a planner event key alone is not durable deduplication |
| Uncertain result | Suspend another write until destination reconciliation resolves whether the first attempt committed |
| Evidence | Record redacted input/version, branch decision, destination identity, retry/reconciliation result and cleanup |

The native trigger, conditions, actions, credential binding and state store remain design choices to verify using current official documentation during implementation. This document does not assert current feature availability, billing tiers, automatic replay semantics or provider connector parity. Apply the [platform-selection worksheet](../04%20Automation%20Framework/README.md) before choosing the final arrangement.

## Local acceptance reference

After [setup](../38%20Deployment/README.md), run from the repository root:

```powershell
node --test tests/ghl-n8n.test.mjs demo-lab/reliability.test.mjs
```

Start the lab and open `/workshop`. Select RE-01, submit a synthetic contact, acknowledge the local review and simulate a timeout after the write. Confirm that the receipt is uncertain and another execution is blocked; reconcile the existing effect and confirm the local effect count remains one. Repeat the same event to retrieve the existing receipt, then change a permitted contact field under that identity and verify a conflict. See the [workshop runbook](../demo-lab/RELIABILITY-WORKSHOP.md).

This exercise runs the repository's SQLite recovery model. It does not demonstrate Zapier storage, queueing, connector retry or remote exactly-once effects. The separate [provider handoff runbook](../integrations/ghl-n8n/README.md) lists destination-side acceptance to preserve when implementing a native connector.

## Work still required

Create a sanitized native Zap artifact with authenticated trigger validation, trusted tenant configuration, strict rejection routing, protected credentials, durable state and an operator-visible uncertain-result queue. In an authorized sandbox, prove normal upsert, zero-effect rejection, duplicate replay, changed payload, revoked credentials, rate limit and timeout-after-write reconciliation. Verify import/reuse independently, document actual execution limitations and retain redacted evidence. The existing n8n workflows cannot be relabeled as working Zapier builds.

---
*Part of the [Enterprise Automation Portfolio](../README.md).*
