export async function mountExecutive(document, api, download = value => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'executive-local-evidence.json'; a.click(); URL.revokeObjectURL(url);
}) {
  const $ = id => document.getElementById(id), clone = value => JSON.parse(JSON.stringify(value));
  const node = (tag, text, cls) => {const value=document.createElement(tag);value.textContent=String(text??'');if(cls)value.className=cls;return value;};
  const clearBox = (id,text) => $(id).replaceChildren(node('p',text));
  const notice = text => {$('exNotice').textContent=text;};
  let catalog, current=null, busy=false, generation=0, sequence=0;
  const commands=new Map(), command=(kind,body)=>{const key=JSON.stringify([kind,body]);if(!commands.has(key))commands.set(key,`ea-ui-${Date.now()}-${++sequence}`);return {...body,commandId:commands.get(key)};};
  const identity=()=>({tenant:$('exTenant').value,actor:$('exActor').value});
  const selectedActor=()=>catalog?.actors.find(a=>a.tenant===identity().tenant&&a.id===identity().actor);
  const role=name=>selectedActor()?.roles.includes(name);
  const draft=()=>({sourceFixtureId:$('exSource').value,commitmentId:$('exCommitment').value,recipient:$('exRecipient').value});
  const dirty=()=>current&&Object.entries(draft()).some(([key,value])=>value!==current[key]);
  const common=()=>({...identity(),caseId:current.caseId,expectedRevision:current.revision});
  const ids=['exRevise','exApprove','exReject','exRecord','exGrant','exRevoke','exExport'];
  function controls(){
    $('exIngest').disabled=!catalog||busy||!role('operators');
    for(const id of ['exRefresh','exVerify'])$(id).disabled=!catalog||busy;
    for(const id of ['exSource','exCommitment','exRecipient','exTarget'])$(id).disabled=!catalog||busy;
    $('exAck').disabled=!current||busy||dirty()||current.stale||!current.readiness.ready||!role('reviewers');
    for(const id of ids)$(id).disabled=true;
    if(busy||!current)return;
    $('exExport').disabled=false;
    $('exDraft').textContent=dirty()?'Unsaved proposal choices differ from this saved receipt. Save the revision or recover the saved choices before reviewing or recording.':'The editor matches the selected saved proposal. Review uses the displayed exact fingerprint.';
    if(current.stale)return;
    $('exRevise').disabled=!role('operators')||!dirty();
    const independent=role('reviewers')&&![current.intakeActor,current.editedBy,current.aclUpdatedBy].includes(identity().actor);
    $('exApprove').disabled=dirty()||!current.readiness.ready||!independent||!$('exAck').checked;
    $('exReject').disabled=$('exApprove').disabled;
    $('exRecord').disabled=dirty()||!role('operators')||current.status!=='ready';
    const custodian=role('custodians')&&identity().actor===current.acl.custodian;
    $('exGrant').disabled=!custodian||dirty()||$('exTarget').value===current.acl.custodian||current.acl.allowedActors.includes($('exTarget').value);
    $('exRevoke').disabled=!custodian||dirty()||$('exTarget').value===current.acl.custodian||!current.acl.allowedActors.includes($('exTarget').value);
  }
  function clearProtected(text='No accessible saved case selected.'){
    current=null;$('exAck').checked=false;
    clearBox('exReceipt',text);clearBox('exEffects','Refresh to read current accessible local effects.');clearBox('exAudit','No current filtered audit snapshot.');clearBox('exHistory','Refresh to recover an accessible case.');controls();
  }
  function options(id,values,label,preferred){
    const old=preferred??$(id).value;$(id).replaceChildren(...values.map(value=>{const option=node('option',label(value));option.value=value.id;return option;}));
    if(values.some(value=>value.id===old))$(id).value=old;
  }
  function choices(sourceId,commitmentId,recipient){
    const tenant=identity().tenant;
    options('exSource',catalog.sources.filter(source=>source.tenant===tenant),s=>`${s.label}${s.isCurrent?' | current':' | superseded'}`,sourceId);
    const selected=$('exSource').value;
    options('exCommitment',catalog.commitments.filter(c=>c.tenant===tenant&&c.sourceFixtureId===selected),c=>c.label,commitmentId);
    const actors=catalog.actors.filter(actor=>actor.tenant===tenant);
    options('exRecipient',actors,a=>a.id,recipient??`${tenant}-assistant`);
    options('exTarget',actors,a=>a.id,`${tenant}-assistant`);
  }
  function renderReceipt(row,resetChoices=true){
    current=clone(row);$('exAck').checked=false;
    if(resetChoices)choices(row.sourceFixtureId,row.commitmentId,row.recipient);
    const box=$('exReceipt'),facts=node('dl','', 'facts');box.replaceChildren(node('h3',`${row.caseId} | ${row.status}`));
    const values=[['Saved revision',row.revision],['Source version',`${row.sourceFixtureId} | v${row.source.version} | ${row.source.isCurrent?'current fixture version':'superseded'}`],['Source title',row.source.title],['Supplied source contents',row.source.content],['Supplied commitment',row.commitment.actionText],['Owner / proposed recipient',`${row.commitment.owner} / ${row.recipient}`],['Supplied UTC window',`${row.commitment.start} to ${row.commitment.end}`],['Fixture ACL',`revision ${row.acl.revision} | custodian ${row.acl.custodian} | ${row.acl.allowedActors.join(', ')}`],['Exact review fingerprint',row.reviewHash],['Independent local review',row.review?`${row.review.reviewer} | ${row.review.decision} | ${row.review.reasonCode}`:'Fresh independent review required'],['Actual local task',row.task?`generation ${row.task.generation} | stored ${row.task.status} | effective ${row.task.effectiveStatus}`:'No task row recorded']];
    for(const [key,value]of values)facts.append(node('dt',key),node('dd',value));box.append(facts);
    if(row.readiness.holds.length)box.append(node('p',row.readiness.holds.join(' '),'hold'));
    if(row.stale)box.append(node('p','Source/configuration changed. This historical receipt is read-only; it is not current task authority.','hold'));
    box.append(node('p',row.scope));controls();
  }
  function renderState(state,audit){
    const history=$('exHistory');history.replaceChildren(node('p',`${state.cases.length} accessible case(s); ${state.restrictedCaseCount} restricted case(s).`));
    for(const row of state.cases){const button=node('button',`${row.familyId} | ${row.caseId} | revision ${row.revision} | ${row.status}`,'secondary');button.type='button';button.disabled=busy;button.addEventListener('click',()=>recover(row.caseId));history.append(button);}
    $('exEffects').replaceChildren(node('p',`Accessible tasks: ${state.tasks.length} | Accessible decisions: ${state.decisions.length} | Checked audit events: ${state.audit.eventCount}`),node('pre',JSON.stringify({tasks:state.tasks,decisions:state.decisions,restrictedCaseCount:state.restrictedCaseCount},null,2)));
    $('exAudit').replaceChildren(node('pre',JSON.stringify(audit,null,2)));
  }
  async function snapshot(who){
    const state=await api('state',who),audit=await api('audit',who);
    if(!state.audit?.valid||!audit.verification?.valid||state.audit.eventCount!==audit.verification.eventCount||state.audit.headHash!==audit.verification.headHash)throw Error('State and audit changed during recovery. Refresh for one coherent snapshot');
    return{state,audit};
  }
  async function run(work){
    if(busy)return;const token=generation;busy=true;controls();notice('Checking the saved local state...');
    try{await work(token);if(token===generation)notice('Local operation finished. Inspect the current source, review and actual effects.');}
    catch(error){if(token===generation){clearProtected('Current authority could not be established. Recover an accessible saved case before acting.');notice(`Local operation could not establish current state: ${error.message}. Refresh accessible records; an unchanged intake can retry its original command after a lost response.`);}}
    finally{if(token===generation){busy=false;controls();for(const b of $('exHistory').querySelectorAll('button'))b.disabled=false;}}
  }
  async function refresh(selected=null,minimumRevision=0,token=generation,resetChoices=true){
    const who=identity(),evidence=await snapshot(who);if(token!==generation)return;
    renderState(evidence.state,evidence.audit);
    if(selected){const row=evidence.state.cases.find(row=>row.caseId===selected);if(!row||row.revision<minimumRevision)throw Error('Selected case access or saved revision changed');renderReceipt(row,resetChoices);}else{current=null;$('exAck').checked=false;clearBox('exReceipt','Recover one of the accessible saved cases.');controls();}
    return evidence;
  }
  function recover(caseId){if(busy)return;return run(token=>refresh(caseId,0,token));}
  function mutate(kind,body){return run(async token=>{const result=await api(kind,command(kind,body));if(token!==generation)return;await refresh(result.caseId,result.revision,token);});}
  $('exIngest').addEventListener('click',()=>mutate('ingest',{...identity(),...draft()}));
  $('exRevise').addEventListener('click',()=>{if(current)mutate('revise',{...common(),...draft()});});
  for(const [id,decision]of [['exApprove','approve'],['exReject','reject']])$(id).addEventListener('click',()=>{if(current&&!$(id).disabled)mutate('review',{...common(),expectedHash:current.reviewHash,decision,reasonCode:decision==='approve'?'checked':'follow-up'});});
  $('exRecord').addEventListener('click',()=>{if(current&&!$('exRecord').disabled)mutate('record-task',{...common(),expectedHash:current.reviewHash});});
  for(const [id,decision]of [['exGrant','grant'],['exRevoke','revoke']])$(id).addEventListener('click',()=>{if(current&&!$(id).disabled)mutate('set-access',{...common(),targetActor:$('exTarget').value,decision});});
  $('exRefresh').addEventListener('click',()=>{const selected=current?.caseId;run(token=>refresh(selected,0,token,false));});
  $('exVerify').addEventListener('click',()=>run(async token=>{const result=await api('verify-audit',identity());if(!result.valid)throw Error(result.reason??'Audit verification failed');if(token!==generation)return;await refresh(current?.caseId,0,token,false);}));
  $('exExport').addEventListener('click',()=>{if(!current)return;const selected=clone(current),who=identity();run(async token=>{
    const receipt=await api('receipt',{...who,caseId:selected.caseId}),evidence=await snapshot(who);if(token!==generation)return;
    const latest=evidence.state.cases.find(row=>row.caseId===selected.caseId);
    if(!latest||receipt.revision!==latest.revision||latest.revision!==selected.revision||latest.reviewHash!==selected.reviewHash)throw Error('Access or revision changed before export; recover the latest receipt');
    renderState(evidence.state,evidence.audit);renderReceipt(latest,false);
    download({kind:'partial-synthetic-executive-local-evidence',identity:who,receipt:latest,state:evidence.state,audit:evidence.audit,scope:catalog.scope});
  });});
  function identityChanged(tenantChanged){
    generation++;busy=false;clearProtected('Identity changed. Source contents were cleared immediately.');
    if(tenantChanged)options('exActor',catalog.actors.filter(a=>a.tenant===identity().tenant),a=>`${a.id} | ${a.roles.join(', ')||'read selector'}`,`${identity().tenant}-assistant`);
    choices();controls();run(token=>refresh(null,0,token));
  }
  $('exTenant').addEventListener('change',()=>identityChanged(true));$('exActor').addEventListener('change',()=>identityChanged(false));
  for(const id of ['exSource','exCommitment','exRecipient'])$(id).addEventListener('change',()=>{
    generation++;busy=false;$('exAck').checked=false;
    if(id==='exSource')choices($('exSource').value,undefined,$('exRecipient').value);
    controls();notice('Proposal selection changed. Saved authority is unchanged until a revision is saved.');
  });
  $('exTarget').addEventListener('change',()=>{$('exAck').checked=false;controls();});$('exAck').addEventListener('change',controls);
  controls();
  try{catalog=await api('catalog');$('exScope').textContent=catalog.scope;$('exClock').textContent=`${catalog.clock.mode}: ${catalog.clock.asOf}. This is not live calendar monitoring.`;
    options('exTenant',[...new Set(catalog.actors.map(a=>a.tenant))].map(id=>({id})),a=>a.id,'acme');
    options('exActor',catalog.actors.filter(a=>a.tenant===identity().tenant),a=>`${a.id} | ${a.roles.join(', ')||'read selector'}`,`${identity().tenant}-assistant`);
    choices(`src-${identity().tenant}-a-v2`);await run(token=>refresh(null,0,token));
  }catch(error){notice(`Fixture catalog unavailable: ${error.message}`);controls();}
  return{getCurrent:()=>current?clone(current):null,isBusy:()=>busy};
}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  const api=async(kind,body)=>{const response=await fetch('/api/industry/executive/'+kind,kind==='catalog'?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error??'Local request failed');return value;};
  mountExecutive(document,api);
}
