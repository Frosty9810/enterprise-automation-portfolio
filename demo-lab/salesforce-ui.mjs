export async function mountSalesforce(document, api, download) {
    const $ = id => document.getElementById(id);
    let state = null, selected = null, receipt = null, busy = false, generation = 0;
    const node = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text, ...className ? { className } : {} });
    function controls() {
        for (const id of ['start', 'full'])
            $(id).disabled = busy;
        $('evaluate').disabled = busy || !selected;
        $('change').disabled = busy || !selected;
        $('review').disabled = busy || receipt?.status !== 'pending_review' || !$('ack').checked;
        $('execute').disabled = busy || !['reviewed', 'retryable', 'completed'].includes(receipt?.status);
        $('reconcile').disabled = busy || receipt?.status !== 'uncertain';
        $('export').disabled = busy || receipt?.status !== 'completed';
    }
    function invalidate() { generation++; receipt = null; $('ack').checked = false; render(); }
    function render() {
        $('records').replaceChildren();
        $('run-id').textContent = '';
        $('confirmed').textContent = '0';
        $('pending').textContent = '0';
        if (state) {
            $('run-id').textContent = 'RUN ' + state.runId.slice(0, 8);
            $('confirmed').textContent = state.receipts.filter(r => r.status === 'completed').length;
            $('pending').textContent = state.receipts.filter(r => ['pending_review', 'reviewed', 'held', 'uncertain', 'retryable'].includes(r.status)).length;
            for (const rec of state.records) {
                const last = state.receipts.find(r => r.recordId === rec.id);
                const button = node('button', '', `record${selected?.id === rec.id ? ' selected' : ''}`);
                button.disabled = busy;
                button.append(node('span', rec.object.toUpperCase(), 'type'), node('strong', rec.data.Name), node('p', `${rec.id} · revision ${rec.revision}`), node('p', rec.object === 'Lead' ? `Intent ${rec.data.Score} · ${rec.data.Employees} employees` : rec.object === 'Opportunity' ? `$${rec.data.Amount.toLocaleString('en-US')} · ${rec.data.StageName}` : `${rec.data.Severity} severity · ${rec.data.Priority} priority`), node('span', last ? last.status.replaceAll('_', ' ') : 'Not evaluated', 'status'));
                button.addEventListener('click', () => { selected = rec; invalidate(); receipt = state.receipts.find(r => r.recordId === rec.id) ?? null; render(); });
                $('records').append(button);
            }
        }
        $('record-title').textContent = selected ? selected.object + ' / ' + selected.data.Name : 'Choose a record.';
        $('result').replaceChildren();
        $('history').replaceChildren();
        if (!receipt) {
            $('result').textContent = 'Evaluate the current record to inspect proposed changes.';
            $('history').append(node('li', 'No selected decision yet.'));
        }
        else {
            $('result').append(node('h3', receipt.status.replaceAll('_', ' ')), node('p', receipt.reasons.join(' · '), 'small'));
            const diff = node('div', '', 'diff');
            const before = node('div', '');
            before.append(node('span', 'BEFORE'), node('pre', JSON.stringify(Object.fromEntries(Object.keys(receipt.patch).map(key => [key, receipt.before[key]])), null, 2)));
            const patch = node('div', '');
            patch.append(node('span', 'PROPOSED CHANGE'), node('pre', JSON.stringify(receipt.patch, null, 2)));
            diff.append(before, patch);
            $('result').append(diff, node('p', `Expected revision ${receipt.expectedRevision} · ${receipt.attempts} attempts · ${receipt.localEffects} local effects`, 'small'), node('p', 'Policy ' + receipt.sourceHash, 'small'));
            for (const event of receipt.history)
                $('history').append(node('li', event.kind.replaceAll('_', ' ') + ' → ' + event.status.replaceAll('_', ' ')));
        }
        controls();
    }
    async function act(kind) {
        if (busy)
            return;
        const revision = generation;
        busy = true;
        render();
        $('notice').textContent = 'Running locally…';
        try {
            const body = kind === 'start' ? { scenario: $('scenario').value } : kind === 'full-run' ? {} : kind === 'evaluate' || kind === 'change' ? { runId: state.runId, recordId: selected.id } : { receiptId: receipt.receiptId, profile: $('profile').value, outcome: $('outcome').value };
            const result = await api(kind, body);
            if (revision !== generation)
                return;
            if (kind === 'export') {
                download(result);
                $('notice').textContent = 'Confirmed local receipt exported.';
            }
            else if (kind === 'start' || kind === 'full-run') {
                state = result;
                selected = state.records[0];
                receipt = state.receipts.find(r => r.recordId === selected.id) ?? null;
                $('ack').checked = false;
                $('scenario').value = state.scenario;
                $('notice').textContent = kind === 'full-run' ? `${result.results.filter(r => r.status === 'completed').length}/3 workflows confirmed · case acknowledgement recovered · 0 external actions` : 'Fresh synthetic run ready.';
            }
            else if (kind === 'change') {
                state = result;
                selected = state.records.find(r => r.id === selected.id);
                receipt = null;
                $('ack').checked = false;
                $('notice').textContent = 'Another local operator changed the record. Earlier reviews cannot overwrite it.';
            }
            else {
                const nextState = await api('state', { runId: state.runId });
                if (revision !== generation)
                    return;
                receipt = result;
                state = nextState;
                selected = state.records.find(r => r.id === selected.id);
                $('notice').textContent = result.replayed ? 'Original receipt retained; no repeated update.' : result.status === 'uncertain' ? 'Acknowledgement lost. Reconcile before another attempt.' : 'Decision record updated.';
            }
        }
        catch (error) {
            if (revision === generation)
                $('notice').textContent = error.message;
        }
        finally {
            busy = false;
            render();
        }
    }
    for (const [id, kind] of [['start', 'start'], ['full', 'full-run'], ['evaluate', 'evaluate'], ['review', 'review'], ['execute', 'execute'], ['reconcile', 'reconcile'], ['change', 'change'], ['export', 'export']])
        $(id).addEventListener('click', () => act(kind));
    $('ack').addEventListener('change', controls);
    $('scenario').addEventListener('change', () => { invalidate(); state = null; selected = null; render(); $('notice').textContent = 'Start a fresh run to load this scenario.'; });
    try {
        const config = await api('config');
        $('scope').textContent = config.scope;
        await act('start');
    }
    catch (error) {
        $('notice').textContent = error.message;
    }
}
if (typeof document !== 'undefined')
    mountSalesforce(document, async (kind, body) => {
        const path = '/api/salesforce/' + kind + (kind === 'state' ? '?run=' + encodeURIComponent(body.runId) : '');
        const response = await fetch(path, kind === 'state' || kind === 'config' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Client': 'local-showcase' }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok)
            throw Error(result.error || 'Request failed');
        return result;
    }, data => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'salesforce-revenueops-receipt.json'; link.click(); URL.revokeObjectURL(url); });
