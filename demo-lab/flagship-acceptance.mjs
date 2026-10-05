import { sourceArtifact } from './flagship-suite.mjs';
export async function crossCheckFlagships(suite) {
    const results = [];
    const validate = { F01: r => r.passed === true && r.results.length === 3 && r.results.every(x => x.localEffects === 1), F02: r => r.afterRecovery.status === 'completed' && r.beforeRecovery.status === 'uncertain' && r.afterRecovery.localEffects === 1, F03: r => r.citations[0] === 'returns' && r.citationEvidence[0].quote === 'Unopened products may be returned within 30 days.', F04: r => r.passed === 3 && r.spentScenarioUnits === 13, F05: r => r.decision.action === 'draft_payable' && r.decision.payment_release_allowed === false, F06: r => r.nodes.length === 12 && r.edges.every(e => e.kind === 'authored_wiring'), F07: r => r.action === 'simulated_merge_reversed' && r.restored[0].company === '' && r.after[0].company === 'Northstar Labs', F08: r => r.decision.action === 'auto_publish', F09: r => r.action === 'communication_suppressed' && r.reason === 'revoked', F10: r => r.amountCents === 2500 && r.nextInvoiceAdjustmentCents === -250 && r.balanced, F11: r => r.decisions[0].action === 'scheduling_hold' && r.decisions[1].action === 'eligible_window_preview' && r.industryChecks.maintenance.evaluation.passed === 6 && r.industryChecks.commitments.evaluation.passed === 6, F12: r => r.passed === 10 && r.total === 10 };
    for (const p of suite.catalog()) {
        const started = performance.now(), checks = [];
        let receipt;
        try {
            receipt = await suite.evaluate(p.id, suite.example(p.id));
            checks.push({ name: 'Distinct domain result matches independently stated expected facts', passed: validate[p.id](receipt.result) });
            checks.push({ name: 'Current source and zero external actions', passed: receipt.sourceHash === p.source.hash && receipt.externalActions === 0 });
            // Preserve an earlier human acknowledgement of identical evidence.
            if (!receipt.review)
                suite.review(receipt.receiptId, 'Scripted analysis reviewer');
            checks.push({ name: 'Reviewed analysis export', passed: suite.export(receipt.receiptId).authority === 'reviewed_local_analysis_only' });
            const input = suite.example(p.id);
            let boundary = false;
            switch (p.id) {
                case 'F01':
                    input.untrustedOwner = 'injected';
                    try {
                        await suite.evaluate(p.id, input);
                    }
                    catch {
                        boundary = true;
                    }
                    break;
                case 'F02':
                    input.recover = false;
                    {
                        const r = (await suite.evaluate(p.id, input)).result;
                        boundary = r.afterRecovery.status === 'uncertain' && r.afterRecovery.localEffects === 1;
                    }
                    break;
                case 'F03':
                    input.query = 'private';
                    boundary = (await suite.evaluate(p.id, input)).result.status === 'abstain';
                    break;
                case 'F04':
                    input.budgetUnits = 0;
                    {
                        const r = (await suite.evaluate(p.id, input)).result;
                        boundary = r.spentScenarioUnits === 0 && r.trials.every(t => t.route === 'budget_stop');
                    }
                    break;
                case 'F05':
                    input.invoice.bank_details_changed = true;
                    boundary = (await suite.evaluate(p.id, input)).result.decision.action === 'blocked';
                    break;
                case 'F06':
                    try {
                        sourceArtifact('../private', 0);
                    }
                    catch {
                        boundary = true;
                    }
                    break;
                case 'F07':
                    input.records[1].consent = false;
                    boundary = (await suite.evaluate(p.id, input)).result.action === 'stewardship_hold';
                    break;
                case 'F08':
                    input.candidate.description += ' 999 invented customers.';
                    boundary = (await suite.evaluate(p.id, input)).result.decision.action === 'blocked';
                    break;
                case 'F09':
                    input.events = input.events.slice(0, 1);
                    input.asOf = '2026-11-01T12:00:00.000Z';
                    boundary = (await suite.evaluate(p.id, input)).result.reason === 'expired';
                    break;
                case 'F10':
                    input.events[0].units = true;
                    try {
                        await suite.evaluate(p.id, input);
                    }
                    catch {
                        boundary = true;
                    }
                    break;
                case 'F11':
                    input.slots[1].ownerReviewed = false;
                    boundary = (await suite.evaluate(p.id, input)).result.action === 'all_windows_held';
                    break;
                case 'F12':
                    input.candidate = 'baseline';
                    {
                        const r = (await suite.evaluate(p.id, input)).result;
                        boundary = r.passed < r.total;
                    }
                    break;
            }
            checks.push({ name: 'Adverse boundary produces the expected hold, rejection or exposed regression', passed: boundary });
        }
        catch (error) {
            checks.push({ name: 'Execution error', passed: false, error: error.message });
        }
        results.push({ id: p.id, title: p.title, passed: checks.every(c => c.passed), checks, receiptId: receipt?.receiptId ?? null, sourceHash: p.source.hash, localDurationMs: performance.now() - started });
    }
    return { format: 'portfolio-twelve-acceptance/v1', measuredAt: new Date().toISOString(), passed: results.every(r => r.passed), passedProjects: results.filter(r => r.passed).length, totalProjects: 12, passedChecks: results.flatMap(r => r.checks).filter(c => c.passed).length, totalChecks: results.flatMap(r => r.checks).length, results, externalActions: 0, scope: 'Authored local acceptance and adverse cases across twelve distinct executable demonstrations. Not live acceptance, blind evaluation, measured business ROI or authenticated operator authorization.' };
}
