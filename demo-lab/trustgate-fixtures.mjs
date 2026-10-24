import { openTrustGate } from './trustgate-core.mjs';
import { fileURLToPath } from 'node:url';

/** Runs real SQL effects, with synthetic records only. The caller owns a supplied gateway. */
export function runTrustGateFixtures(suppliedGateway) {
  const gateway = suppliedGateway ?? openTrustGate();
  const results = [];
  try {
    for (const scenario of gateway.catalog().scenarios) {
      let receipt = gateway.prepare(scenario.proposal);
      if (receipt.status === 'pending_review') receipt = gateway.review({ tenant: receipt.tenant, receiptId: receipt.id, reviewer: 'acme-reviewer', decision: 'approve', note: 'Synthetic fixture reviewed locally; no external action is authorized.', expectedHash: receipt.proposalHash });
      if (receipt.status === 'ready') receipt = gateway.execute({ tenant: receipt.tenant, receiptId: receipt.id });
      results.push({ scenarioId: scenario.id, status: receipt.status, tool: receipt.tool, reasons: receipt.reasons, proposalHash: receipt.proposalHash, effectKind: receipt.effect?.kind ?? null });
    }
    const state = gateway.state({ tenant: 'acme' }); const audit = gateway.verifyAudit({ tenant: 'acme' });
    const passed = results.filter((item) => item.status === 'executed').length === 3 && results.filter((item) => item.status === 'blocked').length === 3 && state.tasks.length === 1 && state.publicNotes.length === 1 && audit.valid;
    return { scope: 'Synthetic local SQLite tool gateway only; no provider, authentication, LLM screening or publication.', passed, results, taskCount: state.tasks.length, publicNoteCount: state.publicNotes.length, audit };
  } finally { if (!suppliedGateway) gateway.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const result = runTrustGateFixtures(); console.log(JSON.stringify(result, null, 2)); if (!result.passed) process.exitCode = 1;
}
