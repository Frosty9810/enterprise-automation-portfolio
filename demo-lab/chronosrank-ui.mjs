const describe = value => typeof value === 'string' ? value : JSON.stringify(value);
const messages = {retrieved:'Valid memories selected',abstained:'Abstained from retrieval'};

export async function mountChronosRank(d, api, download = () => {}) {
  const $ = id => d.getElementById(id);
  const node = (tag, text) => { const element=d.createElement(tag);if(text!==undefined)element.textContent=String(text);return element; };
  let catalog=null,current=null,busy=false,generation=0,sequence=0,requestId='',feedbackId='';
  const identity = prefix => `${prefix}-${d.defaultView.crypto?.randomUUID?.() || `${Date.now()}-${++sequence}`}`;
  const tenant = () => $('chronosTenant').value;
  const events = () => (catalog?.example.events || []).filter(event=>event.tenant===tenant());
  const queries = () => (catalog?.example.queries || []).filter(query=>query.request.tenant===tenant());
  function controls() {
    for(const id of ['chronosLoad','chronosRefresh','chronosAppend','chronosRestore','chronosRetrieve','chronosNewRequest','chronosVerify'])$(id).disabled=busy||!catalog;
    for(const id of ['chronosTenant','chronosEvent','chronosCase','chronosEntity','chronosAsOf','chronosQuery','chronosThreshold','chronosLimit'])$(id).disabled=!catalog;
    $('chronosLoad').disabled ||= !events().length;
    $('chronosRestore').disabled ||= !events().length;
    const active=current&&!current.stale;
    $('chronosExport').disabled=busy||!active;
    for(const id of ['chronosOutcome','chronosFeedbackNote'])$(id).disabled=busy||!active;
    const length=$('chronosFeedbackNote').value.trim().length;
    $('chronosFeedback').disabled=busy||!active||!length||length>500;
    for(const button of $('chronosHistory').querySelectorAll('button'))button.disabled=busy||!catalog;
  }
  function details(host,value,title) { const item=node('details');item.append(node('summary',title),node('pre',JSON.stringify(value,null,2)));host.append(item); }
  function invalidate(message,newIdentity=true) {
    generation++;current=null;feedbackId='';$('chronosFeedbackPanel').hidden=true;$('chronosFeedbackNote').value='';
    $('chronosReceipt').replaceChildren(node('p',message));
    $('chronosNotice').textContent=message;
    if(newIdentity){requestId=identity('query');$('chronosRequestId').textContent=requestId;}
    controls();
  }
  function resetHistory() {
    for(const [id,title] of [['chronosTimeline','Memory events'],['chronosHistory','Retrieval receipts'],['chronosFeedbackHistory','Saved feedback']])$(id).replaceChildren(node('h3',title),node('p','Refresh to inspect this tenant’s saved records.'));
    $('chronosVerification').textContent='';$('chronosAudit').replaceChildren();
    $('chronosWatermark').textContent='Ingestion watermark: refresh history to inspect.';
  }
  function renderReceipt(receipt) {
    current=receipt;feedbackId=identity('feedback');$('chronosFeedbackNote').value='';
    const host=$('chronosReceipt');host.replaceChildren(node('p',messages[receipt.status]||receipt.status));host.firstElementChild.className='outcome';
    const facts=node('div');facts.className='facts';
    for(const text of [`Tenant ${receipt.tenant}`,`As of ${receipt.asOf}`,receipt.stale?'Historical snapshot · memory or implementation changed':'Current memory snapshot',receipt.replayed?'Saved request replayed':'Saved retrieval receipt'])facts.append(node('span',text));
    host.append(facts,node('p',`Receipt ${receipt.id} · entity ${receipt.entity}`),node('p',`Query: ${receipt.query}`));
    const explanation=node('p',describe(receipt.explanation));host.append(explanation);
    host.append(node('h3',`Selected records · ${(receipt.selected||[]).length}`));
    if(!receipt.selected?.length)host.append(node('p','No memory selected. Inspect the exclusions and retrieval explanation before changing the query.'));
    for(const memory of receipt.selected||[]) {
      const card=node('article');card.className='memory-card';card.append(node('h3',memory.memoryId),node('p',memory.text),node('p',`Lexical token overlap: ${memory.score}% · entity ${memory.entity}`));
      card.append(node('p',`Recorded ${memory.recordedAt} · valid from ${memory.validFrom} · expires ${memory.expiresAt||'no scheduled expiry'}`),node('h3','Exact source provenance'),node('p',`Source ${memory.provenance?.sourceId||''}`));
      const quote=node('blockquote',memory.provenance?.quote||'');quote.className='quote';card.append(quote);host.append(card);
    }
    host.append(node('h3',`Excluded records · ${(receipt.excluded||[]).length}`));
    if(receipt.excluded?.length) {
      const wrapper=node('div');wrapper.className='table-wrap';const table=node('table');table.append(node('caption','Memory eligibility and selection reasons'));
      const head=node('tr');for(const text of ['Memory','Reason']){const th=node('th',text);th.scope='col';head.append(th);}table.append(head);
      for(const item of receipt.excluded){const row=node('tr');row.append(node('td',item.memoryId),node('td',describe(item.reason)));table.append(row);}wrapper.append(table);host.append(wrapper);
    } else host.append(node('p','No excluded records in this saved receipt.'));
    if(receipt.stale)host.append(node('p','The memory or implementation changed after this receipt was saved. This remains historical evidence; prepare a fresh request for a current snapshot.'));
    details(host,receipt,'Inspect the complete immutable retrieval receipt');
    $('chronosFeedbackPanel').hidden=receipt.stale;controls();
  }
  function renderHistory(history) {
    const timeline=$('chronosTimeline');timeline.replaceChildren(node('h3',`Memory events · ${history.events?.length||0}`));
    $('chronosWatermark').textContent='Ingestion watermark: '+(history.knowledgeWatermark||'no saved event or retrieval yet')+'.';
    if(!history.events?.length)timeline.append(node('p','No events for tenant '+tenant()+'. Append the synthetic timeline or one event.'));
    for(const event of history.events||[]) {
      const card=node('article');card.className='history-entry';card.append(node('h3',`${event.kind} · ${event.memoryId}`),node('p',event.text||'Explicit expiry event'),node('p',`Recorded ${event.recordedAt}${event.validFrom?' · valid from '+event.validFrom:''}${event.supersedes?' · supersedes '+event.supersedes:''}`));
      details(card,event,'Inspect exact saved event');timeline.append(card);
    }
    const host=$('chronosHistory');host.replaceChildren(node('h3',`Retrieval receipts · ${history.receipts?.length||0}`));
    if(!history.receipts?.length)host.append(node('p','No retrieval receipts for this tenant.'));
    for(const receipt of history.receipts||[]) {
      const item=node('article');item.className='history-entry';item.append(node('p',`${receipt.id} · ${receipt.status}${receipt.stale?' · historical snapshot':''}`),node('p',receipt.query||receipt.asOf||''));
      const button=node('button','Inspect saved receipt');button.className='secondary';button.disabled=busy;
      button.addEventListener('click',()=>run('receipt',{tenant:tenant(),receiptId:receipt.id},value=>{renderReceipt(value);return 'Saved receipt rechecked against the current local memory ledger.';}));item.append(button);host.append(item);
    }
    const feedback=$('chronosFeedbackHistory');feedback.replaceChildren(node('h3',`Saved feedback · ${history.feedback?.length||0}`));
    if(!history.feedback?.length)feedback.append(node('p','No feedback saved for this tenant.'));
    for(const item of history.feedback||[]){const entry=node('article');entry.className='history-entry';entry.append(node('p',`${item.outcome} · receipt ${item.receiptId}`),node('p',item.note));feedback.append(entry);}
    controls();
  }
  async function refresh(revision,scope=tenant()) {
    const history=await api('history',{tenant:scope});if(revision!==generation)return;renderHistory(history);
  }
  async function run(kind,body,display,preflight) {
    if(busy)return;
    const revision=generation;busy=true;controls();$('chronosNotice').textContent='Running local '+kind+'…';
    try {if(preflight&&!await preflight(revision))return;const result=await api(kind,body);if(revision!==generation)return;const message=await display(result,revision);if(revision===generation)$('chronosNotice').textContent=message||'Local '+kind+' complete.';}
    catch(error){if(revision===generation){if(['append','retrieve','feedback'].includes(kind))invalidate('The request did not return confirmed evidence. Refresh history to inspect any saved result.',false);$('chronosNotice').textContent=(error.message||'The local request failed.')+' Refresh history if the response was lost after a local write.';}}
    finally{busy=false;controls();}
  }
  function action(id,work) {$(id).addEventListener('click',()=>{if(busy)return;try{work();}catch(error){$('chronosNotice').textContent=error.message;controls();}});}
  function chooseQuery(id) {
    const sample=queries().find(query=>query.id===id);
    invalidate('Query changed. Run retrieval to inspect evidence for these exact fields.');
    if(!sample){for(const id of ['chronosEntity','chronosAsOf','chronosQuery'])$(id).value='';$('chronosCase').value='';return;}
    const body=sample.request;$('chronosCase').value=sample.id;
    for(const [id,key] of [['chronosEntity','entity'],['chronosAsOf','asOf'],['chronosQuery','query'],['chronosThreshold','threshold'],['chronosLimit','limit']])$(id).value=body[key];
  }
  function restoreEvent() {$('chronosEvent').value=events()[0]?JSON.stringify(events()[0],null,2):'';}
  function chooseTenant() {
    invalidate('Tenant changed. Run a retrieval for this fixture.');resetHistory();restoreEvent();
    $('chronosCase').replaceChildren();for(const query of queries()){const option=node('option',query.title);option.value=query.id;$('chronosCase').append(option);}chooseQuery(queries()[0]?.id);
    $('chronosExampleSummary').textContent=`${events().length} bundled synthetic events · ${queries().length} query cases for ${tenant()}. Appending is explicit; selecting a tenant performs no write.`;
    $('chronosNotice').textContent='Tenant fixture selected. Append its timeline or refresh its saved history.';controls();
  }
  $('chronosTenant').addEventListener('change',chooseTenant);
  $('chronosCase').addEventListener('change',()=>chooseQuery($('chronosCase').value));
  for(const id of ['chronosEntity','chronosAsOf','chronosQuery','chronosThreshold','chronosLimit'])$(id).addEventListener('input',()=>invalidate('Retrieval fields edited. Run this new request to inspect its evidence.'));
  $('chronosEvent').addEventListener('input',()=>invalidate('Event editor changed. Append explicitly, then retrieve a fresh memory snapshot.',false));
  for(const id of ['chronosOutcome','chronosFeedbackNote'])$(id).addEventListener(id==='chronosOutcome'?'change':'input',()=>{feedbackId=identity('feedback');controls();});
  action('chronosRestore',()=>{restoreEvent();invalidate('First example event restored. Appending an unchanged command safely replays its saved intent.',false);});
  action('chronosLoad',()=>{
    const batch=structuredClone(events()),scope=tenant();if(!batch.length)throw Error('No bundled events for this tenant.');
    invalidate('Appending the synthetic timeline. Earlier saved events can be inspected in history.');
    let index=0;
    run('append',batch[0],async(_,revision)=>{for(index=1;index<batch.length;index++){if(revision!==generation)return;await api('append',batch[index]);}await refresh(revision,scope);return `${batch.length} synthetic timeline commands confirmed. Repeated command IDs replay their existing events.`;});
  });
  action('chronosAppend',()=>{
    const text=$('chronosEvent').value;if(text.length>30000)throw Error('Keep an event below 30,000 characters.');
    const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Use a JSON object for one event.');
    if(body.tenant!==tenant())throw Error('The event tenant must match the selected fixture.');
    invalidate('Appending this exact event. Refresh history if the response is interrupted.');
    run('append',body,async(_,revision)=>{await refresh(revision,body.tenant);return 'Event command confirmed in the local ledger. Retrieve again for a current memory snapshot.';});
  });
  action('chronosRetrieve',()=>{
    const body={requestId,tenant:tenant(),entity:$('chronosEntity').value,query:$('chronosQuery').value,asOf:$('chronosAsOf').value,threshold:Number($('chronosThreshold').value),limit:Number($('chronosLimit').value)};
    invalidate('Retrieving against the supplied instant.',false);
    run('retrieve',body,async(receipt,revision)=>{renderReceipt(receipt);await refresh(revision,body.tenant);return receipt.stale?'Historical receipt replayed. Prepare a fresh request for these fields, then retrieve to inspect the current ledger.':(messages[receipt.status]||receipt.status)+'. Inspect exact provenance and exclusion reasons below.';},async revision=>{
      const history=await api('history',{tenant:body.tenant});if(revision!==generation)return false;renderHistory(history);
      if(!history.events.length)throw Error('Append the synthetic timeline or one event first. An empty retrieval would advance the ingestion watermark and prevent loading older examples.');
      return true;
    });
  });
  action('chronosNewRequest',()=>invalidate('New request identity prepared for the same fields. Click Retrieve at this instant to inspect the current ledger; the as-of time stays unchanged.'));
  action('chronosRefresh',()=>{
    const scope=tenant();run('history',{tenant:scope},async(history,revision)=>{renderHistory(history);if(current){const receipt=await api('receipt',{tenant:scope,receiptId:current.id});if(revision!==generation)return;renderReceipt(receipt);}return 'Saved events, receipts and feedback refreshed for this tenant.';});
  });
  action('chronosFeedback',()=>{
    if(!current||current.stale)throw Error('Inspect a current retrieval receipt before saving feedback.');
    const note=$('chronosFeedbackNote').value.trim();if(!note||note.length>500)throw Error('Write a feedback note between 1 and 500 characters.');
    const body={commandId:feedbackId,tenant:current.tenant,receiptId:current.id,outcome:$('chronosOutcome').value,note};
    run('feedback',body,async(_,revision)=>{await refresh(revision,body.tenant);return 'Feedback command confirmed for this exact receipt. It does not train a model.';});
  });
  action('chronosVerify',()=>run('verify-audit',{tenant:tenant()},value=>{$('chronosVerification').textContent=value.valid?`Stored local audit chain valid · ${value.eventCount} memory events · ${value.entryCount} linked entries · head ${value.head||'empty'}`:'Stored local audit verification failed.';details($('chronosAudit'),value,'Inspect the audit verification result');return 'Stored audit verification complete.';}));
  action('chronosExport',()=>{
    if(!current||current.stale)throw Error('Inspect a current saved receipt before exporting.');
    const body={tenant:current.tenant,receiptId:current.id};run('receipt',body,async(value,revision)=>{renderReceipt(value);if(value.stale)throw Error('The memory ledger changed or the implementation changed. Prepare a fresh request before exporting current evidence.');const verification=await api('verify-audit',{tenant:body.tenant});if(revision!==generation)return;if(!verification.valid)throw Error('The stored audit chain failed verification. Export was stopped.');download(value);return 'Receipt and stored audit chain rechecked, then receipt exported.';});
  });
  controls();
  try{catalog=await api('catalog');for(const id of catalog.tenants){const option=node('option',id);option.value=id;$('chronosTenant').append(option);}chooseTenant();}
  catch(error){catalog=null;$('chronosNotice').textContent=error.message||'The local memory catalog could not load. Reload to retry.';controls();}
  return {chooseTenant,chooseQuery};
}

if(typeof document!=='undefined')mountChronosRank(document,async(kind,body)=>{
  const response=await fetch('/api/chronosrank/'+kind,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'Local memory request failed.');return value;
},value=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='ChronosRank-'+value.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
