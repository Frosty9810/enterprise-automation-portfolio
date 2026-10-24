const statusTitles = {blocked:'Blocked by source and tool policy',pending_review:'Local review required',ready:'Ready for this local tool',rejected:'Rejected by local reviewer',executed:'Local tool executed'};
const stringify = value => typeof value === 'string' ? value : JSON.stringify(value);

export async function mountTrustGate(d, api, download = () => {}) {
  const $ = id => d.getElementById(id);
  const node = (tag, text) => { const element = d.createElement(tag); if (text !== undefined) element.textContent = String(text); return element; };
  let catalog = null, selected = null, current = null, busy = false, generation = 0, sequence = 0;
  function proposal() {
    const text = $('trustProposal').value;
    if (text.length > 30000) throw Error('Keep the proposal below 30,000 characters.');
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Use a JSON object for the proposal.');
    if (typeof value.tenant !== 'string' || !value.tenant.trim()) throw Error('The proposal needs a tenant fixture label.');
    return value;
  }
  const reviewer = () => catalog?.actors.find(actor => actor.id === $('trustReviewer').value && actor.id !== current?.actor && actor.tenant === current?.tenant && actor.roles?.includes('reviewer'));
  function controls() {
    for (const id of ['trustPrepare','trustRestore','trustRefresh','trustVerify']) $(id).disabled = busy || !catalog;
    $('trustScenario').disabled = !catalog;
    $('trustProposal').disabled = !catalog;
    $('trustExecute').disabled = busy || !current || current.stale || current.status !== 'ready';
    $('trustExport').disabled = busy || !current || current.stale;
    const reviewable = !busy && current?.status === 'pending_review' && !current.stale;
    const noteLength = $('trustReviewNote').value.trim().length;
    const accepted = reviewable && reviewer() && $('trustReviewAck').checked && noteLength > 0 && noteLength <= 500;
    $('trustApprove').disabled = !accepted;
    $('trustReject').disabled = !accepted;
    for (const id of ['trustReviewer','trustReviewNote','trustReviewAck']) $(id).disabled = !reviewable;
  }
  function json(host, value, title) {
    const details = node('details'); details.append(node('summary', title), node('pre', JSON.stringify(value, null, 2))); host.append(details);
  }
  function resetReview() { $('trustReviewAck').checked = false; $('trustReviewNote').value = ''; $('trustExpectedHash').value = ''; }
  function invalidate(message) {
    generation++; current = null; resetReview();
    $('trustReviewPanel').hidden = true;
    $('trustReceipt').replaceChildren(node('p', message));
    $('trustVerification').textContent = '';
    $('trustHistory').replaceChildren(node('h3','Saved receipts'),node('p','Refresh the selected tenant to inspect its saved receipts.'));
    $('trustEffects').replaceChildren(node('h3','Actual local state'),node('p','Refresh to inspect persisted local effects.'));
    $('trustAudit').replaceChildren(node('h3','Linked audit records'),node('p','Refresh to inspect persisted audit records.'));
    controls();
  }
  function inspectCatalog() {
    if (!catalog) return;
    let p; try { p = proposal(); } catch { p = selected?.proposal || {}; }
    const host = $('trustCatalog'); host.replaceChildren();
    const toolHost = node('section'); toolHost.className = 'catalog-section'; toolHost.append(node('h3','Selected tool and closed registry'),node('p','Only three tools are registered: ' + catalog.tools.map(tool=>tool.id).join(', ') + '.'));
    for (const tool of catalog.tools.filter(tool=>tool.id === p.tool)) {
      const card = node('article'); card.className = 'source-card';
      card.append(node('h3',tool.id),node('p',tool.title || tool.id),node('p',`${tool.mutation ? 'Local write' : 'Read only'} · destination: ${tool.sink || 'local SQLite'}`),node('p','Accepted arguments: ' + Object.keys(tool.args || {}).join(', ')));
      toolHost.append(card);
    }
    host.append(toolHost);
    const actors = node('section'); actors.className = 'catalog-section'; actors.append(node('h3','Registered actor grants'));
    for (const actor of catalog.actors.filter(actor => actor.tenant === p.tenant && actor.id === p.actor)) {
      const card = node('article'); card.className = 'source-card';
      card.append(node('h3',actor.id + (actor.id === p.actor ? ' · selected' : '')),node('p','Fixture roles: ' + (actor.roles || []).join(', ')),node('p','Tool grants: ' + ((actor.grants || []).map(stringify).join(', ') || 'none'))); actors.append(card);
    }
    host.append(actors);
    const sourceIds = new Set(Object.values(p.bindings || {}).map(bound=>bound?.sourceId));
    const sources = node('section'); sources.className = 'catalog-section'; sources.append(node('h3','Bound source values and labels'));
    for (const source of catalog.sources.filter(source=>sourceIds.has(source.id))) {
      const card = node('article'); card.className = 'source-card';
      card.append(node('h3',source.id),node('p','Tenant fixture: ' + source.tenant));
      for (const label of [source.trust,source.classification,source.instructionLike ? 'instruction-like content' : 'no instruction-like fixture flag']) { const tag=node('span',label); tag.className='label-tag';card.append(tag); }
      const keys = [...new Set(Object.values(p.bindings || {}).filter(bound=>bound?.sourceId === source.id).map(bound=>bound.key))];
      for (const key of keys) card.append(node('p',`${key}: ${stringify(source.values[key])}`));
      json(card,source.values,'Inspect all exact values from this source'); sources.append(card);
    }
    host.append(sources);
    json(host,{tools:catalog.tools,actors:catalog.actors,sources:catalog.sources},'Inspect the complete server-owned fixture catalog');
  }
  function showReceipt(receipt) {
    current = receipt; resetReview();
    const host = $('trustReceipt'); host.replaceChildren(node('p',statusTitles[receipt.status] || receipt.status)); host.firstElementChild.className = 'outcome';
    const facts = node('div'); facts.className = 'facts';
    for (const label of [receipt.stale ? 'Stale policy or source snapshot' : 'Current local snapshot',receipt.replayed ? 'Saved intent replayed' : 'Saved local receipt',`Tenant ${receipt.tenant}`,`Tool ${receipt.tool}`]) facts.append(node('span',label));
    host.append(facts,node('p',`Receipt ${receipt.id} · command ${receipt.commandId} · actor ${receipt.actor}`));
    const reasons = node('ul'); reasons.className = 'reason-list';
    for (const reason of receipt.reasons || []) reasons.append(node('li',typeof reason === 'string' ? reason : reason.message || reason.code || stringify(reason)));
    if (reasons.childElementCount) host.append(node('h3','Policy reasons'),reasons);
    host.append(node('h3','Resolved argument values'));
    json(host,receipt.arguments || {},'Inspect exact tool arguments');
    host.append(node('h3','Source-to-argument provenance'));
    const rows = Array.isArray(receipt.provenance) ? receipt.provenance : Object.entries(receipt.provenance || {}).map(([argument,value])=>({argument,...value}));
    if (rows.length) {
      const wrapper = node('div'); wrapper.className = 'table-wrap'; const table=node('table'),head=node('tr');
      for (const title of ['Argument / source key','Registered source','Resolved value','Server labels']) head.append(node('th',title)); table.append(head);
      for (const row of rows) {
        const tr = node('tr'), argument = row.argument || row.arg || row.name || '';
        tr.append(node('td',`${argument} ← ${row.key || row.sourceKey || ''}`),node('td',row.sourceId || ''),node('td',stringify(row.value ?? receipt.arguments?.[argument] ?? '')),node('td',[row.trust,row.classification,row.instructionLike ? 'instruction-like' : ''].filter(Boolean).join(' · '))); table.append(tr);
      }
      wrapper.append(table); host.append(wrapper);
    } else host.append(node('p','No source bindings resolved for this blocked proposal.'));
    if (receipt.review) json(host,receipt.review,'Inspect recorded local review');
    if (receipt.effect) { host.append(node('h3','Confirmed local effect')); json(host,receipt.effect,'Inspect the actual effect'); }
    json(host,receipt,'Inspect complete saved receipt and policy hash');
    $('trustReviewPanel').hidden = receipt.status !== 'pending_review' || receipt.stale;
    $('trustExpectedHash').value = receipt.proposalHash || '';
    $('trustReviewer').replaceChildren(node('option','Select a registered reviewer'));
    $('trustReviewer').firstElementChild.value = '';
    for (const actor of catalog.actors.filter(actor=>actor.id !== receipt.actor && actor.tenant === receipt.tenant && actor.roles?.includes('reviewer'))) { const option=node('option',actor.id);option.value=actor.id;$('trustReviewer').append(option); }
    $('trustExecuteHelp').textContent = receipt.stale ? 'This receipt is stale. Use a fresh command ID and prepare a new proposal.' : receipt.status === 'ready' ? 'This exact receipt is ready. Execution rechecks its saved identity and policy before performing one local tool effect.' : receipt.status === 'executed' ? 'The saved effect has already executed. Inspect its receipt and the persisted state below.' : 'Only a current, ready receipt can execute. Local writes require an approved review.';
    controls();
  }
  async function panels(tenant, revision) {
    const [history,state,audit] = await Promise.all([api('history',{tenant}),api('state',{tenant}),api('audit',{tenant})]);
    if (revision !== generation) return;
    const host = $('trustHistory'); host.replaceChildren(node('h3','Saved receipts'));
    const receipts = history.receipts || [];
    if (!receipts.length) host.append(node('p','No receipts saved for tenant ' + tenant + '.'));
    for (const receipt of receipts) {
      const entry=node('article');entry.className='history-entry';entry.append(node('p',`${receipt.id} · ${receipt.status}${receipt.stale ? ' · stale' : ''}`),node('p',`${receipt.commandId} · ${receipt.tool}`));
      const button=node('button','Inspect saved receipt');button.className='secondary';button.disabled=busy;
      button.addEventListener('click',()=>run('receipt',{tenant,receiptId:receipt.id},value=>{showReceipt(value);return 'Saved receipt rechecked against the current local policy.';}));entry.append(button);host.append(entry);
    }
    const effects=$('trustEffects');effects.replaceChildren(node('h3','Actual local state'),node('p',`${state.tasks?.length || 0} local review tasks · ${state.publicNotes?.length || 0} staged local public notes`));
    json(effects,state,'Inspect persisted local tasks and outbox');
    const auditHost=$('trustAudit');auditHost.replaceChildren(node('h3','Linked audit records'),node('p',`${audit.events?.length || 0} saved events for tenant ${tenant}.`));
    json(auditHost,audit,'Inspect complete linked audit events');
  }
  async function run(kind, body, display) {
    if (busy) return;
    const revision = generation;
    busy=true;controls();$('trustNotice').textContent='Running local ' + kind + '…';
    try {
      const value=await api(kind,body);
      if (revision !== generation) return;
      const message=await display(value,revision);
      if (revision === generation) $('trustNotice').textContent=message || 'Local ' + kind + ' complete.';
    } catch (error) {
      if (revision === generation) {
        if (kind === 'review' || kind === 'execute') {
          current=null;resetReview();$('trustReviewPanel').hidden=true;
          $('trustReceipt').replaceChildren(node('p','The operation did not return a confirmed receipt. Refresh history and inspect the saved receipt before continuing.'));
        }
        $('trustNotice').textContent=error.message || 'The local request failed. Try again or refresh saved history.';
      }
    } finally {
      busy=false;controls();
      for (const button of $('trustHistory').querySelectorAll('button')) button.disabled=false;
    }
  }
  function action(id,work) { $(id).addEventListener('click',()=>{ if (busy) return;try { work(); } catch (error) { $('trustNotice').textContent=error.message;controls(); } }); }
  function select(id) {
    selected=catalog?.scenarios.find(scenario=>scenario.id===id) || null;
    invalidate('Proposal changed. Prepare the new intent before reviewing or executing.');
    if (!selected) { $('trustProposal').value='';$('trustScenarioDescription').textContent='Choose a registered scenario.';return; }
    const input=structuredClone(selected.proposal);
    const random=d.defaultView.crypto?.randomUUID?.() || `${Date.now()}-${++sequence}`;
    input.commandId=`${input.commandId}-${random}`;
    $('trustProposal').value=JSON.stringify(input,null,2);$('trustScenario').value=selected.id;
    $('trustScenarioDescription').textContent=selected.description;
    $('trustNotice').textContent='Scenario loaded. Inspect registered values and grants, then prepare its proposal.';
    inspectCatalog();controls();
  }
  $('trustScenario').addEventListener('change',()=>select($('trustScenario').value));
  $('trustProposal').addEventListener('input',()=>{invalidate('Proposal edited. The previous review and receipt are no longer active in this view.');inspectCatalog();});
  for (const id of ['trustReviewer','trustReviewNote']) $(id).addEventListener(id === 'trustReviewNote' ? 'input' : 'change',()=>{$('trustReviewAck').checked=false;controls();});
  $('trustReviewAck').addEventListener('change',controls);
  action('trustRestore',()=>select(selected?.id));
  action('trustPrepare',()=>{
    const body=proposal();invalidate('Preparing this exact proposal. No tool effect has been performed.');
    run('prepare',body,async(receipt,revision)=>{showReceipt(receipt);await panels(body.tenant,revision);return 'Proposal prepared. ' + (statusTitles[receipt.status] || receipt.status) + '.';});
  });
  function review(decision) {
    if (!current || current.status !== 'pending_review' || current.stale || !reviewer() || !$('trustReviewAck').checked || !$('trustReviewNote').value.trim()) throw Error('Select a registered reviewer, write a decision note and acknowledge the exact local scope.');
    const body={tenant:current.tenant,receiptId:current.id,reviewer:$('trustReviewer').value,decision,note:$('trustReviewNote').value.trim(),expectedHash:current.proposalHash};
    $('trustReviewAck').checked=false;
    run('review',body,async(receipt,revision)=>{showReceipt(receipt);await panels(body.tenant,revision);return decision === 'approve' ? 'Local review recorded. Execute only if the server receipt is ready.' : 'Local rejection recorded. No tool effect was performed.';});
  }
  action('trustApprove',()=>review('approve'));action('trustReject',()=>review('reject'));
  action('trustExecute',()=>{
    if (!current || current.status !== 'ready' || current.stale) throw Error('Prepare a current, ready receipt before executing.');
    const body={tenant:current.tenant,receiptId:current.id};
    run('execute',body,async(receipt,revision)=>{showReceipt(receipt);await panels(body.tenant,revision);return receipt.status === 'executed' ? 'Local tool effect confirmed in its saved receipt.' : 'Execution did not produce a confirmed tool effect. Inspect the saved decision.';});
  });
  action('trustRefresh',()=>{
    const {tenant}=proposal();
    run('history',{tenant},async(_,revision)=>{if(current){const receipt=await api('receipt',{tenant,receiptId:current.id});if(revision!==generation)return;showReceipt(receipt);}await panels(tenant,revision);return 'Saved receipts, actual local state and audit records refreshed.';});
  });
  action('trustVerify',()=>{
    const {tenant}=proposal();
    run('verify-audit',{tenant},value=>{$('trustVerification').textContent=value.valid ? `Stored local audit chain valid · ${value.eventCount} events · head ${value.headHash || 'empty'}` : 'Stored audit verification failed: ' + (value.errors || []).map(stringify).join('; ');return 'Stored local audit verification complete.';});
  });
  action('trustExport',()=>{
    if (!current || current.stale) throw Error('Inspect a current saved receipt before exporting.');
    const body={tenant:current.tenant,receiptId:current.id};
    run('receipt',body,async(value,revision)=>{
      showReceipt(value);
      if(value.stale)throw Error('The saved policy or sources changed. Prepare a new command before exporting current evidence.');
      const verified = await api('verify-audit',{tenant:body.tenant});
      if(revision!==generation)return;
      if(!verified.valid)throw Error('The stored audit chain failed verification. This receipt cannot be exported as current evidence.');
      download(value);return 'Receipt and local audit chain rechecked, then receipt exported.';
    });
  });
  controls();
  try {
    catalog=await api('catalog');
    for(const scenario of catalog.scenarios){const option=node('option',scenario.title);option.value=scenario.id;$('trustScenario').append(option);}
    select(catalog.scenarios[0]?.id);
  } catch(error) {catalog=null;$('trustNotice').textContent=error.message || 'The local fixture catalog could not load. Reload this page to retry.';controls();}
  return {select};
}

if (typeof document !== 'undefined') mountTrustGate(document,async(kind,body)=>{
  const response=await fetch('/api/trustgate/' + kind,body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw Error(value.error || 'Local gateway request failed.');return value;
},value=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='TrustGate-' + value.id + '.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
