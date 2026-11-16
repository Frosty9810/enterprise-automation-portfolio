import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { supportDesk } from './flagship-decisions.mjs';

function readFixture(name) {
  return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function indexById(rows, collection) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Missing ' + collection + '.');
  const entries = new Map();
  for (const row of rows) {
    if (typeof row?.id !== 'string' || !row.id || entries.has(row.id)) {
      throw new Error('Missing or duplicate ID in ' + collection + '.');
    }
    entries.set(row.id, row);
  }
  return entries;
}

function allowed(document, tenant) {
  return document?.tenant === tenant && document.approved === true && document.instructionLike === false;
}

function citationIds(values) {
  return Array.isArray(values) ? values.filter(value => typeof value === 'string' && value) : [];
}

function score(question, label, output, documents) {
  const citations = citationIds(output?.citations);
  const evidence = Array.isArray(output?.citationEvidence) ? output.citationEvidence : [];
  const abstained = output?.status === 'abstain';
  const answered = output?.status === 'evidence_found';
  const status = abstained || answered ? output.status : 'invalid';
  const expectedAnswer = label.status === 'evidence_found';
  const forbidden = [...new Set([...citations, ...citationIds(evidence.map(item => item?.id))])]
    .filter(id => !allowed(documents.get(id), question.tenant));
  const citedDocument = documents.get(citations[0]);
  const exactExcerpt = answered && citations.length === 1 && !forbidden.length &&
    evidence.length === 1 && evidence[0]?.id === citations[0] &&
    output.answer === citedDocument?.text && evidence[0].quote === citedDocument.text &&
    evidence[0].sha256 === sha256(citedDocument.text);
  const validShape = (abstained || answered) && Array.isArray(output.citations) &&
    Array.isArray(output.citationEvidence) && citations.length === output.citations.length &&
    output.externalActions === 0 &&
    (answered
      ? output.action === 'answer_review' && exactExcerpt
      : output.action === 'escalation_review' && citations.length === 0 && evidence.length === 0 &&
        output.answer === 'No approved evidence found.');

  const findings = [];
  if (answered && !expectedAnswer) findings.push('false_answer');
  if (abstained && expectedAnswer) findings.push('false_abstention');
  if (answered && expectedAnswer && !isDeepStrictEqual(citations, label.citations)) {
    findings.push('wrong_citation');
  }
  if (forbidden.length) findings.push('forbidden_citation');
  if (!validShape) findings.push('invalid_result');

  return {
    id: question.id,
    tenant: question.tenant,
    question: question.query,
    expected: { status: label.status, citations: label.citations, rationale: label.rationale },
    observed: { status, citations, ...(exactExcerpt && { quote: evidence[0].quote, sha256: evidence[0].sha256 }) },
    forbidden,
    findings,
  };
}

export function evaluateSupportSuite(decide = supportDesk) {
  const corpus = readFixture('./support-evaluation-corpus.json');
  const reference = readFixture('./support-evaluation-labels.json');
  if (corpus.schemaVersion !== 1 || reference.schemaVersion !== 1 || reference.suiteId !== corpus.suiteId) {
    throw new Error('Support evaluation fixtures have incompatible versions.');
  }
  const documents = indexById(corpus.documents, 'documents');
  const questions = indexById(corpus.cases, 'questions');
  const labels = indexById(reference.labels, 'reference labels');
  if (questions.size !== labels.size) throw new Error('Expected one reference label per question.');
  for (const [id, question] of questions) {
    const label = labels.get(id);
    const citations = label?.citations;
    const validAnswer = label?.status === 'evidence_found' && citations?.length === 1 &&
      allowed(documents.get(citations[0]), question.tenant);
    const validAbstention = label?.status === 'abstain' && citations?.length === 0;
    if (!Array.isArray(citations) || !(validAnswer || validAbstention) ||
        typeof label?.rationale !== 'string' || !label.rationale.trim()) {
      throw new Error('Invalid reference label for ' + id + '.');
    }
  }

  const cases = [...questions.values()].map(question => {
    const output = decide({ query: question.query, tenant: question.tenant, documents: structuredClone(corpus.documents) });
    return score(question, labels.get(question.id), output, documents);
  });
  const count = finding => cases.filter(row => row.findings.includes(finding)).length;
  const exactCases = cases.filter(row => row.findings.length === 0).length;
  return {
    suiteId: corpus.suiteId,
    corpusSha256: sha256(corpus),
    labelsSha256: sha256(reference),
    metrics: {
      cases: cases.length,
      exactCases,
      exactCaseRate: exactCases / cases.length,
      falseAnswers: count('false_answer'),
      falseAbstentions: count('false_abstention'),
      wrongCitations: count('wrong_citation'),
      forbiddenCitationCases: count('forbidden_citation'),
      invalidResults: count('invalid_result'),
    },
    cases,
    scope: 'Authored synthetic diagnostics for the local lexical support desk. No hosted model or general injection detection is evaluated.',
  };
}
