import { createHash } from 'node:crypto';
import { packOrder } from './reconstruction-reference.mjs';
import { baseline, reconstructed } from './reconstruction-candidates.mjs';
export const reconstructionCases = [
    { id: 'simple', split: 'demonstration', input: { onHand: 0, reserved: 0, target: 10, packSize: 5 } },
    { id: 'no-shortage', split: 'demonstration', input: { onHand: 20, reserved: 0, target: 10, packSize: 5 } },
    { id: 'reserved', split: 'regression', input: { onHand: 10, reserved: 4, target: 20, packSize: 7 } },
    { id: 'ceil', split: 'regression', input: { onHand: 0, reserved: 0, target: 1, packSize: 8 } },
    { id: 'all-reserved', split: 'regression', input: { onHand: 12, reserved: 12, target: 1, packSize: 4 } },
    { id: 'zero-target', split: 'regression', input: { onHand: 0, reserved: 0, target: 0, packSize: 4 } },
    { id: 'zero-pack', split: 'regression', input: { onHand: 0, reserved: 0, target: 10, packSize: 0 } },
    { id: 'excess-reservation', split: 'regression', input: { onHand: 1, reserved: 2, target: 10, packSize: 5 } },
    { id: 'boolean', split: 'regression', input: { onHand: true, reserved: 0, target: 10, packSize: 5 } },
    { id: 'fractional', split: 'regression', input: { onHand: 0, reserved: 0, target: 1.5, packSize: 5 } },
];
const observe = (fn, x) => { try {
    return { kind: 'value', value: fn(structuredClone(x)) };
}
catch {
    return { kind: 'rejected' };
} };
export function reconstructionChallenge(x) { if (!['baseline', 'reconstructed'].includes(x.candidate))
    throw Error('Unknown checked-in candidate'); const fn = x.candidate === 'baseline' ? baseline : reconstructed; const cases = reconstructionCases.map(c => { const reference = observe(packOrder, c.input), actual = observe(fn, c.input); return { ...c, reference, actual, passed: JSON.stringify(reference) === JSON.stringify(actual) }; }); return { action: cases.every(c => c.passed) ? 'regression_gate_passed' : 'candidate_needs_repair', candidate: x.candidate, cases, passed: cases.filter(c => c.passed).length, total: cases.length, datasetHash: createHash('sha256').update(JSON.stringify(reconstructionCases)).digest('hex'), externalActions: 0, scope: 'Behavior comparison of newly repository-authored code and fixed checked-in candidates. Public demonstration/regression cases, not blind tests, AI decompilation, native reverse engineering or arbitrary-code execution.' }; }
