export async function insuranceApi(kind,body){
 const response=await fetch('/api/industry/insurance/'+kind,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await response.json();if(!response.ok){const error=Error(value.error??'Request rejected.');error.definitive=true;throw error;}return value;
}
export async function mountInsurance(document,api=insuranceApi,exporter=value=>{const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='INS-01-synthetic-receipt.json';link.click();URL.revokeObjectURL(url);}){
 const $=id=>document.getElementById(id),tenant=()=>$('insTenant').value;let catalog,current=null,workspace=null,busy=false,pending=null,dirty=false,summaryVisible=true,epoch=0,seq=0;
 const buttons=['insIntake','insRefresh','insPacket','insGrant','insRevoke','insResolve','insRoute','insReturn','insEnqueue','insAssign','insExport','insRetry','insForget'];
 const allSelectors=['insTenant','insActor','insEvent','insPolicy','insPrimary','insReviewer','insAdjuster'];
 const identity=()=>({tenant:tenant(),caseId:current.caseId}),common=()=>({...identity(),actor:$('insActor').value,expectedRevision:current.revision});
 const selectedEvent=()=>catalog.events.find(e=>e.id===$('insEvent').value&&e.tenant===tenant());
 const independent=()=>current&&!['intakeActor','packetUpdatedBy'].some(key=>current[key]===$('insReviewer').value)&&current.consent.updatedBy!==$('insReviewer').value&&current.duplicate.resolvedBy!==$('insReviewer').value;
 function options(element,values,label=value=>value){element.replaceChildren(...values.map(value=>{const node=document.createElement('option');node.value=typeof value==='object'?value.id:value;node.textContent=label(value);return node;}));}
 function say(text){$('insStatus').textContent=text;}
 function fields(){
  const row=current,event=row??selectedEvent();if(!event)return;
  options($('insPolicy'),catalog.policies.filter(p=>p.tenant===tenant()&&p.businessLossId===event.businessLossId),p=>p.id+' / '+p.startDate+' to '+p.endDate);
  $('insEvidence').replaceChildren();const legend=document.createElement('legend');legend.textContent='Supplied source versions';$('insEvidence').append(legend);
  for(const doc of catalog.evidence.filter(d=>d.tenant===tenant()&&d.businessLossId===event.businessLossId)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=doc.id;input.checked=(row?.evidenceIds??[]).includes(doc.id);input.addEventListener('change',()=>{dirty=true;summaryVisible=false;epoch++;$('insAck').checked=false;render();});label.append(input,document.createTextNode(' '+doc.title+' / '+doc.id));$('insEvidence').append(label);}
  if(row)$('insPolicy').value=row.policyId;
 }
 function renderSummary(row){
  const container=$('insSummary');container.replaceChildren();
  if(!row||!summaryVisible||dirty){const note=document.createElement('p');note.textContent=row?'Saved summary hidden while the selection or context changes. Refresh or save the packet to inspect current facts.':'No current case authority. Register or recover a saved source event.';container.append(note);return;}
  const queue=row.queue,held=queue?.effectiveStatus==='held',authorized=['ready','queued','assigned'].includes(row.status)&&row.review?.decision==='route'&&row.review.expectedHash===row.reviewHash;
  const review=authorized?row.review.reviewer+' / '+row.review.route+' (current saved packet)':row.review?.decision==='return'?'Follow-up recorded by '+row.review.reviewer+'; no approved route':row.review?'Historical review by '+row.review.reviewer+'; no current routing approval':'No current routing approval; independent review required';
  const duplicate=row.duplicate.kind==='none'?'Primary loss case / '+row.businessLossId:row.duplicate.resolution==='link-primary'?'Exact repeated source linked to '+row.duplicate.linkedCaseId+'; no separate queue or consent authority':row.duplicate.resolution==='distinct-loss'?'Distinct loss recorded by '+row.duplicate.resolvedBy+' / '+row.businessLossId:'Unresolved '+row.duplicate.kind+' identity signal; administrative hold';
  const facts=[['queue','Effective local queue',queue?queue.effectiveStatus:'No local queue row'],['assignment','Current assignment',queue&&!held?(queue.assignee??'Unassigned')+' / generation '+queue.generation:'None currently authorized'],['consent','Current synthetic consent',(row.consent.granted?'Granted':'Not granted')+' / revision '+row.consent.revision],['review','Independent review and route',review],['duplicate','Loss ownership and duplicate link',duplicate],['source','Source and packet revisions',row.eventFixtureId+' / packet '+row.packetVersion+' / case revision '+row.revision],['fingerprint','Exact saved packet fingerprint',row.reviewHash],['history','Stored queue history',queue?'Generation '+queue.generation+' / stored '+queue.status+' / route '+queue.route+(held?' / historical assignment '+(queue.assignee??'none')+'; not current authorization':''):'No stored queue history']];
  for(const [key,label,text] of facts){const group=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');term.textContent=label;value.id='insFact-'+key;value.textContent=text;group.append(term,value);container.append(group);}
 }
 function render(){
  const row=current,locked=busy||!!pending,active=!!row&&!row.stale,clean=active&&!dirty,exact=row?.duplicate.kind==='exact',primary=(workspace?.cases??[]).filter(r=>r.duplicate.kind==='none'&&r.eventFixtureId===row?.duplicate.primaryEventId&&r.businessLossId===row?.businessLossId);
  const prior=$('insPrimary').value;options($('insPrimary'),primary.map(r=>({id:r.caseId,label:r.caseId+' / revision '+r.revision})),r=>r.label);if(primary.some(p=>p.caseId===prior))$('insPrimary').value=prior;
  for(const id of buttons)$(id).disabled=locked;
  for(const id of allSelectors)$(id).disabled=locked;
  for(const input of $('insEvidence').querySelectorAll('input'))input.disabled=locked||!active;
  $('insAck').disabled=locked||!clean;
  $('insPacket').disabled=locked||!active;
  $('insPolicy').disabled=locked||!active;
  for(const id of ['insGrant','insRevoke'])$(id).disabled=locked||!clean||exact;
  $('insResolve').disabled=locked||!clean||!independent()||!row?.duplicate.kind||row.duplicate.kind==='none'||(exact&&!primary.length);
  $('insRoute').disabled=locked||!clean||!independent()||!$('insAck').checked||!row?.gate.readyForReview;
  $('insReturn').disabled=locked||!clean||!independent()||!$('insAck').checked;
  $('insEnqueue').disabled=locked||!clean||row?.status!=='ready';
  $('insAssign').disabled=locked||!clean||!row?.queue||row.queue.effectiveStatus==='held';
  $('insExport').disabled=locked||!clean;
  $('insRefresh').disabled=busy;
  $('insRetry').disabled=busy||!pending;$('insForget').disabled=busy||!pending;$('insPendingPanel').hidden=!pending;
  $('insDraft').textContent=dirty?'Unsaved packet selection. Save it before reviewing, routing or exporting.':'';
  $('insSelected').textContent=row?row.eventFixtureId+' / revision '+row.revision+' / '+row.status:'Select or register a synthetic event.';
  $('insDuplicateNote').textContent=exact?'Exact repeated source: consent is managed only on the registered primary case. Linking does not merge evidence or consent. Recover the primary case below before changing its consent.':row?.duplicate.kind==='ambiguous'?'Related source signal: a separate reviewer must explicitly record a distinct loss before packet routing.':'';
  $('insReceipt').textContent=row?JSON.stringify(row,null,2):'No current case authority.';renderSummary(row);
  $('insHolds').replaceChildren(...(row?[...row.gate.holds,...row.gate.dateFlags]:[]).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  $('insEffects').textContent=workspace?'Local cases: '+workspace.cases.length+' | Local queue rows: '+workspace.queue.length+' | Audit events: '+workspace.audit.eventCount:'';
  $('insHistory').replaceChildren(...(workspace?.cases??[]).map(r=>{const button=document.createElement('button');button.type='button';button.textContent=r.eventFixtureId+' / '+r.status+' / revision '+r.revision;button.disabled=locked;button.addEventListener('click',()=>recover(r.caseId));return button;}));
 }
 function validState(value){if(!value||!Array.isArray(value.cases)||!Array.isArray(value.queue)||value.audit?.valid!==true||value.cases.some(r=>r.tenant!==tenant()))throw Error('Workspace evidence is incomplete or belongs to another tenant.');return value;}
 function install(value,caseId=current?.caseId,{keepDraft=false}={}){workspace=validState(value);summaryVisible=true;current=workspace.cases.find(r=>r.caseId===caseId)??null;$('insAck').checked=false;if(!keepDraft){dirty=false;fields();}epoch++;render();}
 async function refresh({caseId=current?.caseId,keepDraft=true}={}){const value=await api('state',{tenant:tenant()});install(value,caseId,{keepDraft:keepDraft&&dirty&&!!current});return value;}
 async function work(fn){if(busy)return;busy=true;render();try{await fn();}catch(error){current=null;$('insAck').checked=false;epoch++;say(error.message+' Refresh and recover the current saved case before continuing.');}finally{busy=false;render();}}
 async function mutate(kind,body){const frozen={commandId:'ins-'+Date.now().toString(36)+'-'+(++seq),...body};pending={kind,body:structuredClone(frozen)};try{const result=await api(kind,frozen);pending=null;await refresh({caseId:result.caseId,keepDraft:false});say('Saved '+kind+'. Current revision '+current.revision+'. No coverage or fraud decision made.');}catch(error){if(error.definitive||error.code)pending=null;throw error;}}
 async function recover(caseId){await work(async()=>{dirty=false;await refresh({caseId,keepDraft:false});say('Recovered current saved case. Review acknowledgement cleared.');});}
 function on(id,fn){$(id).addEventListener('click',()=>work(fn));}
 function context(){summaryVisible=false;epoch++;$('insAck').checked=false;render();}
 $('insTenant').addEventListener('change',()=>work(async()=>{current=null;workspace=null;dirty=false;pending=null;tenantFields();fields();await refresh({caseId:null,keepDraft:false});say('Tenant fixture changed. No authenticated identity is implied.');}));
 function tenantFields(){for(const [id,role] of [['insActor','operators'],['insReviewer','reviewers'],['insAdjuster','adjusters']])options($(id),catalog.actors[role].filter(v=>v.startsWith(tenant()+'-')));options($('insEvent'),catalog.events.filter(e=>e.tenant===tenant()),e=>e.title+' / '+e.id);}
 $('insEvent').addEventListener('change',()=>{current=null;dirty=false;epoch++;$('insAck').checked=false;fields();render();});
 for(const id of ['insActor','insReviewer','insAdjuster','insPrimary'])$(id).addEventListener('change',context);
 $('insPolicy').addEventListener('change',()=>{dirty=true;context();});$('insAck').addEventListener('change',render);
 on('insIntake',()=>mutate('intake',{tenant:tenant(),actor:$('insActor').value,eventFixtureId:$('insEvent').value}));
 on('insRefresh',async()=>{await refresh();say('Refreshed atomic workspace. Unsaved packet selections are retained; review acknowledgement cleared.');});
 on('insPacket',()=>mutate('set-packet',{...common(),policyId:$('insPolicy').value,evidenceIds:[...$('insEvidence').querySelectorAll('input:checked')].map(input=>input.value)}));
 for(const [id,decision] of [['insGrant','grant'],['insRevoke','revoke']])on(id,()=>mutate('set-consent',{...common(),decision,proofId:current.businessLossId+'-consent-'+decision}));
 on('insResolve',()=>{const primary=workspace.cases.find(r=>r.caseId===$('insPrimary').value),exact=current.duplicate.kind==='exact';return mutate('resolve-duplicate',{...identity(),expectedRevision:current.revision,reviewer:$('insReviewer').value,expectedHash:current.reviewHash,decision:exact?'link-primary':'distinct-loss',primaryCaseId:exact?primary?.caseId:null,primaryExpectedRevision:exact?primary?.revision:null,reasonCode:exact?'same-synthetic-loss':'separate-synthetic-loss'});});
 for(const [id,decision] of [['insRoute','route'],['insReturn','return']])on(id,()=>{const exception=current.gate.dateFlags.length;return mutate('review',{...identity(),expectedRevision:current.revision,reviewer:$('insReviewer').value,expectedHash:current.reviewHash,decision,route:decision==='return'?'none':exception?'adjuster-exception':'adjuster-standard',reasonCode:decision==='return'?'needs-follow-up':exception?'date-exception-routing':'packet-checked'});});
 on('insEnqueue',()=>mutate('enqueue',{...common(),expectedHash:current.reviewHash}));on('insAssign',()=>mutate('assign',{...common(),assignee:$('insAdjuster').value}));
 on('insRetry',async()=>{const saved=structuredClone(pending);const result=await api(saved.kind,saved.body);pending=null;await refresh({caseId:result.caseId,keepDraft:false});say('Recovered exact command intent and current saved authority.');});
 on('insForget',async()=>{pending=null;current=null;dirty=false;await refresh({caseId:null,keepDraft:false});say('Local retry forgotten. Recover the existing source event from history before registering another event.');});
 on('insExport',async()=>{const selected={tenant:tenant(),caseId:current.caseId,revision:current.revision,reviewHash:current.reviewHash,epoch};const verification=await api('verify-audit',{tenant:selected.tenant});const value=validState(await api('state',{tenant:selected.tenant})),row=value.cases.find(r=>r.caseId===selected.caseId);if(epoch!==selected.epoch||tenant()!==selected.tenant||verification.valid!==true||verification.headHash!==value.audit.headHash||!row||row.revision!==selected.revision||row.reviewHash!==selected.reviewHash||row.stale)throw Error('Receipt authority changed during export. Refresh and review the current receipt.');exporter({projectId:'INS-01',scope:catalog.scope,receipt:row,audit:verification,asOf:value.asOf});say('Exported fresh synthetic receipt with verified local audit anchor.');});
 busy=true;render();try{catalog=await api('catalog');$('insClock').textContent=catalog.clock.mode+': '+catalog.clock.asOf;tenantFields();fields();await refresh({caseId:null,keepDraft:false});say('Choose a registered synthetic source event.');}catch(error){say('Unable to load evidence: '+error.message);}finally{busy=false;render();}
 return {getCurrent:()=>current,getWorkspace:()=>workspace,getPending:()=>pending?structuredClone(pending):null};
}
if(typeof document!=='undefined'&&document.getElementById('insIntake'))mountInsurance(document);
