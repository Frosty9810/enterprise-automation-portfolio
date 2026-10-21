import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { JSDOM } from 'jsdom';
import { flagshipSuite, sourceManifest, sourceArtifact } from './flagship-suite.mjs';
import { mountFlagships } from './flagships-ui.mjs';
import { createLabServer, openStore } from './server.mjs';

test('explorer manifest covers every explicitly mapped source and changes with mapped policy bytes', () => {
    const explorer = sourceManifest('F06');
    for (let number = 1; number <= 12; number++) {
        for (const file of sourceManifest('F' + String(number).padStart(2, '0')).files)
            assert.ok(explorer.files.some(x => x.path === file.path), 'Missing ' + file.path);
    }
    const read = changed => path => Buffer.from(path + (path === 'engineering-evals.mjs' ? changed : ''));
    assert.notEqual(sourceManifest('F06', read('before')).hash, sourceManifest('F06', read('after')).hash);
    assert.equal(new Set(explorer.files.map(x => x.path)).size, explorer.files.length);
});

test('a mapped source change across restart invalidates old explorer review/export', async () => {
    const db = new DatabaseSync(':memory:');
    let revision = 'one';
    const manifest = id => ({ hash: id === 'F03' ? revision : id, files: [] });
    try {
        let suite = flagshipSuite(db, manifest);
        const support = await suite.evaluate('F03', suite.example('F03'));
        const map = await suite.evaluate('F06', {});
        suite.review(map.receiptId, 'Original analyst');
        revision = 'two';
        suite = flagshipSuite(db, manifest);
        assert.throws(() => suite.export(map.receiptId), /[Ss]ource/);
        assert.throws(() => suite.review(map.receiptId, 'Original analyst'), /[Ss]ource/);
        const fresh = await suite.evaluate('F06', {});
        const oldSupport = fresh.result.observed.find(x => x.receiptId === support.receiptId);
        assert.equal(oldSupport.sourceCurrent, false);
        assert.equal(oldSupport.sourceHash, 'one');
        assert.equal(oldSupport.currentSourceHash, 'two');
        suite.review(fresh.receiptId, 'New analyst');
        assert.equal(suite.export(fresh.receiptId).authority, 'reviewed_local_analysis_only');
    } finally { db.close(); }
});

test('live mapped source drift requires restart before a new explorer evaluation', async () => {
    const db = new DatabaseSync(':memory:');
    let revision = 'one';
    const suite = flagshipSuite(db, id => ({ hash: id === 'F03' ? revision : id, files: [] }));
    try {
        revision = 'two';
        await assert.rejects(suite.evaluate('F06', {}), /restart/);
        assert.equal(suite.history().length, 0);
    } finally { db.close(); }
});

test('every manifest file has an inspectable, hash-bound source URL', async t => {
    const db = openStore(':memory:'), server = createLabServer(db);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(async () => { await new Promise(r => server.close(r)); db.close(); });
    const base = 'http://127.0.0.1:' + server.address().port;
    const { projects } = await (await fetch(base + '/api/flagships/catalog')).json();
    for (const project of projects) {
        assert.equal(project.sources.length, project.source.files.length);
        for (const [index, source] of project.sources.entries()) {
            assert.equal(source.path, project.source.files[index].path);
            const response = await fetch(base + source.url);
            assert.equal(response.status, 200);
            const bytes = Buffer.from(await response.arrayBuffer());
            assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
            assert.equal(response.headers.get('x-source-sha256'), source.sha256);
            assert.deepEqual(bytes, readFileSync(sourceArtifact(project.id, index).path));
        }
    }
    const url = new URL(projects[0].sources[0].url, base);
    url.searchParams.set('sha256', '0'.repeat(64));
    const stale = await fetch(url);
    assert.equal(stale.status, 409);
    assert.match((await stale.json()).error, /[Ss]ource/);
    url.searchParams.set('sha256', 'invalid');
    assert.equal((await fetch(url)).status, 400);
    assert.equal((await fetch(base + '/api/flagships/source/F06/9999')).status, 404);
    assert.equal((await fetch(base + '/api/flagships/source/private/0')).status, 404);
});

async function renderExplorer(withHistory) {
    const db = new DatabaseSync(':memory:');
    let revision = 'before';
    const manifest = id => ({ hash: id === 'F03' ? revision : id, files: [] });
    let suite = flagshipSuite(db, manifest);
    if (withHistory) {
        await suite.evaluate('F03', suite.example('F03'));
        await suite.evaluate('F12', suite.example('F12'));
        revision = 'after';
        suite = flagshipSuite(db, manifest);
    }
    const dom = new JSDOM(readFileSync(new URL('./flagships.html', import.meta.url), 'utf8'));
    const api = async (kind, body) => kind === 'catalog' ? { projects: suite.catalog() }
        : kind === 'example' ? suite.example(body) : suite.evaluate(body.toolId, body.input);
    await mountFlagships(dom.window.document, api, () => {}, 'F06');
    dom.window.document.getElementById('evaluate').click();
    await new Promise(r => setImmediate(r));
    return { dom, document: dom.window.document, close() { dom.window.close(); db.close(); } };
}

test('explorer UI separates authored wiring from missing execution evidence', async () => {
    const x = await renderExplorer(false);
    try {
        assert.equal(x.document.querySelectorAll('.architecture-node').length, 12);
        assert.equal(x.document.querySelectorAll('[data-evidence-state="missing"]').length, 12);
        assert.match(x.document.getElementById('details').textContent, /Authored wiring/);
        assert.match(x.document.getElementById('details').textContent, /No saved evaluation/);
        assert.equal(x.document.querySelectorAll('[data-evidence-state="current"]').length, 0);
    } finally { x.close(); }
});

test('explorer UI exposes stale and current saved receipt metadata without raw JSON', async () => {
    const x = await renderExplorer(true);
    try {
        const stale = x.document.querySelector('[data-evidence-state="stale"]');
        const current = x.document.querySelector('[data-evidence-state="current"]');
        assert.ok(stale);
        assert.ok(current);
        assert.match(stale.textContent, /before/);
        assert.match(stale.textContent, /after/);
        assert.match(stale.textContent, /Stale execution evidence/);
        assert.match(current.textContent, /Current execution evidence/);
        assert.match(current.textContent, /Receipt/);
        assert.match(current.textContent, /Result SHA-256/);
    } finally { x.close(); }
});

test('exploring a mapped system resets the map acknowledgement and loads its own fixture', async () => {
    const x = await renderExplorer(true);
    try {
        x.document.getElementById('ack').checked = true;
        const support = [...x.document.querySelectorAll('.architecture-node')]
            .find(node => node.querySelector('strong').textContent.startsWith('F03'));
        support.querySelector('button').click();
        await new Promise(r => setImmediate(r));
        assert.match(x.document.getElementById('title').textContent, /Support Desk/);
        assert.ok(JSON.parse(x.document.getElementById('input').value).documents.length);
        assert.equal(x.document.getElementById('ack').checked, false);
        assert.equal(x.document.getElementById('export').disabled, true);
        assert.match(x.document.getElementById('summary').textContent, /Run this system/);
    } finally { x.close(); }
});
