export async function mountWorkshop(document, fetch, location, crypto) {
    const $ = id => document.getElementById(id);
    let projects = [], selected, receipt = null, busy = false, generation = 0;
    const clear = () => { generation++; receipt = null; $('ack').checked = false; if (busy)
        $('notice').textContent = 'Input changed. Validate the current event when the pending request finishes.'; render(); };
    function controls() {
        $('submit').disabled = busy;
        $('reset').disabled = busy;
        $('review').disabled = busy || !receipt || receipt.status !== 'pending_review' || !$('ack').checked || !$('reviewer').value.trim();
        $('execute').disabled = busy || !receipt || !['reviewed', 'retryable', 'completed'].includes(receipt.status);
        $('reconcile').disabled = busy || receipt?.status !== 'uncertain';
        $('export').disabled = busy || receipt?.status !== 'completed';
    }
    function render() {
        const box = $('receipt');
        box.replaceChildren();
        $('history').replaceChildren();
        if (!receipt) {
            box.textContent = 'Validate an event to begin.';
            $('history').append(Object.assign(document.createElement('li'), { textContent: 'No receipt yet.' }));
        }
        else {
            box.append(Object.assign(document.createElement('strong'), { textContent: receipt.status.replaceAll('_', ' ') }));
            box.append(Object.assign(document.createElement('p'), { className: 'metrics', textContent: `${receipt.attempts} attempts · ${receipt.localEffects} local effects · ${receipt.externalActions} external actions` }));
            box.append(Object.assign(document.createElement('pre'), { textContent: JSON.stringify(receipt.payload, null, 2) }));
            box.append(Object.assign(document.createElement('p'), { className: 'small', textContent: `Source revision ${receipt.sourceHash}\nPayload ${receipt.payloadHash}` }));
            for (const event of receipt.events) {
                const li = document.createElement('li');
                li.textContent = `${event.kind.replaceAll('_', ' ')} → ${event.status.replaceAll('_', ' ')}${Object.keys(event.detail).length ? ' · ' + JSON.stringify(event.detail) : ''}`;
                $('history').append(li);
            }
        }
        controls();
    }
    function fixture() { clear(); const scenario = $('scenario').value; const event = { projectId: selected.id, eventId: 'workshop-' + crypto.randomUUID(), locationId: scenario === 'tenant' ? 'OTHER_LOCATION' : 'DEMO_LOCATION', storageConsent: scenario !== 'consent', contact: { email: scenario === 'email' ? 'invalid' : 'reviewer@example.test', firstName: 'Synthetic' }, notes: 'This discarded field is never stored.' }; $('event').value = JSON.stringify(event, null, 2); $('notice').textContent = ''; }
    function select() {
        selected = projects.find(p => p.id === $('project').value);
        if (!selected)
            return;
        location.hash = selected.id;
        for (const key of ['actor', 'decision', 'acceptance', 'failure', 'scope'])
            $(key).textContent = selected[key];
        $('domain').href = selected.deepLink;
        $('checks').textContent = `${selected.handoff.passed}/${selected.handoff.total} shared handoff checks passed`;
        $('principles').replaceChildren(...selected.principles.map(p => Object.assign(document.createElement('li'), { textContent: p })));
        $('sources').replaceChildren(...selected.sourceSnapshot.files.map(s => { const li = document.createElement('li'); if (s.url) {
            const a = document.createElement('a');
            a.href = s.url;
            a.textContent = s.key;
            li.append(a);
        }
        else
            li.textContent = s.key; li.append(document.createTextNode(' · ' + s.sha256.slice(0, 12))); return li; }));
        fixture();
    }
    async function action(kind) {
        const revision = generation;
        busy = true;
        controls();
        $('notice').textContent = 'Working locally…';
        try {
            const body = kind === 'submit' ? { projectId: selected.id, event: JSON.parse($('event').value) } : { receiptId: receipt.receiptId, reviewer: $('reviewer').value, outcome: $('outcome').value };
            const response = await fetch('/api/workshop/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Client': 'local-showcase' }, body: JSON.stringify(body) });
            const data = await response.json();
            if (revision !== generation)
                return;
            if (!response.ok)
                throw Error(data.error || 'Request failed');
            if (kind === 'export') {
                const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = selected.id + '-reliability-evidence.json';
                a.click();
                URL.revokeObjectURL(url);
                $('notice').textContent = 'Evidence exported. Local demonstration only.';
            }
            else if (!data.receiptId) {
                receipt = null;
                $('notice').textContent = 'Held at the boundary: ' + JSON.stringify(data);
            }
            else {
                receipt = data;
                $('notice').textContent = data.replayed ? 'Original receipt retrieved; no duplicate local effect.' : 'Record updated.';
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
    for (const kind of ['submit', 'review', 'execute', 'reconcile', 'export'])
        $(kind).addEventListener('click', () => action(kind));
    $('ack').addEventListener('change', controls);
    $('reviewer').addEventListener('input', controls);
    $('event').addEventListener('input', clear);
    $('scenario').addEventListener('change', fixture);
    $('reset').addEventListener('click', fixture);
    $('project').addEventListener('change', select);
    try {
        const response = await fetch('/api/workshop/projects');
        if (!response.ok)
            throw Error('Project passports unavailable');
        projects = (await response.json()).projects;
        for (const p of projects) {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.id + ' / ' + p.title.replace(new RegExp('^' + p.id + '\\s+'), '');
            $('project').append(option);
        }
        const id = location.hash.slice(1);
        if (projects.some(p => p.id === id))
            $('project').value = id;
        select();
    }
    catch (error) {
        $('notice').textContent = error.message;
    }
}
if (typeof document !== 'undefined')
    mountWorkshop(document, fetch, location, crypto);
