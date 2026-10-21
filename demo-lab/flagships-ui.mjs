export async function mountFlagships(document, api, download, initialId = 'F01') {
    const $ = id => document.getElementById(id);
    const node = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text, ...className ? { className } : {} });
    let projects = [], selected = null, receipt = null, report = null, busy = false, loading = false, generation = 0;
    const fmt = value => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—');
    function table(headers, rows) { const t = document.createElement('table'), head = document.createElement('tr'); headers.forEach(h => head.append(node('th', h))); t.append(head); for (const row of rows) {
        const tr = document.createElement('tr');
        row.forEach(value => tr.append(node('td', fmt(value))));
        t.append(tr);
    } return t; }
    function controls() { $('input').disabled = loading; $('evaluate').disabled = busy || loading || !selected; $('runAll').disabled = busy || loading; $('reset').disabled = busy || !selected; $('review').disabled = busy || loading || !receipt || !!receipt.review || !$('ack').checked || !$('actor').value.trim(); $('export').disabled = busy || loading || !receipt?.review; }
    function render() {
        $('projects').replaceChildren();
        for (const p of projects) {
            const b = node('button', '', `project${selected?.id === p.id ? ' active' : ''}`), checked = report?.results.find(r => r.id === p.id);
            b.append(node('span', p.id + ' / LOCAL BUILD'), node('strong', p.title), node('small', checked ? (checked.passed ? 'Cross-check passed' : 'Needs attention') : p.discipline));
            b.addEventListener('click', () => select(p.id));
            $('projects').append(b);
        }
        $('summary').replaceChildren();
        $('details').replaceChildren();
        $('raw').textContent = receipt ? JSON.stringify(receipt.result, null, 2) : 'No receipt yet.';
        if (!receipt)
            $('summary').textContent = loading ? 'Loading the current fixture…' : 'Run this system to inspect its result.';
        else {
            const r = receipt.result, action = r.action ?? r.decision?.action ?? (r.passed === true ? 'local_flow_completed' : 'local_analysis');
            $('summary').append(node('strong', action.replaceAll('_', ' ')), node('p', r.scope ?? 'Synthetic local result.'));
            detail(r);
        }
        $('report').replaceChildren();
        if (report) {
            $('checked').textContent = report.passedProjects + '/12';
            $('checkCount').textContent = report.passedChecks + '/' + report.totalChecks;
            for (const r of report.results) {
                const row = node('div', '', 'result-row');
                row.append(node('span', r.id + ' · ' + r.title), node('strong', r.passed ? 'PASS' : 'REVIEW'));
                $('report').append(row);
            }
        }
        else
            $('report').textContent = 'Cross-check all twelve to inspect distinct expected domain results and adverse boundaries.';
        controls();
    }
    function detail(r) {
        const box = $('details'), id = selected.id;
        if (id === 'F01')
            box.append(table(['Object', 'State', 'Local effects'], r.results.map(x => [x.before.object, x.status, x.localEffects])));
        if (id === 'F02')
            box.append(table(['Transition', 'Status', 'Effects'], [['Before recovery', r.beforeRecovery.status, r.beforeRecovery.localEffects], ['After recovery', r.afterRecovery.status, r.afterRecovery.localEffects]]));
        if (id === 'F03') {
            box.append(node('p', r.answer, 'quote'));
            box.append(table(['Source', 'Exact excerpt hash'], r.citationEvidence.map(c => [c.id, c.sha256.slice(0, 16)])));
            box.append(table(['Excluded source', 'Reason'], r.excluded.map(c => [c.id, c.reason])));
        }
        if (id === 'F04') {
            box.append(node('p', `${r.spentScenarioUnits}/${r.budgetUnits} synthetic units · ${r.passed}/${r.total} labeled fixture checks`));
            box.append(table(['Case', 'Route', 'Fixture check'], r.trials.map(t => [t.id, t.route, t.passed ? 'pass' : 'review'])));
        }
        if (id === 'F05') {
            const x = receipt.input;
            box.append(table(['Quantity', 'Invoice', 'Purchase / receipt'], [['Units', x.invoice.quantity, x.purchase.po_quantity + ' / ' + x.purchase.received_quantity], ['Unit price', x.invoice.unit_price, x.purchase.po_unit_price], ['Tax', x.invoice.tax, x.purchase.expected_tax]]));
            box.append(node('p', r.decision.reasons.length ? r.decision.reasons.join(' · ') : 'All supplied match controls passed. Payment release remains disabled.'));
        }
        if (id === 'F06') {
            for (const n of r.nodes) {
                const b = node('div', '', 'architecture-node');
                b.append(node('strong', n.id + ' · ' + n.title), node('p', n.sourceCurrent ? 'Listed source is current' : 'Source changed'), node('small', 'Authored edge → durable analysis receipt'));
                for (const s of n.sources) {
                    const a = node('a', s.name);
                    a.href = s.url;
                    b.append(a);
                }
                box.append(b);
            }
            box.append(node('p', r.observed.length + ' actual saved evaluations in this source map. Inspect JSON for freshness and result hashes.'));
        }
        if (id === 'F07') {
            box.append(table(['Record', 'Before', 'Applied / restored'], [['Survivor company', r.before?.find(x => x.id === r.plan.keepId)?.company ?? 'Not applied', r.after?.find(x => x.id === r.plan.keepId)?.company ?? r.action], ['Protected fields', r.plan.protectedFields.join(', '), r.restored ? 'Restored exactly' : 'No reversal applied']]));
            box.append(node('p', r.reasons.join(' · ') || 'Exact identity and protected fields checked.'));
        }
        if (id === 'F08')
            box.append(table(['Policy state', 'Reasons'], [[r.decision.action, r.decision.reasons.join(' · ') || 'Protected facts retained']]));
        if (id === 'F09')
            box.append(table(['Consent scope', 'Reason', 'Latest event'], [[r.channel + ' / ' + r.purpose, r.reason, r.latestEvent]]));
        if (id === 'F10') {
            box.append(node('p', `Draft $${(r.amountCents / 100).toFixed(2)} USD · next adjustment $${(r.nextInvoiceAdjustmentCents / 100).toFixed(2)} USD`));
            box.append(table(['Journal account', 'Debit cents', 'Credit cents'], r.journal.map(j => [j.account, j.debitCents, j.creditCents])));
            box.append(node('p', r.balanced ? 'Draft journal balances. No invoice issued.' : 'Unbalanced draft.'));
        }
        if (id === 'F11')
            box.append(table(['Slot', 'UTC start', 'Decision'], r.decisions.map(d => [d.id, d.startUTC, d.action])));
        if (id === 'F12')
            box.append(table(['Regression case', 'Reference', 'Candidate'], r.cases.map(c => [c.id, c.reference.kind === 'value' ? c.reference.value : 'reject', c.passed ? 'matches' : fmt(c.actual)])));
    }
    async function select(id) { const p = projects.find(p => p.id === id); if (!p)
        return; const revision = ++generation; selected = p; receipt = null; loading = true; $('ack').checked = false; $('input').value = ''; $('discipline').textContent = p.discipline; $('title').textContent = p.title; $('problem').textContent = p.problem; $('deepLink').hidden = !p.deepLink; if (p.deepLink)
        $('deepLink').href = p.deepLink; $('sourceHash').textContent = 'Source ' + p.source.hash + ' · ' + (p.sourceCurrent ? 'current at startup' : 'restart required'); $('sources').replaceChildren(...p.sources.map(s => { const li = document.createElement('li'), a = node('a', s.name); a.href = s.url; li.append(a); return li; })); render(); try {
        const value = await api('example', id);
        if (revision !== generation)
            return;
        $('input').value = JSON.stringify(value, null, 2);
        $('notice').textContent = 'Fixture ready.';
    }
    catch (error) {
        if (revision === generation)
            $('notice').textContent = error.message;
    }
    finally {
        if (revision === generation) {
            loading = false;
            render();
        }
    } }
    async function act(kind) { if (busy)
        return; const revision = generation; busy = true; controls(); $('notice').textContent = 'Executing local source…'; try {
        const body = kind === 'evaluate' ? { toolId: selected.id, input: JSON.parse($('input').value) } : kind === 'run-all' ? {} : { receiptId: receipt.receiptId, actor: $('actor').value };
        const result = await api(kind, body);
        if (revision !== generation)
            return;
        if (kind === 'run-all') {
            report = result;
            $('notice').textContent = result.passed ? `${result.passedProjects}/12 projects and ${result.passedChecks}/${result.totalChecks} checks passed.` : 'Cross-check exposed a failure; inspect the report.';
        }
        else if (kind === 'export') {
            download(result);
            $('notice').textContent = 'Reviewed local analysis exported.';
        }
        else {
            receipt = result;
            $('notice').textContent = kind === 'review' ? 'Analysis acknowledged; no operational authority granted.' : 'Source executed. Inspect the decision and source evidence.';
        }
    }
    catch (error) {
        if (revision === generation)
            $('notice').textContent = error.message;
    }
    finally {
        busy = false;
        render();
    } }
    for (const kind of ['evaluate', 'review', 'export'])
        $(kind).addEventListener('click', () => act(kind));
    $('runAll').addEventListener('click', () => act('run-all'));
    $('reset').addEventListener('click', () => select(selected.id));
    $('ack').addEventListener('change', controls);
    $('actor').addEventListener('input', controls);
    $('input').addEventListener('input', () => { generation++; receipt = null; $('ack').checked = false; render(); $('notice').textContent = 'Input changed; run the current evidence again.'; });
    try {
        projects = (await api('catalog')).projects;
        await select(projects.some(p => p.id === initialId) ? initialId : 'F01');
    }
    catch (error) {
        $('notice').textContent = error.message;
    }
}
if (typeof document !== 'undefined')
    mountFlagships(document, async (kind, body) => { const path = '/api/flagships/' + kind + (kind === 'example' ? '/' + encodeURIComponent(body) : ''); const response = await fetch(path, kind === 'catalog' || kind === 'example' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Client': 'local-showcase' }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok)
        throw Error(result.error || 'Local request failed'); return result; }, result => { const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = result.toolId + '-analysis.json'; link.click(); URL.revokeObjectURL(url); }, location.hash.slice(1));
