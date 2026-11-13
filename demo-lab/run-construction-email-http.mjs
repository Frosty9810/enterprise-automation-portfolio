import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLabServer, openStore } from './server.mjs';

const args = process.argv.slice(2);
const submit = args.length === 1 && args[0] === '--submit';
if (args.length && !submit) throw new Error('Usage: node demo-lab/run-construction-email-http.mjs [--submit]');

const emailBase64 = readFileSync(new URL('./construction-email-insurance.eml', import.meta.url)).toString('base64');
const context = {
  commandId: 'email-http-demo-insurance', tenant: 'acme', actor: 'acme-operator',
  siteId: 'site-acme', subcontractorId: 'sub-acme', receivedAt: '2026-10-24T10:00:00.000Z',
};
const db = openStore(':memory:');
const server = createLabServer(db);
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}/api/construction/`;
  async function post(route, payload) {
    const response = await fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Client': 'local-showcase' },
      body: JSON.stringify(payload),
    });
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  }

  const preview = await post('email-preview', { emailBase64 });
  const audit = () => post('verify-audit', { tenant: context.tenant });
  assert.equal((await audit()).eventCount, 0);
  if (!submit) {
    console.log(JSON.stringify({ mode: 'preview', preview, auditEvents: 0 }, null, 2));
  } else {
    const intent = { emailBase64, context, expectedRawSha256: preview.rawSha256 };
    const { receipt, rawSha256 } = await post('email-submit', intent);
    assert.equal(rawSha256, preview.rawSha256);
    assert.equal(receipt.content, 'eml-v1:' + emailBase64);
    assert.equal(receipt.status, 'unverified');
    assert.equal((await post('email-submit', intent)).receipt.documentId, receipt.documentId);
    const result = await audit();
    assert.equal(result.valid, true);
    assert.equal(result.eventCount, 1);
    console.log(JSON.stringify({ mode: 'submit', preview, documentId: receipt.documentId,
      status: receipt.status, auditEvents: result.eventCount }, null, 2));
  }
} finally {
  if (server.listening) await new Promise(resolve => server.close(resolve));
  db.close();
}
