import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { supportDesk } from './flagship-decisions.mjs';
import { sourceManifest } from './flagship-suite.mjs';
import { compareSupportPolicies, evaluateSupportSuite } from './support-evaluation.mjs';
import { scopedIntentPolicy } from './support-intent-policy.mjs';

const { documents } = JSON.parse(readFileSync(new URL('./support-evaluation-corpus.json', import.meta.url), 'utf8'));
const evaluate = (query, inputDocuments = documents) => supportDesk({
  tenant: 'storefront', query, documents: inputDocuments, retrievalPolicy: scopedIntentPolicy,
});

test('opt-in comparison preserves the original baseline and uses the identical fixture labels and order', () => {
  const { lexical, scopedIntent } = compareSupportPolicies();
  assert.deepEqual(lexical, evaluateSupportSuite());
  assert.equal(scopedIntent.corpusSha256, lexical.corpusSha256);
  assert.equal(scopedIntent.labelsSha256, lexical.labelsSha256);
  assert.deepEqual(scopedIntent.cases.map(row => row.expected), lexical.cases.map(row => row.expected));
  assert.equal(lexical.metrics.exactCases, 11);
  assert.equal(scopedIntent.metrics.exactCases, 14);
  assert.equal(scopedIntent.metrics.forbiddenCitationCases, 0);
  assert.deepEqual(scopedIntent.cases.map(row => row.findings), Array.from({ length: 14 }, () => []));
});

test('scoped policy accepts bounded reformulations and preserves the exact approved excerpt', () => {
  for (const [query, citation, intent] of [
    ['HOW MANY   days do I have to send it back if the parcel is sealed?', 'return-window-v1', 'return_window'],
    ['How should I report damage on a return?', 'damage-report-v1', 'damage_first_step'],
    ['Where do I find the link to track my parcel?', 'tracking-v1', 'tracking_link'],
  ]) {
    const output = evaluate(query);
    assert.equal(output.action, 'answer_review');
    assert.equal(output.externalActions, 0);
    assert.deepEqual(output.retrievalPolicy, { id: scopedIntentPolicy, intent, reason: 'one_approved_source' });
    assert.deepEqual(output.citations, [citation]);
    assert.equal(output.answer, documents.find(document => document.id === citation).text);
    assert.equal(output.citationEvidence[0].quote, output.answer);
  }
});

test('scoped policy escalates unknown details, mixed questions and permission requests', () => {
  for (const query of [
    'How long does standard shipping take and what does it cost?',
    'What charges apply to delivery?',
    'When will express delivery arrive?',
    'Can I return a damaged unopened parcel?',
    'What should I do first to return damaged goods within a week?',
    'How many days can I return an opened product?',
    'How many days do I have to return a parcel that is not sealed?',
    'Where can I download a tax invoice?',
    'Where is my tracking link? Who is the carrier?',
    'Where is the tracking link or delivery estimate?',
    'How do I change my billing address on the invoice?',
    'How can I modify the amount on an invoice?',
    'When can I change my delivery address?',
    'When will my delivery be delayed by weather?',
    'How many days will shipping take for a preorder?',
    'What should I do with a damaged parcel to qualify for compensation?',
    'How long does standard shipping take to Alaska?',
    'How many days will shipping take for a backordered purchase?',
    'How do I report damage anonymously?',
    'How many days do I have to send back a package sealed after testing?',
  ]) {
    const output = evaluate(query);
    assert.equal(output.action, 'escalation_review', query);
    assert.deepEqual(output.citationEvidence, [], query);
  }
});

test('scoped policy holds competing approved sources and refuses foreign, unapproved or marked evidence', () => {
  const query = 'How long does standard shipping take?';
  const source = documents.find(document => document.id === 'standard-delivery-v1');
  const held = evaluate(query, [
    { ...source, tenant: 'other', id: 'foreign-delivery' },
    { ...source, approved: false, id: 'draft-delivery' },
    { ...source, instructionLike: true, id: 'marked-delivery' },
  ]);
  assert.equal(held.retrievalPolicy.reason, 'no_approved_source');
  assert.deepEqual(held.citations, []);
  assert.deepEqual(held.excluded.map(row => row.reason), ['tenant_mismatch', 'not_approved', 'flagged_instruction_text']);
  const conflict = evaluate(query, [source, { ...source, id: 'other-approved-delivery' }]);
  assert.equal(conflict.retrievalPolicy.reason, 'competing_approved_sources');
  assert.deepEqual(conflict.citations, []);
  assert.throws(() => supportDesk({
    tenant: 'storefront', query, documents, retrievalPolicy: 'unknown',
  }), /Unknown support retrieval policy/);
});

test('F03 source receipts bind the new scoped policy module and regression tests', () => {
  const manifest = sourceManifest('F03', path => path);
  const changed = sourceManifest('F03', path => path === 'support-intent-policy.mjs' ? path + '-changed' : path);
  assert.ok(manifest.files.some(file => file.path === 'support-intent-policy.test.mjs'));
  assert.notEqual(changed.hash, manifest.hash);
});
