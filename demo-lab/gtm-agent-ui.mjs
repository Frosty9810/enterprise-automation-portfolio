const eventLabels = { prepared: 'Proposal saved', reviewed: 'Review saved', executed: 'Task recorded' };

const outcomes = {
  blocked: ['Blocked by policy', 'bad', 'The proposed action is held.'],
  pending_review: ['Review required', 'warn', 'Inspect the task and source before recording your decision.'],
  ready: ['Approved', 'good', 'The review is saved. You can now create the local task.'],
  rejected: ['Rejected', 'bad', 'The reviewer declined this action.'],
  executed: ['Task recorded', 'good', 'The task and its receipt are saved in the local ledger.'],
};

function isReceipt(value, scenarioId, receiptId) {
  const receipt = value?.receipt;
  const audit = value?.audit;
  return value?.scenario?.id === scenarioId && receipt &&
    typeof receipt.id === 'string' && receipt.id.length > 0 &&
    (!receiptId || receipt.id === receiptId) &&
    Object.hasOwn(outcomes, receipt.status) &&
    /^[a-f0-9]{64}$/.test(receipt.proposalHash) &&
    typeof receipt.stale === 'boolean' &&
    Array.isArray(receipt.reasons) && receipt.reasons.every(reason => typeof reason === 'string') &&
    typeof audit?.valid === 'boolean' && typeof audit?.effectCount === 'number' && Number.isSafeInteger(audit.effectCount) && audit.effectCount >= 0 &&
    typeof audit?.eventCount === 'number' && Number.isSafeInteger(audit.eventCount) && audit.eventCount >= 0 &&
    Array.isArray(audit?.events) && audit.eventCount === audit.events.length &&
    audit.events.every(event => event && Number.isSafeInteger(event.seq) &&
      Object.hasOwn(eventLabels, event.type) && /^[a-f0-9]{64}$/.test(event.hash));
}

export async function mountGtmAgent(doc, api, makeRunId = () => globalThis.crypto.randomUUID()) {
  const byId = id => doc.getElementById(id);
  const element = (tag, text, className) => {
    const node = doc.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const actionIds = ['propose', 'approve', 'reject', 'execute', 'replay', 'refresh-audit', 'start-over', 'shared-run'];
  const steps = [...doc.querySelectorAll('[data-step]')];

  let scenarios = [];
  let scenario = null;
  let runId = null;
  let current = null;
  let busy = false;
  let verifyBeforeContinuing = false;

  function notice(text, isError = false) {
    byId('notice').textContent = text;
    byId('notice').dataset.tone = isError ? 'bad' : 'neutral';
  }

  function updateControls() {
    actionIds.forEach(id => { byId(id).disabled = true; });
    byId('scenario').disabled = busy || !scenario;
    const receipt = current?.receipt;
    const verified = !verifyBeforeContinuing && current?.audit.valid && !receipt.stale;
    const state = receipt?.status;
    byId('review-controls').hidden = state !== 'pending_review';
    byId('execute').hidden = state !== 'ready';
    byId('replay').hidden = state !== 'executed';
    byId('start-over').hidden = !current && !runId;
    if (!busy) {
      byId('propose').disabled = !scenario || Boolean(current);
      byId('start-over').disabled = !scenario;
      byId('shared-run').disabled = !scenarios.some(item => item.id === 'supplier-signal');
      byId('refresh-audit').disabled = !receipt;
      byId('approve').disabled = byId('reject').disabled = !verified || state !== 'pending_review';
      byId('execute').disabled = !verified || state !== 'ready';
      byId('replay').disabled = !verified || state !== 'executed';
    }
    const activeStep = !state ? 'signal' : ({ blocked: 'proposal', pending_review: 'review', ready: 'review', rejected: 'receipt', executed: 'receipt' })[state];
    steps.forEach((step, index) => {
      const active = step.dataset.step === activeStep;
      if (active) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
      step.dataset.done = String(index < steps.findIndex(node => node.dataset.step === activeStep));
    });
  }

  function selectScenario(id) {
    if (busy) return;
    scenario = scenarios.find(item => item.id === id) ?? null;
    byId('scenario').value = scenario?.id ?? '';
    runId = null;
    current = null;
    verifyBeforeContinuing = false;
    notice('');
    byId('outcome').textContent = 'Awaiting proposal';
    byId('outcome').dataset.tone = 'neutral';
    byId('signal-detail').replaceChildren();
    if (scenario) {
      byId('signal-detail').append(
        element('h3', scenario.title),
        element('p', scenario.signal),
        element('p', scenario.sourceId, 'source'),
        element('p', scenario.description),
      );
    }
    byId('receipt-summary').replaceChildren(
      element('h3', 'Start with a signal'),
      element('p', 'Prepare a proposal to see the task, its source, and the policy decision.'),
    );
    ['task-count', 'event-count', 'integrity'].forEach(id => { byId(id).textContent = '—'; });
    byId('audit-events').replaceChildren();
    byId('audit-events').hidden = true;
    for (const [panel, view] of [['technical', 'receipt-json'], ['audit-evidence', 'audit-json']]) {
      byId(panel).hidden = true;
      byId(panel).open = false;
      byId(view).textContent = '';
    }
    updateControls();
  }

  function render(result) {
    current = result;
    const { receipt, audit } = result;
    const [label, tone, description] = outcomes[receipt.status];
    byId('outcome').textContent = receipt.stale ? 'Stale receipt' : label;
    byId('outcome').dataset.tone = receipt.stale ? 'bad' : tone;
    const summary = byId('receipt-summary');
    const { title, summary: taskSummary, caseId } = receipt.arguments ?? {};
    summary.replaceChildren(
      element('h3', typeof title === 'string' ? title : 'Local CRM follow-up'),
      element('p', receipt.stale ? 'The saved evidence changed. Start a new run to prepare against the current source.' : description),
    );
    if (typeof taskSummary === 'string') summary.append(element('p', taskSummary));
    if (typeof caseId === 'string') summary.append(element('p', 'Target case · ' + caseId, 'source'));
    if (receipt.reasons.length) {
      const list = element('ul', '', 'fact-list');
      receipt.reasons.forEach(reason => list.append(element('li', reason)));
      summary.append(list);
    }
    const sources = [...new Set(Object.values(receipt.provenance ?? {}).map(item => item?.sourceId).filter(id => typeof id === 'string'))];
    if (sources.length) summary.append(element('p', 'Bound sources · ' + sources.join(', '), 'source'));
    summary.append(element('p', 'Proposal SHA-256 · ' + receipt.proposalHash.slice(0, 12) + '…', 'source'));
    if (receipt.effect) {
      const taskId = receipt.effect.taskId ?? receipt.effect.id;
      if (typeof taskId === 'string') summary.append(element('p', 'Local task · ' + taskId, 'source'));
    }
    byId('task-count').textContent = String(audit.effectCount);
    byId('event-count').textContent = String(audit.eventCount);
    byId('integrity').textContent = audit.valid ? 'Verified' : 'Failed';
    const events = byId('audit-events');
    events.replaceChildren(...audit.events.map(event => {
      const row = element('li', '');
      row.append(element('span', eventLabels[event.type]), element('code', '#' + event.seq + ' · ' + event.hash.slice(0, 12) + '…'));
      return row;
    }));
    events.hidden = audit.events.length === 0;
    byId('receipt-json').textContent = JSON.stringify(receipt, null, 2);
    byId('audit-json').textContent = JSON.stringify(audit, null, 2);
    byId('technical').hidden = byId('audit-evidence').hidden = false;
  }

  async function run(action, input) {
    if (busy || !scenario) return;
    busy = true;
    updateControls();
    notice('Checking the local ledger…');
    try {
      const result = await api(action, input);
      if (!isReceipt(result, scenario.id, action === 'plan' ? null : input.receiptId)) {
        throw new Error('The server did not return a matching receipt. Verify the saved outcome before continuing.');
      }
      verifyBeforeContinuing = false;
      render(result);
      if (!result.audit.valid) {
        notice('Audit verification failed. Actions are held.', true);
      } else if (result.receipt.stale) {
        notice('This receipt is stale. Start a new run to continue.', true);
      } else if (result.receipt.replayed && action === 'execute') {
        notice('Replay returned the saved receipt. The ledger did not add another task.');
      } else if (action === 'inspect') {
        notice('Saved receipt and audit verified.');
      } else {
        notice('');
      }
    } catch (error) {
      verifyBeforeContinuing = Boolean(current);
      const recovery = current ? ' Verify audit to reload the saved receipt.' : ' Retry preparation to reuse the same run ID.';
      notice((error instanceof Error ? error.message : 'The local request failed.') + recovery, true);
    } finally {
      busy = false;
      updateControls();
    }
  }

  byId('scenario').addEventListener('change', () => selectScenario(byId('scenario').value));
  byId('start-over').addEventListener('click', () => selectScenario(byId('scenario').value));
  byId('propose').addEventListener('click', () => {
    if (byId('propose').disabled) return;
    runId ??= makeRunId();
    void run('plan', { scenarioId: scenario.id, runId });
  });
  byId('shared-run').addEventListener('click', () => {
    if (byId('shared-run').disabled) return;
    selectScenario('supplier-signal');
    runId = 'n8n-synthetic-demo';
    void run('plan', { scenarioId: scenario.id, runId });
  });
  for (const [id, decision] of [['approve', 'approve'], ['reject', 'reject']]) {
    byId(id).addEventListener('click', () => {
      if (byId(id).disabled) return;
      const { id: receiptId, proposalHash: expectedHash } = current.receipt;
      void run('review', { receiptId, expectedHash, decision });
    });
  }
  for (const [id, action] of [['execute', 'execute'], ['replay', 'execute'], ['refresh-audit', 'inspect']]) {
    byId(id).addEventListener('click', () => {
      if (byId(id).disabled) return;
      void run(action, { receiptId: current.receipt.id });
    });
  }

  try {
    const catalog = await api('catalog');
    if (!Array.isArray(catalog?.scenarios) || !catalog.scenarios.length ||
        catalog.scenarios.some(item => !item || ['id', 'title', 'description', 'sourceId', 'signal'].some(field => typeof item[field] !== 'string'))) {
      throw new Error('The local signal catalog is unavailable.');
    }
    scenarios = catalog.scenarios;
    byId('scenario').replaceChildren(...scenarios.map(item => {
      const option = element('option', item.title);
      option.value = item.id;
      return option;
    }));
    selectScenario(scenarios[0].id);
  } catch {
    byId('signal-detail').replaceChildren(element('p', 'The local signal catalog is unavailable. Reload this page to try again.'));
  }
}

if (typeof document !== 'undefined') {
  void mountGtmAgent(document, async (action, input) => {
    const headers = { 'X-Demo-Client': 'local-showcase' };
    const options = { headers, signal: AbortSignal.timeout(10000) };
    if (input) {
      headers['Content-Type'] = 'application/json';
      options.method = 'POST';
      options.body = JSON.stringify(input);
    }
    const response = await fetch('/api/gtm/' + action, options);
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value?.error === 'string' ? value.error : 'The local request failed.');
    return value;
  });
}
