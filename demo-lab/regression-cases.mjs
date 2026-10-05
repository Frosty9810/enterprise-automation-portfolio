/** Separately maintained regression examples, not a blind or statistical holdout. */
import { construction, referral, legalIntake, insuranceIntake } from './roadmap-scenarios.mjs';
const approval = { requestId: 'reg-change', requester: 'originator', asOf: '2026-09-09', certificateExpiry: '2026-09-09', version: 4, amountCents: 0, approvals: [{ actor: 'one', role: 'project_manager', version: 4, amountCents: 0 }, { actor: 'two', role: 'finance', version: 4, amountCents: 0 }] };
export const regressionCases = [
    { project: 'CON-01', name: 'Expiry-day certificate remains current under demo policy', run: construction, input: approval, key: 'queue', expected: 'release_review' },
    { project: 'CON-01', name: 'Same actor cannot fill both approval roles', run: construction, input: { ...approval, approvals: approval.approvals.map(a => ({ ...a, actor: 'one' })) }, key: 'queue', expected: 'exception_review' },
    { project: 'CON-01', name: 'Empty approval history cannot release readiness', run: construction, input: { ...approval, approvals: [] }, key: 'queue', expected: 'exception_review' },
    { project: 'MED-01', name: 'Extra document labels cannot satisfy a missing order', run: referral, input: { referralId: 'reg-ref', storageConsent: true, payer: 'DEMO_PAYER_A', documents: ['referral_form', 'misc'] }, key: 'queue', expected: 'document_follow_up' },
    { project: 'MED-01', name: 'Prototype-like payer name remains unknown', run: referral, input: { referralId: 'reg-ref', storageConsent: true, payer: '__proto__', documents: [] }, key: 'queue', expected: 'payer_review' },
    { project: 'MED-01', name: 'Revoked consent wins over a complete checklist', run: referral, input: { referralId: 'reg-ref', storageConsent: false, payer: 'DEMO_PAYER_A', documents: ['referral_form', 'order'] }, key: 'queue', expected: 'consent_review' },
    { project: 'LEGAL-01', name: 'Exact match wins when another party is ambiguous', run: legalIntake, input: { matterId: 'reg-matter', parties: ['Cedar Holdings', 'Birch SA'], adverseEntities: ['Cedar Studio', 'Birch SA'] }, key: 'queue', expected: 'conflict_review' },
    { project: 'LEGAL-01', name: 'Full-width normalized entity still conflicts', run: legalIntake, input: { matterId: 'reg-matter', parties: ['Ｃｅｄａｒ'], adverseEntities: ['Cedar'] }, key: 'queue', expected: 'conflict_review' },
    { project: 'LEGAL-01', name: 'Empty adverse list does not grant creation authority', run: legalIntake, input: { matterId: 'reg-matter', parties: ['Birch'], adverseEntities: [] }, key: 'matterCreationAllowed', expected: false },
    { project: 'INS-01', name: 'Policy start date is inside the demo window', run: insuranceIntake, input: { claimId: 'reg-claim', eventId: 'reg-event', lossDate: '2026-01-01', policyStart: '2026-01-01', policyEnd: '2026-12-31', documents: ['incident_report', 'policy_reference'] }, key: 'queue', expected: 'adjuster_intake' },
    { project: 'INS-01', name: 'Multiple exception flags do not decide coverage', run: insuranceIntake, input: { claimId: 'reg-claim', eventId: 'reg-event', lossDate: '2025-01-01', policyStart: '2026-01-01', policyEnd: '2026-12-31', documents: [], duplicateSignal: true }, key: 'coverageDecision', expected: 'not_made' },
    { project: 'INS-01', name: 'Leap-day date is accepted in a leap year', run: insuranceIntake, input: { claimId: 'reg-claim', eventId: 'reg-event', lossDate: '2024-02-29', policyStart: '2024-01-01', policyEnd: '2024-12-31', documents: ['incident_report', 'policy_reference'] }, key: 'queue', expected: 'adjuster_intake' },
];
export function evaluateRegression(project) {
    const cases = regressionCases.filter(c => c.project === project).map(c => {
        try {
            const actual = c.run(structuredClone(c.input))[c.key];
            return { name: c.name, expected: c.expected, actual, passed: actual === c.expected };
        }
        catch (error) {
            return { name: c.name, passed: false, error: error.message };
        }
    });
    return { passed: cases.filter(c => c.passed).length, total: cases.length, cases,
        scope: cases.length ? 'Separate regression file, authored after the demos. Not a blind holdout, model benchmark or production validation.' : 'No separate business regression suite is attached to this project yet.' };
}
