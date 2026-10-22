# Make.com translation plan

> Status: **Partial — source-backed translation/runbook; no native Make scenario or provider acceptance.**

This section defines the behavior a future Make implementation must preserve for the portfolio's contact handoff. The runnable reference is [JavaScript planning](../integrations/ghl-n8n/contract.mjs) and the [local n8n wrapper](../demo-lab/workflows/RE-01.json). Those n8n JSON files are not Make imports. No Make scenario export, account connection or native execution evidence is supplied here.

## Behavior mapping

| Reference step | Required translation behavior | Evidence to retain |
|---|---|---|
| Synthetic/manual intake | Use a controlled synthetic event first; resolve tenant/project from trusted configuration | Redacted input and configuration revision |
| `planContact(event, config)` | Preserve every validation/rejection rule before any write; normalize email and minimize fields | Accepted plan and rejected/no-request result |
| Ready branch | Continue only when `status === ready`; keep `communicationAllowed: false` | Branch outcome; no accidental enrollment/message |
| Contact request | Bind authorized credentials outside the exported scenario; use only the minimized planned body | Redacted request, provider response ID and observed location/email |
| Verify result | Check returned identity and destination fields rather than treating HTTP success alone as acceptance | Matching destination state |
| Uncertain timeout | Stop blind retries; reconcile the destination before any additional attempt | Initial uncertainty, lookup result and operator decision |

This is an implementation specification, not a claim that a particular Make module, plan or storage feature already satisfies the contract. Select native components against current official platform documentation when building the actual artifact. The [framework](../04%20Automation%20Framework/README.md) requires equivalent branch/error semantics and verified replay behavior before platform selection is accepted.

## Reproduce the contract before translating

After [local setup](../38%20Deployment/README.md), run from the repository root:

```powershell
node --test tests/ghl-n8n.test.mjs demo-lab/reliability.test.mjs
```

Use a synthetic event shaped like this; the planner does not send it:

```json
{
  "projectId": "RE-01",
  "eventId": "make-translation-001",
  "storageConsent": true,
  "contact": {"email": "translation@example.test", "firstName": "Demo"}
}
```

Trusted local configuration supplies `projectId: RE-01` and `locationId: DEMO_LOCATION`. Set consent false and verify `storage_consent_required` with no request. Try an input location different from trusted configuration and verify `tenant_mismatch`. Extra contact notes must not appear in the minimized output. The [handoff runbook](../integrations/ghl-n8n/README.md) describes remaining authorized provider acceptance; its n8n-specific setup steps still require a native Make translation.

## Work still required

Build and review the actual native scenario, authenticated intake, trusted configuration, secret binding, durable identity/outbox storage, conflict policy, finite retry scheduling and operator reconciliation path. Record duplicate replay, changed-payload identity, missing consent, tenant mismatch, authorization failure, rate limit and timeout-after-write results in an authorized sandbox. Export a sanitized native artifact and verify it can be imported/executed independently before marking the platform implementation complete. No paid account or live write is authorized merely by this translation document.

---
*Part of the [Enterprise Automation Portfolio](../README.md).*
