import { openVeilRag } from './veilrag-core.mjs';

const store = openVeilRag();
try {
  const cases = [];
  for (const scenario of store.api.catalog().scenarios) {
    let protectedReceipt;
    try { protectedReceipt = store.api.protect(scenario.input); }
    catch (error) {
      if (scenario.id !== 'reject-variant-transport' || error.code !== 'declared_literal_variant_leak') throw error;
      cases.push({ id: scenario.id, status: 'rejected', reason: error.code });
      continue;
    }
    const generated = await store.api.generate({ tenant: scenario.input.tenant, receiptId: protectedReceipt.id });
    if (generated.status === 'generated') {
      const restored = store.api.restore({ tenant: scenario.input.tenant, receiptId: protectedReceipt.id, recipient: 'acme-reviewer' });
      cases.push({ id: scenario.id, status: generated.status, restoredDeclaredValues: scenario.input.entities.every((entity) => restored.output.includes(entity.value)) });
    } else cases.push({ id: scenario.id, status: generated.status, reason: generated.reason });
  }
  console.log(JSON.stringify({ scope: store.api.catalog().scope, cases, audit: store.api.verifyAudit({ tenant: 'acme' }) }, null, 2));
  if (cases[0].status !== 'generated' || !cases[0].restoredDeclaredValues || cases.slice(1).some((item) => item.status !== (item.id === 'reject-variant-transport' ? 'rejected' : 'blocked'))) process.exitCode = 1;
} finally { store.close(); }
