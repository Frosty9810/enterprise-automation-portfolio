let sequence=0;
const freshId=kind=>`ref-ui-${kind}-${Date.now()}-${++sequence}`;
export async function mountReferral(d,api,download=value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=d.createElement('a');a.href=url;a.download='synthetic-referral-snapshot.json';a.click();URL.revokeObjectURL(url);}){
 const $=id=>d.getElementById(id),commands=new Map();
 const node=(tag,text,className)=>{const e=d.createElement(tag);e.textContent=String(text??'');if(className)e.className=className;return e;};
 let catalog,current=null,snapshot=null,selectionId=null,busy=false,generation=0,packetDirty=false,consentDirty=false;
 const tenant=()=>$('refTenant').value,fixture=()=>catalog.referrals.find(row=>row.id===$('refFixture').value&&row.tenant===tenant());
 const clean=()=>!packetDirty&&!consentDirty;
 const active=()=>current&&!current.stale&&clean();
 const identity=row=>JSON.stringify([row.caseId,row.revision,row.reviewHash,row.status,row.stale,row.readiness?.ready,row.queue?.effectiveStatus,row.queue?.generation]);
 const actor=group=>catalog.actors[group].find(value=>value.startsWith(`${tenant()}-`));
 const command=(kind,body,revision)=>{const key=JSON.stringify([kind,body,revision]);if(!commands.has(key))commands.set(key,freshId(kind));return {...body,commandId:commands.get(key)};};
 const notice=text=>{$('refNotice').textContent=text;};
 const proof=()=>catalog?.consentProofs.find(row=>row.id===$('refConsentProof').value);
 const checkedDocuments=()=>[...$('refDocuments').querySelectorAll('input:checked')].map(input=>input.value);
 const actions=['refIntake','refRestore','refSavePacket','refGrant','refRevoke','refApprove','refReject','refEnqueue','refAssign','refExport','refRefresh','refVerify'];
 function controls(){
  for(const id of actions)$(id).disabled=!catalog||busy;
  for(const id of ['refReviewer','refReason','refAssignee','refAck'])$(id).disabled=!catalog||busy;
  const selected=!!current&&!current.stale;
  $('refSavePacket').disabled=busy||!selected||!packetDirty;
  $('refGrant').disabled=busy||!selected||proof()?.decision!=='grant';
  $('refRevoke').disabled=busy||!selected||proof()?.decision!=='revoke';
  const independent=current&&![current.intakeActor,current.packetUpdatedBy,current.consent.updatedBy].includes($('refReviewer').value);
  const reviewable=active()&&current.readiness?.ready&&independent&&$('refAck').checked;
  $('refApprove').disabled=busy||!reviewable||$('refReason').value!=='packet-checked';
  $('refReject').disabled=busy||!reviewable||$('refReason').value!=='needs-follow-up';
  const approved=active()&&current.readiness?.ready&&current.review?.decision==='approve'&&current.review.expectedHash===current.reviewHash;
  $('refEnqueue').disabled=busy||!approved||['queued','assigned'].includes(current?.queue?.effectiveStatus);
  $('refAssign').disabled=busy||!approved||!['queued','assigned'].includes(current?.queue?.effectiveStatus);
  $('refExport').disabled=busy||!active();
  $('refHistory').querySelectorAll('button').forEach(button=>button.disabled=busy);
 }
 function draftNotice(){
  const parts=[];if(packetDirty)parts.push('Unsaved packet selections');if(consentDirty)parts.push('Unapplied synthetic consent selection');
  $('refDraft').textContent=parts.length?`${parts.join(' / ')}. Save the intended change or explicitly recover the saved case before review, queue action or export.`:current?'Displayed packet selections match the saved snapshot. Review and queue actions still require current server evidence.':'These are fixture selections. Save or explicitly recover a case before treating them as saved evidence.';
 }
 function clearAuthority(message,{clearSelection=false}={}){current=null;if(clearSelection)selectionId=null;$('refAck').checked=false;$('refReceipt').replaceChildren(node('p',message));$('refReview').replaceChildren(node('p','No current selected review authority.'));$('refQueueReceipt').replaceChildren(node('p','Recover a saved case to inspect its current local queue item.'));$('refReadiness').replaceChildren(node('p','No current selected readiness snapshot. Recover saved evidence before acting.'));controls();}
 function facts(values){const dl=node('dl','','facts');for(const [label,value]of values)dl.append(node('dt',label),node('dd',value));return dl;}
 function renderFixtureSource(){const row=fixture();$('refFixtureSource').replaceChildren(node('h3',row.title),facts([['Referral fixture',row.id],['Patient fixture',row.patientFixtureId],['Pinned source event',row.sourceEventId]]),node('p','These registered labels are synthetic source selectors, not an actual health record.'));}
 function populatePacket(row){
  const payerId=row.payerId,ids=row.documentIds??[];$('refPayer').replaceChildren();
  for(const payer of catalog.payers){const option=node('option',`${payer.title} | ${payer.version}`);option.value=payer.id;$('refPayer').append(option);}$('refPayer').value=payerId;
  $('refDocuments').replaceChildren();for(const doc of catalog.documents.filter(doc=>doc.tenant===row.tenant&&doc.referralFixtureId===row.referralFixtureId)){
   const label=node('label','','document-option'),check=d.createElement('input');check.type='checkbox';check.value=doc.id;check.checked=ids.includes(doc.id);check.dataset.documentId=doc.id;
   const detail=`${doc.title} | ${doc.kind} | version ${doc.version} | ${doc.isCurrent?'current registered source':'superseded source'} | exclusive expiry ${doc.validUntil}`;check.setAttribute('aria-label',detail);label.append(check,node('span',detail));$('refDocuments').append(label);check.addEventListener('change',()=>editPacket());
  }
 }
 function populateProofs(row,preferred){$('refConsentProof').replaceChildren();for(const item of catalog.consentProofs.filter(item=>item.tenant===row.tenant&&item.referralFixtureId===row.referralFixtureId)){const option=node('option',`${item.decision} | ${item.title??item.id}`);option.value=item.id;$('refConsentProof').append(option);}if(preferred&&catalog.consentProofs.some(p=>p.id===preferred))$('refConsentProof').value=preferred;}
 function populateActors(){for(const [id,group]of [['refReviewer','reviewers'],['refAssignee','staff']]){$(id).replaceChildren();for(const value of catalog.actors[group].filter(value=>value.startsWith(`${tenant()}-`))){const option=node('option',value);option.value=value;$(id).append(option);}}}
 function renderCase(value){
  current=value;selectionId=value.caseId;$('refAck').checked=false;
  const box=$('refReceipt');box.replaceChildren(node('h3',`${value.caseId} | ${value.status}`));
  if(value.stale)box.append(node('p','Historical source/configuration: this saved case is read-only. Current reviewed authority must be prepared using supported fresh sources.','hold'));
  box.append(facts([['Fixture / patient',`${value.referralFixtureId} / ${value.patientFixtureId}`],['Revision / packet version',`${value.revision} / ${value.packetVersion}`],['Pinned source event',value.sourceEventId??fixture()?.sourceEventId],['Source editor fixtures',`intake ${value.intakeActor} | packet ${value.packetUpdatedBy} | consent ${value.consent.updatedBy??'not recorded'}`],['Fictional payer',value.payerId],['Consent revision',`${value.consent.revision} | ${value.consent.granted?'fixture grant recorded':'not granted'} | ${value.consent.proofId??'no proof'} `],['Exact review fingerprint',value.reviewHash]]));
  if(!clean())box.append(node('p','Unsaved selections are retained. The saved receipt does not authorize those unsaved changes.','hold'));
  renderGate(value);
  $('refReview').replaceChildren(node('h3','Saved independent review'),value.review?node('pre',JSON.stringify(value.review,null,2)):node('p','No current independent review.'));
  const q=value.queue;$('refQueueReceipt').replaceChildren(node('h3','Selected local queue item'),q?facts([['Current effective status',q.effectiveStatus],['Stored status',q.status],['Generation / packet version',`${q.generation} / ${q.packetVersion}`],['Assigned fixture',q.assignee??'not assigned'],['Recorded review hash',q.reviewHash]]):node('p','No local queue record exists for this case.'));
  if(q&&q.status!==q.effectiveStatus)$('refQueueReceipt').append(node('p','The current source/consent/expiry gate holds this item. Stored history has not been rewritten by a background process.','hold'));
  draftNotice();controls();
 }
 function renderGate(value){
  const gate=$('refReadiness');gate.replaceChildren(node('p',value.readiness.ready?'Saved fictional administrative checklist is complete. Queue authority depends on the current independent review shown below.':'Administrative handoff is held.',value.readiness.ready?'pass':'hold'),node('p',`As of ${value.readiness.asOf} | checklist ${value.readiness.payerVersion??'unconfigured'}`));
  for(const reason of value.readiness.holds)gate.append(node('p',reason,'hold'));
  for(const doc of value.readiness.documents??[])gate.append(node('p',`${doc.id} | ${doc.kind} v${doc.version} | ${doc.isCurrent?'current':'superseded'} | exclusive expiry ${doc.validUntil}`));
 }
 function renderWorkspace(value){
  const box=$('refHistory');box.replaceChildren(node('h3',`Saved synthetic cases | ${value.cases.length}`));const list=node('div','','history-list');
  for(const row of value.cases){const button=node('button',`${row.referralFixtureId} | revision ${row.revision} | ${row.status}`,'secondary');button.type='button';button.addEventListener('click',()=>recover(row.caseId));list.append(button);}box.append(list);
  const queue=$('refQueue');queue.replaceChildren(node('h3',`Actual local queue rows | ${value.queue.length}`));for(const row of value.queue)queue.append(node('div',`${row.caseId} | stored ${row.status} | effective ${row.effectiveStatus} | generation ${row.generation} | ${row.assignee??'unassigned'}`,'queue-card'));
  $('refState').replaceChildren(node('pre',JSON.stringify(value,null,2)));
  $('refVerification').textContent=value.audit.valid?`Atomic workspace audit valid | ${value.audit.eventCount} events | as of ${value.asOf}. This is not an external signature.`:'Atomic workspace audit verification failed.';
 }
 function applyWorkspace(value,{caseId=selectionId,discardDraft=false,expected=null}={}){
  if(!value||!Array.isArray(value.cases)||!Array.isArray(value.queue)||value.audit?.valid!==true)throw Error('A verified atomic workspace snapshot was not returned.');
  snapshot=value;renderWorkspace(value);const fresh=value.cases.find(row=>row.caseId===caseId);
  if(!fresh){clearAuthority('Choose a saved synthetic case or save the selected fixture intake.');return;}
  if(expected&&identity(fresh)!==identity(expected)){clearAuthority('Fresh workspace evidence changed this case. Recover its current saved snapshot before acting. Unsaved selections are retained.');renderGate(fresh);return;}
  if(!discardDraft&&!clean()&&!current&&!expected){clearAuthority('Unsaved selections are retained without a current base revision. Explicitly recover saved evidence before reapplying them.');renderGate(fresh);return;}
  if(fresh.tenant!==tenant())throw Error('Workspace selection does not match the displayed tenant.');
  $('refFixture').value=fresh.referralFixtureId;renderFixtureSource();
  if(discardDraft){packetDirty=false;consentDirty=false;populatePacket(fresh);populateProofs(fresh,fresh.consent.proofId);}
  else{if(!packetDirty)populatePacket(fresh);if(!consentDirty)populateProofs(fresh,fresh.consent.proofId);}
  renderCase(fresh);
 }
 async function run(work,display){
  if(busy)return;const token=generation;busy=true;controls();notice('Reading or updating the local administrative record...');
  try{const value=await work();if(token!==generation)return;if(display)display(value);if(token===generation)notice('Local operation finished. Inspect the current atomic snapshot, saved holds and actual queue rows.');}
  catch(error){if(token===generation){clearAuthority('The response did not establish current authority. Refresh or explicitly recover the saved case before acting.');notice(`Local operation could not establish current state: ${error.message}. No external referral was sent.`);}}
  finally{busy=false;controls();}
 }
 function restoreFixture(){generation++;packetDirty=false;consentDirty=false;clearAuthority('Registered fixture draft restored. Save or recover its intake to inspect saved evidence.',{clearSelection:true});const row=fixture();populatePacket({...row,referralFixtureId:row.id});populateProofs({...row,referralFixtureId:row.id});renderFixtureSource();draftNotice();notice('Closed synthetic fixture restored. Its registered source event remains unchanged.');}
 function editPacket(){generation++;packetDirty=true;$('refAck').checked=false;draftNotice();$('refReceipt').replaceChildren(node('p','Packet selections changed. Save a revision of the selected case or explicitly recover saved evidence before acting.','hold'));controls();}
 async function recover(caseId){if(busy)return;generation++;selectionId=caseId;const owner=tenant();run(()=>api('state',{tenant:owner}),value=>applyWorkspace(value,{caseId,discardDraft:true}));}
 function mutate(kind,extra,{clearPacket=false,clearConsent=false}={}){
  if(busy||!current||current.stale)return;const saved=current,caseId=saved.caseId,body=command(kind,{tenant:saved.tenant,caseId,expectedRevision:saved.revision,actor:actor('operators'),...extra},saved.revision);
  generation++;clearAuthority('A local change is pending. Recover saved evidence if the response is lost.');
  run(async()=>{const result=await api(kind,body),workspace=await api('state',{tenant:saved.tenant});return {result,workspace};},({result,workspace})=>{if(clearPacket)packetDirty=false;if(clearConsent)consentDirty=false;applyWorkspace(workspace,{caseId,expected:result});});
 }
 $('refTenant').addEventListener('change',()=>{generation++;current=null;selectionId=null;snapshot=null;packetDirty=false;consentDirty=false;populateFixtures();populateActors();restoreFixture();for(const id of ['refHistory','refQueue','refState'])$(id).replaceChildren();$('refVerification').textContent='';$('refReadiness').replaceChildren(node('p',"Refresh or recover this organization's synthetic workspace."));});
 function populateFixtures(){$('refFixture').replaceChildren();for(const row of catalog.referrals.filter(row=>row.tenant===tenant())){const option=node('option',row.title);option.value=row.id;$('refFixture').append(option);}}
 $('refFixture').addEventListener('change',restoreFixture);$('refRestore').addEventListener('click',restoreFixture);$('refPayer').addEventListener('change',editPacket);
 $('refConsentProof').addEventListener('change',()=>{generation++;consentDirty=true;$('refAck').checked=false;draftNotice();controls();});
 for(const id of ['refReviewer','refReason'])$(id).addEventListener('change',()=>{$('refAck').checked=false;controls();});$('refAck').addEventListener('change',controls);
 $('refIntake').addEventListener('click',()=>{if(busy)return;generation++;packetDirty=false;consentDirty=false;const row=fixture(),owner=tenant();clearAuthority('Reading the pinned source event before local intake.');run(async()=>{const first=await api('state',{tenant:owner}),existing=first.cases.find(item=>item.referralFixtureId===row.id);if(existing)return {workspace:first,caseId:existing.caseId};const body=command('intake',{tenant:owner,actor:actor('operators'),referralFixtureId:row.id,sourceEventId:row.sourceEventId},row.id);const result=await api('intake',body);return {workspace:await api('state',{tenant:owner}),caseId:result.caseId};},value=>applyWorkspace(value.workspace,{caseId:value.caseId,discardDraft:true}));});
 $('refSavePacket').addEventListener('click',()=>mutate('set-packet',{payerId:$('refPayer').value,documentIds:checkedDocuments()},{clearPacket:true}));
 for(const [id,decision]of [['refGrant','grant'],['refRevoke','revoke']])$(id).addEventListener('click',()=>mutate('set-consent',{decision,proofId:$('refConsentProof').value},{clearConsent:true}));
 function review(decision){if(busy||!active()||!$('refAck').checked)return;const saved=current,reasonCode=$('refReason').value;if(reasonCode!==(decision==='approve'?'packet-checked':'needs-follow-up'))return;const body=command('review',{tenant:saved.tenant,caseId:saved.caseId,expectedRevision:saved.revision,reviewer:$('refReviewer').value,expectedHash:saved.reviewHash,decision,reasonCode},saved.revision);generation++;clearAuthority('Independent review is pending. The current saved snapshot must establish new authority.');run(async()=>{const result=await api('review',body);return {result,workspace:await api('state',{tenant:saved.tenant})};},value=>applyWorkspace(value.workspace,{caseId:saved.caseId,expected:value.result}));}
 $('refApprove').addEventListener('click',()=>review('approve'));$('refReject').addEventListener('click',()=>review('reject'));
 $('refEnqueue').addEventListener('click',()=>{if(active())mutate('enqueue',{expectedHash:current.reviewHash});});$('refAssign').addEventListener('click',()=>{if(active())mutate('assign',{assignee:$('refAssignee').value});});
 $('refRefresh').addEventListener('click',()=>{const owner=tenant(),saved=current;run(()=>api('state',{tenant:owner}),value=>applyWorkspace(value,{caseId:selectionId,expected:!clean()?saved:null}));});
 $('refVerify').addEventListener('click',()=>{const owner=tenant();run(async()=>{const check=await api('verify-audit',{tenant:owner});if(!check.valid)throw Error('Stored local audit verification failed.');return api('state',{tenant:owner});},value=>applyWorkspace(value,{caseId:selectionId,expected:!clean()?current:null}));});
 $('refExport').addEventListener('click',()=>{if(busy||!active())return;const saved=current;run(async()=>{const check=await api('verify-audit',{tenant:saved.tenant});if(!check.valid)throw Error('Stored audit verification failed.');const workspace=await api('state',{tenant:saved.tenant}),fresh=workspace.cases.find(row=>row.caseId===saved.caseId);if(!fresh||fresh.stale||identity(fresh)!==identity(saved))throw Error('Saved evidence changed; recover the current snapshot before export.');return {workspace,case:fresh};},value=>{applyWorkspace(value.workspace,{caseId:saved.caseId});download({case:value.case,asOf:value.workspace.asOf,audit:value.workspace.audit,scope:'Verified point-in-time synthetic local snapshot; not ongoing authority or a real referral submission.'});});});
 try{catalog=await api('catalog');for(const owner of [...new Set(catalog.referrals.map(row=>row.tenant))]){const option=node('option',`Synthetic ${owner} organization`);option.value=owner;$('refTenant').append(option);}for(const id of ['refTenant','refFixture','refPayer','refConsentProof'])$(id).disabled=false;populateFixtures();populateActors();$('refClock').textContent=`${catalog.clock.mode} | ${catalog.clock.asOf}. Fixed synthetic snapshot, not live deadline or health monitoring.`;restoreFixture();controls();}catch(error){notice(`Synthetic referral catalog unavailable: ${error.message}`);}
 return {getCurrent:()=>current,getSnapshot:()=>snapshot};
}
if(typeof document!=='undefined'&&document.getElementById('refIntake'))mountReferral(document,async(kind,body)=>{const response=await fetch(`/api/referral/${kind}`,kind==='catalog'?undefined:{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error??value.message??`HTTP ${response.status}`);return value;});
