export const scopedIntentPolicy = 'scoped-intent-v1';

// Match whole questions. A shared keyword cannot authorize a qualifier,
// different operation, or second question that the source does not cover.
const rules = [
  {
    intent: 'return_window',
    signal: /\b(?:returns?|send (?:it )?back)\b/,
    requests: [
      /^how (?:long|many days) do i have to (?:return|send back) (?:my|the|an?) (?:unopened|sealed) (?:purchase|item|order|package|parcel)$/,
      /^how (?:long|many days) do i have to send it back if (?:the|my) (?:purchase|item|order|package|parcel) is (?:unopened|sealed)$/,
      /^what is the return window for (?:an?|my|the) (?:unopened|sealed) (?:purchase|item|order|package|parcel)$/,
    ],
    topics: ['return', 'returns', 'unopened'],
  },
  {
    intent: 'delivery_duration',
    signal: /\b(?:shipping|delivery|deliver)\b/,
    requests: [
      /^how long does (?:standard )?(?:domestic )?(?:shipping|delivery) take(?: for delivery)?$/,
      /^how many (?:business )?days (?:does|will) (?:standard )?(?:domestic )?(?:shipping|delivery) take$/,
      /^what is the (?:standard )?(?:domestic )?(?:delivery time|shipping estimate)$/,
    ],
    topics: ['shipping', 'delivery', 'standard'],
  },
  {
    intent: 'tracking_link',
    signal: /\b(?:tracking|track)\b/,
    requests: [
      /^how (?:do|can) i track (?:my|the) (?:parcel|package|order|shipment)(?: after dispatch)?$/,
      /^where (?:can|do) i find the link to track (?:my|the) (?:parcel|package|order|shipment)$/,
      /^where (?:is|can i find|do i find) (?:my|the) tracking link(?: for (?:my|the) (?:parcel|package|order|shipment))?$/,
    ],
    topics: ['tracking', 'track'],
  },
  {
    intent: 'damage_first_step',
    signal: /\b(?:damaged?|broken)\b/,
    requests: [
      /^(?:the|my) (?:goods|parcel|package|order|item) arrived (?:damaged|broken)\. what (?:should|do) i do$/,
      /^what (?:should|do) i do (?:first )?(?:with|about) (?:my|the|an?) (?:damaged|broken) (?:parcel|package|order|item)$/,
      /^what (?:should|do) i do first to return (?:unopened )?(?:damaged|broken) (?:goods|items|products)$/,
      /^how (?:do|can|should) i report (?:a damaged (?:item|parcel|package)|(?:the )?damage(?: on a return)?)$/,
    ],
    topics: ['damaged', 'damage', 'broken'],
  },
  {
    intent: 'invoice_copy',
    signal: /\b(?:invoices?|receipts?)\b/,
    requests: [
      /^(?:where|how) (?:can|do) i (?:download|find|get) (?:my|the|an?) invoice$/,
      /^(?:where|how) (?:can|do) i (?:download|find|get) a copy of (?:my|the|an?) invoice$/,
      /^where is (?:my|the) invoice$/,
    ],
    topics: ['invoice', 'invoices', 'receipt'],
  },
  {
    intent: 'dealer_tier_schedule',
    signal: /\b(?:wholesale|dealer tiers?|tier schedule)\b/,
    requests: [
      /^where (?:is|can i find|do i find) the (?:wholesale|dealer) tier schedule$/,
      /^how (?:do|can) i (?:view|access) the (?:wholesale|dealer) tier schedule$/,
    ],
    topics: ['wholesale', 'tier'],
  },
];

function answerReview(document) {
  return document
    ? { status: 'evidence_found', answer: document.text, citations: [document.id], action: 'review' }
    : { status: 'abstain', answer: 'No approved evidence found.', citations: [], action: 'review' };
}

function decision(intent, reason, document) {
  return { result: answerReview(document), policy: { id: scopedIntentPolicy, intent, reason } };
}

export function extractScopedSupportAnswer(query, tenant, documents) {
  const normalized = query.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  if ((normalized.match(/\?/g) ?? []).length > 1 || normalized.includes(';')) {
    return decision(null, 'mixed_intents');
  }
  const question = normalized.replace(/[.!?]$/, '');
  const matches = rules.filter(rule => rule.requests.some(form => form.test(question)));
  if (matches.length !== 1) {
    const candidates = rules.filter(rule => rule.signal.test(question));
    if (candidates.length > 1 || matches.length > 1) return decision(null, 'mixed_intents');
    return candidates.length === 1 ? decision(candidates[0].intent, 'unsupported_question_form')
      : decision(null, 'unknown_intent');
  }
  const [rule] = matches;
  const eligible = documents.filter(document => document.tenant === tenant && document.approved && !document.instructionLike &&
    document.topics.some(topic => rule.topics.includes(topic)));
  if (eligible.length !== 1) {
    return decision(rule.intent, eligible.length > 1 ? 'competing_approved_sources' : 'no_approved_source');
  }
  return decision(rule.intent, 'one_approved_source', eligible[0]);
}
