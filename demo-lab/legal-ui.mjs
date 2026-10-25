export async function mountLegal(document,api,download=value=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='legal-synthetic-receipt.json';a.click();URL.revokeObjectURL(url);
}){
 const $=id=>document.getElementById(id),node=(tag,text)=>{const e=document.createElement(tag);e.textContent=String(text??'');return e;};
 let catalog,current=null,busy=false,generation=0,sequence=0,dirty=false;const commands=new Map();
 const names=['legalIntake','legalRefresh','legalSaveParties','legalApproveConflict','legalReturnConflict','legalCreateMatter','legalProposeDeadline','legalApproveDeadline','legalReturnDeadline','legalRecordDeadline','legalExport','legalVerify'];
 const inputIds=['legalTenant','legalSource','legalOperator','legalParties','legalReviewer','legalDeadline','legalConflictAck','legalDeadlineAck'];
 const selectedParties=()=>Array.from($('legalParties').selectedOptions).map(option=>option.value);
 const local=()=>current&&!current.stale;
 const independent=()=>current&&![current.intakeActor,current.partyUpdatedBy].includes($('legalReviewer').value);
 function controls(){
  for(const id of names)$(id).disabled=true;
  for(const id of inputIds)$(id).disabled=!catalog||busy;
  $('legalHistory').querySelectorAll('button').forEach(button=>button.disabled=busy);
  if(!catalog||busy)return;
  $('legalIntake').disabled=false;$('legalRefresh').disabled=false;$('legalVerify').disabled=false;
  if(!local())return;
  $('legalSaveParties').disabled=!!current.matter||!dirty;
  if(dirty)return;
  const reviewed=current.conflictReview?.decision==='approve'&&current.conflictReview.expectedHash===current.conflictHash;
  const conflictReviewable=!current.matter&&independent()&&$('legalConflictAck').checked;
  $('legalApproveConflict').disabled=!conflictReviewable||current.conflict.hold;
  $('legalReturnConflict').disabled=!conflictReviewable;
  $('legalCreateMatter').disabled=!!current.matter||current.conflict.hold||!reviewed;
  $('legalProposeDeadline').disabled=!current.matter||current.conflict.hold||!reviewed;
  const dateIndependent=independent()&&current.deadlineProposal?.proposedBy!==$('legalReviewer').value;
  const dateSaved=current.deadlineProposal?.fixture.id===$('legalDeadline').value;
  const dateReviewable=!!current.deadlineProposal&&dateSaved&&dateIndependent&&$('legalDeadlineAck').checked;
  $('legalApproveDeadline').disabled=!dateReviewable||!current.deadlineEligibility.ready;
  $('legalReturnDeadline').disabled=!dateReviewable;
  $('legalRecordDeadline').disabled=!dateSaved||!current.deadlineEligibility.ready||current.deadlineReview?.decision!=='approve'||current.deadlineReview.expectedHash!==current.deadlineHash||current.calendar?.effectiveStatus==='recorded';
  $('legalExport').disabled=false;
 }
 const notice=text=>{$('legalNotice').textContent=text;};
 function revoke(message){generation++;current=null;dirty=false;$('legalConflictAck').checked=false;$('legalDeadlineAck').checked=false;$('legalReceipt').replaceChildren(node('p',message));controls();}
 function options(id,values,label=value=>value.id??value){const select=$(id);select.replaceChildren();for(const value of values){const option=node('option',label(value));option.value=value.id??value;select.append(option);}}
 function tenantOptions(){const tenant=$('legalTenant').value;options('legalSource',catalog.sources.filter(x=>x.tenant===tenant),x=>x.title);options('legalParties',catalog.parties.filter(x=>x.tenant===tenant),x=>x.label);options('legalDeadline',catalog.deadlines.filter(x=>x.tenant===tenant),x=>`${x.title} | ${x.dueAt}`);options('legalOperator',catalog.actors.operators.filter(x=>x.startsWith(tenant+'-')));options('legalReviewer',catalog.actors.reviewers.filter(x=>x.startsWith(tenant+'-')));}
 function renderReceipt(row){
  current=row;dirty=false;$('legalTenant').value=row.tenant;tenantOptions();$('legalSource').value=row.sourceId;
  for(const option of $('legalParties').options)option.selected=row.partyIds.includes(option.value);
  if(row.deadlineProposal)$('legalDeadline').value=row.deadlineProposal.fixture.id;
  $('legalConflictAck').checked=false;$('legalDeadlineAck').checked=false;
  const box=$('legalReceipt'),facts=node('dl','');box.replaceChildren(node('h3',`${row.caseId} | ${row.status}`));
  if(row.stale){const p=node('p','Historical source/configuration mismatch. This receipt is read-only; prior review cannot authorize another effect.');p.className='hold';box.append(p);}
  const result=node('p',row.conflict.hold?row.conflict.explanation:'No match in this closed synthetic register. A no-match result alone does not authorize a local matter; inspect the saved independent review below.');result.className=row.conflict.hold?'hold':'good';box.append(result);
  const entries=[['Saved revision',row.revision],['Pinned intake source',row.sourceId],['Saved party fixtures',row.partyIds.join(', ')],['Conflict graph version',row.conflict.graphVersion],['Conflict fingerprint',row.conflictHash],['Matched relationships',row.conflict.matches.length?JSON.stringify(row.conflict.matches,null,2):'No match in this closed synthetic register'],['Independent conflict review',row.conflictReview?`${row.conflictReview.reviewer} | ${row.conflictReview.decision}`:'Required before any local matter record'],['Local matter',row.matter?`${row.matter.effectiveStatus} | ${row.matter.label}`:'No persisted local matter'],['Supplied date proposal',row.deadlineProposal?`${row.deadlineProposal.fixture.dueAt} | ${row.deadlineProposal.fixture.sourceReference}`:'No supplied date proposed'],['Date holds',row.deadlineEligibility.holds.join('; ')||'No supplied-date hold at this fixed scenario clock'],['Supplied-date fingerprint',row.deadlineHash??'No date proposal'],['Independent date review',row.deadlineReview?`${row.deadlineReview.reviewer} | ${row.deadlineReview.decision}`:'No date review'],['Local calendar row',row.calendar?`${row.calendar.effectiveStatus} | generation ${row.calendar.generation} | ${row.calendar.label}`:'No persisted local calendar row'],['Evidence clock',`${row.asOf} (fixed synthetic snapshot)`]];
  for(const[key,value]of entries)facts.append(node('dt',key),node('dd',value));box.append(facts);controls();
 }
 function renderState(state,selectedId){
  if(!state.audit?.valid)throw Error('Local integrity evidence is incomplete');
  const history=$('legalHistory');history.replaceChildren();
  for(const row of state.cases){const button=node('button',`${row.sourceId} | ${row.status} | revision ${row.revision}`);button.className='secondary';button.addEventListener('click',()=>{if(busy)return;revoke('Recovering the selected saved case...');run(()=>api('receipt',{tenant:row.tenant,caseId:row.caseId}),value=>value.caseId,row.tenant);});history.append(button);}
  $('legalEffects').replaceChildren(node('p',`Local matter rows: ${state.matters.length} | Local calendar rows: ${state.deadlines.length}`),node('pre',JSON.stringify({matters:state.matters,deadlines:state.deadlines},null,2)));
  $('legalAudit').textContent=JSON.stringify(state.audit,null,2);
  if(selectedId){const row=state.cases.find(x=>x.caseId===selectedId);if(!row)throw Error('Selected case is absent from fresh saved state');renderReceipt(row);}
 }
 async function run(work,select,tenant){
  if(busy)return;const token=generation;busy=true;controls();notice('Reading checked local state...');
  try{const value=await work();if(token!==generation)return;const selectedId=select?.(value);if(tenant){const state=await api('state',{tenant});if(token!==generation)return;renderState(state,selectedId);}if(token===generation)notice('Local operation finished. Inspect the saved evidence and actual effects.');}
  catch(error){if(token===generation){current=null;dirty=false;$('legalConflictAck').checked=false;$('legalDeadlineAck').checked=false;$('legalReceipt').replaceChildren(node('p','The response did not establish current authority. Refresh saved state and recover the case before acting.'));notice(`Current authority unavailable: ${error.message}. Refresh saved state to recover a possibly committed operation; unchanged intent can retry its original command.`);}}
  finally{busy=false;controls();}
 }
 const command=(kind,body)=>{const key=JSON.stringify([kind,body]);if(!commands.has(key))commands.set(key,`legal-ui-${Date.now()}-${++sequence}`);return {...body,commandId:commands.get(key)};};
 function mutate(kind,extra){if(busy||!local())return;const saved=current,body=command(kind,{tenant:saved.tenant,caseId:saved.caseId,expectedRevision:saved.revision,...extra(saved)});run(()=>api(kind,body),value=>value.caseId,saved.tenant);}
 const operator=()=>({actor:$('legalOperator').value});
 $('legalTenant').addEventListener('change',()=>{revoke('Tenant changed. Save a supplied intake or refresh this tenant to recover a case.');if(catalog)tenantOptions();$('legalHistory').replaceChildren();$('legalEffects').replaceChildren();$('legalAudit').textContent='';$('legalVerification').textContent='';});
 $('legalSource').addEventListener('change',()=>revoke('Source changed. Save this supplied intake or refresh saved state to recover an existing case.'));
 for(const id of ['legalOperator','legalReviewer'])$(id).addEventListener('change',()=>{$('legalConflictAck').checked=false;$('legalDeadlineAck').checked=false;controls();});
 $('legalParties').addEventListener('change',()=>{dirty=!!current;$('legalConflictAck').checked=false;$('legalDeadlineAck').checked=false;notice('Unsaved party selection. Save it or refresh saved state to discard edits.');controls();});
 $('legalDeadline').addEventListener('change',()=>{$('legalDeadlineAck').checked=false;controls();});
 for(const id of ['legalConflictAck','legalDeadlineAck'])$(id).addEventListener('change',controls);
 $('legalIntake').addEventListener('click',()=>{if(busy)return;const tenant=$('legalTenant').value,body=command('intake',{tenant,actor:$('legalOperator').value,sourceId:$('legalSource').value});revoke('Saving supplied intake...');run(()=>api('intake',body),value=>value.caseId,tenant);});
 $('legalSaveParties').addEventListener('click',()=>mutate('set-parties',()=>({...operator(),partyIds:selectedParties()})));
 for(const[id,decision]of [['legalApproveConflict','approve'],['legalReturnConflict','return']])$(id).addEventListener('click',()=>mutate('review-conflict',row=>({reviewer:$('legalReviewer').value,expectedHash:row.conflictHash,decision,reasonCode:decision==='approve'?'synthetic-no-match-checked':'conflict-follow-up'})));
 $('legalCreateMatter').addEventListener('click',()=>mutate('create-matter',row=>({...operator(),expectedHash:row.conflictHash})));
 $('legalProposeDeadline').addEventListener('click',()=>mutate('propose-deadline',()=>({...operator(),deadlineFixtureId:$('legalDeadline').value})));
 for(const[id,decision]of [['legalApproveDeadline','approve'],['legalReturnDeadline','return']])$(id).addEventListener('click',()=>mutate('review-deadline',row=>({reviewer:$('legalReviewer').value,expectedHash:row.deadlineHash,decision,reasonCode:decision==='approve'?'supplied-date-checked':'date-follow-up'})));
 $('legalRecordDeadline').addEventListener('click',()=>mutate('record-deadline',row=>({...operator(),expectedHash:row.deadlineHash})));
 $('legalRefresh').addEventListener('click',()=>{if(busy)return;const tenant=$('legalTenant').value,selectedId=current?.caseId;run(()=>api('state',{tenant}),state=>{renderState(state,selectedId);if(!selectedId){dirty=false;$('legalConflictAck').checked=false;$('legalDeadlineAck').checked=false;}},undefined);});
 $('legalVerify').addEventListener('click',()=>run(()=>api('verify-audit',{tenant:$('legalTenant').value}),value=>{if(value?.valid!==true){$('legalVerification').textContent='Local audit verification failed. Saved authority was cleared; recover only after the integrity problem is resolved.';$('legalHistory').replaceChildren();$('legalEffects').replaceChildren();$('legalAudit').textContent='';throw Error('Local audit verification failed');}$('legalVerification').textContent=`Local audit valid | ${value.eventCount} events. No external signature is claimed.`;}));
 $('legalExport').addEventListener('click',()=>{if(busy||!local()||dirty)return;const saved=current;run(async()=>{const verified=await api('verify-audit',{tenant:saved.tenant}),fresh=await api('receipt',{tenant:saved.tenant,caseId:saved.caseId});if(!verified.valid||fresh.stale||JSON.stringify(fresh)!==JSON.stringify(saved))throw Error('Saved evidence changed; refresh before exporting');return fresh;},value=>{renderReceipt(value);download(value);});});
 try{catalog=await api('catalog');options('legalTenant',catalog.tenants);tenantOptions();$('legalClock').textContent=`Evidence clock: ${catalog.clock.mode} | ${catalog.clock.asOf}. This is a fixed synthetic snapshot, not live deadline monitoring.`;notice('Choose a supplied intake. No writes occur when this page loads.');controls();}catch(error){notice(`Legal catalog unavailable: ${error.message}`);}
 return{getCurrent:()=>current,isBusy:()=>busy};
}
if(typeof document!=='undefined'&&document.getElementById('legalIntake'))mountLegal(document,async(kind,body)=>{const response=await fetch(`/api/industry/legal/${kind}`,kind==='catalog'?undefined:{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error??`HTTP ${response.status}`);return value;});
