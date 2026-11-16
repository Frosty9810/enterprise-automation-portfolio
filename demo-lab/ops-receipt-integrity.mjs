import { createHash } from 'node:crypto';

const receiptStatuses = new Set(['pending_review', 'reviewed', 'retryable', 'stopped', 'uncertain', 'completed']);
const executionOutcomes = {
  confirmed_no_effect: 'timeout_before',
  local_effect_confirmed: 'success',
  acknowledgement_lost: 'timeout_after',
};

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parse(value) {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function inReadSnapshot(db, read) {
  if (db.isTransaction) return read();
  db.exec('BEGIN');
  try {
    return read();
  } finally {
    db.exec('ROLLBACK');
  }
}

function replay(events) {
  let status = null;
  let reviewer = null;
  let attempts = 0;
  let unresolvedReconciliations = 0;

  for (const [index, event] of events.entries()) {
    const detail = parse(event.detail);
    let nextStatus = null;
    let expectedDetail = {};

    if (event.kind === 'submitted' && index === 0) {
      nextStatus = 'pending_review';
    } else if (event.kind === 'reviewed' && status === 'pending_review') {
      const label = detail?.reviewer;
      if (typeof label === 'string' && label && label === label.trim() && label.length <= 200) {
        reviewer = label;
        nextStatus = 'reviewed';
        expectedDetail = { reviewer };
      }
    } else if (Object.hasOwn(executionOutcomes, event.kind) && ['reviewed', 'retryable'].includes(status) && attempts < 2) {
      attempts++;
      expectedDetail = { outcome: executionOutcomes[event.kind] };
      if (event.kind === 'confirmed_no_effect') nextStatus = attempts === 2 ? 'stopped' : 'retryable';
      else nextStatus = event.kind === 'local_effect_confirmed' ? 'completed' : 'uncertain';
    } else if (status === 'uncertain' && event.kind === 'reconciliation_unresolved') {
      unresolvedReconciliations++;
      nextStatus = 'uncertain';
    } else if (status === 'uncertain' && event.kind === 'reconciled_existing_effect') {
      nextStatus = 'completed';
    }

    if (!event.positive_sequence || nextStatus === null || nextStatus !== event.status ||
        event.detail !== JSON.stringify(expectedDetail)) {
      return { invalidEventIndex: index };
    }
    status = nextStatus;
  }

  return { status, reviewer, attempts, unresolvedReconciliations };
}

export function verifyReliabilityReceipt(db, receiptId) {
  if (typeof receiptId !== 'string' || !/^[a-f0-9]{64}$/u.test(receiptId)) {
    throw new TypeError('Expected a local reliability receipt ID.');
  }

  return inReadSnapshot(db, () => {
    const receipt = db.prepare(
      'SELECT id, event_key, project, payload, payload_hash, source_hash, status, reviewer, ' +
      "CASE WHEN typeof(attempts) = 'integer' AND attempts BETWEEN 0 AND 2 THEN attempts END AS attempts " +
      'FROM reliability_intents WHERE id = ?',
    ).get(receiptId);
    if (!receipt) throw new Error('Unknown local reliability receipt.');
    const events = db.prepare('SELECT sequence > 0 AS positive_sequence, kind, status, detail FROM reliability_events WHERE intent_id = ? ORDER BY sequence').all(receiptId);
    const effect = db.prepare('SELECT payload FROM reliability_effects WHERE intent_id = ?').get(receiptId);

    const findings = [];
    const payload = parse(receipt.payload);
    const payloadHashMatches = payload !== null && typeof payload === 'object' && !Array.isArray(payload) &&
      JSON.stringify(payload) === receipt.payload && hash(payload) === receipt.payload_hash;
    if (!payloadHashMatches) findings.push({ code: 'receipt_payload_integrity' });

    const identityMatches = typeof receipt.event_key === 'string' &&
      receipt.event_key.split(':')[1] === receipt.project &&
      hash({ eventKey: receipt.event_key, payloadHash: receipt.payload_hash, source: receipt.source_hash }) === receipt.id;
    if (!identityMatches) findings.push({ code: 'receipt_identity_mismatch' });

    const trace = replay(events);
    if (trace.invalidEventIndex !== undefined) {
      findings.push({ code: 'invalid_history_event', eventIndex: trace.invalidEventIndex });
    } else if (trace.status === null) {
      findings.push({ code: 'missing_history' });
    } else {
      if (trace.status !== receipt.status) findings.push({ code: 'history_status_mismatch' });
      if (trace.reviewer !== receipt.reviewer) findings.push({ code: 'history_reviewer_mismatch' });
      if (trace.attempts !== receipt.attempts) findings.push({ code: 'history_attempts_mismatch' });
    }

    const traceUsable = trace.invalidEventIndex === undefined && trace.status !== null;
    const history = {
      valid: traceUsable && trace.status === receipt.status && trace.reviewer === receipt.reviewer &&
        trace.attempts === receipt.attempts,
      eventCount: events.length,
      inferredStatus: traceUsable ? trace.status : null,
      inferredAttempts: traceUsable ? trace.attempts : null,
      unresolvedReconciliations: traceUsable ? trace.unresolvedReconciliations : null,
    };
    const expected = traceUsable ? ['uncertain', 'completed'].includes(trace.status) : null;
    const present = Boolean(effect);
    const payloadMatches = present ? effect.payload === receipt.payload : null;
    let effectStatus = 'expectation_unknown';

    if (expected === true) {
      if (!present) {
        effectStatus = 'missing';
        findings.push({ code: 'effect_missing' });
      } else if (!payloadMatches) {
        effectStatus = 'payload_mismatch';
        findings.push({ code: 'effect_payload_mismatch' });
      } else {
        effectStatus = 'matches_receipt';
      }
    } else if (expected === false) {
      effectStatus = present ? 'unexpected' : 'not_expected';
      if (present) findings.push({ code: 'effect_unexpected' });
    }

    return {
      receiptId,
      status: receiptStatuses.has(receipt.status) ? receipt.status : null,
      valid: findings.length === 0,
      receipt: { payloadHashMatches, identityMatches },
      history,
      effect: { expected, present, payloadMatches, status: effectStatus },
      findings,
    };
  });
}
