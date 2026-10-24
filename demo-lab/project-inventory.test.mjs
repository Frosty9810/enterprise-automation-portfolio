import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { portfolioInventory } from './project-inventory.mjs';
import { projects } from './catalog.mjs';
import { humanProjects } from './human-projects.mjs';
import { workbenchProjects } from './workbench-core.mjs';
import { flagshipDescriptions } from './flagship-fixtures.mjs';
import { validateInventory, filterInventory, mountProjectInventory } from './projects-ui.mjs';

const html = readFileSync(new URL('./projects.html', import.meta.url), 'utf8');
const setup = (url = 'http://localhost/projects') => new JSDOM(html, { url });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('inventory covers every live catalog once within its collection, with working destination identities', () => {
  const entries = validateInventory(portfolioInventory());
  for (const [collection, expected] of [
    ['automation', projects.map(project => project.id)],
    ['life-data', humanProjects.map(project => project.id)],
    ['engineering', workbenchProjects.map(project => project.id)],
    ['business-systems', flagshipDescriptions.map(row => row[0])],
    ['research', ['AtlasGraph', 'ChronosRank', 'TrustGate', 'DocksideSLM', 'VeilRAG']],
  ]) {
    assert.deepEqual(entries.filter(entry => entry.collection === collection).map(entry => entry.id), expected);
  }
  assert.deepEqual(Object.fromEntries(['automation', 'life-data', 'engineering', 'business-systems', 'research'].map(collection => [collection, entries.filter(entry => entry.collection === collection).length])), {
    automation: 27, 'life-data': 20, engineering: 9, 'business-systems': 12, research: 5,
  });
  assert.equal(entries.length, 73);
  for (const entry of entries) {
    const url = new URL(entry.href, 'http://localhost');
    assert.equal(url.searchParams.get(entry.collection === 'life-data' ? 'human' : 'project'), entry.id);
    assert.equal(url.hash, '');
  }
});

test('six industry tracks stay partial and research design names cannot inflate shipped claims', () => {
  const entries = portfolioInventory();
  assert.deepEqual(entries.filter(entry => entry.collection === 'automation' && entry.status === 'partial-local').map(entry => entry.id).sort(), ['CON-01', 'EA-01', 'INS-01', 'LEGAL-01', 'MED-01', 'PM-01']);
  const research = entries.filter(entry => entry.collection === 'research');
  assert.equal(research.find(entry => entry.id === 'AtlasGraph').status, 'partial-local');
  assert.match(research.find(entry => entry.id === 'AtlasGraph').scope, /No LLM, dense-vector baseline/);
  assert.equal(research.find(entry=>entry.id==='TrustGate').status,'partial-local');
  assert.equal(research.find(entry=>entry.id==='TrustGate').href,'/trustgate?project=TrustGate');
  assert.equal(research.find(entry=>entry.id==='ChronosRank').status,'partial-local');
  assert.equal(research.find(entry=>entry.id==='ChronosRank').href,'/chronosrank?project=ChronosRank');
  assert.match(research.find(entry=>entry.id==='ChronosRank').scope,/No trained reranker/);
  assert.equal(research.find(entry=>entry.id==='DocksideSLM').status,'partial-local');
  assert.equal(research.find(entry=>entry.id==='DocksideSLM').href,'/dockside?project=DocksideSLM');
  assert.match(research.find(entry=>entry.id==='DocksideSLM').scope,/No OCR, SLM inference/);
  assert.equal(research.find(entry=>entry.id==='VeilRAG').status,'partial-local');
  assert.equal(research.find(entry=>entry.id==='VeilRAG').href,'/veilrag?project=VeilRAG');
  assert.match(research.find(entry=>entry.id==='VeilRAG').scope,/No automatic entity detector/);
  assert.deepEqual(research.filter(entry => entry.status === 'blueprint-only').map(entry => entry.id), []);
  assert.match(html, /count does not represent independent production deployments/);
});

test('returned records are fresh and do not mutate the executable catalogs', () => {
  const initial = projects[0].title, entries = portfolioInventory();
  entries[0].title = 'tampered'; entries.pop();
  assert.equal(projects[0].title, initial);
  assert.equal(portfolioInventory()[0].title, initial);
  assert.equal(portfolioInventory().length, 73);
});

test('search normalizes case and whitespace; words intersect with collection and status', () => {
  const entries = validateInventory(portfolioInventory());
  assert.deepEqual(filterInventory(entries, { query: '  pM-01   ' }).map(entry => entry.id), ['PM-01']);
  assert.deepEqual(filterInventory(entries, { query: 'temporal memory', collection: 'research', status: 'partial-local' }).map(entry => entry.id), ['ChronosRank']);
  assert.deepEqual(filterInventory(entries, { query: 'temporal reranking', collection: 'engineering' }), []);
  assert.equal(filterInventory(entries, { collection: 'research', status: 'blueprint-only' }).length, 0);
  assert.equal(filterInventory(entries, { query: '  ' }).length, entries.length);
  assert.deepEqual(filterInventory(entries, { query: 'nonexistent-catalog-name' }), []);
});

test('malformed inventory fails closed for missing fields, duplicate identities, unknown states and unsafe destinations', () => {
  const row = portfolioInventory()[0];
  for (const bad of [null, {}, [], [null], [{ ...row, title: '' }], [{ ...row, summary: {} }], [{ ...row, scope: 'x'.repeat(4001) }], [{ ...row, id: '../escape' }], [{ ...row, collection: '__proto__' }], [{ ...row, status: 'production-ready' }], [{ ...row, href: 'javascript:alert(1)' }], [{ ...row, href: '//evil.example/project' }], [{ ...row, href: '/?project=another-id' }], [row, { ...row }]]) {
    assert.throws(() => validateInventory(bad));
  }
  assert.throws(() => filterInventory([row], { query: {} }));
  assert.throws(() => filterInventory([row], { query: 'x'.repeat(301) }));
  assert.throws(() => filterInventory([row], { collection: 'missing' }));
  assert.throws(() => filterInventory([row], { status: 'shipped' }));
});

test('browser renders every catalog entry with explicit scopes and valid links', async () => {
  const dom = setup();
  try {
    await mountProjectInventory(dom.window.document, async () => portfolioInventory());
    const d = dom.window.document;
    assert.equal(d.querySelectorAll('.project-card').length, 73);
    assert.equal(d.getElementById('project-count').textContent, '73 of 73 catalog entries');
    assert.equal(d.getElementById('inventory-results').getAttribute('aria-busy'), 'false');
    assert.match(d.getElementById('inventory-overview').textContent, /27 automation.*20 life and data.*9 ai engineering.*12 business systems.*5 research builds/);
    assert.equal(d.querySelectorAll('.project-scope').length, 73);
    assert.equal(d.querySelectorAll('.status[data-status="blueprint-only"]').length, 0);
    assert.match(d.querySelector('[data-project="ChronosRank"] a').textContent, /Open project/);
    assert.equal(d.querySelector('[data-project="AtlasGraph"] a').getAttribute('href'), '/research?project=AtlasGraph');
    assert.equal(d.querySelector('[data-project="TrustGate"] a').getAttribute('href'), '/trustgate?project=TrustGate');
  } finally { dom.window.close(); }
});

test('browser filters combine; no results announce clearly and clearing restores the collection and focus', async () => {
  const dom = setup();
  try {
    const d = dom.window.document;
    await mountProjectInventory(d, async () => portfolioInventory());
    d.getElementById('project-collection').value = 'research';
    d.getElementById('project-collection').dispatchEvent(new dom.window.Event('change'));
    d.getElementById('project-status').value = 'blueprint-only';
    d.getElementById('project-status').dispatchEvent(new dom.window.Event('change'));
    assert.equal(d.querySelectorAll('.project-card').length, 0);
    d.getElementById('project-status').value = 'partial-local';
    d.getElementById('project-status').dispatchEvent(new dom.window.Event('change'));
    d.getElementById('project-search').value = 'temporal';
    d.getElementById('project-search').dispatchEvent(new dom.window.Event('input'));
    assert.equal(d.querySelector('.project-card').dataset.project, 'ChronosRank');
    assert.equal(new URL(dom.window.location.href).searchParams.get('q'), 'temporal');
    d.getElementById('project-search').value = 'no-such-project';
    d.getElementById('project-search').dispatchEvent(new dom.window.Event('input'));
    assert.equal(d.querySelectorAll('.project-card').length, 0);
    assert.equal(d.getElementById('inventory-empty').hidden, false);
    assert.equal(d.getElementById('project-count').textContent, '0 of 73 catalog entries');
    d.getElementById('empty-clear').click();
    assert.equal(d.querySelectorAll('.project-card').length, 73);
    assert.equal(d.getElementById('inventory-empty').hidden, true);
    assert.equal(dom.window.location.search, '');
    assert.equal(d.activeElement, d.getElementById('project-search'));
  } finally { dom.window.close(); }
});

test('shared search URL and browser navigation restore filters, invalid filters fall back safely', async () => {
  const dom = setup('http://localhost/projects?q=PM-01&collection=automation&status=partial-local');
  try {
    const d = dom.window.document;
    await mountProjectInventory(d, async () => portfolioInventory());
    assert.equal(d.querySelectorAll('.project-card').length, 1);
    assert.equal(d.querySelector('.project-card').dataset.project, 'PM-01');
    dom.window.history.pushState(null, '', '/projects?collection=research&status=blueprint-only');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    assert.equal(d.querySelectorAll('.project-card').length, 0);
    dom.window.history.pushState(null, '', '/projects?collection=__proto__&status=production-ready');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    assert.equal(d.getElementById('project-collection').value, 'all');
    assert.equal(d.getElementById('project-status').value, 'all');
    assert.equal(d.querySelectorAll('.project-card').length, 73);
  } finally { dom.window.close(); }
});

test('untrusted catalog text stays text, never markup or executable attributes', async () => {
  const dom = setup();
  try {
    const row = portfolioInventory()[0], injection = '<img src=x onerror="window.pwned=true">';
    await mountProjectInventory(dom.window.document, async () => [{ ...row, title: injection, summary: '<script>window.pwned=true</script>', scope: '<a href="javascript:alert(1)">unsafe</a>' }]);
    const results = dom.window.document.getElementById('inventory-results');
    assert.equal(results.querySelector('h3').textContent, injection);
    assert.equal(results.querySelector('img'), null);
    assert.equal(results.querySelector('script'), null);
    assert.equal(results.querySelectorAll('a').length, 1);
    assert.equal(dom.window.pwned, undefined);
  } finally { dom.window.close(); }
});

test('network failure and malformed responses expose retry without a misleading empty collection', async () => {
  const dom = setup(); let calls = 0;
  try {
    const d = dom.window.document;
    await mountProjectInventory(d, async () => { calls++; if (calls === 1) throw Error('network failed'); if (calls === 2) return [{ id: 'bad' }]; return portfolioInventory(); });
    assert.equal(d.getElementById('inventory-error').hidden, false);
    assert.equal(d.getElementById('inventory-empty').hidden, true);
    assert.equal(d.getElementById('project-count').textContent, 'Inventory unavailable');
    d.getElementById('inventory-retry').click(); await flush();
    assert.equal(d.getElementById('inventory-error').hidden, false);
    d.getElementById('inventory-retry').click(); await flush();
    assert.equal(d.querySelectorAll('.project-card').length, 73);
    assert.equal(d.getElementById('inventory-error').hidden, true);
    assert.equal(d.getElementById('inventory-retry').hidden, true);
  } finally { dom.window.close(); }
});

test('older refresh responses cannot overwrite newer catalog results', async () => {
  const dom = setup(); const pending = []; let controller;
  try {
    const mounted = mountProjectInventory(dom.window.document, async () => new Promise(resolve => pending.push(resolve)));
    pending.shift()(portfolioInventory()); controller = await mounted;
    const earlier = controller.refresh(), latest = controller.refresh();
    pending[1]([portfolioInventory().find(entry => entry.id === 'AtlasGraph')]); await latest;
    pending[0](portfolioInventory()); await earlier;
    assert.equal(dom.window.document.querySelectorAll('.project-card').length, 1);
    assert.equal(dom.window.document.querySelector('.project-card').dataset.project, 'AtlasGraph');
  } finally { controller?.destroy(); dom.window.close(); }
});

test('disposing the view prevents a pending response from writing detached UI', async () => {
  const dom = setup(); let resolve, controller;
  try {
    let first = true;
    controller = await mountProjectInventory(dom.window.document, () => { if (first) { first = false; return Promise.resolve(portfolioInventory()); } return new Promise(done => { resolve = done; }); });
    const pending = controller.refresh(); controller.destroy();
    resolve([portfolioInventory()[0]]); await pending;
    assert.equal(dom.window.document.querySelectorAll('.project-card').length, 73);
  } finally { dom.window.close(); }
});
