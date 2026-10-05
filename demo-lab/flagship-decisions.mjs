import { createHash } from 'node:crypto';
import { extractAnswer, validateAnswer } from './engineering-evals.mjs';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const text = (x, n) => { if (typeof x !== 'string' || !x.trim() || x.length > 2000)
    throw Error(n + ' must be nonempty text'); return x.trim(); };
export const integer = (x, n, min = 0) => { if (!Number.isSafeInteger(x) || x < min || x > 1e9)
    throw Error(n + ' must be a bounded integer'); return x; };
const list = (x, n) => { if (!Array.isArray(x) || x.length > 100)
    throw Error(n + ' must be an array of at most 100 entries'); return x; };
const unique = (rows) => { const ids = new Set(); for (const row of rows) {
    text(row.id, 'ID');
    if (ids.has(row.id))
        throw Error('Conflicting or duplicate ID');
    ids.add(row.id);
} };
const bool = (x, n) => { if (typeof x !== 'boolean')
    throw Error(n + ' must be boolean'); };
export function instant(x) { text(x, 'Timestamp'); const m = x.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-]\d{2}:\d{2})$/); if (!m)
    throw Error('Explicit ISO timestamp offset required'); const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number); const local = new Date(Date.UTC(y, mo - 1, d, h, mi, s)); if (local.getUTCFullYear() !== y || local.getUTCMonth() !== mo - 1 || local.getUTCDate() !== d || h > 23 || mi > 59 || s > 59)
    throw Error('Invalid calendar timestamp'); if (m[8] !== 'Z') {
    const [oh, om] = m[8].slice(1).split(':').map(Number);
    if (oh > 14 || om > 59 || (oh === 14 && om !== 0))
        throw Error('Invalid timezone offset');
} const result = Date.parse(x); if (!Number.isFinite(result))
    throw Error('Invalid timestamp'); return result; }
export function supportDesk(x) {
    text(x.tenant, 'Tenant');
    text(x.query, 'Query');
    list(x.documents, 'Documents');
    unique(x.documents);
    for (const d of x.documents) {
        text(d.tenant, 'Document tenant');
        text(d.text, 'Document text');
        bool(d.approved, 'Approved');
        bool(d.instructionLike, 'Instruction marker');
        list(d.topics, 'Topics');
        d.topics.forEach(t => text(t, 'Topic'));
    }
    const eligible = x.documents.filter(d => !d.instructionLike), result = extractAnswer(x.query, x.tenant, eligible);
    if (!validateAnswer(result, x.tenant, eligible))
        throw Error('Evidence verification failed');
    return { ...result, action: result.status === 'abstain' ? 'escalation_review' : 'answer_review', citationEvidence: result.citations.map(id => { const d = eligible.find(d => d.id === id); return { id, quote: d.text, sha256: hash(d.text) }; }), excluded: x.documents.filter(d => d.tenant !== x.tenant || !d.approved || d.instructionLike).map(d => ({ id: d.id, reason: d.tenant !== x.tenant ? 'tenant_mismatch' : !d.approved ? 'not_approved' : 'flagged_instruction_text' })), externalActions: 0, scope: 'Exact approved excerpts and lexical retrieval. Instruction markers are supplied fixtures, not a general injection detector or semantic truth test.' };
}
export function routingLab(x) {
    text(x.datasetVersion, 'Dataset version');
    integer(x.budgetUnits, 'Budget');
    list(x.cases, 'Cases');
    unique(x.cases);
    list(x.trainingIds, 'Training IDs');
    if (x.trainingIds.some(id => x.cases.some(c => c.id === id)))
        throw Error('Evaluation/training split overlaps');
    if (!x.cases.length)
        throw Error('At least one evaluation case required');
    x.trainingIds.forEach(id => text(id, 'Training ID'));
    const trials = [], latencies = [];
    let spent = 0;
    for (const c of x.cases) {
        text(c.query, 'Query');
        text(c.tenant, 'Tenant');
        list(c.documents, 'Documents');
        unique(c.documents);
        for (const d of c.documents) {
            text(d.text, 'Source');
            text(d.tenant, 'Source tenant');
            bool(d.approved, 'Approved');
            list(d.topics, 'Topics');
            d.topics.forEach(t => text(t, 'Topic'));
        }
        if (c.expectedCitation !== null)
            text(c.expectedCitation, 'Expected citation');
        const start = performance.now(), trace = [];
        let selected = null, route = 'budget_stop';
        for (const [name, proposal] of [['cheap', c.cheap], ['escalation', c.escalation]]) {
            if (!proposal)
                continue;
            integer(proposal.units, 'Scenario units', 1);
            if (spent + proposal.units > x.budgetUnits) {
                trace.push({ name, status: 'budget_stop' });
                break;
            }
            spent += proposal.units;
            const valid = validateAnswer(proposal.result, c.tenant, c.documents);
            const reference = extractAnswer(c.query, c.tenant, c.documents);
            const relevant = valid && JSON.stringify(proposal.result.citations) === JSON.stringify(reference.citations) && proposal.result.status === reference.status;
            trace.push({ name, status: relevant ? 'verified' : 'rejected', units: proposal.units });
            if (relevant) {
                selected = proposal.result;
                route = name;
                break;
            }
        }
        const actual = selected?.citations[0] ?? null, passed = !!selected && actual === c.expectedCitation;
        const latency = performance.now() - start;
        latencies.push(latency);
        trials.push({ id: c.id, route, selected, trace, passed, expectedCitation: c.expectedCitation, localDurationMs: latency });
    }
    const sorted = [...latencies].sort((a, b) => a - b), accepted = trials.filter(t => t.selected).length;
    return { action: trials.every(t => t.passed) ? 'fixture_gate_passed' : 'evaluation_review', datasetHash: hash({ version: x.datasetVersion, cases: x.cases, trainingIds: x.trainingIds }), trials, passed: trials.filter(t => t.passed).length, total: trials.length, spentScenarioUnits: spent, budgetUnits: x.budgetUnits, scenarioUnitsPerVerifiedResult: accepted ? spent / accepted : null, p50LocalMs: sorted.length ? sorted[Math.ceil(sorted.length * .5) - 1] : null, p95LocalMs: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null, sampleCount: latencies.length, externalActions: 0, scope: 'Proposals and unit costs are synthetic fixtures. Durations measure the local verifier, not model latency. No paid inference, empirical provider cost, blind holdout or general semantic grounding claim.' };
}
export function mergePreview(x) {
    text(x.tenant, 'Tenant');
    list(x.records, 'Records');
    unique(x.records);
    for (const r of x.records) {
        text(r.tenant, 'Record tenant');
        text(r.name, 'Name');
        text(r.owner, 'Owner');
        integer(r.revision, 'Revision', 1);
        bool(r.consent, 'Consent');
        if (typeof r.email !== 'string' || (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())))
            throw Error('Invalid email');
        for (const field of ['company', 'phone'])
            if (typeof r[field] !== 'string' || r[field].length > 200)
                throw Error('Invalid merge field');
    }
    if (!['preview', 'simulate_apply_undo', 'simulate_undo_conflict'].includes(x.mode))
        throw Error('Unknown merge mode');
    const keep = x.records.find(r => r.id === x.keepId), duplicate = x.records.find(r => r.id === x.duplicateId);
    if (!keep || !duplicate || keep.id === duplicate.id)
        throw Error('Two distinct records required');
    const reasons = [];
    if (keep.tenant !== x.tenant || duplicate.tenant !== x.tenant)
        reasons.push('cross_tenant');
    if (!keep.email || keep.email.trim().toLowerCase() !== duplicate.email.trim().toLowerCase())
        reasons.push('email_identity_differs');
    if (keep.name.trim().toLowerCase() !== duplicate.name.trim().toLowerCase())
        reasons.push('name_identity_conflict');
    if (keep.owner !== duplicate.owner)
        reasons.push('owner_conflict');
    if (keep.consent !== duplicate.consent)
        reasons.push('consent_conflict');
    const patch = {};
    for (const field of ['company', 'phone']) {
        if (keep[field] && duplicate[field] && keep[field] !== duplicate[field])
            reasons.push(field + '_conflict');
        else if (!keep[field] && duplicate[field])
            patch[field] = duplicate[field];
    }
    const plan = { keepId: keep.id, duplicateId: duplicate.id, expectedRevisions: [keep.revision, duplicate.revision], patch, protectedFields: ['tenant', 'owner', 'consent', 'email', 'name'], inputHash: hash(x.records) };
    const result = { action: reasons.length ? 'stewardship_hold' : 'merge_preview', reasons, plan, planHash: hash(plan), externalActions: 0, scope: 'Local cloned-record simulation and conditional reversal; not Salesforce merge/delete API acceptance or authenticated stewardship.' };
    if (reasons.length || x.mode === 'preview')
        return result;
    if (x.acknowledged !== true)
        return { ...result, action: 'review_required' };
    const before = structuredClone(x.records), after = structuredClone(x.records), survivor = after.find(r => r.id === keep.id), archived = after.find(r => r.id === duplicate.id);
    Object.assign(survivor, patch);
    survivor.revision++;
    archived.revision++;
    archived.archived = true;
    const appliedHash = hash(after), current = structuredClone(after);
    if (x.mode === 'simulate_undo_conflict')
        current.find(r => r.id === keep.id).revision++;
    const undoAllowed = hash(current) === appliedHash;
    return { ...result, action: undoAllowed ? 'simulated_merge_reversed' : 'undo_conflict_hold', before, after, current, restored: undoAllowed ? before : null, trace: ['exact_identity_candidate', 'demo_steward_acknowledged', 'local_survivor_fields_applied', 'duplicate_archived', undoAllowed ? 'conditional_undo_restored' : 'intervening_change_blocks_undo'], localWrites: 2, undoAllowed };
}
export function journey(x) {
    text(x.personId, 'Person');
    const asOf = instant(x.asOf);
    if (!['email', 'sms'].includes(x.channel) || !['marketing', 'service'].includes(x.purpose))
        throw Error('Unknown channel or purpose');
    list(x.events, 'Consent events');
    const dedup = new Map();
    for (const e of x.events) {
        text(e.id, 'Event ID');
        instant(e.occurredAt);
        instant(e.knownAt);
        if (instant(e.knownAt) < instant(e.occurredAt))
            throw Error('Known time precedes occurrence');
        if (!['grant', 'revoke'].includes(e.type) || !['email', 'sms'].includes(e.channel) || !['marketing', 'service'].includes(e.purpose))
            throw Error('Invalid consent event');
        if (e.type === 'grant') {
            instant(e.expiresAt);
            if (instant(e.expiresAt) <= instant(e.occurredAt))
                throw Error('Grant expiry must follow occurrence');
        }
        const old = dedup.get(e.id);
        if (old && hash(old) !== hash(e))
            throw Error('Conflicting duplicate consent event');
        dedup.set(e.id, e);
    }
    const relevant = [...dedup.values()].filter(e => e.channel === x.channel && e.purpose === x.purpose && instant(e.knownAt) <= asOf && instant(e.occurredAt) <= asOf).sort((a, b) => instant(a.occurredAt) - instant(b.occurredAt) || (a.type === 'revoke' ? 1 : 0) - (b.type === 'revoke' ? 1 : 0) || a.id.localeCompare(b.id));
    const latest = relevant.at(-1), conflicted = latest?.type === 'grant' && new Set(relevant.filter(e => e.type === 'grant' && instant(e.occurredAt) === instant(latest.occurredAt)).map(e => e.expiresAt)).size > 1, eligible = !conflicted && latest?.type === 'grant' && instant(latest.expiresAt) > asOf;
    return { action: eligible ? 'eligible_transition_preview' : 'communication_suppressed', reason: !latest ? 'no_applicable_consent' : latest.type === 'revoke' ? 'revoked' : conflicted ? 'conflicting_grants' : instant(latest.expiresAt) <= asOf ? 'expired' : 'active_scoped_grant', personId: x.personId, channel: x.channel, purpose: x.purpose, asOf: x.asOf, considered: relevant.map(e => e.id), latestEvent: latest?.id ?? null, uniqueEvents: dedup.size, retention: { rawContactStored: false }, communicationSent: false, externalActions: 0, scope: 'Synthetic eligibility preview for explicitly supplied consent events. No consent authentication, delivery or production retention enforcement.' };
}
export function usageLedger(x) {
    text(x.account, 'Account');
    text(x.currency, 'Currency');
    if (x.currency !== 'USD')
        throw Error('Only USD fixture supported');
    integer(x.priceCents, 'Unit price', 1);
    const start = instant(x.periodStart), end = instant(x.periodEnd), close = instant(x.closedAt);
    if (start >= end || close < end)
        throw Error('Invalid billing period or close');
    list(x.events, 'Usage events');
    const entries = [], seen = new Map();
    let units = 0, nextPeriodUnits = 0;
    for (const e of x.events) {
        text(e.id, 'Usage ID');
        const occurred = instant(e.occurredAt), posted = instant(e.postedAt);
        if (posted < occurred)
            throw Error('Posting precedes usage');
        if (!Number.isSafeInteger(e.units) || e.units === 0 || Math.abs(e.units) > 1e6)
            throw Error('Whole nonzero bounded units required');
        const previous = seen.get(e.id);
        if (previous) {
            if (previous.hash !== hash(e))
                throw Error('Conflicting usage event identity');
            continue;
        }
        if (occurred < start || occurred >= end)
            throw Error('Usage outside half-open period');
        if (e.units < 0) {
            const original = seen.get(e.adjusts);
            if (!original || original.units <= 0 || original.occurredAt !== e.occurredAt || posted < original.posted)
                throw Error('Adjustment must reference earlier posted original usage at its occurrence');
            if (original.remaining + e.units < 0)
                throw Error('Adjustment exceeds original usage');
            original.remaining += e.units;
        }
        const late = posted > close;
        seen.set(e.id, { hash: hash(e), units: e.units, remaining: e.units, occurredAt: e.occurredAt, posted });
        if (late)
            nextPeriodUnits += e.units;
        else
            units += e.units;
        entries.push({ id: e.id, units: e.units, classification: late ? 'next_invoice_adjustment' : 'period_charge', adjusts: e.adjusts ?? null });
    }
    const amount = Number(BigInt(units) * BigInt(x.priceCents)), adjustment = Number(BigInt(nextPeriodUnits) * BigInt(x.priceCents));
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(adjustment))
        throw Error('Monetary range exceeded');
    if (amount < 0)
        throw Error('Negative base invoice');
    const journal = [{ account: 'receivable', debitCents: amount, creditCents: 0 }, { account: 'usage_revenue', debitCents: 0, creditCents: amount }], balanced = journal.reduce((n, r) => n + r.debitCents - r.creditCents, 0) === 0;
    return { action: 'invoice_review', currency: x.currency, periodUnits: units, amountCents: amount, nextInvoiceAdjustmentCents: adjustment, entries, journal, balanced, ledgerHash: hash({ account: x.account, periodStart: x.periodStart, periodEnd: x.periodEnd, priceCents: x.priceCents, entries }), externalActions: 0, scope: 'Exact-cent local usage calculation and balanced draft journal. Late entries roll to a proposed next-invoice adjustment; no invoice issued, tax/revenue-recognition advice or live ledger integration.' };
}
export function scheduleBoard(x) {
    const now = instant(x.asOf);
    integer(x.bufferMinutes, 'Buffer');
    if (x.bufferMinutes > 120)
        throw Error('Buffer too large');
    list(x.slots, 'Slots');
    list(x.commitments, 'Commitments');
    unique(x.slots);
    unique(x.commitments);
    for (const c of x.commitments) {
        if (!['active', 'cancelled'].includes(c.status) || instant(c.start) >= instant(c.end))
            throw Error('Invalid commitment');
    }
    const decisions = x.slots.map(s => { const start = instant(s.start), end = instant(s.end); if (start >= end)
        throw Error('Invalid slot ordering'); for (const flag of ['accessConfirmed', 'vendorEligible', 'ownerReviewed'])
        bool(s[flag], flag); const conflicts = x.commitments.filter(c => c.status === 'active' && start < instant(c.end) + x.bufferMinutes * 60000 && end > instant(c.start) - x.bufferMinutes * 60000).map(c => c.id); const reasons = []; if (start < now)
        reasons.push('past_window'); if (!s.accessConfirmed)
        reasons.push('access_unconfirmed'); if (!s.vendorEligible)
        reasons.push('vendor_ineligible'); if (!s.ownerReviewed)
        reasons.push('owner_review_pending'); if (conflicts.length)
        reasons.push('calendar_conflict'); return { id: s.id, action: reasons.length ? 'scheduling_hold' : 'eligible_window_preview', reasons, conflicts, startUTC: new Date(start).toISOString(), endUTC: new Date(end).toISOString() }; });
    return { action: decisions.some(d => d.action === 'eligible_window_preview') ? 'dispatcher_review' : 'all_windows_held', decisions, externalActions: 0, scope: 'Explicit-offset slot checks with cancellation and buffer handling. No IANA timezone conversion, calendar authentication, reservation or vendor dispatch.' };
}
