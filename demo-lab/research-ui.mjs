export async function mountResearch(d, api, download = () => {}, location = d.defaultView.location) {
  const $ = id => d.getElementById(id);
  const node = (tag, text) => { const n = d.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  let catalog = [], selected, example, receipt = null, compiled = false, busy = false, generation = 0;
  const controls = () => {
    for (const id of ['compile', 'answer', 'searchResearch', 'resetResearch', 'refreshResearch']) $(id).disabled = busy || (id !== 'compile' && id !== 'resetResearch' && !compiled);
    $('exportResearch').disabled = busy || !receipt || receipt.stale || !compiled;
  };
  function invalidate(message, source = false) {
    generation++; receipt = null;
    if (source) { compiled = false; $('compileState').textContent = 'Source input changed. Compile this bundle before collecting evidence.'; $('searchResults').replaceChildren(); $('pageEvidence').replaceChildren(); }
    $('researchResult').replaceChildren(node('p', message)); controls();
  }
  async function perform(kind, body, display) {
    if (busy) return;
    const revision = generation;
    busy = true; controls(); $('researchNotice').textContent = 'Running the local ' + kind + ' operation…';
    try {
      const value = await api(kind, body);
      if (revision !== generation) return;
      await display(value, revision);
      if (revision === generation) $('researchNotice').textContent = 'Local ' + kind + ' operation complete.';
    } catch (error) {
      if (revision === generation) $('researchNotice').textContent = error.message;
    } finally { busy = false; controls(); }
  }
  function parse(id) {
    if ($(id).value.length > 30000) throw Error('Keep this local example below 30,000 characters.');
    const value = JSON.parse($(id).value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Use a JSON object.');
    return value;
  }
  function compileTenant() {
    const tenant = parse('compileInput').tenant;
    if (typeof tenant !== 'string' || !tenant.trim()) throw Error('The source bundle needs a tenant label.');
    return tenant;
  }
  function button(text, action) { const b = node('button', text); b.className = 'secondary'; b.addEventListener('click', action); return b; }
  function showJSON(host, value, title = 'Inspect complete local evidence') {
    const details = node('details'); details.append(node('summary', title), node('pre', JSON.stringify(value, null, 2))); host.append(details);
  }
  function pageButtons(host, id, tenant) {
    const actions = node('div'); actions.className = 'actions';
    actions.append(button('Read ' + id, () => perform('read', {tenant, id}, value => { $('pageEvidence').replaceChildren(node('h3', 'Compiled page: ' + id)); showJSON($('pageEvidence'), value); })),
      button('Follow links', () => perform('follow', {tenant, id}, value => { $('pageEvidence').replaceChildren(node('h3', 'Links from and to ' + id)); showJSON($('pageEvidence'), value); })));
    host.append(actions);
  }
  function showReceipt(value, tenant) {
    receipt = value;
    const host = $('researchResult'); host.replaceChildren();
    const reasons = {supported:'Every required claim key has a consistent exact value in the reachable source graph.',missing_start:'The starting page is missing or is not approved.',missing_evidence:'A required claim is missing from the reachable pages.',contradictory_evidence:'Reachable sources give conflicting values for a required claim.',hop_limit:'The hop limit leaves part of the connected evidence unchecked.',evidence_budget:'The complete citations exceed the chosen evidence budget.'};
    const heading = node('p', value.status === 'supported' ? 'Required structured evidence collected' : 'Abstained: evidence is incomplete'); heading.className = 'outcome'; host.append(heading, node('p', reasons[value.reason] || value.reason || 'Exact source excerpts and authored claim values follow.'));
    const facts = node('div'); facts.className = 'facts';
    facts.append(node('span', (value.stale ? 'Stale source snapshot' : 'Current source snapshot')), node('span', `${value.evidenceBytes} / ${value.evidenceBudgetBytes} evidence bytes`), node('span', value.replayed ? 'Saved receipt replayed' : 'Receipt persisted locally'));
    host.append(facts, node('p', 'Path: ' + (value.trace || []).map(row => `${row.pageId} (hop ${row.depth})`).join(' → ')));
    const table = node('table'), head = node('tr'); head.append(node('th', 'Claim key'), node('th', 'Authored value')); table.append(head);
    for (const row of value.claims || []) { const tr = node('tr'); tr.append(node('td', row.key), node('td', row.value)); table.append(tr); }
    host.append(table);
    for (const citation of value.citations || []) {
      const box = node('article'); box.className = 'citation';
      box.append(node('h3', citation.pageId), node('p', `Source ${citation.sourceId} · version ${citation.version} · SHA-256 ${citation.sourceHash}`), node('blockquote', citation.text));
      pageButtons(box, citation.pageId, tenant); host.append(box);
    }
    showJSON(host, value); controls();
  }
  async function refreshPanels(tenant, revision) {
    const [history, errors] = await Promise.all([api('history', {tenant}), api('errors', {tenant})]);
    if (revision !== generation) return;
    const h = $('researchHistory'); h.replaceChildren(node('h3', 'Persisted evidence receipts'));
    if (!history.receipts.length) h.append(node('p', 'No saved evidence receipts for this tenant label.'));
    for (const row of history.receipts) {
      const box = node('article'); box.className = 'history-entry';
      box.append(node('p', `${row.id} · ${row.status} · ${row.stale ? 'stale sources' : 'current sources'}`), button('Inspect saved receipt', () => perform('receipt', {tenant, id:row.id}, value => showReceipt(value, tenant)))); h.append(box);
    }
    const e = $('researchErrors'); e.replaceChildren(node('h3', 'Error Book'));
    if (!errors.errors.length) e.append(node('p', 'No failed paths or manual corrections recorded for this tenant label.'));
    for (const row of errors.errors) {
      const box = node('article'); box.className = 'error-entry';
      box.append(node('p', `${row.id} · ${row.status || 'open'} · ${row.message || row.reason || 'Evidence needs review'}`));
      showJSON(box, row, 'Inspect correction record');
      if (!row.status || row.status === 'pending') {
        const label = node('label', 'Review note'), input = node('input'); input.maxLength = 2000; label.append(input); box.append(label);
        const review = status => {
          if (!input.value.trim()) { $('researchNotice').textContent = 'Add a review note before recording this decision.'; return; }
          perform('review-error', {tenant, id:row.id, status, note:input.value.trim()}, (_, revision) => refreshPanels(tenant, revision));
        };
        box.append(button('Accept correction for follow-up', () => review('accepted')), button('Reject correction', () => review('rejected')));
      }
      e.append(box);
    }
  }
  function action(id, work) { $(id).addEventListener('click', () => { try { work(); } catch (error) { $('researchNotice').textContent = error.message; } }); }
  action('compile', () => {
    const input = parse('compileInput');
    invalidate('Source compilation requested. Collect fresh evidence after it completes.', true);
    perform('compile', input, async (value, revision) => { compiled = true; $('compileState').textContent = 'Compiled snapshot: ' + value.snapshotHash + (value.reused ? ' · existing version reused' : ''); await refreshPanels(input.tenant, revision); });
  });
  action('answer', () => {
    const input = parse('answerInput'), tenant = compileTenant();
    if (input.tenant !== tenant) throw Error('Question and source bundle must use the same tenant label.');
    invalidate('Collecting current evidence.');
    perform('answer', input, async (value, revision) => { showReceipt(value, tenant); await refreshPanels(tenant, revision); });
  });
  action('searchResearch', () => { const tenant = compileTenant(); perform('search', {tenant, query:$('researchSearch').value}, value => { const host = $('searchResults'); host.replaceChildren(node('p', `${value.matches.length} matching pages`)); for (const row of value.matches) { const box = node('article'); box.append(node('h3', row.title || row.id)); pageButtons(box, row.id, tenant); host.append(box); } }); });
  action('refreshResearch', () => { const tenant = compileTenant(); perform('history', {tenant}, (_, revision) => refreshPanels(tenant, revision)); });
  action('exportResearch', () => { if (!receipt) return; const tenant = compileTenant(), id = receipt.id; perform('receipt', {tenant, id}, value => { showReceipt(value, tenant); if (value.stale) throw Error('Sources changed. Collect fresh evidence before exporting.'); download(value); }); });
  action('resetResearch', () => { $('compileInput').value = JSON.stringify(example.compile, null, 2); $('answerInput').value = JSON.stringify(example.answer, null, 2); invalidate('Example restored. Compile the source bundle to begin.', true); });
  $('compileInput').addEventListener('input', () => invalidate('Sources edited; previous evidence cleared.', true));
  $('answerInput').addEventListener('input', () => invalidate('Question edited; collect current evidence again.'));
  function select(id) {
    selected = catalog.find(p => p.id === id);
    generation++; compiled = false; receipt = null;
    $('researchWorkbench').hidden = selected?.id !== 'AtlasGraph';
    $('researchTitle').textContent = selected?.title || 'Unknown research project';
    $('researchScope').textContent = selected?.scope || 'Select a known project from the collection.';
    $('blueprint').href = selected ? '/api/research/blueprint?project=' + encodeURIComponent(selected.id) : '/projects';
    $('researchBuild').hidden = selected?.id !== 'TrustGate';
    $('researchNotice').textContent = selected?.id === 'AtlasGraph' ? 'Compile the synthetic example, then follow its evidence.' : selected?.id === 'TrustGate' ? 'A partial local tool gateway is available. Open the build to inspect source-bound arguments and execution controls.' : 'Blueprint available. A runnable implementation is still pending.';
    $('researchProject').value = selected?.id || '';
    for (const id of ['researchHistory', 'researchErrors', 'pageEvidence', 'searchResults']) $(id).replaceChildren();
    $('researchResult').replaceChildren(node('p', 'Compile the example, then collect evidence.'));
    $('compileState').textContent = 'No sources compiled in this view.';
    controls();
  }
  $('researchProject').addEventListener('change', () => {
    const id = $('researchProject').value;
    const url = new URL(location.href); url.searchParams.set('project', id);
    d.defaultView.history.replaceState(null, '', url); select(id);
  });
  try {
    const [c, fixture] = await Promise.all([api('catalog'), api('example')]); catalog = c.projects; example = fixture;
    for (const row of catalog) { const option = node('option', row.title + ' · ' + (row.status === 'partial-local' ? 'Partial local build' : 'Blueprint only')); option.value = row.id; $('researchProject').append(option); }
    $('compileInput').value = JSON.stringify(fixture.compile, null, 2); $('answerInput').value = JSON.stringify(fixture.answer, null, 2);
    select(new URLSearchParams(location.search).get('project') || 'AtlasGraph');
  } catch (error) { $('researchNotice').textContent = error.message; }
  return {select};
}

if (typeof document !== 'undefined') mountResearch(document, async (kind, body) => {
  const response = await fetch('/api/research/' + kind, body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});
  const value = await response.json(); if (!response.ok) throw Error(value.error || 'Local research request failed'); return value;
}, value => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'})), link = document.createElement('a');
  link.href = url; link.download = 'AtlasGraph-' + value.id + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
