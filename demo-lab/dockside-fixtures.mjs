export const docksideScope = 'Local synthetic document-validation and reviewed delivery queue. Supplied structured extraction; no OCR, SLM, model confidence, hardware benchmark or live ERP. Reviewer IDs are unauthenticated demo labels.';

export function docksideScenarios() {
  const sample = (id, change = () => {}) => {
    const input = { commandId: `dockside-${id}`, tenant: 'acme', actor: 'acme-operator', document: { id: `document-${id}`, version: 1, text: 'SYNTHETIC invoice from vendor-acme. 2026-10-23. Two widgets at USD 12.50 each. Total USD 25.00.' }, extraction: { kind: 'invoice', vendorId: 'vendor-acme', reference: `INV-${id}`, issuedOn: '2026-10-23', currency: 'USD', lines: [{ itemId: 'item-widget', quantity: 2, unitPriceMinor: 1250, lineTotalMinor: 2500 }], totalMinor: 2500 } };
    input.document.text = `SYNTHETIC invoice ${input.extraction.reference} from vendor-acme. 2026-10-23. Two item-widget units at USD 12.50 each. Total USD 25.00.`;
    change(input); return input;
  };
  return [
    { id: 'valid-invoice', title: 'Valid synthetic invoice', input: sample('valid-invoice') },
    { id: 'packing-list', title: 'Valid synthetic packing list', input: sample('packing-list', (i) => { i.extraction.kind = 'packing-list'; i.extraction.lines[0] = { itemId: 'item-bolt', quantity: 10, unitPriceMinor: 0, lineTotalMinor: 0 }; i.extraction.totalMinor = 0; i.document.text = 'SYNTHETIC packing list from vendor-acme, 2026-10-23: ten bolts. No price or invoice posting.'; }) },
    { id: 'offline-queue', title: 'Valid invoice for an offline delivery attempt', input: sample('offline-queue') },
    { id: 'uncertain-response', title: 'Valid invoice for a lost receiver response', input: sample('uncertain-response') },
    { id: 'bad-total', title: 'Reject inconsistent totals', input: sample('bad-total', (i) => { i.extraction.totalMinor = 2400; }) },
    { id: 'unknown-vendor', title: 'Reject an unregistered vendor', input: sample('unknown-vendor', (i) => { i.extraction.vendorId = 'unknown-vendor'; }) },
    { id: 'bad-date', title: 'Reject an impossible calendar date', input: sample('bad-date', (i) => { i.extraction.issuedOn = '2026-02-30'; }) },
    { id: 'unknown-item', title: 'Reject an unregistered item', input: sample('unknown-item', (i) => { i.extraction.lines[0].itemId = 'unknown-item'; }) },
  ];
}
