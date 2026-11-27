const stories = {
  Lead: {
    title: 'A promising lead needs an accountable owner.',
    context: 'Northstar Labs has a high fit score and 420 employees. The sales team needs a consistent assignment rule and a reviewable reason for the owner change.',
    rule: 'The local rule proposes enterprise ownership when score is at least 80 and employees at least 200. Storage consent and field permission can hold the update.',
    discovery: 'How do you define a qualified account? Who owns exceptions? Where is storage consent recorded, and who can change assignment fields?',
    recommendation: 'Read the current CRM record, explain the assignment and require review before changing OwnerId. Keep the original event identity for retries.',
    fields: ['Company', 'Score', 'Employees', 'StorageConsent'],
  },
  Opportunity: {
    title: 'A proposal is waiting without a useful next step.',
    context: 'The Northstar expansion proposal has had no updated next step for nine days. Its current note is awaiting discovery notes. The account team needs a specific follow-up that preserves the commercial record.',
    rule: 'The local rule proposes a concrete NextStep when a proposal has gone at least seven days without an updated next step. The proposed change covers that field only.',
    discovery: 'What makes an opportunity stalled? Who should own follow-up? Which fields must automation leave under the account team’s control?',
    recommendation: 'Propose a next action from the current opportunity, keep the commercial fields visible and protect the update against a concurrent edit.',
    fields: ['StageName', 'DaysWithoutNextStep', 'NextStep', 'Amount'],
  },
  Case: {
    title: 'A critical service issue needs a reliable escalation.',
    context: 'A Northstar integration outage is critical. The service team needs an escalation owner and high priority, plus a safe recovery path when a saved update loses its response.',
    rule: 'Critical severity proposes High priority and an escalation owner. After a lost acknowledgement, reconcile the persisted effect before attempting another update.',
    discovery: 'What defines a critical case? Which queue owns escalation? How does an operator discover whether a timed-out write actually reached the CRM?',
    recommendation: 'Review Priority and OwnerId, persist the local update and exercise lost-response recovery. Reconciliation should confirm the existing effect.',
    fields: ['Severity', 'Priority', 'Status', 'OwnerId'],
  },
};
const labels = {
  Company: 'Company', Score: 'Fit score', Employees: 'Employees', StorageConsent: 'Storage consent',
  StageName: 'Stage', DaysWithoutNextStep: 'Days without next step', NextStep: 'Next step',
  Amount: 'Synthetic amount (USD)', Severity: 'Severity', Priority: 'Priority', Status: 'Status', OwnerId: 'Owner ID',
};
const statuses = {
  held: 'Held for review', pending_review: 'Review required', reviewed: 'Review recorded',
  retryable: 'Confirmed failure', stopped: 'Retry limit reached', uncertain: 'Response lost',
  completed: 'Update confirmed', no_change: 'No change proposed',
};

export async function mountRevenueInterview(document, api, download = () => {}) {
  const byId = id => document.getElementById(id);
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    node.textContent = String(text ?? '—');
    if (className) node.className = className;
    return node;
  };
  let story = 'Lead';
  let state = null;
  let record = null;
  let receipt = null;
  let busy = false;
  let needsVerify = false;
  let generation = 0;

  function notice(text, error = false) {
    byId('notice').textContent = text;
    byId('notice').dataset.error = String(error);
  }

  function controls() {
    byId('start-story').disabled = busy;
    byId('challenge').disabled = busy;
    byId('reviewer').disabled = busy || needsVerify;
    byId('outcome').disabled = busy || needsVerify;
    byId('acknowledge').disabled = busy || needsVerify;
    byId('evaluate').disabled = busy || !record || Boolean(receipt) || needsVerify;
    byId('review-controls').hidden = receipt?.status !== 'pending_review';
    byId('execution-controls').hidden = !['reviewed', 'retryable'].includes(receipt?.status);
    byId('approve').disabled = busy || needsVerify || receipt?.status !== 'pending_review' || !byId('acknowledge').checked;
    byId('apply').disabled = busy || needsVerify || !['reviewed', 'retryable'].includes(receipt?.status);
    for (const [id, visible] of [
      ['reconcile', receipt?.status === 'uncertain'],
      ['replay', receipt?.status === 'completed'],
      ['download', receipt?.status === 'completed'],
      ['verify', Boolean(state) && needsVerify],
    ]) {
      byId(id).hidden = !visible;
      byId(id).disabled = busy || (id !== 'verify' && needsVerify);
    }
    const step = !receipt ? 'signal' : receipt.status === 'pending_review' ? 'proposal'
      : ['reviewed', 'retryable'].includes(receipt.status) ? 'review' : 'receipt';
    for (const item of document.querySelectorAll('[data-step]')) {
      if (item.dataset.step === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    }
  }

  function render() {
    const description = stories[story];
    for (const key of Object.keys(stories)) byId('story-' + key).setAttribute('aria-pressed', String(key === story));
    byId('brief-title').textContent = description.title;
    byId('business-context').textContent = description.context;
    byId('discovery').textContent = description.discovery;
    byId('recommendation').textContent = description.recommendation;
    byId('rule').textContent = description.rule;
    const consentOption = byId('challenge').querySelector('option[value="consent_hold"]');
    consentOption.disabled = story !== 'Lead';
    const nextActions = {
      pending_review: 'Compare the fields, choose a reviewer and acknowledge the exact revision.',
      reviewed: 'Approval is saved. Choose a response scenario, then apply the update.',
      retryable: 'The write did not happen. One attempt remains under this review.',
      stopped: 'Both attempts failed before writing. Start a new walkthrough to investigate again.',
      uncertain: 'One update may already exist. Reconcile it before continuing.',
      completed: 'The update is confirmed. Replay to prove the saved effect is reused, or export the receipt.',
      held: 'The evidence blocks this update. Inspect the reason and start a fresh scenario.',
      no_change: 'The record requires no update under the selected rule.',
    };
    byId('next-action').textContent = needsVerify ? 'Reload saved evidence before taking another action.'
      : receipt ? nextActions[receipt.status] : record ? 'Prepare the proposal to inspect the exact fields.'
      : 'Choose a story and start a fresh walkthrough.';
    const recordBox = byId('record');
    recordBox.replaceChildren();
    if (record) {
      recordBox.append(make('h3', record.data.Name, 'record-name'));
      recordBox.append(make('p', record.object + ' · revision ' + record.revision, 'mono'));
      const facts = make('dl', '', 'facts');
      for (const field of description.fields) {
        const item = make('div', '');
        item.append(make('dt', labels[field]), make('dd', typeof record.data[field] === 'boolean'
          ? record.data[field] ? 'Recorded' : 'Missing' : record.data[field]));
        facts.append(item);
      }
      recordBox.append(facts);
    } else {
      recordBox.append(make('p', 'Start a fresh walkthrough to load the synthetic record.', 'support'));
    }
    const proposal = byId('proposal');
    proposal.replaceChildren();
    byId('status').textContent = receipt ? statuses[receipt.status] ?? receipt.status : 'Ready to begin';
    if (receipt) {
      proposal.append(make('p', receipt.reasons.map(reason => reason.replaceAll('_', ' ')).join(' · '), 'proposal-copy'));
      if (Object.keys(receipt.patch).length) {
        const table = make('table', '');
        const head = make('tr', '');
        for (const label of ['Field', 'Before evaluation', ['completed', 'uncertain'].includes(receipt.status) ? 'Saved update' : 'Proposed update']) head.append(Object.assign(make('th', label), { scope: 'col' }));
        const thead = make('thead', '');
        thead.append(head);
        const caption = make('caption', 'Reviewed field comparison');
        table.append(caption, thead);
        const body = make('tbody', '');
        for (const [field, value] of Object.entries(receipt.patch)) {
          const row = make('tr', '');
          row.append(Object.assign(make('th', labels[field] ?? field), { scope: 'row' }), make('td', receipt.before[field]), make('td', value));
          body.append(row);
        }
        table.append(body);
        proposal.append(table);
      }
      const reviewText = receipt.reviewer ? 'Review recorded by ' + receipt.reviewer + ' for revision ' + receipt.expectedRevision + '.'
        : 'Review required for record revision ' + receipt.expectedRevision + '.';
      proposal.append(make('p', reviewText, 'support'));
      if (receipt.status === 'held' || receipt.status === 'no_change') {
        proposal.append(make('p', 'The displayed fields are a draft. No update is authorized.', 'support'));
      }
      if (receipt.status === 'uncertain') {
        proposal.append(make('p', 'The effect is saved locally. Reconciliation checks the receipt against that effect.', 'support'));
      }
      byId('receipt-json').textContent = JSON.stringify(receipt, null, 2);
    } else {
      proposal.append(make('p', 'Prepare a proposal to inspect the exact fields, decision reason and review boundary.', 'proposal-copy'));
      byId('receipt-json').textContent = '';
    }
    byId('effects').textContent = receipt ? String(receipt.localEffects) : '—';
    byId('attempts').textContent = receipt ? String(receipt.attempts) : '—';
    byId('events').textContent = receipt ? String(receipt.history.length) : '—';
    byId('run-label').textContent = state ? 'RUN ' + state.runId.slice(0, 8) : '';
    byId('timeline').replaceChildren(...(receipt?.history ?? []).map(event =>
      make('li', event.kind.replaceAll('_', ' ') + ' → ' + event.status.replaceAll('_', ' '))));
    byId('technical').hidden = !receipt;
    controls();
  }

  function selectStory(next) {
    generation++;
    story = next;
    if (next !== 'Lead' && byId('challenge').value === 'consent_hold') byId('challenge').value = 'normal';
    byId('reviewer').value = 'revops-reviewer';
    byId('technical').open = false;
    state = record = receipt = null;
    busy = false;
    needsVerify = false;
    byId('acknowledge').checked = false;
    byId('outcome').value = next === 'Case' ? 'timeout_after' : 'success';
    notice('');
    render();
  }

  function validateState(value, expectedRun) {
    if (!value || typeof value.runId !== 'string' || !value.runId ||
        (expectedRun && value.runId !== expectedRun) ||
        !Array.isArray(value.records) || !Array.isArray(value.receipts) ||
        !value.records.every(item => item && typeof item.id === 'string' && item.data) ||
        !value.receipts.every(item => item && typeof item.receiptId === 'string') ||
        value.records.filter(item => item.object === story).length !== 1) {
      throw new Error('The saved state does not match this walkthrough.');
    }
  }

  function validateReceipt(value, savedState, expectedId) {
    const selected = savedState.records.find(item => item.object === story);
    const saved = savedState.receipts.find(item => item.receiptId === value?.receiptId);
    if (!value || value.runId !== savedState.runId || value.recordId !== selected.id ||
        value.before?.object !== story || (expectedId && value.receiptId !== expectedId) ||
        !saved || !Object.hasOwn(statuses, value.status)) {
      throw new Error('The returned receipt does not match the selected record.');
    }
    for (const field of ['runId', 'recordId', 'status', 'before', 'patch', 'expectedRevision',
      'sourceHash', 'reviewer', 'attempts', 'localEffects', 'history', 'reasons']) {
      if (JSON.stringify(value[field]) !== JSON.stringify(saved[field])) {
        throw new Error('The returned receipt differs from the saved decision.');
      }
    }
  }

  async function act(kind) {
    if (busy) return;
    const currentGeneration = generation;
    busy = true;
    render();
    notice('Checking the local record…');
    try {
      let body;
      if (kind === 'start') body = { scenario: byId('challenge').value };
      else if (kind === 'evaluate') body = { runId: state.runId, recordId: record.id };
      else if (kind === 'state') body = { runId: state.runId };
      else body = { receiptId: receipt.receiptId, profile: byId('reviewer').value, outcome: byId('outcome').value };
      const result = await api(kind, body);
      if (currentGeneration !== generation) return;
      if (kind === 'export') {
        validateReceipt(result, state, receipt.receiptId);
        if (result.authority !== 'local_simulation_only' || result.status !== 'completed') {
          throw new Error('A confirmed local receipt is required for export.');
        }
        download(result);
        notice('Confirmed local receipt exported.');
      } else if (kind === 'start') {
        validateState(result);
        state = result;
        record = state.records.find(item => item.object === story);
        if (!record) throw new Error('The selected record is missing from the local run.');
        receipt = null;
        needsVerify = false;
        byId('acknowledge').checked = false;
        notice('Fresh synthetic record loaded. Prepare the proposed change.');
      } else if (kind === 'state') {
        validateState(result, state.runId);
        const selected = result.records.find(item => item.object === story);
        const saved = result.receipts.find(item => item.recordId === selected.id);
        if (receipt && !saved) throw new Error('The saved receipt is missing. Reload evidence before continuing.');
        if (saved) validateReceipt(saved, result, receipt?.receiptId);
        state = result;
        record = state.records.find(item => item.object === story);
        receipt = state.receipts.find(item => item.recordId === record?.id) ?? null;
        needsVerify = false;
        byId('acknowledge').checked = false;
        notice('Reloaded the saved outcome. Inspect it before continuing.');
      } else {
        const refreshed = await api('state', { runId: state.runId });
        if (currentGeneration !== generation) return;
        validateState(refreshed, state.runId);
        validateReceipt(result, refreshed, kind === 'evaluate' ? null : receipt.receiptId);
        state = refreshed;
        record = state.records.find(item => item.object === story);
        receipt = result;
        needsVerify = false;
        byId('acknowledge').checked = false;
        notice(result.replayed ? 'The same receipt returned. The local effect count is unchanged.'
          : result.status === 'uncertain' ? 'The update is saved, but its response was lost. Reconcile before continuing.'
          : result.status === 'completed' ? 'The local update is confirmed. Replay it to inspect duplicate handling.'
          : result.status === 'reviewed' ? 'Review recorded. No local update has been applied yet.'
          : result.status === 'held' ? 'The supplied evidence holds this change. Inspect the reason.'
          : result.status === 'retryable' ? 'The failure was confirmed before the write. One retry remains.'
          : result.status === 'stopped' ? 'The retry limit is reached. Investigate before a fresh walkthrough.'
          : 'Proposal saved. Inspect the exact fields before reviewing.');
      }
    } catch (error) {
      if (currentGeneration !== generation) return;
      needsVerify = Boolean(state);
      const recovery = state ? ' Reload saved evidence before continuing.' : ' Start a fresh walkthrough to try again.';
      notice((error instanceof Error ? error.message : 'The local request failed.') + recovery, true);
    } finally {
      if (currentGeneration === generation) {
        busy = false;
        render();
        const focusId = needsVerify ? 'verify' : !state ? 'start-story'
          : !receipt ? 'evaluate' : receipt.status === 'pending_review' ? 'acknowledge'
          : ['reviewed', 'retryable'].includes(receipt.status) ? 'apply'
          : receipt.status === 'uncertain' ? 'reconcile'
          : receipt.status === 'completed' ? 'replay' : 'start-story';
        byId(focusId).focus();
      }
    }
  }

  for (const key of Object.keys(stories)) byId('story-' + key).addEventListener('click', () => selectStory(key));
  byId('challenge').addEventListener('change', () => selectStory(story));
  byId('acknowledge').addEventListener('change', controls);
  byId('reviewer').addEventListener('change', () => {
    byId('acknowledge').checked = false;
    controls();
  });
  for (const [id, kind] of [
    ['start-story', 'start'], ['evaluate', 'evaluate'], ['approve', 'review'], ['apply', 'execute'],
    ['reconcile', 'reconcile'], ['replay', 'execute'], ['verify', 'state'], ['download', 'export'],
  ]) {
    byId(id).addEventListener('click', () => {
      if (!byId(id).disabled) void act(kind);
    });
  }
  selectStory('Lead');
}

if (typeof document !== 'undefined') {
  void mountRevenueInterview(document, async (kind, body) => {
    const path = '/api/salesforce/' + kind + (kind === 'state' ? '?run=' + encodeURIComponent(body.runId) : '');
    const options = { signal: AbortSignal.timeout(10000) };
    if (kind !== 'state') {
      options.method = 'POST';
      options.headers = { 'Content-Type': 'application/json', 'X-Demo-Client': 'local-showcase' };
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The local request failed.');
    return result;
  }, result => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'revenueos-interview-receipt.json';
    anchor.click();
    URL.revokeObjectURL(url);
  });
}
