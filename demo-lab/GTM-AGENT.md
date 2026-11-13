# Governed GTM workflow

Start the local lab with Node.js 24 or later.

```powershell
node demo-lab/server.mjs
```

Open the [GTM workflow](http://127.0.0.1:5680/gtm-agent). Start a synthetic buying signal, inspect its source and proposed local task, review the exact proposal, then run the approved action. Retry execution and inspect the same receipt and the unchanged number of effects. The instruction-marked scenario shows the policy refusal before any write tool can run.

The deterministic planner uses server-held fixtures and the existing TrustGate policy. An independent fixture reviewer records the approval decision. Approval binds the proposal hash. The write produces a local SQLite task, and the ledger records the proposal, review and execution. Repeating execution returns the stored effect. The per-case timeline filters events from the shared tenant chain, so its sequence numbers can have gaps.

## Start the proposal from n8n

With the lab listening on numeric loopback port 5680, run:

```powershell
node demo-lab/n8n.mjs import:workflow --input=demo-lab/gtm-agent-n8n.json
node demo-lab/n8n.mjs execute --id=PortfolioGtm0011 --rawOutput
```

The manual workflow takes the synthetic supplier signal to the loopback proposal endpoint. It uses a stable run ID, so rerunning returns the same proposal and its current review status. On a fresh local ledger, the proposal waits for review and has zero effects. In the browser select the shared n8n demo run to continue with the same receipt. The workflow contains only a manual trigger and a proposal request. Review and execution are explicit separate actions.

```powershell
node --test demo-lab/gtm-agent.test.mjs demo-lab/gtm-agent-http.test.mjs demo-lab/gtm-agent-ui.test.mjs
```

Use synthetic data in this local lab. The deterministic planner demonstrates tool boundaries and review without a hosted model. Fixture identities, loopback checks and the local audit chain provide demo controls. Production authentication, a real CRM connector, LLM evaluation and campaign outcome measurements remain separate.
