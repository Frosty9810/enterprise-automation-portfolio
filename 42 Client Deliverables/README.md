# Client deliverables

> Status: **Populated — public synthetic handoff checklist and existing reference package.**

This section defines a reviewable delivery package using existing public artifacts. It contains no actual client handoff, confidential records, credentials or signed acceptance. Client-specific documents and operational exports belong in an approved private destination.

## Reference package: consent-gated contact handoff

The [RE-01 showcase package](../showcase/RE-01/README.md) contains a preview-only n8n export and a manual GHL setup specification. The separate [local n8n wrapper](../demo-lab/workflows/RE-01.json) actually calls the loopback lab and contact simulator. Deliver these with their distinct scopes, rather than presenting the preview as a provider-connected deployment.

| Deliverable | Existing public reference | Acceptance owner/action |
|---|---|---|
| Executive brief | [Portfolio executive summary](../00%20Executive%20Summary/README.md), [canonical template](../41%20Templates/executive-summary-template.md) | Sponsor confirms problem, bounded outcome, assumptions and remaining limits |
| Current-state discovery | [Worksheet and synthetic worked example](../02%20Discovery/README.md) | Process owner confirms trigger, identifiers, permissions and exception paths |
| Requirements and value model | [Traceability and labeled hypothetical ROI](../03%20Business%20Analysis/README.md) | Analyst verifies observable tests; sponsor replaces invented assumptions with measured baselines |
| Architecture and platform decision | [Framework](../04%20Automation%20Framework/README.md) | Technical reviewer confirms domain/orchestration/state boundaries |
| Build artifacts | [Preview export](../showcase/RE-01/n8n-workflow.json), [manual setup spec](../showcase/RE-01/ghl-build.json), [planner](../integrations/ghl-n8n/contract.mjs) | Engineer verifies actual artifact type and credential-free public content |
| Operating and API runbooks | [Local setup/recovery](../38%20Deployment/README.md), [implemented API](../30%20API%20Documentation/README.md) | Operator reproduces setup, rejection, uncertain result and recovery |
| Validation and review record | [Handoff commands and boundaries](../REVIEW-HANDOFF.md), [governor workflow](../PORTFOLIO-AGENTS.md) | Reviewer checks exact commit, adverse cases, logs and unresolved findings |
| Recording | [Video index](../32%20SOP%20Library/video-index.md) | Human records actual demonstrated scope; a script/pending row is not a video |
| Provider acceptance and support | [Authorized integration checklist](../integrations/ghl-n8n/README.md) | Named account owner performs sandbox acceptance, cleanup and support handoff; currently pending |

## Reproduce the public handoff

After [local setup](../38%20Deployment/README.md), run:

```powershell
node --test tests/ghl-n8n.test.mjs demo-lab/reliability.test.mjs
```

Open `/workshop`, submit a synthetic event, review the minimized payload, simulate an acknowledgement lost after a write, reconcile and export the completed local receipt. The [recovery controller](../demo-lab/reliability.mjs) exports `portfolio-reliability-evidence/v1` with `authority: local_demo_only`, zero external actions and communication disabled. Changed source invalidates the affected evidence; a reviewer label is not an authenticated client sign-off.

For domain analysis, use `/flagships` to export an acknowledged current analysis. That receipt proves the stated local scope and source identity; it does not approve a payment, message, hiring decision, clinical decision, dispatch or provider write.

## Packaging checklist

1. Record repository URL, exact commit, branch/base, artifact list and measured test commands/results. Link evidence rather than copying an older test count.
2. Inspect every supplied file and generated report for actual credentials, personal data, client identities and execution payloads. Use synthetic fixtures in public packages.
3. Include one normal case, one rejection and one recovery case with expected/observed outcomes. Separate a genuine local execution from a request preview, DOM test or hosted acceptance.
4. List unresolved provider, authentication, migration, monitoring, recording and human acceptance items with an owner. Do not mark an item complete because a document describes its future design.
5. Keep runtime databases, connection credentials, real exports, account-specific configuration and client materials outside the public delivery. Never embed bearer tokens or credential identifiers into shareable workflow JSON.
6. Obtain actual acceptance and operational ownership through the approved client process before a production release. No signature, real client result or production authorization is created by this checklist.

Use the [master templates](../41%20Templates/README.md) when creating a private client-specific package. Public synthetic examples demonstrate structure and reproducibility; they do not establish that a client engagement occurred.

---
*Part of the [Enterprise Automation Portfolio](../README.md).*
