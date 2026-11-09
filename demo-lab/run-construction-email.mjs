import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openConstruction } from './construction-core.mjs';
import { prepareConstructionEmail } from './construction-email.mjs';

const args = process.argv.slice(2);
const submit = args.length === 1 && args[0] === '--submit';
if (args.length && !submit) throw new Error('Usage: node demo-lab/run-construction-email.mjs [--submit]');

const site = { tenant: 'acme', siteId: 'site-acme', subcontractorId: 'sub-acme' };
const samples = ['insurance', 'license'].map(kind => {
  const bytes = readFileSync(new URL('./construction-email-' + kind + '.eml', import.meta.url));
  return prepareConstructionEmail(bytes, {
    ...site, commandId: 'email-intake-' + kind, actor: 'acme-operator',
    receivedAt: '2026-10-24T10:00:00.000Z',
  });
});
const sources = samples.map(({ input, rawSha256 }) => ({
  kind: input.kind, sourceId: input.sourceId, reference: input.reference,
  validUntil: input.validUntil, rawSha256,
}));

if (!submit) {
  console.log(JSON.stringify({ mode: 'preview', scope: 'Synthetic plain-text fixture emails', sources }, null, 2));
} else {
  const desk = openConstruction(':memory:');
  try {
    const receipts = samples.map(({ input, rawSha256 }) => {
      const doc = desk.submitDocument(input);
      assert.equal(doc.status, 'unverified');
      assert.equal(doc.documentId, desk.submitDocument(input).documentId);
      const decoded = Buffer.from(doc.content.slice('eml-v1:'.length), 'base64');
      assert.equal(createHash('sha256').update(decoded).digest('hex'), rawSha256);
      return doc;
    });
    const readyBeforeReview = desk.readiness(site).ready;
    assert.equal(readyBeforeReview, false);
    assert.equal(desk.verifyAudit({ tenant: site.tenant }).eventCount, 2);
    for (const doc of receipts) {
      const reviewed = desk.reviewDocument({
        commandId: 'email-review-' + doc.kind, tenant: site.tenant,
        documentId: doc.documentId, reviewer: 'acme-compliance',
        expectedHash: doc.contentHash, expectedRevision: doc.revision,
        decision: 'verify', note: 'Checked the supplied synthetic email export and its declared fields.',
      });
      assert.equal(reviewed.status, 'verified');
    }
    const readyAfterReview = desk.readiness(site).ready;
    assert.equal(readyAfterReview, true);
    const audit = desk.verifyAudit({ tenant: site.tenant });
    assert.equal(audit.valid, true);
    assert.equal(audit.eventCount, 4);
    console.log(JSON.stringify({
      mode: 'submit', scope: 'Synthetic fixture review in an in-memory SQLite database',
      sources, readyBeforeReview, readyAfterReview,
      documentCount: desk.state({ tenant: site.tenant }).documents.length,
      audit: { valid: audit.valid, eventCount: audit.eventCount },
    }, null, 2));
  } finally {
    desk.close();
  }
}
