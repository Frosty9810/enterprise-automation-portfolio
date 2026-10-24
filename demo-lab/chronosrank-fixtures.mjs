const memory = (memoryId, entity, text, recordedAt, extra = {}) => ({ commandId: `seed-${memoryId}`, tenant: 'acme', kind: 'remember', memoryId, entity, text, provenance: { sourceId: `source-${memoryId}`, quote: text }, recordedAt, validFrom: recordedAt, expiresAt: null, ...extra });
const request = (requestId, entity, query, asOf) => ({ requestId, tenant: 'acme', entity, query, asOf, threshold: 100, limit: 3 });

// Synthetic authored fixtures. No public or private source corpus is imported.
export const chronosExample = {
  retrieval: request('example-before-change', 'delivery-policy', 'deliveries arrive', '2026-10-22T11:00:00.000Z'),
  events: [
    memory('delivery-v1', 'delivery-policy', 'Synthetic deliveries arrive Tuesday.', '2026-10-20T09:00:00.000Z'),
    memory('archive-v1', 'invoice-policy', 'Synthetic invoice approval requires two reviewers.', '2026-10-20T09:00:00.000Z', { expiresAt: '2026-10-22T12:00:00.000Z' }),
    memory('dispatch-a', 'dispatch-policy', 'Synthetic dispatch opens Monday.', '2026-10-20T09:00:00.000Z'),
    memory('dispatch-b', 'dispatch-policy', 'Synthetic dispatch opens Thursday.', '2026-10-20T09:00:00.000Z'),
    memory('beta-delivery', 'delivery-policy', 'Synthetic beta deliveries arrive Sunday.', '2026-10-20T09:00:00.000Z', { tenant: 'beta' }),
    memory('delivery-v2', 'delivery-policy', 'Synthetic deliveries arrive Friday.', '2026-10-21T09:00:00.000Z', { kind: 'supersede', supersedes: 'delivery-v1', validFrom: '2026-10-23T09:00:00.000Z', expiresAt: '2026-10-24T09:00:00.000Z' }),
  ],
  queries: [
    { id: 'before-change', title: 'Before the scheduled replacement', request: request('example-before-change', 'delivery-policy', 'deliveries arrive', '2026-10-22T11:00:00.000Z'), expected: { status: 'retrieved', memoryIds: ['delivery-v1'] } },
    { id: 'replacement-boundary', title: 'At the replacement boundary', request: request('example-replacement-boundary', 'delivery-policy', 'deliveries arrive', '2026-10-23T09:00:00.000Z'), expected: { status: 'retrieved', memoryIds: ['delivery-v2'] } },
    { id: 'no-revival', title: 'Expired successor does not revive old memory', request: request('example-no-revival', 'delivery-policy', 'deliveries arrive', '2026-10-24T09:00:00.000Z'), expected: { status: 'abstained', memoryIds: [] } },
    { id: 'expiry-boundary', title: 'At the expiration boundary', request: request('example-expiry-boundary', 'invoice-policy', 'invoice approval', '2026-10-22T12:00:00.000Z'), expected: { status: 'abstained', memoryIds: [] } },
    { id: 'ambiguous', title: 'Tied distinct text causes abstention', request: request('example-ambiguous', 'dispatch-policy', 'dispatch opens', '2026-10-22T11:00:00.000Z'), expected: { status: 'abstained', memoryIds: [] } },
    { id: 'other-tenant', title: 'Tenant labels keep separate ledgers', request: { ...request('example-other-tenant', 'delivery-policy', 'deliveries arrive', '2026-10-22T11:00:00.000Z'), tenant: 'beta' }, expected: { status: 'retrieved', memoryIds: ['beta-delivery'] } },
    { id: 'below-threshold', title: 'Unmatched query abstains', request: request('example-below-threshold', 'delivery-policy', 'cargo insurance', '2026-10-22T11:00:00.000Z'), expected: { status: 'abstained', memoryIds: [] } },
  ],
};
