const calendarClone=value=>JSON.parse(JSON.stringify(value));
const calendarCanonical=value=>Array.isArray(value)?value.map(calendarCanonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,calendarCanonical(value[key])])):value;
const calendarSame=(a,b)=>JSON.stringify(calendarCanonical(a))===JSON.stringify(calendarCanonical(b));
const calendarFail=message=>{throw Error(message);};
const calendarHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const calendarInteger=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;
const calendarText=value=>typeof value==='string'&&value.length>0&&value.length<=20000&&value.isWellFormed();
const calendarBytes=value=>new TextEncoder().encode(value).length;
function calendarInstant(value){if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)calendarFail('Calendar snapshot requires exact supplied whole-second UTC instants');return value.replace(/[-:]/gu,'').replace('.000','');}
const calendarEscape=value=>String(value).replace(/\\/gu,'\\\\').replace(/\r\n|\r|\n/gu,'\\n').replace(/,/gu,'\\,').replace(/;/gu,'\\;');
async function calendarUidHash(tenant,caseId){const bytes=new TextEncoder().encode(JSON.stringify([tenant,caseId])),hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');}
export function executiveCalendarEligible(row){return Boolean(row&&!row.stale&&row.status==='active'&&row.readiness?.ready&&row.review?.decision==='approve'&&row.review.expectedHash===row.reviewHash&&calendarHash(row.reviewHash)&&row.task?.status==='active'&&row.task.effectiveStatus==='active'&&row.task.reviewHash===row.reviewHash&&row.task.tenant===row.tenant&&row.task.caseId===row.caseId&&row.task.sourceFixtureId===row.sourceFixtureId&&row.task.sourceVersion===row.source?.version&&row.task.recipient===row.recipient&&row.task.actionText===row.commitment?.actionText&&row.task.start===row.commitment?.start&&row.task.end===row.commitment?.end&&row.task.owner===row.commitment?.owner&&calendarInteger(row.task.sourceVersion)&&calendarText(row.task.actionText)&&calendarInteger(row.task.generation)&&calendarInteger(row.revision));}
function completionTime(value){return typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
export function executiveCompletionEligible(row,who,actors){
 const task=row?.task,gate=row?.completionReadiness,source=row?.source,review=row?.review,acl=row?.acl;
 if(!row||row.stale!==false||!task||task.status!=='active'||task.completion!==undefined||!['active','held'].includes(row.status)||gate?.ready!==true||!Array.isArray(gate.holds)||gate.holds.length||!completionTime(gate.asOf)||gate.asOf!==row.readiness?.asOf||source?.isCurrent!==true||!completionTime(source.receivedAt)||!completionTime(source.validUntil)||Date.parse(source.receivedAt)>Date.parse(gate.asOf)||Date.parse(source.validUntil)<=Date.parse(gate.asOf))return false;
 if(!Array.isArray(acl?.allowedActors)||!acl.allowedActors.includes(row.recipient)||!acl.allowedActors.includes(who?.actor)||who?.tenant!==row.tenant||!actors?.some(actor=>actor.tenant===who.tenant&&actor.id===who.actor&&actor.roles.includes('operators')))return false;
 if(review?.decision!=='approve'||review.expectedHash!==row.reviewHash||!calendarHash(row.reviewHash)||!acl.allowedActors.includes(review.reviewer)||[row.intakeActor,row.editedBy,row.aclUpdatedBy].includes(review.reviewer)||!actors.some(actor=>actor.tenant===row.tenant&&actor.id===review.reviewer&&actor.roles.includes('reviewers')))return false;
 return row.id===`${row.tenant}:${row.caseId}`&&source.id===row.sourceFixtureId&&calendarInteger(source.version)&&task.id===row.id&&task.tenant===row.tenant&&task.caseId===row.caseId&&task.sourceFixtureId===row.sourceFixtureId&&task.sourceVersion===source.version&&task.recipient===row.recipient&&task.reviewHash===row.reviewHash&&task.owner===row.commitment?.owner&&task.actionText===row.commitment?.actionText&&task.start===row.commitment?.start&&task.end===row.commitment?.end&&calendarInteger(task.generation)&&calendarInteger(row.revision);
}
export function validateExecutiveCompletedTask(row){
 const task=row?.task;if(task?.status!=='completed'&&row?.status!=='completed')return;
 const c=task?.completion,fields=['actor','asOf','reasonCode','reviewHash','sourceFixtureId','sourceVersion','aclRevision','generation','label'];
 if(row.status!=='completed'||task?.status!=='completed'||task.effectiveStatus!=='completed'||row.id!==`${row.tenant}:${row.caseId}`||task.id!==row.id||task.tenant!==row.tenant||task.caseId!==row.caseId||task.sourceFixtureId!==row.sourceFixtureId||task.recipient!==row.recipient||typeof row.stale!=='boolean'||(row.stale===false&&(task.sourceVersion!==row.source?.version||task.owner!==row.commitment?.owner||task.actionText!==row.commitment?.actionText||task.start!==row.commitment?.start||task.end!==row.commitment?.end))||!c||!calendarSame(Object.keys(c).sort(),fields.sort())||!calendarText(c.actor)||!completionTime(c.asOf)||!completionTime(task.recordedAt)||Date.parse(c.asOf)<Date.parse(task.recordedAt)||c.reasonCode!=='reported-complete'||!calendarHash(c.reviewHash)||c.reviewHash!==task.reviewHash||c.sourceFixtureId!==task.sourceFixtureId||c.sourceVersion!==task.sourceVersion||!calendarInteger(c.aclRevision)||!calendarInteger(row.acl?.revision)||c.aclRevision>row.acl.revision||c.generation!==task.generation||!calendarInteger(c.generation)||c.label!=='Synthetic local completion reported by a fixture operator; no real work or provider outcome verified.')throw Error('Completed task evidence is inconsistent; recover current local history');
}
function validateCompletionResult(row,before,who){
 validateExecutiveCompletedTask(row);
 const c=row?.task?.completion;
 if(!c||row.tenant!==before.tenant||row.caseId!==before.caseId||row.revision!==before.revision+1||row.reviewHash!==before.reviewHash||c.actor!==who.actor||c.aclRevision!==before.acl.revision||c.asOf!==row.completionReadiness?.asOf)throw Error('Completion response differs from the selected revision and actor');
 const actual=calendarClone(row.task),expected=calendarClone(before.task);delete actual.completion;delete actual.effectiveStatus;delete expected.effectiveStatus;expected.status='completed';if(!calendarSame(actual,expected))throw Error('Completion response changed the original local task');
}
export async function validateExecutiveCalendarResponse(value,row){
 if(!executiveCalendarEligible(row))calendarFail('Calendar download requires a current active reviewed local task');
 if(!value||typeof value!=='object'||Array.isArray(value))calendarFail('Invalid calendar snapshot response');
 const fields=['kind','tenant','caseId','revision','reviewHash','taskGeneration','uid','sequence','filename','mediaType','content','audit','asOf','scope'];if(!calendarSame(Object.keys(value).sort(),[...fields].sort()))calendarFail('Calendar response fields differ from its closed contract');
 if(value.kind!=='synthetic-executive-calendar-snapshot'||value.tenant!==row.tenant||value.caseId!==row.caseId||value.revision!==row.revision||value.reviewHash!==row.reviewHash||value.taskGeneration!==row.task.generation)calendarFail('Calendar snapshot differs from selected case revision, review or task generation');
 const uidHash=await calendarUidHash(row.tenant,row.caseId),uid='ea-'+uidHash+'@portfolio.invalid';if(value.uid!==uid||value.sequence!==row.revision||value.filename!==`executive-${uidHash.slice(0,24)}-r${row.revision}.ics`||value.mediaType!=='text/calendar;charset=utf-8')calendarFail('Calendar identity, sequence or download metadata differs from selected task');
 if(!value.audit||value.audit.valid!==true||!Number.isSafeInteger(value.audit.eventCount)||value.audit.eventCount<0||!calendarHash(value.audit.headHash)||!calendarText(value.scope))calendarFail('Calendar audit evidence is malformed');calendarInstant(value.asOf);
 if(!calendarText(value.content)||!value.content.endsWith('\r\n'))calendarFail('Calendar content must end in CRLF');const physical=value.content.slice(0,-2).split('\r\n'),logical=[];for(const line of physical){if(!line.length||/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(line)||calendarBytes(line)>75)calendarFail('Calendar physical lines violate the bounded UTF-8/CRLF contract');if(line.startsWith(' ')){if(!logical.length||line.length===1)calendarFail('Calendar continuation has no preceding content');logical[logical.length-1]+=line.slice(1);}else logical.push(line);}
 const task=row.task,expected=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Frosty9810//Synthetic Executive Calendar Snapshot v1//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+uid,'SEQUENCE:'+row.revision,'DTSTAMP:'+calendarInstant(task.recordedAt),'DTSTART:'+calendarInstant(task.start),'DTEND:'+calendarInstant(task.end),'SUMMARY:'+calendarEscape('SYNTHETIC - '+task.actionText),'DESCRIPTION:'+calendarEscape('Synthetic local task snapshot only. Not an invitation or provider booking. Downloaded files cannot be recalled.'),'STATUS:TENTATIVE','TRANSP:TRANSPARENT','X-EXECUTIVE-TENANT:'+calendarEscape(row.tenant),'X-EXECUTIVE-CASE-ID:'+calendarEscape(row.caseId),'X-EXECUTIVE-SOURCE-ID:'+calendarEscape(task.sourceFixtureId),'X-EXECUTIVE-SOURCE-VERSION:'+task.sourceVersion,'X-EXECUTIVE-REVIEW-HASH:'+row.reviewHash,'X-EXECUTIVE-TASK-GENERATION:'+task.generation,'END:VEVENT','END:VCALENDAR'];if(!calendarSame(logical,expected))calendarFail('Calendar properties differ from the exact reviewed synthetic task; invitations and alarms are not allowed');return calendarClone(value);
}
export async function mountExecutive(document, api, download = value => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'executive-local-evidence.json'; a.click(); URL.revokeObjectURL(url);
}, downloadCalendar = value => {
  const url = URL.createObjectURL(new Blob([value.content], {type:value.mediaType}));
  const a = document.createElement('a'); a.href = url; a.download = value.filename; a.click(); URL.revokeObjectURL(url);
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
  const ids=['exRevise','exApprove','exReject','exRecord','exGrant','exRevoke','exExport','exCalendar','exComplete'];
  function controls(){
    $('exIngest').disabled=!catalog||busy||!role('operators');
    for(const id of ['exRefresh','exVerify'])$(id).disabled=!catalog||busy;
    for(const id of ['exSource','exCommitment','exRecipient','exTarget'])$(id).disabled=!catalog||busy;
    $('exAck').disabled=!current||busy||dirty()||current.stale||current.task?.status==='completed'||!current.readiness.ready||!role('reviewers');
    $('exCompleteAck').disabled=busy||dirty()||!executiveCompletionEligible(current,identity(),catalog?.actors);
    for(const id of ids)$(id).disabled=true;
    if(busy||!current)return;
    $('exExport').disabled=false;
    $('exDraft').textContent=dirty()?'Unsaved proposal choices differ from this saved receipt. Save the revision or recover the saved choices before reviewing or recording.':'The editor matches the selected saved proposal. Review uses the displayed exact fingerprint.';
    if(current.stale)return;
    $('exCalendar').disabled=dirty()||!executiveCalendarEligible(current);
    const completed=current.task?.status==='completed';
    $('exComplete').disabled=dirty()||!$('exCompleteAck').checked||!executiveCompletionEligible(current,identity(),catalog?.actors);
    $('exRevise').disabled=completed||!role('operators')||!dirty();
    const independent=role('reviewers')&&![current.intakeActor,current.editedBy,current.aclUpdatedBy].includes(identity().actor);
    $('exApprove').disabled=completed||dirty()||!current.readiness.ready||!independent||!$('exAck').checked;
    $('exReject').disabled=$('exApprove').disabled;
    $('exRecord').disabled=completed||dirty()||!role('operators')||current.status!=='ready';
    const custodian=role('custodians')&&identity().actor===current.acl.custodian;
    $('exGrant').disabled=!custodian||dirty()||$('exTarget').value===current.acl.custodian||current.acl.allowedActors.includes($('exTarget').value);
    $('exRevoke').disabled=!custodian||dirty()||$('exTarget').value===current.acl.custodian||!current.acl.allowedActors.includes($('exTarget').value);
  }
  function clearProtected(text='No accessible saved case selected.'){
    current=null;$('exAck').checked=false;$('exCompleteAck').checked=false;
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
    validateExecutiveCompletedTask(row);
    current=clone(row);$('exAck').checked=false;$('exCompleteAck').checked=false;
    if(resetChoices)choices(row.sourceFixtureId,row.commitmentId,row.recipient);
    const box=$('exReceipt'),facts=node('dl','', 'facts');box.replaceChildren(node('h3',`${row.caseId} | ${row.status}`));
    const values=[['Saved revision',row.revision],['Source version',`${row.sourceFixtureId} | v${row.source.version} | ${row.source.isCurrent?'current fixture version':'superseded'}`],['Source title',row.source.title],['Supplied source contents',row.source.content],['Supplied commitment',row.commitment.actionText],['Owner / proposed recipient',`${row.commitment.owner} / ${row.recipient}`],['Supplied UTC window',`${row.commitment.start} to ${row.commitment.end}`],['Fixture ACL',`revision ${row.acl.revision} | custodian ${row.acl.custodian} | ${row.acl.allowedActors.join(', ')}`],['Exact review fingerprint',row.reviewHash],['Independent local review',row.review?`${row.review.reviewer} | ${row.review.decision} | ${row.review.reasonCode}`:'Fresh independent review required'],['Actual local task',row.task?`generation ${row.task.generation} | stored ${row.task.status} | effective ${row.task.effectiveStatus}`:'No task row recorded']];
    for(const [key,value]of values)facts.append(node('dt',key),node('dd',value));box.append(facts);
    if(row.task?.completion)box.append(node('p',`Local completion reported by ${row.task.completion.actor} at ${row.task.completion.asOf} for generation ${row.task.completion.generation}. ${row.task.completion.label}`));
    if(row.completionReadiness?.holds?.length&&row.task?.status!=='completed')box.append(node('p','Completion holds: '+row.completionReadiness.holds.join(' '),'hold'));
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
    for(const row of state.cases){validateExecutiveCompletedTask(row);if(row.task?.status==='completed'){const task=state.tasks.find(task=>task.id===row.id);if(!task||!calendarSame(task,row.task))throw Error('Completed case and task history differ');}}
    return{state,audit};
  }
  async function run(work){
    if(busy)return;const token=generation;busy=true;controls();notice('Checking the saved local state...');
    try{const result=await work(token);if(token===generation)notice(typeof result==='string'?result:'Local operation finished. Inspect the current source, review and actual effects.');}
    catch(error){if(token===generation){clearProtected('Current authority could not be established. Recover an accessible saved case before acting.');notice(`Local operation could not establish current state: ${error.message}. Refresh accessible records; an unchanged intake can retry its original command after a lost response.`);}}
    finally{if(token===generation){busy=false;controls();for(const b of $('exHistory').querySelectorAll('button'))b.disabled=false;}}
  }
  async function refresh(selected=null,minimumRevision=0,token=generation,resetChoices=true){
    const who=identity(),evidence=await snapshot(who);if(token!==generation)return;
    for(const row of evidence.state.cases)validateExecutiveCompletedTask(row);
    renderState(evidence.state,evidence.audit);
    if(selected){const row=evidence.state.cases.find(row=>row.caseId===selected);if(!row||row.revision<minimumRevision)throw Error('Selected case access or saved revision changed');renderReceipt(row,resetChoices);}else{current=null;$('exAck').checked=false;$('exCompleteAck').checked=false;clearBox('exReceipt','Recover one of the accessible saved cases.');controls();}
    return evidence;
  }
  function recover(caseId){if(busy)return;return run(token=>refresh(caseId,0,token));}
  function mutate(kind,body){return run(async token=>{const result=await api(kind,command(kind,body));if(token!==generation)return;await refresh(result.caseId,result.revision,token);});}
  $('exIngest').addEventListener('click',()=>mutate('ingest',{...identity(),...draft()}));
  $('exRevise').addEventListener('click',()=>{if(current)mutate('revise',{...common(),...draft()});});
  for(const [id,decision]of [['exApprove','approve'],['exReject','reject']])$(id).addEventListener('click',()=>{if(current&&!$(id).disabled)mutate('review',{...common(),expectedHash:current.reviewHash,decision,reasonCode:decision==='approve'?'checked':'follow-up'});});
  $('exRecord').addEventListener('click',()=>{if(current&&!$('exRecord').disabled)mutate('record-task',{...common(),expectedHash:current.reviewHash});});
  $('exComplete').addEventListener('click',()=>{if(!current||$('exComplete').disabled||!$('exCompleteAck').checked||!executiveCompletionEligible(current,identity(),catalog?.actors))return;const before=clone(current),who=identity(),body=command('complete-task',{...common(),expectedHash:current.reviewHash,expectedGeneration:current.task.generation,reasonCode:'reported-complete'});run(async token=>{
    const result=await api('complete-task',body);if(token!==generation)return;validateCompletionResult(result,before,who);
    const evidence=await refresh(result.caseId,result.revision,token);if(token!==generation)return;const latest=evidence.state.cases.find(row=>row.caseId===before.caseId),task=evidence.state.tasks.find(row=>row.caseId===before.caseId&&row.tenant===who.tenant);
    if(!latest||!task||!calendarSame(latest.task,result.task)||!calendarSame(task,latest.task))throw Error('Completion and recovered task history changed; recover current evidence');
    return 'Synthetic local completion recorded once. This reports an administrative status only; no real work or provider outcome was verified. Downloaded calendar files cannot be recalled.';
  });});
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
  $('exCalendar').addEventListener('click',()=>{if(!current||$('exCalendar').disabled)return;const selected=clone(current),who=identity();run(async token=>{
    const response=await api('calendar-export',{...who,caseId:selected.caseId,expectedRevision:selected.revision,expectedHash:selected.reviewHash});if(token!==generation)return;
    const checked=await validateExecutiveCalendarResponse(response,selected);if(token!==generation)return;
    const receipt=await api('receipt',{...who,caseId:selected.caseId});if(token!==generation)return;
    const evidence=await snapshot(who);if(token!==generation)return;const latest=evidence.state.cases.find(row=>row.caseId===selected.caseId),task=evidence.state.tasks.find(row=>row.caseId===selected.caseId&&row.tenant===who.tenant);
    if(dirty()||!latest||!executiveCalendarEligible(receipt)||!executiveCalendarEligible(latest)||!latest.acl.allowedActors.includes(who.actor)||!receipt.acl.allowedActors.includes(who.actor))throw Error('Current source access or active reviewed task changed before calendar download');
    for(const row of [receipt,latest])if(row.tenant!==who.tenant||row.revision!==selected.revision||row.reviewHash!==selected.reviewHash||row.task.generation!==selected.task.generation||!calendarSame(row.task,selected.task))throw Error('Case revision, reviewed task or generation changed before calendar download');
    if(!calendarSame(receipt,latest)||!task||!calendarSame(task,latest.task)||checked.audit.valid!==evidence.state.audit.valid||checked.audit.eventCount!==evidence.state.audit.eventCount||checked.audit.headHash!==evidence.state.audit.headHash||checked.asOf!==evidence.state.asOf||receipt.readiness.asOf!==checked.asOf||latest.readiness.asOf!==checked.asOf)throw Error('Calendar receipt, accessible task and audit are not one current snapshot');
    await validateExecutiveCalendarResponse(checked,latest);if(token!==generation)return;
    renderState(evidence.state,evidence.audit);renderReceipt(latest,false);downloadCalendar(clone(checked));return 'Downloaded a tentative transparent synthetic UTC snapshot. It creates no provider booking or invitation; downloaded files cannot be recalled or automatically updated.';
  });});
  function identityChanged(tenantChanged){
    generation++;busy=false;clearProtected('Identity changed. Source contents were cleared immediately.');
    if(tenantChanged)options('exActor',catalog.actors.filter(a=>a.tenant===identity().tenant),a=>`${a.id} | ${a.roles.join(', ')||'read selector'}`,`${identity().tenant}-assistant`);
    choices();controls();run(token=>refresh(null,0,token));
  }
  $('exTenant').addEventListener('change',()=>identityChanged(true));$('exActor').addEventListener('change',()=>identityChanged(false));
  for(const id of ['exSource','exCommitment','exRecipient'])$(id).addEventListener('change',()=>{
    generation++;busy=false;$('exAck').checked=false;$('exCompleteAck').checked=false;
    if(id==='exSource')choices($('exSource').value,undefined,$('exRecipient').value);
    controls();notice('Proposal selection changed. Saved authority is unchanged until a revision is saved.');
  });
  $('exTarget').addEventListener('change',()=>{$('exAck').checked=false;$('exCompleteAck').checked=false;controls();});$('exAck').addEventListener('change',controls);$('exCompleteAck').addEventListener('change',controls);
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
