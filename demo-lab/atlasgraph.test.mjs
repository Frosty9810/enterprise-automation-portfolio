import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { atlasGraph, AtlasGraphError, openAtlasGraph } from './atlasgraph-core.mjs';

const fixture = JSON.parse(readFileSync(new URL('./atlasgraph-example.json', import.meta.url), 'utf8'));
const example = () => structuredClone(fixture);
function using(run) { const graph = openAtlasGraph(); try { return run(graph, example()); } finally { graph.close(); } }
function rejects(run, code = 'invalid_input') { assert.throws(run, (error) => error instanceof AtlasGraphError && error.code === code); }

test('AtlasGraph compiles the supplied structured fixture and collects exact cited evidence across two hops', () => using((graph, data) => {
  const compiled = graph.compile(data.compile);
  assert.equal(compiled.sources, 3); assert.equal(compiled.pages, 3); assert.equal(compiled.links, 2); assert.match(compiled.snapshotHash, /^[a-f0-9]{64}$/u);
  const answer = graph.answer(data.answer);
  assert.equal(answer.status, 'supported'); assert.equal(answer.reason, 'supported'); assert.equal(answer.trace.at(-1).depth, 2);
  assert.deepEqual(answer.claims.map(({ key, value }) => [key, value]), [['approval', 'operations director approval'], ['customsRule', 'signed permit before release'], ['incoterm', 'DAP']]);
  assert.equal(answer.citations.length, 3); assert.equal(answer.evidenceBytes, Buffer.byteLength(JSON.stringify(answer.citations), 'utf8')); assert.ok(answer.evidenceBytes <= answer.evidenceBudgetBytes);
  for (const citation of answer.citations) { assert.equal(citation.version, 'v1'); assert.match(citation.sourceHash, /^[a-f0-9]{64}$/u); assert.equal(citation.text, data.compile.sources.find((source) => source.id === citation.sourceId).pages[0].text); }
  assert.equal(graph.errors({ tenant: 'harbor-demo' }).errors.length, 0);
}));

test('AtlasGraph search, read and bidirectional follow use only the selected tenant approved graph', () => using((graph, data) => {
  graph.compile(data.compile);
  assert.equal(graph.search({ tenant: 'harbor-demo', query: 'permit' }).matches.length, 2);
  assert.equal(graph.read({ tenant: 'harbor-demo', id: 'shipment' }).page.sourceId, 'supplier-record');
  const links = graph.follow({ tenant: 'harbor-demo', id: 'customs-checks' }).links;
  assert.equal(links.length, 2); assert.equal(links.find((link) => link.direction === 'incoming').support.pageId, 'shipment');
  assert.deepEqual(new Set(links.map((link) => link.neighbor)), new Set(['shipment', 'approval-threshold']));
  rejects(() => graph.read({ tenant: 'other', id: 'shipment' }), 'not_compiled');
  rejects(() => graph.search({ tenant: 'harbor-demo', query: 'permit', limit: 21 }));
  rejects(() => graph.search({ tenant: 'harbor-demo', query: '!@#' }));
  rejects(() => graph.follow({ tenant: 'harbor-demo', id: 'absent' }), 'not_found');
}));

test('AtlasGraph canonical compilation reuses equivalent snapshots and protects immutable source versions atomically', () => using((graph, data) => {
  const first = graph.compile(data.compile);
  data.compile.sources.reverse();
  assert.deepEqual(graph.compile(data.compile), { ...first, reused: true });
  const changed = example().compile;
  changed.sources[0].version = 'v2'; changed.sources[0].title = 'New source staged before conflicting source';
  changed.sources[1].title = 'Illegal title edit at the same version';
  rejects(() => graph.compile(changed), 'version_conflict');
  assert.equal(graph.read({ tenant: 'harbor-demo', id: 'shipment' }).snapshotHash, first.snapshotHash);
  // The earlier v2 insert must also have rolled back, not only the active pointer.
  changed.sources[0].title = 'A different v2 title after the rejected transaction';
  changed.sources[1].version = 'v2';
  const updated = graph.compile(changed);
  assert.notEqual(updated.snapshotHash, first.snapshotHash);
}));

test('AtlasGraph traversal handles cycles once and abstains rather than silently clipping a bounded neighborhood', () => using((graph, data) => {
  const finalPage = data.compile.sources[2].pages[0];
  finalPage.text += ' The shipment page provides original terms.';
  finalPage.references.push({ to: 'shipment', relation: 'context', quote: 'The shipment page provides original terms.' });
  graph.compile(data.compile);
  const result = graph.answer({ ...data.answer, maxHops: 2 });
  assert.equal(result.status, 'supported'); assert.equal(result.trace.length, 3); assert.equal(new Set(result.trace.map((step) => step.pageId)).size, 3);
  const bounded = graph.answer({ ...data.answer, requiredClaims: ['incoterm'], maxHops: 0, requestId: 'bounded' });
  assert.equal(bounded.status, 'abstained'); assert.equal(bounded.reason, 'hop_limit'); assert.deepEqual(bounded.citations, []);
  rejects(() => graph.answer({ ...data.answer, maxHops: 7 }));
}));

test('AtlasGraph missing evidence and absent start pages create persistent pending review records', () => using((graph, data) => {
  graph.compile(data.compile);
  const missing = graph.answer({ ...data.answer, requiredClaims: ['absent-claim'], requestId: 'missing-claim' });
  assert.equal(missing.status, 'abstained'); assert.equal(missing.reason, 'missing_evidence'); assert.deepEqual(missing.missing, ['absent-claim']);
  const absent = graph.answer({ ...data.answer, startId: 'absent-page', requestId: 'missing-start' });
  assert.equal(absent.reason, 'missing_start'); assert.equal(absent.trace.length, 0);
  assert.equal(graph.errors({ tenant: 'harbor-demo' }).errors.length, 2);
  assert.ok(graph.errors({ tenant: 'harbor-demo' }).errors.every((entry) => entry.status === 'pending'));
}));

test('AtlasGraph contradictory reachable claims cause abstention even when the first path already supplied an answer', () => using((graph, data) => {
  const finalPage = data.compile.sources[2].pages[0];
  finalPage.text += ' The approval-alternative page contains another current instruction.';
  finalPage.references.push({ to: 'approval-alternative', relation: 'context', quote: 'The approval-alternative page contains another current instruction.' });
  data.compile.sources[2].pages.push({ id: 'approval-alternative', title: 'Contradictory synthetic instruction', text: 'Release requires finance director approval.', claims: [{ key: 'approval', value: 'finance director approval' }] });
  graph.compile(data.compile);
  const result = graph.answer({ ...data.answer, maxHops: 3 });
  assert.equal(result.reason, 'contradictory_evidence'); assert.deepEqual(result.conflicts, ['approval']); assert.deepEqual(result.claims, []); assert.deepEqual(result.citations, []);
}));

test('AtlasGraph exact UTF-8 citation budget abstains on overflow without claiming a tokenizer measurement', () => using((graph, data) => {
  data.compile.sources[0].pages[0].text += ' Synthetic unicode: envío marítimo 🚢.';
  graph.compile(data.compile);
  const adequate = graph.answer(data.answer);
  const exact = graph.answer({ ...data.answer, evidenceBudgetBytes: adequate.evidenceBytes, requestId: 'exact-budget' });
  assert.equal(exact.status, 'supported'); assert.equal(exact.evidenceBytes, exact.evidenceBudgetBytes);
  const overflow = graph.answer({ ...data.answer, evidenceBudgetBytes: adequate.evidenceBytes - 1, requestId: 'short-budget' });
  assert.equal(overflow.reason, 'evidence_budget'); assert.ok(overflow.requiredEvidenceBytes > overflow.evidenceBudgetBytes); assert.equal(overflow.evidenceBytes, 2); assert.deepEqual(overflow.citations, []);
  rejects(() => graph.answer({ ...data.answer, evidenceBudgetBytes: 25000 }));
}));

test('AtlasGraph source references require exact supporting quotes, target IDs and approved same-tenant targets', () => {
  for (const mutate of [
    (data) => { data.compile.sources[0].pages[0].references[0].quote = 'A fabricated quote about customs-checks.'; },
    (data) => { data.compile.sources[0].pages[0].references[0].quote = 'Sample shipment uses Incoterm DAP.'; },
    (data) => { data.compile.sources[0].pages[0].references[0].to = 'other-tenant-page'; data.compile.sources[0].pages[0].references[0].quote = 'other-tenant-page'; data.compile.sources[0].pages[0].text += ' other-tenant-page'; },
    (data) => { data.compile.sources[1].approved = false; },
    (data) => { data.compile.sources[0].pages[0].claims[0].value = 'A value absent from the page'; },
  ]) using((graph, data) => { mutate(data); rejects(() => graph.compile(data.compile)); });
});

test('AtlasGraph unapproved standalone sources are stored but never searchable, readable or traversable', () => using((graph, data) => {
  data.compile.sources.push({ id: 'unreviewed', version: 'v1', title: 'Not approved', approved: false, pages: [{ id: 'hidden', title: 'Secret synthetic page', text: 'UNAPPROVED_SENTINEL', claims: [] }] });
  const compiled = graph.compile(data.compile);
  assert.equal(compiled.pages, 4); assert.equal(compiled.approvedPages, 3);
  assert.equal(graph.search({ tenant: 'harbor-demo', query: 'UNAPPROVED_SENTINEL' }).matches.length, 0);
  rejects(() => graph.read({ tenant: 'harbor-demo', id: 'hidden' }), 'not_found');
  rejects(() => graph.follow({ tenant: 'harbor-demo', id: 'hidden' }), 'not_found');
  assert.equal(graph.answer({ ...data.answer, startId: 'hidden' }).reason, 'missing_start');
}));

test('AtlasGraph replays exact queries, rejects key conflicts and marks old evidence stale after source revision', () => using((graph, data) => {
  graph.compile(data.compile); const original = graph.answer(data.answer);
  const replay = graph.answer(data.answer); assert.equal(replay.replayed, true); assert.equal(replay.stale, false); assert.deepEqual(replay.citations, original.citations);
  rejects(() => graph.answer({ ...data.answer, question: 'A different question using the same request key' }), 'request_conflict');
  data.compile.sources[0].version = 'v2'; data.compile.sources[0].pages[0].text = data.compile.sources[0].pages[0].text.replace('DAP', 'FCA'); data.compile.sources[0].pages[0].claims[0].value = 'FCA';
  graph.compile(data.compile);
  const stale = graph.receipt({ tenant: 'harbor-demo', id: original.id });
  assert.equal(stale.stale, true); assert.deepEqual(stale.citations, original.citations); assert.equal(graph.answer(data.answer).stale, true);
  const current = graph.answer({ ...data.answer, requestId: 'new-evidence' });
  assert.equal(current.stale, false); assert.equal(current.claims.find((claim) => claim.key === 'incoterm').value, 'FCA');
  assert.notEqual(current.citations[0].sourceHash, original.citations[0].sourceHash);
  rejects(() => graph.receipt({ tenant: 'another', id: original.id }), 'not_found');
  assert.equal(graph.history({ tenant: 'another' }).receipts.length, 0);
}));

test('AtlasGraph SQLite restart preserves compiled versions, receipts and manual correction review', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlasgraph-')); const path = join(directory, 'graph.sqlite'); let graph;
  try {
    const data = example(); graph = openAtlasGraph(path); graph.compile(data.compile);
    const answer = graph.answer({ ...data.answer, requiredClaims: ['missing'] });
    const correction = graph.recordError({ tenant: 'harbor-demo', receiptId: answer.id, message: 'Review a missing policy claim.', correction: 'Create an approved source revision with the missing claim.' });
    graph.close(); graph = openAtlasGraph(path);
    assert.equal(graph.read({ tenant: 'harbor-demo', id: 'shipment' }).page.version, 'v1');
    assert.equal(graph.receipt({ tenant: 'harbor-demo', id: answer.id }).reason, 'missing_evidence');
    assert.equal(graph.errors({ tenant: 'harbor-demo' }).errors.length, 2);
    const before = graph.read({ tenant: 'harbor-demo', id: 'shipment' }).snapshotHash;
    const review = graph.reviewError({ tenant: 'harbor-demo', id: correction.id, status: 'accepted', note: 'Accepted for manual compilation; no source edit has been made.' });
    assert.equal(review.sourceChanged, false); assert.equal(graph.read({ tenant: 'harbor-demo', id: 'shipment' }).snapshotHash, before);
    graph.close(); graph = openAtlasGraph(path);
    assert.equal(graph.errors({ tenant: 'harbor-demo' }).errors.find((entry) => entry.id === correction.id).status, 'accepted');
    rejects(() => graph.reviewError({ tenant: 'harbor-demo', id: correction.id, status: 'rejected', note: 'Duplicate review' }), 'not_found');
    rejects(() => graph.recordError({ tenant: 'other', receiptId: answer.id, message: 'Cross tenant correction' }), 'not_found');
    const changed = example().compile; changed.sources[0].title = 'Changed without a revision'; rejects(() => graph.compile(changed), 'version_conflict');
  } finally { graph?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('AtlasGraph accepts an existing SQLite connection without owning its lifecycle', () => {
  const db = new DatabaseSync(':memory:');
  try { const graph = atlasGraph(db); graph.compile(example().compile); assert.equal(graph.search({ tenant: 'harbor-demo', query: 'shipment' }).matches.length, 2); assert.equal(db.prepare('SELECT COUNT(*) AS total FROM atlas_source_versions').get().total, 3); } finally { db.close(); }
});

test('AtlasGraph rejects malformed, oversized and prototype-related structured input', () => {
  for (const mutate of [
    (data) => { data.compile.sources[0].pages[0].text = 'x'.repeat(8001); },
    (data) => { data.compile.sources[0].approved = 'true'; },
    (data) => { data.compile.sources.push(structuredClone(data.compile.sources[0])); },
    (data) => { data.compile.sources[1].pages[0].id = 'shipment'; },
    (data) => { data.compile.sources[0].unexpected = true; },
    (data) => { data.compile.tenant = '../escape'; },
    (data) => { data.compile.sources[0].pages[0].claims.push({ key: 'incoterm', value: 'DAP' }); },
    (data) => { data.compile.sources[0].pages[0].references.push(structuredClone(data.compile.sources[0].pages[0].references[0])); },
    (data) => { data.compile.sources = Array.from({ length: 13 }, (_, index) => ({ ...data.compile.sources[0], id: `source-${index}` })); },
    (data) => { data.compile.sources[0].pages = Array.from({ length: 33 }, (_, index) => ({ id: `page-${index}`, title: 'Page', text: 'Text' })); },
  ]) using((graph, data) => { mutate(data); rejects(() => graph.compile(data.compile)); });
  using((graph) => {
    rejects(() => graph.compile(JSON.parse('{"tenant":"harbor-demo","sources":[],"__proto__":{"polluted":true}}')));
    rejects(() => graph.compile({ tenant: 'harbor-demo', sources: [], constructor: 'unsafe' }));
    rejects(() => graph.compile({ tenant: 'harbor-demo', sources: [], extra: Number.NaN }));
    assert.equal({}.polluted, undefined);
  });
});
