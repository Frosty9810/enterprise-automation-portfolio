import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openConstruction } from './construction-core.mjs';
import { parseConstructionEmail, prepareConstructionEmail } from './construction-email.mjs';

const fixture = kind => readFileSync(new URL('./construction-email-' + kind + '.eml', import.meta.url));
const insurance = fixture('insurance').toString('utf8').replaceAll('\r\n', '\n');
const site = { tenant: 'acme', siteId: 'site-acme', subcontractorId: 'sub-acme' };
const context = {
  ...site, actor: 'acme-operator', commandId: 'email-intake',
  receivedAt: '2026-10-24T10:00:00.000Z',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('parse uniform LF and CRLF, preserving exact UTF-8 octets and source metadata', () => {
  const license = fixture('license').toString('utf8').replaceAll('\r\n', '\n');
  const lf = Buffer.from(license);
  const crlf = Buffer.from(license.replaceAll('\n', '\r\n'));
  for (const bytes of [lf, crlf]) {
    const parsed = parseConstructionEmail(bytes);
    assert.equal(parsed.kind, 'license');
    assert.equal(parsed.sourceId, 'eml-fixture-license-001');
    assert.equal(parsed.reference, 'Synthetic license manifest');
    assert.equal(parsed.validUntil, '2026-12-01T00:00:00.000Z');
    assert.equal(parsed.rawSha256, hash(bytes));
    assert.deepEqual(Buffer.from(parsed.content.slice('eml-v1:'.length), 'base64'), bytes);
  }
  assert.notEqual(parseConstructionEmail(lf).rawSha256, parseConstructionEmail(crlf).rawSha256);
});

test('preparation uses explicit fixture context and does not substitute the mail Date', () => {
  const { input, rawSha256 } = prepareConstructionEmail(Buffer.from(insurance), context);
  for (const [key, value] of Object.entries(context)) assert.equal(input[key], value);
  assert.equal(input.channel, 'email');
  assert.equal(rawSha256, hash(Buffer.from(insurance)));
  assert.equal(Object.hasOwn(input, 'rawSha256'), false);
  assert.throws(() => prepareConstructionEmail(Buffer.from(insurance), { ...context, kind: 'insurance' }), /context fields/);
  assert.throws(() => prepareConstructionEmail(Buffer.from(insurance), { ...context, receivedAt: undefined }), /context fields/);
});

const invalid = [
  ['empty source', Buffer.alloc(0)],
  ['oversize bytes', Buffer.from(insurance + 'é'.repeat(1400))],
  ['invalid UTF-8', Buffer.concat([Buffer.from(insurance), Buffer.of(0xff)])],
  ['BOM', Buffer.from('\uFEFF' + insurance)],
  ['bare CR', Buffer.from(insurance.replace('\n', '\r'))],
  ['mixed endings', Buffer.from(insurance.replace('\n', '\r\n'))],
  ['control byte', Buffer.from(insurance + '\0')],
  ['no body', Buffer.from(insurance.split('\n\n')[0] + '\n\n ')],
  ['missing header', Buffer.from(insurance.replace(/^Subject: .*\n/mu, ''))],
  ['folded header', Buffer.from(insurance.replace(/^Subject: .*$/mu, 'Subject: Fixture\n continued'))],
  ['duplicate header', Buffer.from(insurance.replace(/^Subject: .*$/mu, 'Message-ID: <copy@construction.invalid>'))],
  ['unknown header', Buffer.from(insurance.replace('Subject:', 'X-Arbitrary:'))],
  ['encoded header', Buffer.from(insurance.replace(/^Subject: .*$/mu, 'Subject: =?UTF-8?B?QQ==?='))],
  ['unconfigured sender domain', Buffer.from(insurance.replace('supplier@construction.invalid', 'supplier@example.com'))],
  ['bad message ID', Buffer.from(insurance.replace('<fixture-insurance-001@construction.invalid>', '<wrong@example.com>'))],
  ['bad Date', Buffer.from(insurance.replace('Sat, 24 Oct', 'Mon, 24 Oct'))],
  ['bad expiry', Buffer.from(insurance.replace('2026-12-01', '2026-02-30'))],
  ['bad kind', Buffer.from(insurance.replace('X-CON01-Kind: insurance', 'X-CON01-Kind: passport'))],
  ['multipart', Buffer.from(insurance.replace('text/plain; charset=UTF-8', 'multipart/mixed; boundary=fixture'))],
  ['encoded body', Buffer.from(insurance.replace('Encoding: 8bit', 'Encoding: base64'))],
];
for (const [label, bytes] of invalid) {
  test('reject ' + label, () => {
    assert.throws(() => parseConstructionEmail(bytes), /Invalid CON-01 fixture email/);
  });
}

test('existing ledger keeps exact byte evidence unverified, replays once, and requires independent review', t => {
  const desk = openConstruction(':memory:');
  t.after(() => desk.close());
  const audit = () => desk.verifyAudit({ tenant: site.tenant });
  const prepare = (kind, commandId) => prepareConstructionEmail(fixture(kind), { ...context, commandId });
  const first = prepare('insurance', 'insurance-mail');
  const second = prepare('license', 'license-mail');

  assert.throws(() => prepareConstructionEmail(Buffer.of(0xff), context), /UTF-8/);
  assert.throws(() => desk.submitDocument({ ...first.input, actor: 'beta-operator' }), /operators fixture/);
  assert.equal(audit().eventCount, 0);
  const insuranceDoc = desk.submitDocument(first.input);
  assert.deepEqual(desk.submitDocument(first.input), insuranceDoc);
  const changed = Buffer.from(fixture('insurance').toString('utf8').replace('certificate summary', 'updated certificate'));
  const altered = prepareConstructionEmail(changed, { ...context, commandId: first.input.commandId });
  assert.throws(() => desk.submitDocument(altered.input), error => error.code === 'conflict');
  assert.throws(() => desk.submitDocument({ ...altered.input, commandId: 'insurance-copy' }), /immutable document/);
  const licenseDoc = desk.submitDocument(second.input);
  assert.equal(audit().eventCount, 2);
  assert.equal(desk.readiness(site).ready, false);

  for (const [doc, expected] of [[insuranceDoc, first], [licenseDoc, second]]) {
    assert.equal(doc.status, 'unverified');
    assert.equal(doc.receivedAt, context.receivedAt);
    assert.equal(doc.sourceContentHash, hash(doc.content));
    assert.equal(hash(Buffer.from(doc.content.slice('eml-v1:'.length), 'base64')), expected.rawSha256);
    const review = {
      commandId: 'review-' + doc.kind, tenant: site.tenant, documentId: doc.documentId,
      reviewer: 'acme-compliance', expectedHash: doc.contentHash, expectedRevision: doc.revision,
      decision: 'verify', note: 'Reviewed the synthetic fixture evidence.',
    };
    assert.throws(() => desk.reviewDocument({ ...review, expectedHash: expected.rawSha256 }), /exact document hash/);
    assert.equal(desk.reviewDocument(review).status, 'verified');
  }
  assert.equal(desk.readiness(site).ready, true);
  assert.equal(desk.state({ tenant: site.tenant }).documents.length, 2);
  assert.equal(audit().eventCount, 4);
  assert.equal(audit().valid, true);
});
