import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer, openStore } from './server.mjs';

const context = {
  commandId: 'email-http-insurance',
  tenant: 'acme',
  actor: 'acme-operator',
  siteId: 'site-acme',
  subcontractorId: 'sub-acme',
  receivedAt: '2026-10-24T10:00:00.000Z',
};
const raw = Buffer.from(readFileSync(new URL('./construction-email-insurance.eml', import.meta.url), 'utf8')
  .replace(/\r?\n/g, '\r\n').replace('Synthetic certificate summary', 'Synthetic café certificate summary'));
const emailBase64 = raw.toString('base64');
const rawSha256 = createHash('sha256').update(raw).digest('hex');
const submission = { emailBase64, context, expectedRawSha256: rawSha256 };

async function setup(t) {
  const db = openStore(':memory:');
  const server = createLabServer(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api/construction/`;
  const post = async (route, body, headers = {}) => {
    const response = await fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Client': 'local-showcase', ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, value: await response.json() };
  };
  const ok = async (route, body) => {
    const result = await post(route, body);
    assert.equal(result.status, 200, JSON.stringify(result.value));
    return result.value;
  };
  const count = async () => (await ok('verify-audit', { tenant: context.tenant })).eventCount;
  return { base, post, ok, count };
}

test('email preview returns only parsed metadata and the original byte hash without writing', async t => {
  const { ok, count } = await setup(t);
  const preview = await ok('email-preview', { emailBase64 });
  assert.deepEqual(preview, {
    kind: 'insurance',
    sourceId: 'eml-fixture-insurance-001',
    reference: 'Synthetic insurance manifest',
    validUntil: '2026-12-01T00:00:00.000Z',
    rawSha256,
  });
  assert.deepEqual(await ok('email-preview', { emailBase64 }), preview);
  assert.equal(await count(), 0);
});

test('explicit submission preserves CRLF and UTF-8 bytes, replays once and retains independent review', async t => {
  const { post, ok, count } = await setup(t);
  const preview = await ok('email-preview', { emailBase64 });
  const intent = { ...submission, expectedRawSha256: preview.rawSha256 };
  const saved = await ok('email-submit', intent);
  assert.equal(saved.rawSha256, rawSha256);
  const { receipt } = saved;
  assert.equal(receipt.status, 'unverified');
  assert.equal(receipt.sourceId, preview.sourceId);
  assert.equal(receipt.receivedAt, context.receivedAt);
  assert.equal(receipt.content, 'eml-v1:' + emailBase64);
  assert.deepEqual(Buffer.from(receipt.content.slice('eml-v1:'.length), 'base64'), raw);
  assert.deepEqual(await ok('email-submit', intent), saved);
  const state = await ok('state', { tenant: context.tenant });
  assert.equal(state.documents.length, 1);
  assert.equal(await count(), 1);
  const review = {
    commandId: 'email-http-review', tenant: context.tenant, documentId: receipt.documentId,
    reviewer: 'acme-compliance', expectedHash: receipt.contentHash, expectedRevision: receipt.revision,
    decision: 'verify', note: 'Checked the synthetic fixture source.',
  };
  assert.equal((await post('review-document', { ...review, reviewer: context.actor })).status, 400);
  assert.equal((await post('review-document', { ...review, expectedHash: preview.rawSha256 })).status, 400);
  assert.equal(await count(), 1);
  assert.equal((await ok('review-document', review)).status, 'verified');
  assert.equal((await ok('email-submit', intent)).receipt.status, 'verified');
  assert.equal(await count(), 2);
});

test('email endpoints reject malformed or overlong source, altered bytes and supplied authority without writing', async t => {
  const { post, count } = await setup(t);
  const changed = Buffer.concat([raw, Buffer.from('Additional synthetic evidence')]).toString('base64');
  const previewWithPadding = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 3) % 3, 65)]).toString('base64');
  assert.match(previewWithPadding, /=+$/);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = previewWithPadding.match(/=+$/)[0].length;
  const lastIndex = previewWithPadding.length - padding - 1;
  const nonzeroPadBits = previewWithPadding.slice(0, lastIndex) +
    alphabet[alphabet.indexOf(previewWithPadding[lastIndex]) + 1] + previewWithPadding.slice(lastIndex + 1);
  for (const body of [
    null, [], { emailBase64, path: 'fixture.eml' }, { emailBase64: '' }, { emailBase64: [emailBase64] },
    { emailBase64: emailBase64 + '\n' }, { emailBase64: previewWithPadding.replace(/=+$/, '') },
    { emailBase64: nonzeroPadBits }, { emailBase64: Buffer.alloc(2801, 65).toString('base64') },
    { emailBase64: Buffer.from([0xff]).toString('base64') },
  ]) assert.equal((await post('email-preview', body)).status, 400);
  for (const body of [
    null, [], { ...submission, kind: 'license' }, { ...submission, expectedRawSha256: undefined },
    { ...submission, emailBase64: changed }, { ...submission, expectedRawSha256: rawSha256.toUpperCase() },
    { ...submission, context: { ...context, approved: true } },
    { ...submission, context: { ...context, actor: 'beta-operator' } },
    { ...submission, context: { ...context, receivedAt: '2027-01-01T00:00:00.000Z' } },
  ]) assert.equal((await post('email-submit', body)).status, 400);
  assert.equal(await count(), 0);
});

test('email endpoints retain the loopback host, origin, client and method guards', async t => {
  const { post, base, count } = await setup(t);
  for (const [route, body] of [['email-preview', { emailBase64 }], ['email-submit', submission]]) {
    assert.equal((await post(route, body, { 'X-Demo-Client': '' })).status, 403);
    assert.equal((await post(route, body, { Origin: 'https://foreign.example' })).status, 403);
    assert.equal((await post(route, body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await fetch(base + route, { method: 'PUT' })).status, 405);
    assert.equal((await fetch(base + route)).status, 404);
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(base + route, { method: 'POST', headers: { Host: 'foreign.example' } }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
  }
  assert.equal(await count(), 0);
});
