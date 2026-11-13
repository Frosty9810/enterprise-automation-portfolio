const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/u;

function exactFields(value, names) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.keys(value).length === names.length &&
    names.every(name => Object.hasOwn(value, name));
}

function boundedText(value, max) {
  return typeof value === 'string' && value.length <= max && value.trim().length > 0;
}

function validCandidate(candidate) {
  if (!exactFields(candidate, ['status', 'claims']) ||
      !['supported', 'abstained'].includes(candidate.status) ||
      !Array.isArray(candidate.claims) || candidate.claims.length > 8) return false;
  for (const claim of candidate.claims) {
    if (!exactFields(claim, ['key', 'value', 'pageId', 'quote']) ||
        typeof claim.key !== 'string' || !identifier.test(claim.key) ||
        typeof claim.pageId !== 'string' || !identifier.test(claim.pageId) ||
        !boundedText(claim.value, 1000) || !boundedText(claim.quote, 8000)) return false;
  }
  return true;
}

function validReceipt(receipt) {
  const required = receipt.requiredClaims;
  if (!Array.isArray(required) || required.length < 1 || required.length > 8 ||
      required.some(key => typeof key !== 'string' || !identifier.test(key)) ||
      new Set(required).size !== required.length ||
      !Array.isArray(receipt.claims) || !Array.isArray(receipt.citations)) return false;
  if (receipt.status === 'abstained') {
    return receipt.reason !== 'supported' && receipt.claims.length === 0 && receipt.citations.length === 0;
  }
  return receipt.status === 'supported' && receipt.reason === 'supported' &&
    receipt.claims.length === required.length && receipt.citations.length > 0 &&
    receipt.citations.every(citation => citation && typeof citation.pageId === 'string') &&
    required.every(key => {
      const claim = receipt.claims.find(item => item?.key === key);
      return claim && boundedText(claim.value, 1000) &&
        Array.isArray(claim.pageIds) && claim.pageIds.length > 0 &&
        claim.pageIds.every(id => typeof id === 'string' && identifier.test(id));
    });
}

/** gradeCandidate takes a trusted local AtlasGraph desk and caller-selected receipt reference. */
export function gradeCandidate(desk, { tenant, receiptId }, candidate) {
  const reject = reason => ({ accepted: false, reason });
  if (!validCandidate(candidate)) return reject('invalid_candidate');
  let receipt;
  try {
    receipt = desk.receipt({ tenant, id: receiptId });
  } catch (error) {
    if (error.code === 'not_found') return reject('receipt_unavailable');
    throw error;
  }
  if (receipt.tenant !== tenant || receipt.id !== receiptId) return reject('receipt_unavailable');
  if (receipt.stale) return reject('stale_receipt');
  if (!validReceipt(receipt)) return reject('invalid_receipt');
  if (candidate.status === 'abstained') {
    if (candidate.claims.length) return reject('abstention_contains_claims');
    return receipt.status === 'abstained'
      ? { accepted: true, reason: 'grounded_abstention' }
      : reject('unnecessary_abstention');
  }
  if (receipt.status !== 'supported') return reject('unsupported_receipt');

  const required = new Set(receipt.requiredClaims);
  const seen = new Set();
  for (const claim of candidate.claims) {
    if (!required.has(claim.key)) return reject('unexpected_claim');
    if (seen.has(claim.key)) return reject('duplicate_claim');
    seen.add(claim.key);
    const expected = receipt.claims.find(item => item.key === claim.key);
    if (expected?.value !== claim.value) return reject('unsupported_value');
    const citation = receipt.citations.find(item => item.pageId === claim.pageId);
    if (!expected.pageIds.includes(claim.pageId) || !citation) return reject('wrong_citation');

    let pageRead;
    try {
      pageRead = desk.read({ tenant, id: claim.pageId });
    } catch (error) {
      if (['not_found', 'not_compiled'].includes(error.code)) return reject('evidence_unavailable');
      throw error;
    }
    const { page, snapshotHash } = pageRead;
    if (snapshotHash !== receipt.snapshotHash) return reject('stale_receipt');
    if (page.id !== citation.pageId || page.sourceId !== citation.sourceId ||
        page.version !== citation.version || page.sourceHash !== citation.sourceHash ||
        page.text !== citation.text ||
        !page.claims.some(item => item.key === claim.key && item.value === claim.value)) {
      return reject('evidence_mismatch');
    }
    if (!page.text.includes(claim.quote) || !claim.quote.includes(claim.value)) {
      return reject('quote_mismatch');
    }
  }
  if (seen.size !== required.size) return reject('missing_claim');
  return { accepted: true, reason: 'grounded_answer' };
}
