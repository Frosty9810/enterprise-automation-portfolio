import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { JSDOM } from 'jsdom';
import { mountFlagships } from './flagships-ui.mjs';
import { flagshipSuite } from './flagship-suite.mjs';
import { crossCheckFlagships } from './flagship-acceptance.mjs';
const flush = () => new Promise(r => setImmediate(r));
async function until(fn) { for (let i = 0; i < 300; i++) {
    if (fn())
        return;
    await new Promise(r => setTimeout(r, 10));
} throw Error('UI did not settle'); }
function setup() { const dom = new JSDOM(readFileSync(new URL('./flagships.html', import.meta.url), 'utf8')), db = new DatabaseSync(':memory:'), suite = flagshipSuite(db); let exported; const api = async (k, b) => k === 'catalog' ? { projects: suite.catalog() } : k === 'example' ? suite.example(b) : k === 'evaluate' ? suite.evaluate(b.toolId, b.input) : k === 'run-all' ? crossCheckFlagships(suite) : k === 'review' ? suite.review(b.receiptId, b.actor) : suite.export(b.receiptId); return { dom, db, suite, api, d: dom.window.document, download: x => { exported = x; }, exported: () => exported, close() { dom.window.close(); db.close(); } }; }
test('all twelve UI cards execute distinct sources and render readable domain evidence', async () => { const x = setup(); try {
    await mountFlagships(x.d, x.api, x.download);
    const expected = ['local flow completed', 'incident resolved', 'answer review', 'fixture gate passed', 'draft payable', 'source map', 'simulated merge reversed', 'auto publish', 'communication suppressed', 'invoice review', 'dispatcher review', 'regression gate passed'];
    for (let i = 0; i < 12; i++) {
        x.d.querySelectorAll('.project')[i].click();
        await flush();
        x.d.getElementById('evaluate').click();
        await until(() => !x.d.getElementById('evaluate').disabled);
        assert.match(x.d.getElementById('summary').textContent, new RegExp(expected[i]));
        assert.ok(x.d.getElementById('details').textContent.length > 10);
        assert.equal(x.d.getElementById('export').disabled, true);
    }
    x.d.getElementById('runAll').click();
    await until(() => !x.d.getElementById('runAll').disabled);
    assert.equal(x.d.getElementById('checked').textContent, '12/12');
    assert.equal(x.d.getElementById('checkCount').textContent, '48/48');
}
finally {
    x.close();
} });
test('analysis acknowledgement gates export, editing invalidates evidence, malformed input recovers', async () => { const x = setup(); try {
    await mountFlagships(x.d, x.api, x.download, 'F07');
    x.d.getElementById('evaluate').click();
    await until(() => !x.d.getElementById('evaluate').disabled);
    assert.equal(x.d.getElementById('review').disabled, true);
    x.d.getElementById('ack').checked = true;
    x.d.getElementById('ack').dispatchEvent(new x.dom.window.Event('change'));
    x.d.getElementById('review').click();
    await flush();
    x.d.getElementById('export').click();
    await flush();
    assert.equal(x.exported().authority, 'reviewed_local_analysis_only');
    const input = x.d.getElementById('input');
    input.value = '{';
    input.dispatchEvent(new x.dom.window.Event('input'));
    assert.equal(x.d.getElementById('export').disabled, true);
    x.d.getElementById('evaluate').click();
    await flush();
    assert.match(x.d.getElementById('notice').textContent, /JSON|property/i);
    assert.equal(x.d.getElementById('evaluate').disabled, false);
    x.d.getElementById('reset').click();
    await flush();
    assert.ok(JSON.parse(input.value).records);
}
finally {
    x.close();
} });
test('late evaluation and fixture responses cannot overwrite a newer project', async () => { const x = setup(); let finish, fixture; try {
    const api = (k, b) => k === 'evaluate' ? new Promise(r => { finish = r; }) : k === 'example' && b === 'F03' ? new Promise(r => { fixture = r; }) : x.api(k, b);
    await mountFlagships(x.d, api, x.download);
    x.d.getElementById('evaluate').click();
    x.d.querySelectorAll('.project')[2].click();
    assert.equal(x.d.getElementById('input').disabled, true);
    x.d.querySelectorAll('.project')[9].click();
    await flush();
    finish({ result: { action: 'obsolete' }, input: {} });
    fixture(x.suite.example('F03'));
    await flush();
    assert.match(x.d.getElementById('title').textContent, /Usage/);
    assert.ok(JSON.parse(x.d.getElementById('input').value).priceCents);
    assert.doesNotMatch(x.d.getElementById('summary').textContent, /obsolete/);
    assert.equal(x.d.getElementById('evaluate').disabled, false);
}
finally {
    x.close();
} });
