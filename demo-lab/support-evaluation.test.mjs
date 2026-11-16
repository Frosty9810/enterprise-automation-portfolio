import assert from 'node:assert/strict';
import test from 'node:test';
import { supportDesk } from './flagship-decisions.mjs';
import { evaluateSupportSuite } from './support-evaluation.mjs';

test('F03 evaluates the frozen diagnostic cases and includes exact excerpt evidence', () => {
  const result = evaluateSupportSuite();
  assert.deepEqual(evaluateSupportSuite(), result);
  assert.equal(result.suiteId, 'f03-support-diagnostic-v1');
  for (const digest of [result.corpusSha256, result.labelsSha256]) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.metrics, {
    cases: 14,
    exactCases: 11,
    exactCaseRate: 11 / 14,
    falseAnswers: 1,
    falseAbstentions: 1,
    wrongCitations: 1,
    forbiddenCitationCases: 0,
    invalidResults: 0,
  });
  const returned = result.cases.find(row => row.id === 'return-window');
  assert.deepEqual(returned.observed.citations, ['return-window-v1']);
  assert.match(returned.observed.quote, /within 30 calendar days/);
  assert.match(returned.observed.sha256, /^[a-f0-9]{64}$/);
});

test('F03 surfaces distinct relevance failures separately from source control checks', () => {
  const result = evaluateSupportSuite();
  assert.deepEqual(result.cases.filter(row => row.findings.length).map(row => [row.id, row.findings]), [
    ['paraphrased-return', ['false_abstention']],
    ['unsupported-shipping-price', ['false_answer']],
    ['damage-versus-general-return', ['wrong_citation']],
  ]);
  for (const id of ['cross-tenant', 'draft-policy', 'flagged-instructions']) {
    const row = result.cases.find(item => item.id === id);
    assert.deepEqual(row.observed, { status: 'abstain', citations: [] });
    assert.deepEqual(row.forbidden, []);
  }
  const dealer = result.cases.find(row => row.id === 'dealer-authority');
  assert.deepEqual(dealer.observed.citations, ['dealer-tiers-v1']);
});

test('scoring detects forbidden citations on either output surface and omits the raw excerpt', () => {
  const result = evaluateSupportSuite(input => {
    const output = supportDesk(input);
    if (input.tenant === 'storefront' && input.query.includes('wholesale')) {
      return {
        ...output,
        status: 'evidence_found',
        action: 'answer_review',
        citations: ['dealer-tiers-v1'],
        citationEvidence: [{ id: 'flagged-refund-v1', quote: 'deliberately-forged-excerpt' }],
      };
    }
    if (input.query.includes('warranty')) return { ...output, citations: ['warranty-draft-v1'] };
    return output;
  });
  const crossTenant = result.cases.find(row => row.id === 'cross-tenant');
  assert.deepEqual(crossTenant.forbidden, ['dealer-tiers-v1', 'flagged-refund-v1']);
  assert.deepEqual(crossTenant.findings, ['false_answer', 'forbidden_citation', 'invalid_result']);
  assert.equal(Object.hasOwn(crossTenant.observed, 'quote'), false);
  assert.deepEqual(result.cases.find(row => row.id === 'draft-policy').forbidden, ['warranty-draft-v1']);
  assert.equal(result.metrics.forbiddenCitationCases, 2);
});

test('scoring keeps a forged excerpt or an external effect from passing', () => {
  const result = evaluateSupportSuite(input => {
    const output = supportDesk(input);
    if (input.query.includes('damaged') && input.query.includes('arrived')) {
      return { ...output, citationEvidence: [{ ...output.citationEvidence[0], sha256: '0'.repeat(64) }] };
    }
    if (input.query.includes('appliances')) return { ...output, externalActions: 1 };
    return output;
  });
  for (const id of ['damage-report', 'missing-policy']) {
    const row = result.cases.find(candidate => candidate.id === id);
    assert.deepEqual(row.findings, ['invalid_result']);
  }
  assert.equal(result.metrics.exactCases, 9);
});

test('candidate mutations cannot rewrite the reference corpus or contaminate later cases', () => {
  const baseline = evaluateSupportSuite();
  const result = evaluateSupportSuite(input => {
    if (input.query === baseline.cases[0].question) {
      input.documents.find(document => document.id === 'return-window-v1').text = 'Unopened goods may be returned within one hour.';
      input.documents.find(document => document.id === 'standard-delivery-v1').topics.length = 0;
    }
    return supportDesk(input);
  });

  assert.equal(result.corpusSha256, baseline.corpusSha256);
  assert.deepEqual(result.cases[0].findings, ['invalid_result']);
  assert.equal(Object.hasOwn(result.cases[0].observed, 'quote'), false);
  assert.deepEqual(result.cases.slice(1), baseline.cases.slice(1));
});
