import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { artifacts } from './showcase.mjs';
import { projects, projectById } from './catalog.mjs';
import { evaluateHandoff } from './acceptance.mjs';
const stories = {
    'RE-01': ['Sales operations', 'Prioritize a new inquiry', 'Duplicate or incomplete lead', 'Explain scoring, preserve contact identity, verify consent before follow-up'],
    'RE-02': ['Transaction coordinator', 'Calculate a milestone deadline', 'Invalid offsets or overdue milestone', 'Reject impossible milestone ordering and expose escalation'],
    'RE-03': ['Lead qualification team', 'Propose a qualification bucket', 'Uncertain classification', 'Show the scoring breakdown and require review of uncertain evidence'],
    'RE-04': ['Commercial property analyst', 'Calculate a comparable-property range', 'Outliers or insufficient comparables', 'Expose excluded comparables and valuation assumptions'],
    'REC-01': ['Recruiter', 'Explain skills matching', 'Missing or expired candidate consent', 'Block unauthorized progression and expose missing skill evidence'],
    'MKT-01': ['Marketing operator', 'Review pacing and attribution', 'Incomplete attribution', 'Separate data-quality review from budget recommendations'],
    'SAAS-01': ['Growth operations', 'Assess trial usage intent', 'Late or missing usage events', 'Explain usage aggregation, time windows and missing milestones'],
    'SAAS-02': ['Billing operations', 'Plan payment recovery', 'Repeated or terminal payment events', 'Keep recovery state separate from authority to charge'],
    'SAAS-03': ['Customer success', 'Review a churn-risk signal', 'Synthetic data or model fallback', 'Explain model inputs and distinguish synthetic evaluation from customer accuracy'],
    'SAAS-04': ['Finance operations', 'Reconcile usage and billing', 'Overbilling, underbilling or invalid metering', 'Expose variance direction and require review of mismatches'],
    'ECOM-01': ['Catalog reviewer', 'Review a localized product draft', 'Changed protected fact or stale review', 'Bind review to the exact candidate, source revision and policy'],
    'ECOM-02': ['Customer experience', 'Triage a review response', 'Safety concern or unsupported incentive', 'Route risk to review before drafting a public response'],
    'ECOM-03': ['Inventory operator', 'Derive sellable inventory', 'Stale source or excessive correction', 'Show source authority and quarantine uncertain stock'],
    'ECOM-04': ['Support operator', 'Assign a queue and SLA', 'Sensitive data or urgent order change', 'Minimize exposed text and explain routing priority'],
    'ACC-01': ['Accounts payable', 'Prepare a payable draft', 'Duplicate invoice or changed bank details', 'Match purchase and receipt evidence; retain payment-release restriction'],
    'CS-01': ['Support quality analyst', 'Review answer quality', 'Low confidence or unsupported answer', 'Show evidence limits and keep automatic penalties disabled'],
    'IMP-01': ['Import operations', 'Prepare an operational decision', 'Incomplete shipment evidence', 'Expose agent responsibilities and require human decision review'],
    'PM-01': ['Maintenance dispatcher', 'Propose an eligible service window', 'Emergency, missing access or vendor conflict', 'Check access and vendor constraints; retain dispatcher authority'],
    'EA-01': ['Executive operations', 'Capture a commitment', 'Unauthorized source or changed duplicate', 'Persist original records and route conflicting versions to review'],
    'CON-01': ['Construction coordinator', 'Review a change request', 'Expired certificate or self-approval', 'Require independent current approvals without releasing funds'],
    'MED-01': ['Referral coordinator', 'Review intake completeness', 'Missing consent or clinical urgency', 'Route exceptions to qualified humans; no clinical eligibility decision'],
    'LEGAL-01': ['Legal operations', 'Prepare matter intake', 'Conflict or missing engagement evidence', 'Preserve a review queue; no automated legal acceptance'],
    'INS-01': ['Insurance operator', 'Review loss-intake evidence', 'Incomplete loss or policy records', 'Expose missing records; no automated coverage eligibility decision'],
    'INV-01': ['Wholesale buyer', 'Propose pack-aware replenishment', 'Stale stock or invalid reservations', 'Show available stock and pack rounding without placing a purchase'],
    'CRM-01': ['CRM owner', 'Propose a version-aware handoff', 'Stale version or missing storage consent', 'Normalize minimal fields and hold external synchronization for review'],
    'AGT-01': ['Support automation owner', 'Review a proposed tool action', 'Unapproved tool or exhausted budget', 'Explain allowlist and grounding boundaries without calling tools'],
    'OPS-01': ['Service operator', 'Plan handoff recovery', 'Uncertain write or retry limit', 'Reconcile uncertain outcomes before considering another attempt'],
};
export function sourceSnapshot(id) {
    if (!projectById.has(id))
        throw Error('Unknown project');
    const selected = artifacts(id).filter(a => ['source', 'contract', 'demo-workflow', 'industry-depth', 'engineering-evals'].includes(a.key));
    selected.push({ key: 'reliability-controller', path: fileURLToPath(new URL('./reliability.mjs', import.meta.url)) });
    selected.push({ key: 'passport-manifest', path: fileURLToPath(import.meta.url) });
    const files = selected.map(a => ({ key: a.key, sha256: createHash('sha256').update(readFileSync(a.path)).digest('hex'), url: ['reliability-controller', 'passport-manifest'].includes(a.key) ? null : `/api/artifacts/${id}/${a.key}` }));
    return { hash: createHash('sha256').update(JSON.stringify(files)).digest('hex'), files, scope: 'Explicit listed source components; not an inferred complete dependency graph.' };
}
export function passport(id) {
    const p = projectById.get(id), story = stories[id];
    if (!p || !story)
        throw Error('Unknown project');
    const handoff = evaluateHandoff(id);
    return { id, title: p.title, actor: story[0], decision: story[1], failure: story[2], acceptance: story[3], sourceSnapshot: sourceSnapshot(id), handoff,
        demo: p.demo, steps: p.stages, deepLink: id === 'ECOM-01' ? '/product-governance' : `/#project=${id}`,
        principles: ['Validate inputs', 'Separate proposal from authority', 'Minimize stored data', 'Bind review to source', 'Replay without duplicate effects', 'Reconcile uncertain outcomes', 'Retain failure evidence'],
        production: { status: 'not_established', needs: ['Authenticated roles and tenant context', 'Authoritative live domain records', 'Original full workflow and database acceptance', 'Provider reconciliation and operator takeover', 'Measured operational outcomes'] },
        scope: 'The interactive workshop below exercises the shared relationship-handoff lifecycle. It does not execute or validate this project’s domain policy.' };
}
export const projectPassports = () => projects.map(p => passport(p.id));
