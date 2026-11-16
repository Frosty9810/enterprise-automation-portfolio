import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewCrmDuplicates } from './crm-duplicate-review.mjs';

const contact = (id, email, fields = {}) => ({
  id, email, tenant: 'demo', name: 'Synthetic contact', owner: 'owner-1',
  consent: true, company: '', phone: '', revision: 1, ...fields,
});

test('duplicate review uses a stable case-folded in-tenant group and emits no identity fields or values', () => {
  const records = [
    contact('z2', '  TARGET@example.test  ', {company: 'Fixture Company', revision: 2}),
    contact('foreign', 'target@example.test', {tenant: 'other', consent: false}),
    contact('z1', 'target@example.test'),
    contact('missing', ''),
    contact('alias', 'target+suffix@example.test'),
  ];
  const original = structuredClone(records);
  const result = reviewCrmDuplicates({ tenant: 'demo', records });
  assert.deepEqual(records, original);
  assert.deepEqual(result, reviewCrmDuplicates({ tenant: 'demo', records: records.toReversed() }));
  assert.deepEqual(result, {
    scannedRecords: 5, excludedForeign: 1, missingEmail: 1, unmatched: 1, candidatePairs: 1, holds: 0,
    queue: [{ recordIds: ['z1', 'z2'], action: 'merge_preview', reasons: [], expectedRevisions: [1, 2], fillFields: ['company'] }],
    localWrites: 0, externalActions: 0,
  });
  assert.doesNotMatch(JSON.stringify(result), /example.test|Fixture Company|foreign/);
});

test('duplicate review holds name, owner, consent, field conflicts, and all multi-record groups', () => {
  const records = [
    contact('a1', 'pair@example.test', { company: 'A' }),
    contact('a2', 'pair@example.test', { owner: 'owner-2', consent: false, name: 'Different', company: 'B' }),
    contact('b3', 'cluster@example.test'),
    contact('b1', 'cluster@example.test'),
    contact('b2', 'cluster@example.test'),
  ];
  const result = reviewCrmDuplicates({ tenant: 'demo', records });
  assert.equal(result.candidatePairs, 0);
  assert.equal(result.holds, 2);
  assert.deepEqual(result.queue, [
    { recordIds: ['a1', 'a2'], action: 'stewardship_hold', reasons: ['name_identity_conflict', 'owner_conflict', 'consent_conflict', 'company_conflict'], expectedRevisions: [1, 1], fillFields: [] },
    { recordIds: ['b1', 'b2', 'b3'], action: 'stewardship_hold', reasons: ['multi_record_group'] },
  ]);
});

test('invalid rows fail the batch before exposing partial triage results', () => {
  const record = contact('id1', 'pair@example.test');
  assert.throws(() => reviewCrmDuplicates({ tenant: 'demo', records: [record, {...record, tenant: 'other'}] }), /duplicate ID/i);
  assert.throws(() => reviewCrmDuplicates({ tenant: 'demo', records: [{...record, consent: 'true'}] }), /boolean/);
  assert.throws(() => reviewCrmDuplicates({ tenant: 'demo', records: [{...record, email: 'bad-address'}] }), /email/);
  assert.deepEqual(reviewCrmDuplicates({ tenant: 'demo', records: [] }).queue, []);
});
