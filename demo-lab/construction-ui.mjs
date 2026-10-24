let sequence = 0;
const freshId = kind => `con-ui-${kind}-${Date.now()}-${++sequence}`;
const money = cents => Number.isSafeInteger(cents) && cents >= 0 ? `$${BigInt(cents) / 100n}.${String(BigInt(cents) % 100n).padStart(2,'0')} USD` : 'No amount';

export async function mountConstruction(d, api, download = value => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'}));
  const a=d.createElement('a');a.href=url;a.download='construction-order-snapshot.json';a.click();URL.revokeObjectURL(url);
}) {
  const $=id=>d.getElementById(id), commands=new Map(), latestDocumentVersions=new Map();
  const element=(tag,text,className)=>{const e=d.createElement(tag);e.textContent=String(text ?? '');if(className)e.className=className;return e;};
  const command=(kind,body,revision)=>{const key=JSON.stringify([kind,body,revision]);if(!commands.has(key))commands.set(key,freshId(kind));return {...body,commandId:commands.get(key)};};
  let catalog, currentDocument=null, currentOrder=null, draftEdited=false, busy=false, generation=0;
  const contextKey=site=>`${site.tenant}:${site.id}:${site.subcontractorId}`;
  const context=()=>catalog.sites.find(site=>contextKey(site)===$('conContext').value);
  const selector=()=>{const site=context();return {tenant:site.tenant,siteId:site.id,subcontractorId:site.subcontractorId};};
  const actor=(group,tenant=context().tenant)=>catalog.actors[group].find(value=>value.startsWith(`${tenant}-`));
  const note=id=>$(id).value.trim();
  const notice=text=>{$('conNotice').textContent=text;};
  const documentGroup=value=>[value.tenant,value.siteId,value.subcontractorId,value.kind].join('|');
  const latestDocument=()=>currentDocument&&latestDocumentVersions.get(documentGroup(currentDocument))===currentDocument.version;
  function rememberDocuments(rows) {for(const row of rows){const key=documentGroup(row);latestDocumentVersions.set(key,Math.max(latestDocumentVersions.get(key)??0,row.version));}}
  const exactOrder=()=>currentOrder&&!currentOrder.stale&&!draftEdited;
  const buttons=['conSubmitDocument','conRestoreDocument','conVerifyDocument','conRevokeDocument','conReadiness','conCreateOrder','conReviseOrder','conRestoreOrder','conApproveOrder','conRejectOrder','conCommit','conExport','conRefresh','conVerifyAudit'];
  function controls() {
    for(const id of buttons)$(id).disabled=!catalog||busy;
    for(const id of ['conCompliance','conDocumentNote','conReviewRole','conOrderReviewer','conOrderNote','conDocumentAck','conOrderAck'])$(id).disabled=!catalog||busy;
    $('conVerifyDocument').disabled=busy||!currentDocument||currentDocument.stale||!latestDocument()||!$('conDocumentAck').checked||!note('conDocumentNote');
    $('conRevokeDocument').disabled=$('conVerifyDocument').disabled||currentDocument?.status!=='verified';
    $('conReviseOrder').disabled=busy||!currentOrder||currentOrder.stale||currentOrder.status==='committed';
    for(const id of ['conApproveOrder','conRejectOrder'])$(id).disabled=busy||!exactOrder()||currentOrder.status==='committed'||!currentOrder.readiness?.ready||!$('conOrderAck').checked||!note('conOrderNote');
    $('conCommit').disabled=busy||!exactOrder()||currentOrder.status!=='ready';
    $('conExport').disabled=busy||!exactOrder();
    for(const id of ['conDocumentHistory','conOrderHistory'])$(id).querySelectorAll('button').forEach(button=>button.disabled=busy);
  }
  function facts(values) {const list=element('dl','','facts');for(const [label,value]of values)list.append(element('dt',label),element('dd',value));return list;}
  function stale(box,value) {if(value.stale)box.append(element('p','Historical evidence: source or configuration changed. This saved revision is read-only. Restart with current sources and prepare new reviewed evidence; existing approvals cannot authorize a new action.','hold'));}
  function adopt(value) {
    const match=catalog.sites.find(site=>site.tenant===value.tenant&&site.id===value.siteId&&site.subcontractorId===value.subcontractorId);
    if(match&&$('conContext').value!==contextKey(match)){currentDocument=null;currentOrder=null;$('conContext').value=contextKey(match);populateExamples();}
  }
  function renderDocument(value) {
    adopt(value);currentDocument=value;$('conDocumentAck').checked=false;
    $('conCompliance').value=actor('compliance',value.tenant);
    const box=$('conDocumentReceipt');box.replaceChildren(element('h3',`${value.kind} | version ${value.version} | ${value.status}`));stale(box,value);
    const latest=latestDocumentVersions.get(documentGroup(value));
    if(latest>value.version)box.append(element('p',`Historical / Superseded document version ${value.version}: current known version is ${latest}. This source is read-only; recover the latest document for verification or revocation.`,'hold'));
    else if(latest!==value.version)box.append(element('p','Latest document version has not been established. Refresh saved evidence before verification or revocation.','hold'));
    box.append(facts([['Document ID',value.documentId],['Document revision',value.revision],['Supplied source',`${value.channel} | ${value.reference}`],['Source ID',value.sourceId],['Scope',`${value.tenant} / ${value.siteId} / ${value.subcontractorId}`],['Received / exclusive expiry',`${value.receivedAt} / ${value.validUntil}`],['Exact review hash',value.contentHash],['Supplied UTF-8 content SHA-256',value.sourceContentHash],['Review',value.review?`${value.review.reviewer} | ${value.review.decision} | ${value.review.note}`:'No fixture verification recorded']]));
    box.append(element('h3','Supplied source content'),element('div',value.content,'source-text'));controls();
  }
  function renderReadiness(value) {
    const box=$('conReadinessReceipt');box.replaceChildren(element('p',value.ready?'Current fixture document gate is ready. This is not site-work authorization.':'Local commitment is held by document evidence.',value.ready?'pass':'hold'));
    box.append(element('p',`As of ${value.asOf} | ${value.tenant ?? context().tenant} / ${value.siteId} / ${value.subcontractorId}`));
    for(const reason of value.reasons ?? [])box.append(element('p',typeof reason==='string'?reason:JSON.stringify(reason),'hold'));
    for(const doc of value.documents ?? [])box.append(element('p',`${doc.kind} | v${doc.version} | ${doc.status} | exclusive expiry ${doc.validUntil} | ${doc.documentId}`));
  }
  function renderOrder(value,{keepDraft=false}={}) {
    const retainedDraft=keepDraft&&draftEdited;
    adopt(value);currentOrder=value;draftEdited=retainedDraft;$('conOrderAck').checked=false;populateOrderReviewers();
    const box=$('conOrderReceipt');box.replaceChildren(element('h3',`${value.orderId} | ${value.status}`));stale(box,value);
    box.append(facts([['Version / revision',`${value.version} / ${value.revision}`],['Scope',value.scope],['Amount',money(value.amountCents)],['Schedule impact',`${value.scheduleImpactDays} days (supplied scenario estimate)`],['Requester',value.requester],['Source issue / provenance',`${value.sourceIssueId} | ${value.channel} | ${value.reference}`],['Exact review fingerprint',value.reviewHash],['Project manager review',JSON.stringify(value.reviews?.project_manager ?? null)],['Finance review',JSON.stringify(value.reviews?.finance ?? null)],['Local commitment',value.commitment?JSON.stringify(value.commitment):'No budget commitment recorded']]));
    box.append(element('h3','Supplied change source'),element('div',value.content,'source-text'));
    if(value.readiness)renderReadiness(value.readiness);
    if(draftEdited)box.append(element('p','Unsaved editor changes are retained. Save a revision or explicitly recover the saved order before approval, commitment or export.','hold'));
    if(value.status==='committed')box.append(element('p','Historical local cost commitment. Later document holds do not erase this record; inspect current readiness separately.'));
    controls();
  }
  function history(kind,rows) {
    const documents=kind==='document',box=$(documents?'conDocumentHistory':'conOrderHistory');box.replaceChildren(element('h3',documents?'Document versions':'Saved change orders'));
    const list=element('div','','history-list');
    for(const row of rows){const button=element('button',documents?`${row.kind} | v${row.version} | ${row.status} | ${row.documentId}`:`${money(row.amountCents)} | v${row.version} | ${row.status} | ${row.orderId}`);button.type='button';button.disabled=busy;
      button.addEventListener('click',()=>{if(busy)return;generation++;if(documents)currentDocument=null;else currentOrder=null;controls();run(async()=>{if(!documents)return api('receipt',{tenant:row.tenant,orderId:row.orderId});const receipt=await api('document-receipt',{tenant:row.tenant,documentId:row.documentId}),saved=await api('history',{tenant:row.tenant});return {receipt:saved.documents.find(doc=>doc.documentId===receipt.documentId&&doc.revision>=receipt.revision)??receipt,documents:saved.documents};},value=>{if(documents){rememberDocuments(value.documents);renderDocument(value.receipt);}else{renderOrder(value);prefillRevision(value);}},row.tenant);});list.append(button);}
    box.append(list);
  }
  function renderState(value) {
    const budgets=$('conBudgets');budgets.replaceChildren();
    for(const budget of value.budgets ?? []){const card=element('div','','budget-card');card.append(element('h3',budget.siteId),element('p','Remaining local fixture budget'),element('strong',money(budget.remainingCents)),element('p',`Committed ${money(budget.committedCents)} of ${money(budget.budgetCents)}`));budgets.append(card);}
    const box=$('conCommitments');box.replaceChildren(element('h3',`Actual local cost ledger | ${value.commitments.length} entries`));
    for(const row of value.commitments)box.append(element('div',JSON.stringify(row),'source-text'));
    $('conState').replaceChildren(element('pre',JSON.stringify(value,null,2)));
  }
  async function evidence(tenant,token) {
    const [saved,state,audit,readiness]=await Promise.all([api('history',{tenant}),api('state',{tenant}),api('audit',{tenant}),api('readiness',selector())]);
    if(token!==generation)return;
    rememberDocuments(saved.documents);
    if(currentOrder){
      const selected=currentOrder;
      const identity=value=>JSON.stringify([value.revision,value.reviewHash,value.status,value.stale,value.readiness?.ready]);
      const candidates=[saved.orders.find(row=>row.orderId===selected.orderId),state.orders.find(row=>row.orderId===selected.orderId)];
      const readinessChanged=selected.siteId===readiness.siteId&&selected.subcontractorId===readiness.subcontractorId&&selected.readiness?.ready!==readiness.ready;
      if(readinessChanged||candidates.some(row=>!row||identity(row)!==identity(selected))){
        currentOrder=null;$('conOrderAck').checked=false;
        $('conOrderReceipt').replaceChildren(element('p','Fresh saved evidence changed the selected order. Recover its current snapshot before approval, commitment or export. Unsaved editor text is retained.'));
      }
    }
    if(currentDocument){const fresh=saved.documents.find(doc=>doc.documentId===currentDocument.documentId&&doc.revision>=currentDocument.revision);renderDocument(fresh??currentDocument);}
    history('document',saved.documents);history('order',saved.orders);renderState(state);renderReadiness(readiness);$('conAudit').replaceChildren(element('pre',JSON.stringify(audit,null,2)));
  }
  async function run(work,display,tenant) {
    if(busy)return;const token=generation;busy=true;controls();notice('Inspecting the durable local record...');
    try {const value=await work();if(token!==generation)return;if(display)display(value);if(tenant)await evidence(tenant,token);if(token===generation)notice('Local operation recorded or read. Inspect source versions, holds and actual ledger effects below.');}
    catch(error){if(token===generation){currentDocument=null;currentOrder=null;$('conDocumentAck').checked=false;$('conOrderAck').checked=false;$('conOrderReceipt').replaceChildren(element('p','Current authority was not established. Refresh saved evidence and recover the intended order before acting.'));notice(`Operation could not establish current state: ${error.message}. Refresh and recover; an unchanged intake retry reuses its original command.`);}}
    finally{busy=false;controls();}
  }
  function examples(type) {const site=context();return catalog[type==='document'?'documentExamples':'orderExamples'].filter(row=>row.input.tenant===site.tenant&&row.input.siteId===site.id&&row.input.subcontractorId===site.subcontractorId);}
  function populateExamples() {
    for(const type of ['document','order']){const select=$(type==='document'?'conDocumentExample':'conOrderExample');select.replaceChildren();for(const row of examples(type)){const option=element('option',row.title);option.value=row.id;select.append(option);}}
  }
  function restore(type) {
    generation++;const doc=type==='document';if(doc){currentDocument=null;invalidateOrderForDocument();}else{currentOrder=null;draftEdited=false;}
    const row=examples(type).find(example=>example.id===$(doc?'conDocumentExample':'conOrderExample').value);if(!row){notice('No supplied fixture for this context.');controls();return;}
    const input=structuredClone(row.input);input.commandId=freshId(doc?'document':'order');const key=doc?'sourceId':'sourceIssueId';input[key]=`${input[key].slice(0,55)}-${Date.now()}-${++sequence}`;
    $(doc?'conDocumentInput':'conOrderInput').value=JSON.stringify(input,null,2);$(doc?'conDocumentAck':'conOrderAck').checked=false;
    $(doc?'conDocumentReceipt':'conOrderReceipt').replaceChildren(element('p','Illustrative fixture restored as a new intake intent. The JSON editor is authoritative; the accepted source appears after saving.'));
    controls();notice('Fixture restored as a new intent. Inspect its supplied fields before saving.');
  }
  function populateOrderReviewers() {
    if(!catalog)return;const group=$('conReviewRole').value==='finance'?'finance':'projectManagers',tenant=currentOrder?.tenant??context().tenant;
    $('conOrderReviewer').replaceChildren();for(const value of catalog.actors[group].filter(name=>name.startsWith(`${tenant}-`))){const option=element('option',value);option.value=value;$('conOrderReviewer').append(option);}
  }
  function prefillRevision(order) {
    $('conOrderInput').value=JSON.stringify({tenant:order.tenant,actor:actor('operators',order.tenant),siteId:order.siteId,subcontractorId:order.subcontractorId,sourceIssueId:order.sourceIssueId,scope:order.scope,amountCents:order.amountCents,scheduleImpactDays:order.scheduleImpactDays,channel:order.channel,reference:order.reference,content:order.content,receivedAt:order.receivedAt},null,2);
  }
  function input(type) {const value=JSON.parse($(type==='document'?'conDocumentInput':'conOrderInput').value);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Intake must be a JSON object.');return value;}
  $('conContext').addEventListener('change',()=>{generation++;currentDocument=null;currentOrder=null;draftEdited=false;populateExamples();restore('document');restore('order');populateOrderReviewers();$('conReadinessReceipt').replaceChildren(element('p','Context changed. Refresh the readiness snapshot for this site.'));for(const id of ['conDocumentHistory','conOrderHistory','conBudgets','conCommitments','conState','conAudit'])$(id).replaceChildren();});
  for(const type of ['document','order']){
    const doc=type==='document';$(doc?'conDocumentExample':'conOrderExample').addEventListener('change',()=>restore(type));$(doc?'conRestoreDocument':'conRestoreOrder').addEventListener('click',()=>restore(type));
    $(doc?'conDocumentInput':'conOrderInput').addEventListener('input',()=>{generation++;$(doc?'conDocumentAck':'conOrderAck').checked=false;if(doc){currentDocument=null;invalidateOrderForDocument();$('conDocumentReceipt').replaceChildren(element('p','Document input changed. Save or recover its accepted source before review.'));}else{draftEdited=true;$('conOrderReceipt').replaceChildren(element('p','Draft edits are not saved. Save a revision of the selected order, or recover its saved version before approval, commitment or export.'));}controls();});
    $(doc?'conSubmitDocument':'conCreateOrder').addEventListener('click',()=>{if(busy)return;generation++;if(doc){currentDocument=null;invalidateOrderForDocument();}else currentOrder=null;controls();let body;try{body=input(type);if(!body.commandId)throw Error('Restore an example for a new intake command, or save the selected order as a revision.');}catch(error){notice(error.message);return;}run(()=>api(doc?'submit-document':'create-order',body),doc?value=>{renderDocument(value);invalidateOrderForDocument();}:renderOrder,body.tenant);});
  }
  for(const id of ['conCompliance','conDocumentNote','conReviewRole','conOrderReviewer','conOrderNote'])for(const type of ['input','change'])$(id).addEventListener(type,()=>{$('conDocumentAck').checked=false;$('conOrderAck').checked=false;if(id==='conReviewRole')populateOrderReviewers();controls();});
  for(const id of ['conDocumentAck','conOrderAck'])$(id).addEventListener('change',controls);
  function invalidateOrderForDocument() {$('conOrderAck').checked=false;if(currentOrder){currentOrder=null;$('conOrderReceipt').replaceChildren(element('p','Document evidence changed. Recover the order to inspect its new readiness and review fingerprint.'));}}
  function reviewDocument(decision) {if(busy)return;invalidateOrderForDocument();controls();if(!currentDocument||currentDocument.stale||!latestDocument())return;const saved=currentDocument;const body=command('review-document',{tenant:saved.tenant,documentId:saved.documentId,reviewer:$('conCompliance').value,expectedHash:saved.contentHash,expectedRevision:saved.revision,decision,note:note('conDocumentNote')},saved.revision);run(()=>api('review-document',body),value=>{renderDocument(value);invalidateOrderForDocument();},saved.tenant);}
  $('conVerifyDocument').addEventListener('click',()=>reviewDocument('verify'));$('conRevokeDocument').addEventListener('click',()=>reviewDocument('revoke'));
  $('conReviseOrder').addEventListener('click',()=>{if(busy||!currentOrder)return;const saved=currentOrder;let draft;try{draft=input('order');if(draft.tenant!==saved.tenant||draft.siteId!==saved.siteId||draft.subcontractorId!==saved.subcontractorId||draft.sourceIssueId!==saved.sourceIssueId)throw Error('A revision must keep the selected saved order context and source issue.');}catch(error){notice(error.message);return;}
    const fields=Object.fromEntries(['scope','amountCents','scheduleImpactDays','channel','reference','content','receivedAt'].map(key=>[key,draft[key]]));
    const body=command('revise-order',{tenant:saved.tenant,actor:actor('operators',saved.tenant),orderId:saved.orderId,expectedRevision:saved.revision,...fields},saved.revision);run(()=>api('revise-order',body),renderOrder,saved.tenant);
  });
  function reviewOrder(decision) {if(busy||!exactOrder())return;const saved=currentOrder;const body=command('review-order',{tenant:saved.tenant,orderId:saved.orderId,reviewer:$('conOrderReviewer').value,role:$('conReviewRole').value,expectedHash:saved.reviewHash,decision,note:note('conOrderNote')},saved.revision);run(()=>api('review-order',body),renderOrder,saved.tenant);}
  $('conApproveOrder').addEventListener('click',()=>reviewOrder('approve'));$('conRejectOrder').addEventListener('click',()=>reviewOrder('reject'));
  $('conCommit').addEventListener('click',()=>{if(busy||!exactOrder())return;const saved=currentOrder;const body=command('record-commitment',{tenant:saved.tenant,orderId:saved.orderId,actor:actor('operators',saved.tenant),expectedHash:saved.reviewHash},saved.revision);run(()=>api('record-commitment',body),renderOrder,saved.tenant);});
  $('conReadiness').addEventListener('click',()=>{invalidateOrderForDocument();controls();run(()=>api('readiness',selector()),renderReadiness);});
  $('conRefresh').addEventListener('click',()=>{const selected=selector(),saved=currentOrder,savedDocument=currentDocument;run(async()=>{const doc=savedDocument?await api('document-receipt',{tenant:savedDocument.tenant,documentId:savedDocument.documentId}):null;const order=saved?await api('receipt',{tenant:saved.tenant,orderId:saved.orderId}):null;const history=await api('history',{tenant:selected.tenant});return {doc:doc?(history.documents.find(row=>row.documentId===doc.documentId&&row.revision>=doc.revision)??doc):null,order,history};},value=>{rememberDocuments(value.history.documents);if(value.doc)renderDocument(value.doc);if(value.order)renderOrder(value.order,{keepDraft:true});},selected.tenant);});
  $('conVerifyAudit').addEventListener('click',()=>run(()=>api('verify-audit',{tenant:context().tenant}),value=>{$('conAuditVerification').textContent=value.valid?`Local audit chain valid | ${value.eventCount} events. This is not an external signature.`:'Local audit verification failed.';}));
  $('conExport').addEventListener('click',()=>{if(busy||!exactOrder())return;const saved=currentOrder;run(async()=>{const verification=await api('verify-audit',{tenant:saved.tenant});const latest=await api('receipt',{tenant:saved.tenant,orderId:saved.orderId});if(!verification.valid||latest.stale||latest.revision!==saved.revision||latest.reviewHash!==saved.reviewHash||latest.status!==saved.status)throw Error('Saved order evidence changed. Recover the current snapshot before exporting.');return latest;},value=>{renderOrder(value);download(value);});});
  try {
    catalog=await api('catalog');for(const site of catalog.sites){const option=element('option',`${site.title} | ${site.tenant} / ${site.subcontractorId}`);option.value=contextKey(site);$('conContext').append(option);}
    for(const value of catalog.actors.compliance){const option=element('option',value);option.value=value;$('conCompliance').append(option);}
    for(const id of ['conContext','conDocumentExample','conOrderExample','conDocumentInput','conOrderInput'])$(id).disabled=false;
    $('conClock').textContent=`${catalog.clock.mode} | ${catalog.clock.asOf}. Fixed synthetic snapshot; no live document monitoring.`;
    populateExamples();restore('document');restore('order');populateOrderReviewers();controls();
  } catch(error){notice(`Construction catalog unavailable: ${error.message}`);}
  return {getDocument:()=>currentDocument,getOrder:()=>currentOrder};
}

if(typeof document!=='undefined'&&document.getElementById('conSubmitDocument'))mountConstruction(document,async(kind,body)=>{
  const response=await fetch(`/api/construction/${kind}`,kind==='catalog'?undefined:{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error??`HTTP ${response.status}`);return value;
});
