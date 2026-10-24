export const collectionLabels = Object.freeze({
  automation: 'Automation', 'life-data': 'Life and data', engineering: 'AI engineering',
  'business-systems': 'Business systems', research: 'Research builds',
});
export const statusLabels = Object.freeze({
  'local-demo': 'Local demo', 'local-prototype': 'Local prototype',
  'partial-local': 'Partial build', 'blueprint-only': 'Blueprint only',
});
const routeFor = (collection, id) => ({
  automation: `/?project=${encodeURIComponent(id)}`, 'life-data': `/?human=${encodeURIComponent(id)}`,
  engineering: `/engineering?project=${encodeURIComponent(id)}`,
  'business-systems': `/flagships?project=${encodeURIComponent(id)}`,
  research: `${id==='TrustGate'?'/trustgate':id==='ChronosRank'?'/chronosrank':id==='DocksideSLM'?'/dockside':id==='VeilRAG'?'/veilrag':'/research'}?project=${encodeURIComponent(id)}`,
})[collection];

/** Validate the response as a whole. A broken catalog must not silently hide projects. */
export function validateInventory(value) {
  if (!Array.isArray(value) || !value.length || value.length > 1000) throw Error('Invalid project inventory.');
  const seen = new Set();
  return value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Invalid project record.');
    const record = {};
    for (const key of ['collection', 'id', 'title', 'summary', 'scope', 'status', 'href']) {
      if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > (key === 'id' ? 100 : 4000)) throw Error(`Invalid project ${key}.`);
      record[key] = row[key];
    }
    if (!Object.hasOwn(collectionLabels, record.collection) || !Object.hasOwn(statusLabels, record.status)) throw Error('Unknown project collection or status.');
    if (!/^[A-Za-z0-9-]+$/.test(record.id)) throw Error('Invalid project identifier.');
    if (record.href !== routeFor(record.collection, record.id)) throw Error('Invalid project destination.');
    const key = `${record.collection}:${record.id}`;
    if (seen.has(key)) throw Error('Duplicate project identifier within a collection.');
    seen.add(key);
    return record;
  });
}

const normalize = value => value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
export function filterInventory(entries, { query = '', collection = 'all', status = 'all' } = {}) {
  if (typeof query !== 'string' || query.length > 300) throw Error('Search must be text up to 300 characters.');
  if (collection !== 'all' && !Object.hasOwn(collectionLabels, collection)) throw Error('Unknown collection filter.');
  if (status !== 'all' && !Object.hasOwn(statusLabels, status)) throw Error('Unknown status filter.');
  const terms = normalize(query).split(' ').filter(Boolean);
  return entries.filter(entry => {
    if (collection !== 'all' && entry.collection !== collection || status !== 'all' && entry.status !== status) return false;
    const haystack = normalize([entry.id, entry.title, entry.summary, entry.scope, collectionLabels[entry.collection], statusLabels[entry.status]].join(' '));
    return terms.every(term => haystack.includes(term));
  });
}

async function fetchInventory() {
  const response = await fetch('/api/project-inventory');
  if (!response.ok) throw Error('Inventory request failed.');
  return response.json();
}

export async function mountProjectInventory(d = document, load = fetchInventory) {
  const $ = id => d.getElementById(id), view = d.defaultView;
  let entries = [], request = 0, disposed = false;
  const controls = [$('project-search'), $('project-collection'), $('project-status'), $('clear-filters')];
  function state() { return { query: $('project-search').value, collection: $('project-collection').value, status: $('project-status').value }; }
  function readUrl() {
    const params = new URL(view.location.href).searchParams;
    $('project-search').value = (params.get('q') || '').slice(0, 300);
    $('project-collection').value = Object.hasOwn(collectionLabels, params.get('collection')) ? params.get('collection') : 'all';
    $('project-status').value = Object.hasOwn(statusLabels, params.get('status')) ? params.get('status') : 'all';
  }
  function writeUrl() {
    const value = state(), url = new URL(view.location.href);
    for (const [key, text] of [['q', value.query], ['collection', value.collection], ['status', value.status]]) {
      if (text && text !== 'all') url.searchParams.set(key, text); else url.searchParams.delete(key);
    }
    view.history.replaceState(null, '', url);
  }
  const element = (tag, text, className) => { const node = d.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  function render() {
    const visible = filterInventory(entries, state()), fragment = d.createDocumentFragment();
    for (const entry of visible) {
      const card = element('article', undefined, 'project-card');
      card.dataset.project = entry.id; card.dataset.collection = entry.collection;
      const meta = element('div', undefined, 'project-meta');
      meta.append(element('span', entry.id, 'project-id'), element('span', collectionLabels[entry.collection]));
      const status = element('span', statusLabels[entry.status], 'status'); status.dataset.status = entry.status;
      const link = element('a', entry.status === 'blueprint-only' ? 'Read the design and remaining work →' : 'Open project and inspect its scope →', 'project-link');
      link.href = entry.href; link.setAttribute('aria-label', `${entry.title}: ${link.textContent}`);
      card.append(meta, element('h3', entry.title), element('p', entry.summary, 'summary'), status, element('p', entry.scope, 'project-scope'), link);
      fragment.append(card);
    }
    $('inventory-results').replaceChildren(fragment);
    $('project-count').textContent = `${visible.length} of ${entries.length} catalog entries`;
    $('inventory-empty').hidden = visible.length !== 0;
  }
  function change() { writeUrl(); if (entries.length) render(); }
  function clear() {
    $('project-search').value = ''; $('project-collection').value = 'all'; $('project-status').value = 'all';
    change(); $('project-search').focus();
  }
  function popstate() { readUrl(); if (entries.length) render(); }
  async function refresh() {
    const current = ++request;
    controls.forEach(control => { control.disabled = true; });
    $('inventory-results').setAttribute('aria-busy', 'true');
    $('inventory-error').hidden = true; $('inventory-retry').hidden = true; $('inventory-empty').hidden = true;
    $('project-count').textContent = 'Loading projects…';
    try {
      const data = validateInventory(await load());
      if (disposed || current !== request) return;
      entries = data;
      $('inventory-overview').textContent = `${entries.length} catalog entries · ` + Object.entries(collectionLabels).map(([key, label]) => `${entries.filter(entry => entry.collection === key).length} ${label.toLowerCase()}`).join(' · ');
      render();
    } catch {
      if (disposed || current !== request) return;
      entries = []; $('inventory-results').replaceChildren();
      $('inventory-overview').textContent = 'The current source catalogs could not be loaded.';
      $('project-count').textContent = 'Inventory unavailable';
      $('inventory-error').textContent = 'The project inventory could not be loaded or validated. Retry to load the complete collection.';
      $('inventory-error').hidden = false; $('inventory-retry').hidden = false;
    } finally {
      if (!disposed && current === request) {
        controls.forEach(control => { control.disabled = false; });
        $('inventory-results').setAttribute('aria-busy', 'false');
      }
    }
  }
  readUrl();
  $('inventory-filters').onsubmit = event => { event.preventDefault(); change(); };
  $('project-search').oninput = change; $('project-collection').onchange = change; $('project-status').onchange = change;
  $('clear-filters').onclick = clear; $('empty-clear').onclick = clear; $('inventory-retry').onclick = refresh;
  view.addEventListener('popstate', popstate);
  await refresh();
  return { refresh, destroy() { disposed = true; request++; view.removeEventListener('popstate', popstate); $('inventory-filters').onsubmit = null; $('project-search').oninput = null; $('project-collection').onchange = null; $('project-status').onchange = null; $('clear-filters').onclick = null; $('empty-clear').onclick = null; $('inventory-retry').onclick = null; } };
}

if (typeof document !== 'undefined' && document.getElementById('inventory-page')) mountProjectInventory(document);
