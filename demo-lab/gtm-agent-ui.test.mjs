import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createGtmAgent } from './gtm-agent.mjs';
import { mountGtmAgent } from './gtm-agent-ui.mjs';
import { openTrustGate } from './trustgate-core.mjs';

async function setup(t, decorate = api => api) {
  const gate = openTrustGate();
  const agent = createGtmAgent(gate);
  const html = readFileSync(new URL('./gtm-agent.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html);
  t.after(() => {
    dom.window.close();
    gate.close();
  });
  const { document, Event } = dom.window;
  const get = id => document.getElementById(id);
  const calls = [];
  let runNumber = 0;
  await mountGtmAgent(document, decorate(async (kind, body) => {
    calls.push({ kind, body });
    return kind === 'catalog' ? agent.catalog() : agent[kind](body);
  }), () => 'ui-test-' + ++runNumber);
  return {
    get, calls,
    select(id) {
      const field = get('scenario');
      field.value = id;
      field.dispatchEvent(new Event('change'));
    },
    async click(id) {
      assert.equal(get(id).disabled, false);
      get(id).click();
      await new Promise(resolve => setImmediate(resolve));
    },
    tasks: () => gate.state({ tenant: 'acme' }).tasks,
    receipt: () => JSON.parse(get('receipt-json').textContent),
  };
}

test('GTM shows the exact proposal and explicit review before a single replayable task', async t => {
  const view = await setup(t);
  assert.deepEqual(view.calls.map(call => call.kind), ['catalog']);
  assert.equal(view.get('execute').disabled, true);
  await view.click('propose');
  const proposal = view.receipt();
  assert.equal(proposal.status, 'pending_review');
  assert.match(view.get('receipt-summary').textContent, /estimates delivery on Friday/);
  assert.equal(view.get('task-count').textContent, '0');
  assert.equal(view.get('execute').disabled, true);
  await view.click('approve');
  assert.equal(view.calls.at(-1).body.expectedHash, proposal.proposalHash);
  assert.equal(view.receipt().status, 'ready');
  assert.equal(view.tasks().length, 0);
  await view.click('execute');
  const executed = view.receipt();
  assert.equal(executed.status, 'executed');
  assert.equal(view.get('task-count').textContent, '1');
  assert.equal(view.get('event-count').textContent, '3');
  assert.equal(view.get('integrity').textContent, 'Verified');
  await view.click('replay');
  assert.equal(view.receipt().id, executed.id);
  assert.equal(view.receipt().replayed, true);
  assert.equal(view.tasks().length, 1);
  assert.equal(view.get('event-count').textContent, '3');
});

test('GTM exposes the real blocked reason and never grants review or execution', async t => {
  const view = await setup(t);
  view.select('marked-instruction');
  await view.click('propose');
  assert.equal(view.receipt().status, 'blocked');
  assert.match(view.get('receipt-summary').textContent, /instruction-marked source is blocked/);
  assert.equal(view.get('approve').disabled, true);
  assert.equal(view.get('execute').disabled, true);
  assert.equal(view.tasks().length, 0);
});

test('GTM shared run uses the same fixed proposal as n8n and recovers a lost task response', async t => {
  let dropResponse = true;
  const view = await setup(t, api => async (kind, body) => {
    const result = await api(kind, body);
    if (kind === 'execute' && dropResponse) {
      dropResponse = false;
      throw Error('Simulated response loss after the ledger write.');
    }
    return result;
  });
  view.select('marked-instruction');
  await view.click('shared-run');
  assert.deepEqual(view.calls.at(-1).body, { scenarioId: 'supplier-signal', runId: 'n8n-synthetic-demo' });
  assert.equal(view.get('scenario').value, 'supplier-signal');
  await view.click('approve');
  await view.click('execute');
  assert.equal(view.tasks().length, 1);
  assert.equal(view.get('execute').disabled, true);
  assert.match(view.get('notice').textContent, /Verify audit/);
  await view.click('refresh-audit');
  assert.equal(view.receipt().status, 'executed');
  await view.click('replay');
  assert.equal(view.tasks().length, 1);
});

test('GTM holds approval when the returned audit is invalid', async t => {
  const view = await setup(t, api => async (kind, body) => {
    const result = await api(kind, body);
    if (kind === 'plan') result.audit.valid = false;
    return result;
  });
  await view.click('propose');
  assert.equal(view.receipt().status, 'pending_review');
  assert.equal(view.get('integrity').textContent, 'Failed');
  assert.match(view.get('notice').textContent, /Actions are held/);
  assert.equal(view.get('approve').disabled, true);
  assert.equal(view.get('execute').disabled, true);
  await view.click('refresh-audit');
  assert.equal(view.get('integrity').textContent, 'Verified');
  assert.equal(view.get('approve').disabled, false);
});
