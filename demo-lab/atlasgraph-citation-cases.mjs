import { atlasGraph } from './atlasgraph-core.mjs';
import { atlasMarkdown } from './atlasgraph-markdown.mjs';
import { gradeCandidate } from './atlasgraph-citation-gate.mjs';

export function prepareCitationCases(db) {
  const desk = atlasGraph(db);
  const importer = atlasMarkdown(db);
  const input = importer.catalog().example;

  function importSnapshot(snapshot) {
    const { previewHash, implementationHash, baseSnapshotHash } = importer.preview(snapshot);
    importer.compile({ input: snapshot, previewHash, implementationHash, baseSnapshotHash });
  }

  importSnapshot(input);
  const tenant = input.tenant;
  const query = {
    tenant, question: 'What terms and approvals apply to the synthetic shipment?',
    startId: 'shipment', requiredClaims: ['incoterm', 'customsRule', 'approval'], maxHops: 2,
  };
  const answer = { tenant, receiptId: 'citation-eval-supported' };
  const missing = { tenant, receiptId: 'citation-eval-missing' };
  desk.answer({ ...query, requestId: answer.receiptId });
  desk.answer({ ...query, requiredClaims: ['unpublishedException'], requestId: missing.receiptId });

  const supported = {
    status: 'supported',
    claims: [
      { key: 'incoterm', value: 'DAP', pageId: 'shipment', quote: 'Sample shipment uses Incoterm DAP.' },
      { key: 'customsRule', value: 'signed permit before release', pageId: 'customs-checks', quote: 'Restricted goods require a signed permit before release.' },
      { key: 'approval', value: 'operations director approval', pageId: 'approval-threshold', quote: 'release requires operations director approval after permit verification.' },
    ],
  };
  const abstained = { status: 'abstained', claims: [] };
  function altered(index, changes) {
    return { ...supported, claims: supported.claims.map((claim, i) => i === index ? { ...claim, ...changes } : claim) };
  }
  const cases = [
    { id: 'exact-claims-and-quotes', receipt: answer, candidate: supported, expected: 'grounded_answer' },
    { id: 'forged-page', receipt: answer, candidate: altered(0, { pageId: 'made-up-policy' }), expected: 'wrong_citation' },
    { id: 'real-page-wrong-claim', receipt: answer, candidate: altered(0, { pageId: 'approval-threshold' }), expected: 'wrong_citation' },
    { id: 'invented-quote', receipt: answer, candidate: altered(0, { quote: 'DAP applies worldwide.' }), expected: 'quote_mismatch' },
    { id: 'unrelated-real-quote', receipt: answer, candidate: altered(0, { quote: 'Fictional source note: Café Harbor 📦;' }), expected: 'quote_mismatch' },
    { id: 'claim-value-changed', receipt: answer, candidate: altered(0, { value: 'FOB' }), expected: 'unsupported_value' },
    { id: 'claim-omitted', receipt: answer, candidate: { ...supported, claims: supported.claims.slice(1) }, expected: 'missing_claim' },
    { id: 'unnecessary-abstention', receipt: answer, candidate: abstained, expected: 'unnecessary_abstention' },
    { id: 'missing-evidence-abstention', receipt: missing, candidate: abstained, expected: 'grounded_abstention' },
    { id: 'answer-with-missing-evidence', receipt: missing, candidate: supported, expected: 'unsupported_receipt' },
    { id: 'wrong-tenant-receipt', receipt: { ...answer, tenant: 'other-tenant' }, candidate: supported, expected: 'receipt_unavailable' },
  ];
  const revise = () => {
    const updated = structuredClone(input);
    const source = updated.sources[0];
    source.version = 'markdown-v2';
    source.markdown = source.markdown.replace('Café Harbor', 'Café Harbor Annex');
    importSnapshot(updated);
  };
  return { desk, cases, answer, supported, revise };
}

export function evaluateCitationCases(db) {
  const { desk, cases, answer, supported, revise } = prepareCitationCases(db);
  const results = cases.map(({ id, receipt, candidate, expected }) => ({
    id, expected, ...gradeCandidate(desk, receipt, candidate),
  }));
  revise();
  results.push({
    id: 'stale-after-source-refresh', expected: 'stale_receipt',
    ...gradeCandidate(desk, answer, supported),
  });
  const passed = results.filter(result => result.reason === result.expected &&
    result.accepted === ['grounded_answer', 'grounded_abstention'].includes(result.expected)).length;
  return { total: results.length, passed, cases: results };
}
