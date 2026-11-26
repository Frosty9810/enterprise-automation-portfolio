const statuses = new Set(['held', 'pending_review', 'reviewed', 'retryable', 'stopped', 'uncertain', 'completed', 'no_change']);
const objects = new Set(['Lead', 'Opportunity', 'Case']);
const actions = ['review', 'execute', 'reconcile', 'retry', 'reevaluate', 'stop', 'none'];
const string = value => typeof value === 'string' && value.length > 0;

// RevenueOS records contain flat primitive fields from the local fixture store.
function sameRecord(left, right) {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && left[key] === right[key]);
}

function validateReceipt(receipt, state, records) {
  if (!receipt || !string(receipt.receiptId) || receipt.runId !== state.runId ||
      !string(receipt.recordId) || !statuses.has(receipt.status) ||
      !Array.isArray(receipt.reasons) || receipt.reasons.some(reason => !string(reason)) ||
      !Number.isSafeInteger(receipt.attempts) || receipt.attempts < 0 || receipt.attempts > 2 ||
      !Number.isSafeInteger(receipt.localEffects) || receipt.localEffects < 0 || receipt.localEffects > 1 ||
      !Number.isSafeInteger(receipt.expectedRevision) || receipt.expectedRevision < 1 ||
      !string(receipt.sourceHash) || !records.has(receipt.recordId) ||
      !receipt.before || typeof receipt.before !== 'object' || Array.isArray(receipt.before)) {
    throw new TypeError('Invalid Salesforce receipt in queue state.');
  }
  const record = records.get(receipt.recordId);
  if (!objects.has(record.object) || receipt.before.object !== record.object) {
    throw new TypeError('Invalid Salesforce object in queue state.');
  }
}

function nextAction(receipt, staleRecord, stalePolicy) {
  if (receipt.status === 'completed' || receipt.status === 'no_change') return 'none';
  // An uncertain write may already be reflected in the current record. Its
  // revision change cannot authorize a replacement attempt.
  if (receipt.status === 'uncertain') return stalePolicy ? 'stop' : 'reconcile';
  if (receipt.status === 'stopped') return 'stop';
  if (staleRecord || stalePolicy || receipt.status === 'held') return 'reevaluate';
  return ({ pending_review: 'review', reviewed: 'execute', retryable: 'retry' })[receipt.status];
}

/** Read-only projection of server-held local state. This grants no authority. */
export function projectSalesforceQueue(state) {
  if (!state || !string(state.runId) || !string(state.orgId) || !string(state.sourceHash) ||
      !Array.isArray(state.records) || !Array.isArray(state.receipts)) {
    throw new TypeError('Invalid Salesforce queue state.');
  }
  const records = new Map();
  for (const record of state.records) {
    if (!record || !string(record.id) || records.has(record.id) || !objects.has(record.object) ||
        !Number.isSafeInteger(record.revision) || record.revision < 1 ||
        !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) {
      throw new TypeError('Invalid Salesforce record in queue state.');
    }
    records.set(record.id, record);
  }
  const ids = new Set();
  const rows = state.receipts.map(receipt => {
    validateReceipt(receipt, state, records);
    if (ids.has(receipt.receiptId)) throw new TypeError('Duplicate Salesforce receipt in queue state.');
    ids.add(receipt.receiptId);
    const record = records.get(receipt.recordId);
    const staleRecord = record.revision !== receipt.expectedRevision || !sameRecord(record.data, receipt.before);
    const stalePolicy = receipt.sourceHash !== state.sourceHash;
    const action = nextAction(receipt, staleRecord, stalePolicy);
    const reasonCodes = [...receipt.reasons];
    if (stalePolicy) reasonCodes.push('source_changed');
    if (staleRecord && !['completed', 'uncertain', 'no_change'].includes(receipt.status)) reasonCodes.push('record_changed');
    if (receipt.status === 'uncertain') reasonCodes.push('write_outcome_requires_reconciliation');
    return {
      receiptId: receipt.receiptId,
      recordId: receipt.recordId,
      object: record.object,
      status: receipt.status,
      action,
      reasonCodes,
      localEffects: receipt.localEffects,
      attempts: receipt.attempts,
      maxAttempts: 2,
      staleEvidence: stalePolicy || (staleRecord && !['completed', 'uncertain', 'no_change'].includes(receipt.status)),
      historical: receipt.status === 'completed',
    };
  });
  rows.sort((a, b) => a.object.localeCompare(b.object) || a.recordId.localeCompare(b.recordId) || a.receiptId.localeCompare(b.receiptId));
  const counts = { total: rows.length, ...Object.fromEntries(actions.map(action => [action, rows.filter(row => row.action === action).length])) };
  return { runId: state.runId, orgId: state.orgId, rows, counts, externalActions: 0 };
}
