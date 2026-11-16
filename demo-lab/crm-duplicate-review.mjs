import { mergePreview, text, validateMergeRecords } from './flagship-decisions.mjs';

export function reviewCrmDuplicates({ tenant, records }) {
  text(tenant, 'Tenant');
  validateMergeRecords(records);

  const groups = new Map();
  let excludedForeign = 0;
  let missingEmail = 0;
  for (const record of records) {
    if (record.tenant !== tenant) {
      excludedForeign++;
      continue;
    }
    const email = record.email.trim().toLowerCase();
    if (!email) {
      missingEmail++;
      continue;
    }
    const group = groups.get(email) ?? [];
    group.push(record);
    groups.set(email, group);
  }

  const queue = [];
  let unmatched = 0;
  for (const group of groups.values()) {
    if (group.length === 1) {
      unmatched++;
      continue;
    }
    const sorted = group.toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const recordIds = sorted.map(record => record.id);
    if (group.length > 2) {
      queue.push({ recordIds, action: 'stewardship_hold', reasons: ['multi_record_group'] });
      continue;
    }
    const [keepId, duplicateId] = recordIds;
    const preview = mergePreview({ tenant, records: sorted, keepId, duplicateId, mode: 'preview' });
    queue.push({
      recordIds,
      action: preview.action,
      reasons: preview.reasons,
      expectedRevisions: preview.plan.expectedRevisions,
      fillFields: preview.action === 'merge_preview' ? Object.keys(preview.plan.patch) : [],
    });
  }
  queue.sort((a, b) => a.recordIds[0] < b.recordIds[0] ? -1 : 1);
  return {
    scannedRecords: records.length,
    excludedForeign,
    missingEmail,
    unmatched,
    candidatePairs: queue.filter(row => row.action === 'merge_preview').length,
    holds: queue.filter(row => row.action === 'stewardship_hold').length,
    queue,
    localWrites: 0,
    externalActions: 0,
  };
}
