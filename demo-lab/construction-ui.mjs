const constructionClone=value=>JSON.parse(JSON.stringify(value));
const constructionCanonical=value=>Array.isArray(value)?value.map(constructionCanonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,constructionCanonical(value[key])])):value;
const constructionSame=(a,b)=>JSON.stringify(constructionCanonical(a))===JSON.stringify(constructionCanonical(b));
const constructionFail=message=>{throw Error(message);};
const constructionHashValue=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
async function constructionDigest(value){const bytes=new TextEncoder().encode(JSON.stringify(constructionCanonical(value))),result=await globalThis.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(result),byte=>byte.toString(16).padStart(2,'0')).join('');}
function validateReversalStructure(order,catalog){
 const original=order.commitment,r=order.reversal;if(!original){if(r)constructionFail('A reversal cannot exist without an original positive commitment');return;}
 if(order.status!=='committed'||original.id!==order.tenant+':'+order.orderId||!Number.isSafeInteger(original.amountCents)||original.amountCents<=0||original.amountCents!==order.amountCents||original.kind!==undefined||['tenant','siteId','subcontractorId','orderId','currency','version'].some(key=>original[key]!==order[key]))constructionFail('Original positive commitment differs from its immutable order');
 if(!r){if(order.reversalHash!==null||order.reversalReviewsCurrent!==false||order.reversalStatus!=='not-proposed')constructionFail('Reversal status contradicts absent proposal');return;}
 if(r.version!==1||!['change-cancelled','scope-withdrawn'].includes(r.reasonCode)||typeof r.note!=='string'||!r.note.trim()||r.note.length>1000||!catalog.actors.operators.includes(r.requester)||!r.requester.startsWith(order.tenant+'-')||r.originalEntryId!==original.id||!constructionHashValue(r.originalEntryHash)||!constructionHashValue(order.reversalHash)||!constructionHashValue(r.sourceHash)||!constructionHashValue(r.configHash)||!r.reviews||typeof r.reviews!=='object'||Array.isArray(r.reviews))constructionFail('Saved reversal proposal is inconsistent with the original commitment');
 for(const[role,review]of Object.entries(r.reviews)){const group=role==='project_manager'?'projectManagers':role==='finance'?'finance':null;if(!group||!catalog.actors[group].includes(review.reviewer)||!review.reviewer.startsWith(order.tenant+'-')||[order.requester,r.requester].includes(review.reviewer)||!['approve','reject'].includes(review.decision)||review.expectedHash!==order.reversalHash||typeof review.note!=='string'||!review.note.trim()||review.note.length>1000)constructionFail('Reversal review does not bind an independent exact proposal');}
 const manager=r.reviews.project_manager,finance=r.reviews.finance;if(manager&&finance&&manager.reviewer===finance.reviewer)constructionFail('Reversal manager and finance reviewers must differ');const approved=manager?.decision==='approve'&&finance?.decision==='approve',current=Boolean(approved&&!order.stale&&r.sourceHash===order.sourceHash&&r.configHash===order.configHash);if(order.reversalReviewsCurrent!==current)constructionFail('Reversal approval authority contradicts its saved reviews');
 if(r.entry){const entry=r.entry;if(!approved||entry.kind!=='full-reversal'||entry.id!==order.tenant+':reversal-'+order.orderId||!catalog.actors.operators.includes(entry.recordedBy)||!entry.recordedBy.startsWith(order.tenant+'-')||entry.reversesEntryId!==original.id||entry.originalEntryHash!==r.originalEntryHash||entry.amountCents!==-original.amountCents||entry.reviewHash!==order.reversalHash||entry.proposalVersion!==1||entry.scheduleImpactDays!==0||entry.manager!==manager.reviewer||entry.finance!==finance.reviewer||['tenant','siteId','subcontractorId','orderId','currency','version'].some(key=>entry[key]!==original[key]))constructionFail('Posted reversal must be the exact linked negative original amount');}
 if(order.reversalStatus!==(r.entry?'reversed':current?'ready':'pending'))constructionFail('Reversal status contradicts saved reviews or posting');
}
export async function validateConstructionReversalEvidence(order,catalog){validateReversalStructure(order,catalog);if(!order.reversal)return constructionClone(order);const r=order.reversal,proposal={orderId:order.orderId,tenant:order.tenant,siteId:order.siteId,subcontractorId:order.subcontractorId,currency:order.currency,originalEntry:order.commitment,proposal:{version:r.version,requester:r.requester,reasonCode:r.reasonCode,note:r.note,originalEntryId:r.originalEntryId,originalEntryHash:r.originalEntryHash,proposedAt:r.proposedAt},sourceHash:r.sourceHash,configHash:r.configHash};if(r.originalEntryHash!==await constructionDigest(order.commitment)||order.reversalHash!==await constructionDigest(proposal))constructionFail('Reversal source fingerprint differs from the exact original entry and immutable proposal');return constructionClone(order);}
let sequence = 0;
const freshId = kind => `con-ui-${kind}-${Date.now()}-${++sequence}`;
const money = cents => {if(!Number.isSafeInteger(cents))return 'No amount';const value=BigInt(cents),absolute=value<0n?-value:value;return (value<0n?'-':'')+'$'+String(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0')+' USD';};

export async function mountConstruction(d, api, download = value => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'}));
  const a=d.createElement('a');a.href=url;a.download='construction-order-snapshot.json';a.click();URL.revokeObjectURL(url);
}) {
  const $=id=>d.getElementById(id), commands=new Map(), latestDocumentVersions=new Map();
  const element=(tag,text,className)=>{const e=d.createElement(tag);e.textContent=String(text ?? '');if(className)e.className=className;return e;};
  const command=(kind,body,revision)=>{const key=JSON.stringify([kind,body,revision]);if(!commands.has(key))commands.set(key,freshId(kind));return {...body,commandId:commands.get(key)};};
  let catalog, currentDocument=null, currentOrder=null, draftEdited=false, busy=false, generation=0, reversalRetry=null;
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
  const buttons=['conSubmitDocument','conRestoreDocument','conVerifyDocument','conRevokeDocument','conReadiness','conCreateOrder','conReviseOrder','conRestoreOrder','conApproveOrder','conRejectOrder','conCommit','conExport','conRefresh','conVerifyAudit','conProposeReversal','conApproveReversal','conRejectReversal','conRecordReversal','conRetryReversal'];
  function clearReversalAcknowledgments(){$('conReversalReviewAck').checked=false;$('conReversalPostAck').checked=false;}
  const reversalExact=()=>Boolean(exactOrder()&&currentOrder.commitment);
  function populateReversalPeople(){if(!catalog)return;const tenant=currentOrder?.tenant??context().tenant,operators=catalog.actors.operators.filter(value=>value.startsWith(tenant+'-')),old=$('conReversalActor').value;$('conReversalActor').replaceChildren();for(const value of operators){const option=element('option',value);option.value=value;$('conReversalActor').append(option);}if(operators.includes(old))$('conReversalActor').value=old;populateReversalReviewers();}
  function populateReversalReviewers(){if(!catalog)return;const role=$('conReversalRole').value,group=role==='finance'?'finance':'projectManagers',tenant=currentOrder?.tenant??context().tenant,r=currentOrder?.reversal,other=r?.reviews?.[role==='finance'?'project_manager':'finance']?.reviewer,excluded=new Set([currentOrder?.requester,r?.requester,other]),values=catalog.actors[group].filter(value=>value.startsWith(tenant+'-')&&!excluded.has(value)),old=$('conReversalReviewer').value;$('conReversalReviewer').replaceChildren();for(const value of values){const option=element('option',value);option.value=value;$('conReversalReviewer').append(option);}if(values.includes(old))$('conReversalReviewer').value=old;}
  function reversalControls(){const exact=reversalExact(),r=currentOrder?.reversal,unposted=Boolean(exact&&r&&!r.entry),role=$('conReversalRole').value,reviewer=$('conReversalReviewer').value,group=role==='finance'?'finance':'projectManagers',other=r?.reviews?.[role==='finance'?'project_manager':'finance']?.reviewer,independent=Boolean(catalog&&r&&['finance','project_manager'].includes(role)&&catalog.actors[group].includes(reviewer)&&reviewer.startsWith(currentOrder.tenant+'-')&&![currentOrder.requester,r.requester,other].includes(reviewer)),operator=Boolean(catalog&&catalog.actors.operators.includes($('conReversalActor').value)&&currentOrder&&$('conReversalActor').value.startsWith(currentOrder.tenant+'-'));
    for(const id of ['conReversalActor','conReversalReason','conReversalNote'])$(id).disabled=busy||!exact||(id!=='conReversalActor'&&Boolean(r));for(const id of ['conReversalRole','conReversalReviewer','conReversalReviewNote','conReversalReviewAck'])$(id).disabled=busy||!unposted;
    $('conProposeReversal').disabled=busy||!exact||Boolean(r)||!operator||!['change-cancelled','scope-withdrawn'].includes($('conReversalReason').value)||!note('conReversalNote')||note('conReversalNote').length>1000;
    for(const id of ['conApproveReversal','conRejectReversal'])$(id).disabled=busy||!unposted||!independent||!$('conReversalReviewAck').checked||!note('conReversalReviewNote')||note('conReversalReviewNote').length>1000;
    const ready=Boolean(exact&&r&&!r.entry&&currentOrder.reversalStatus==='ready'&&currentOrder.reversalReviewsCurrent);$('conReversalPostAck').disabled=busy||!ready;$('conRecordReversal').disabled=busy||!ready||!operator||!$('conReversalPostAck').checked;
    $('conRetryReversal').disabled=busy||!catalog||!reversalRetry||draftEdited||reversalRetry.context!==contextKey(context())||Boolean(currentOrder&&currentOrder.orderId!==reversalRetry.saved.orderId);$('conReversalRetryStatus').textContent=reversalRetry?`Exact unconfirmed ${reversalRetry.kind} for order ${reversalRetry.saved.orderId}, reviewed revision ${reversalRetry.saved.revision}. Retry preserves command ${reversalRetry.body.commandId}; recovery or edits clear this retry.`:'';
    if(!currentOrder)$('conReversalReceipt').replaceChildren(element('p','No current committed order selected. Recover saved evidence before proposing or reviewing a reversal.'));
  }
  function renderReversal(value){populateReversalPeople();const box=$('conReversalReceipt');if(!value?.commitment){box.replaceChildren(element('p','A saved positive commitment is required. A draft or approved unposted order has no cost to reverse.'));return;}const r=value.reversal,original=value.commitment,negative=r?.entry?.amountCents??0;box.replaceChildren(element('h3',`Historical commitment preserved | ${value.reversalStatus==='reversed'?'full reversal posted':'reversal '+value.reversalStatus}`));box.append(facts([['Original positive entry',original.id],['Original posted amount',money(original.amountCents)],['Full negative amount',r?.entry?money(r.entry.amountCents):`${money(-original.amountCents)} proposed amount only; not posted`],['Net posted for this order',money(original.amountCents+negative)],['Saved order revision',value.revision],['Exact reversal fingerprint',value.reversalHash??'No reversal proposal saved']]));if(!value.readiness?.ready)box.append(element('p','Current document readiness is held. Correcting historical local cost does not clear this hold or authorize site work.','hold'));
    if(r){$('conReversalReason').value=r.reasonCode;$('conReversalNote').value=r.note;box.append(facts([['Reversal proposer',r.requester],['Saved reason',r.reasonCode],['Saved proposal note',r.note],['Original entry fingerprint',r.originalEntryHash],['Independent manager review',JSON.stringify(r.reviews.project_manager??null)],['Independent finance review',JSON.stringify(r.reviews.finance??null)],['Posted linked negative entry',r.entry?JSON.stringify(r.entry):'No negative entry posted']]));if(r.entry)box.append(element('p','The original positive entry and this one full negative entry remain in the ledger. The local budget was credited once; no payment, refund or real contract cancellation occurred.'));}else{$('conReversalNote').value='';box.append(element('p','Propose one full immutable correction with a closed reason and a note. It does not change the original order amount.'));}}
  function clearReversalIntent(){reversalRetry=null;clearReversalAcknowledgments();}
  function performReversal(candidate,retry=false){if(busy)return;const token=generation;reversalRetry=constructionClone(candidate);currentOrder=null;clearReversalAcknowledgments();$('conOrderReceipt').replaceChildren(element('p','Reversal action pending. The original posting remains; current action authority is unconfirmed.'));controls();run(async()=>{
      try{if(!retry){const before=await api('receipt',{tenant:candidate.saved.tenant,orderId:candidate.saved.orderId});if(token!==generation)return before;await validateConstructionReversalEvidence(before,catalog);if(token!==generation)return before;if(before.stale||before.revision!==candidate.saved.revision||before.reversalHash!==candidate.saved.reversalHash||!constructionSame(before.commitment,candidate.saved.commitment)){const error=Error('Saved reversal authority changed before this action; recover the current revision.');error.code='stale';throw error;}}
      const value=await api(candidate.kind,candidate.body);if(token!==generation)return value;await validateConstructionReversalEvidence(value,catalog);if(value.tenant!==candidate.saved.tenant||value.orderId!==candidate.saved.orderId||!constructionSame(value.commitment,candidate.saved.commitment)||value.revision<candidate.saved.revision)throw Error('Reversal response differs from the exact original order context');
      if(candidate.kind==='propose-reversal'&&(value.reversal?.requester!==candidate.body.actor||value.reversal.reasonCode!==candidate.body.reasonCode||value.reversal.note!==candidate.body.note))throw Error('Saved reversal proposal differs from the exact submitted intent');if(candidate.kind==='review-reversal'){const review=value.reversal?.reviews?.[candidate.body.role];if(!review||review.reviewer!==candidate.body.reviewer||review.decision!==candidate.body.decision||review.note!==candidate.body.note||review.expectedHash!==candidate.body.expectedHash)throw Error('Saved reversal review differs from exact submitted intent');}if(candidate.kind==='record-reversal'&&(!value.reversal?.entry||value.reversal.entry.reviewHash!==candidate.body.expectedHash||value.reversal.entry.recordedBy!==candidate.body.actor))throw Error('No exact linked reversal posting was confirmed');
      const latest=await api('receipt',{tenant:value.tenant,orderId:value.orderId});if(token!==generation)return latest;await validateConstructionReversalEvidence(latest,catalog);if(!constructionSame(latest,value))throw Error('Saved reversal evidence changed before its fresh receipt was checked');return latest;
      }catch(error){if(token===generation&&['invalid_input','conflict','stale','not_found','integrity_failed'].includes(error.code))reversalRetry=null;throw error;}
    },value=>{renderOrder(value);prefillRevision(value);},candidate.saved.tenant);}
  function startReversal(kind,body){if(busy||!reversalExact())return;const saved=constructionClone(currentOrder),intent=command(kind,body,saved.revision);performReversal({kind,body:intent,saved,context:contextKey(context())});}
  function controls() {
    for(const id of buttons)$(id).disabled=!catalog||busy;
    for(const id of ['conCompliance','conDocumentNote','conReviewRole','conOrderReviewer','conOrderNote','conDocumentAck','conOrderAck'])$(id).disabled=!catalog||busy;
    $('conVerifyDocument').disabled=busy||!currentDocument||currentDocument.stale||!latestDocument()||!$('conDocumentAck').checked||!note('conDocumentNote');
    $('conRevokeDocument').disabled=$('conVerifyDocument').disabled||currentDocument?.status!=='verified';
    $('conReviseOrder').disabled=busy||!currentOrder||currentOrder.stale||Boolean(currentOrder.commitment);
    for(const id of ['conApproveOrder','conRejectOrder'])$(id).disabled=busy||!exactOrder()||currentOrder.status==='committed'||!currentOrder.readiness?.ready||!$('conOrderAck').checked||!note('conOrderNote');
    $('conCommit').disabled=busy||!exactOrder()||(currentOrder.commitment||currentOrder.status!=='ready');
    $('conExport').disabled=busy||!exactOrder();
    reversalControls();
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
    validateReversalStructure(value,catalog);adopt(value);currentOrder=value;draftEdited=retainedDraft;reversalRetry=null;clearReversalAcknowledgments();$('conOrderAck').checked=false;populateOrderReviewers();
    const box=$('conOrderReceipt');box.replaceChildren(element('h3',`${value.orderId} | ${value.status}`));stale(box,value);
    box.append(facts([['Version / revision',`${value.version} / ${value.revision}`],['Scope',value.scope],['Amount',money(value.amountCents)],['Schedule impact',`${value.scheduleImpactDays} days (supplied scenario estimate)`],['Requester',value.requester],['Source issue / provenance',`${value.sourceIssueId} | ${value.channel} | ${value.reference}`],['Exact review fingerprint',value.reviewHash],['Project manager review',JSON.stringify(value.reviews?.project_manager ?? null)],['Finance review',JSON.stringify(value.reviews?.finance ?? null)],['Local commitment',value.commitment?JSON.stringify(value.commitment):'No budget commitment recorded']]));
    box.append(element('h3','Supplied change source'),element('div',value.content,'source-text'));
    if(value.readiness)renderReadiness(value.readiness);
    if(draftEdited)box.append(element('p','Unsaved editor changes are retained. Save a revision or explicitly recover the saved order before approval, commitment or export.','hold'));
    if(value.commitment)box.append(element('p','Historical local cost commitment. Later document holds do not erase this record; inspect current readiness separately.'));renderReversal(value);
    controls();
  }
  function history(kind,rows) {
    const documents=kind==='document',box=$(documents?'conDocumentHistory':'conOrderHistory');box.replaceChildren(element('h3',documents?'Document versions':'Saved change orders'));
    const list=element('div','','history-list');
    for(const row of rows){const button=element('button',documents?`${row.kind} | v${row.version} | ${row.status} | ${row.documentId}`:`${money(row.amountCents)} | v${row.version} | ${row.status} | ${row.orderId}`);button.type='button';button.disabled=busy;
      button.addEventListener('click',()=>{if(busy)return;generation++;clearReversalIntent();if(documents)currentDocument=null;else currentOrder=null;controls();run(async()=>{if(!documents)return api('receipt',{tenant:row.tenant,orderId:row.orderId});const receipt=await api('document-receipt',{tenant:row.tenant,documentId:row.documentId}),saved=await api('history',{tenant:row.tenant});return {receipt:saved.documents.find(doc=>doc.documentId===receipt.documentId&&doc.revision>=receipt.revision)??receipt,documents:saved.documents};},value=>{if(documents){rememberDocuments(value.documents);renderDocument(value.receipt);}else{renderOrder(value);prefillRevision(value);}},row.tenant);});list.append(button);}
    box.append(list);
  }
  function renderState(value) {
    const budgets=$('conBudgets');budgets.replaceChildren();
    for(const budget of value.budgets ?? []){const card=element('div','','budget-card');card.append(element('h3',budget.siteId),element('p','Remaining local fixture budget'),element('strong',money(budget.remainingCents)),element('p',`Net committed ${money(budget.committedCents)} of ${money(budget.budgetCents)}`));budgets.append(card);}
    const box=$('conCommitments');box.replaceChildren(element('h3',`Actual local cost ledger | ${value.commitments.length} entries`));
    for(const row of value.commitments){const card=element('article','',row.kind==='full-reversal'?'ledger-entry reversal':'ledger-entry');card.append(element('h4',`${row.kind==='full-reversal'?'Full linked reversal':'Original local commitment'} | ${money(row.amountCents)}`),element('p',row.kind==='full-reversal'?`Preserves and offsets entry ${row.reversesEntryId}`:`Positive historical entry ${row.id}`),element('div',JSON.stringify(row),'source-text'));box.append(card);}
    $('conState').replaceChildren(element('pre',JSON.stringify(value,null,2)));
  }
  async function evidence(tenant,token) {
    const [saved,state,audit,readiness]=await Promise.all([api('history',{tenant}),api('state',{tenant}),api('audit',{tenant}),api('readiness',selector())]);
    if(token!==generation)return;
    rememberDocuments(saved.documents);
    if(currentOrder){
      const selected=currentOrder;
      const identity=value=>JSON.stringify([value.revision,value.reviewHash,value.status,value.stale,value.readiness?.ready,value.reversalHash,value.reversalStatus,value.reversalReviewsCurrent,value.reversal?.entry?.id]);
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
    catch(error){if(token===generation){currentDocument=null;currentOrder=null;clearReversalAcknowledgments();$('conDocumentAck').checked=false;$('conOrderAck').checked=false;$('conOrderReceipt').replaceChildren(element('p','Current authority was not established. Refresh saved evidence and recover the intended order before acting.'));notice(`Operation could not establish current state: ${error.message}. Refresh and recover; an unchanged intake retry reuses its original command.`);}}
    finally{busy=false;controls();}
  }
  for(const id of ['conReversalActor','conReversalReason','conReversalNote','conReversalRole','conReversalReviewer','conReversalReviewNote'])for(const type of ['input','change'])$(id).addEventListener(type,()=>{generation++;reversalRetry=null;clearReversalAcknowledgments();if(busy){currentOrder=null;$('conOrderReceipt').replaceChildren(element('p','Reversal input changed while a response was pending. Recover saved history; the local action may already have committed.'));}if(id==='conReversalRole')populateReversalReviewers();controls();});
  for(const id of ['conReversalReviewAck','conReversalPostAck'])$(id).addEventListener('change',controls);
  $('conProposeReversal').addEventListener('click',()=>{if($('conProposeReversal').disabled||!reversalExact())return;const saved=currentOrder;startReversal('propose-reversal',{tenant:saved.tenant,orderId:saved.orderId,actor:$('conReversalActor').value,expectedRevision:saved.revision,reasonCode:$('conReversalReason').value,note:note('conReversalNote')});});
  for(const [id,decision]of [['conApproveReversal','approve'],['conRejectReversal','reject']])$(id).addEventListener('click',()=>{if($(id).disabled||!reversalExact())return;const saved=currentOrder;startReversal('review-reversal',{tenant:saved.tenant,orderId:saved.orderId,reviewer:$('conReversalReviewer').value,role:$('conReversalRole').value,expectedRevision:saved.revision,expectedHash:saved.reversalHash,decision,note:note('conReversalReviewNote')});});
  $('conRecordReversal').addEventListener('click',()=>{if($('conRecordReversal').disabled||!reversalExact())return;const saved=currentOrder;startReversal('record-reversal',{tenant:saved.tenant,orderId:saved.orderId,actor:$('conReversalActor').value,expectedRevision:saved.revision,expectedHash:saved.reversalHash});});
  $('conRetryReversal').addEventListener('click',()=>{if($('conRetryReversal').disabled||!reversalRetry)return;performReversal(constructionClone(reversalRetry),true);});
  function examples(type) {const site=context();return catalog[type==='document'?'documentExamples':'orderExamples'].filter(row=>row.input.tenant===site.tenant&&row.input.siteId===site.id&&row.input.subcontractorId===site.subcontractorId);}
  function populateExamples() {
    for(const type of ['document','order']){const select=$(type==='document'?'conDocumentExample':'conOrderExample');select.replaceChildren();for(const row of examples(type)){const option=element('option',row.title);option.value=row.id;select.append(option);}}
  }
  function restore(type) {
    generation++;clearReversalIntent();const doc=type==='document';if(doc){currentDocument=null;invalidateOrderForDocument();}else{currentOrder=null;draftEdited=false;}
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
  $('conContext').addEventListener('change',()=>{generation++;clearReversalIntent();currentDocument=null;currentOrder=null;draftEdited=false;populateExamples();restore('document');restore('order');populateOrderReviewers();$('conReadinessReceipt').replaceChildren(element('p','Context changed. Refresh the readiness snapshot for this site.'));for(const id of ['conDocumentHistory','conOrderHistory','conBudgets','conCommitments','conState','conAudit'])$(id).replaceChildren();});
  for(const type of ['document','order']){
    const doc=type==='document';$(doc?'conDocumentExample':'conOrderExample').addEventListener('change',()=>restore(type));$(doc?'conRestoreDocument':'conRestoreOrder').addEventListener('click',()=>restore(type));
    $(doc?'conDocumentInput':'conOrderInput').addEventListener('input',()=>{generation++;clearReversalIntent();$(doc?'conDocumentAck':'conOrderAck').checked=false;if(doc){currentDocument=null;invalidateOrderForDocument();$('conDocumentReceipt').replaceChildren(element('p','Document input changed. Save or recover its accepted source before review.'));}else{draftEdited=true;$('conOrderReceipt').replaceChildren(element('p','Draft edits are not saved. Save a revision of the selected order, or recover its saved version before approval, commitment or export.'));}controls();});
    $(doc?'conSubmitDocument':'conCreateOrder').addEventListener('click',()=>{if(busy)return;generation++;if(doc){currentDocument=null;invalidateOrderForDocument();}else currentOrder=null;controls();let body;try{body=input(type);if(!body.commandId)throw Error('Restore an example for a new intake command, or save the selected order as a revision.');}catch(error){notice(error.message);return;}run(()=>api(doc?'submit-document':'create-order',body),doc?value=>{renderDocument(value);invalidateOrderForDocument();}:renderOrder,body.tenant);});
  }
  for(const id of ['conCompliance','conDocumentNote','conReviewRole','conOrderReviewer','conOrderNote'])for(const type of ['input','change'])$(id).addEventListener(type,()=>{$('conDocumentAck').checked=false;$('conOrderAck').checked=false;if(id==='conReviewRole')populateOrderReviewers();controls();});
  for(const id of ['conDocumentAck','conOrderAck'])$(id).addEventListener('change',controls);
  function invalidateOrderForDocument() {clearReversalIntent();$('conOrderAck').checked=false;if(currentOrder){currentOrder=null;$('conOrderReceipt').replaceChildren(element('p','Document evidence changed. Recover the order to inspect its new readiness and review fingerprint.'));}}
  function reviewDocument(decision) {if(busy)return;invalidateOrderForDocument();controls();if(!currentDocument||currentDocument.stale||!latestDocument())return;const saved=currentDocument;const body=command('review-document',{tenant:saved.tenant,documentId:saved.documentId,reviewer:$('conCompliance').value,expectedHash:saved.contentHash,expectedRevision:saved.revision,decision,note:note('conDocumentNote')},saved.revision);run(()=>api('review-document',body),value=>{renderDocument(value);invalidateOrderForDocument();},saved.tenant);}
  $('conVerifyDocument').addEventListener('click',()=>reviewDocument('verify'));$('conRevokeDocument').addEventListener('click',()=>reviewDocument('revoke'));
  $('conReviseOrder').addEventListener('click',()=>{if(busy||!currentOrder||currentOrder.commitment)return;const saved=currentOrder;let draft;try{draft=input('order');if(draft.tenant!==saved.tenant||draft.siteId!==saved.siteId||draft.subcontractorId!==saved.subcontractorId||draft.sourceIssueId!==saved.sourceIssueId)throw Error('A revision must keep the selected saved order context and source issue.');}catch(error){notice(error.message);return;}
    const fields=Object.fromEntries(['scope','amountCents','scheduleImpactDays','channel','reference','content','receivedAt'].map(key=>[key,draft[key]]));
    const body=command('revise-order',{tenant:saved.tenant,actor:actor('operators',saved.tenant),orderId:saved.orderId,expectedRevision:saved.revision,...fields},saved.revision);run(()=>api('revise-order',body),renderOrder,saved.tenant);
  });
  function reviewOrder(decision) {if(busy||!exactOrder()||currentOrder.commitment)return;const saved=currentOrder;const body=command('review-order',{tenant:saved.tenant,orderId:saved.orderId,reviewer:$('conOrderReviewer').value,role:$('conReviewRole').value,expectedHash:saved.reviewHash,decision,note:note('conOrderNote')},saved.revision);run(()=>api('review-order',body),renderOrder,saved.tenant);}
  $('conApproveOrder').addEventListener('click',()=>reviewOrder('approve'));$('conRejectOrder').addEventListener('click',()=>reviewOrder('reject'));
  $('conCommit').addEventListener('click',()=>{if(busy||!exactOrder()||currentOrder.commitment)return;const saved=currentOrder;const body=command('record-commitment',{tenant:saved.tenant,orderId:saved.orderId,actor:actor('operators',saved.tenant),expectedHash:saved.reviewHash},saved.revision);run(()=>api('record-commitment',body),renderOrder,saved.tenant);});
  $('conReadiness').addEventListener('click',()=>{invalidateOrderForDocument();controls();run(()=>api('readiness',selector()),renderReadiness);});
  $('conRefresh').addEventListener('click',()=>{const selected=selector(),saved=currentOrder,savedDocument=currentDocument;run(async()=>{const doc=savedDocument?await api('document-receipt',{tenant:savedDocument.tenant,documentId:savedDocument.documentId}):null;const order=saved?await api('receipt',{tenant:saved.tenant,orderId:saved.orderId}):null;const history=await api('history',{tenant:selected.tenant});return {doc:doc?(history.documents.find(row=>row.documentId===doc.documentId&&row.revision>=doc.revision)??doc):null,order,history};},value=>{rememberDocuments(value.history.documents);if(value.doc)renderDocument(value.doc);if(value.order)renderOrder(value.order,{keepDraft:true});},selected.tenant);});
  $('conVerifyAudit').addEventListener('click',()=>run(()=>api('verify-audit',{tenant:context().tenant}),value=>{$('conAuditVerification').textContent=value.valid?`Local audit chain valid | ${value.eventCount} events. This is not an external signature.`:'Local audit verification failed.';}));
  $('conExport').addEventListener('click',()=>{if(busy||!exactOrder())return;const saved=currentOrder;run(async()=>{const verification=await api('verify-audit',{tenant:saved.tenant});const latest=await api('receipt',{tenant:saved.tenant,orderId:saved.orderId});if(!verification.valid||latest.stale||latest.revision!==saved.revision||latest.reviewHash!==saved.reviewHash||latest.status!==saved.status)throw Error('Saved order evidence changed. Recover the current snapshot before exporting.');return latest;},value=>{renderOrder(value);download(value);});});
  try {
    catalog=await api('catalog');for(const site of catalog.sites){const option=element('option',`${site.title} | ${site.tenant} / ${site.subcontractorId}`);option.value=contextKey(site);$('conContext').append(option);}
    for(const value of catalog.actors.compliance){const option=element('option',value);option.value=value;$('conCompliance').append(option);}
    for(const id of ['conContext','conDocumentExample','conOrderExample','conDocumentInput','conOrderInput'])$(id).disabled=false;
    $('conClock').textContent=`${catalog.clock.mode} | ${catalog.clock.asOf}. Fixed synthetic snapshot; no live document monitoring.`;
    populateExamples();restore('document');restore('order');populateOrderReviewers();populateReversalPeople();controls();
  } catch(error){notice(`Construction catalog unavailable: ${error.message}`);}
  return {getDocument:()=>currentDocument,getOrder:()=>currentOrder,getReversalRetry:()=>reversalRetry?constructionClone(reversalRetry):null};
}

if(typeof document!=='undefined'&&document.getElementById('conSubmitDocument'))mountConstruction(document,async(kind,body)=>{
  const response=await fetch(`/api/construction/${kind}`,kind==='catalog'?undefined:{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error??`HTTP ${response.status}`);return value;
});
