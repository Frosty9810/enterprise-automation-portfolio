import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {referralDesk,openReferral} from './referral-core.mjs';
const moduleUrl=new URL('./referral-core.mjs',import.meta.url).href;
const owner={tenant:'acme'};
function setup(t,options={}){const db=new DatabaseSync(':memory:'),desk=referralDesk(db,options);t.after(()=>db.close());return{db,desk};}
function temp(t){const dir=mkdtempSync(join(tmpdir(),'referral-test-'));t.after(()=>{if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw Error('Unexpected temporary path.');rmSync(dir,{recursive:true,force:true});});return dir;}
const input=(desk,tenant='acme',n=1)=>structuredClone(desk.catalog().intakeExamples.find(x=>x.id===`ref-${tenant}-0${n}`).input);
const common=(row,commandId)=>({commandId,tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision,actor:`${row.tenant}-intake`});
const consent=(desk,row,decision='grant',commandId='consent-'+row.revision)=>desk.setConsent({...common(row,commandId),decision,proofId:`${row.referralFixtureId}-consent-${decision}`});
const packet=(desk,row,documentIds=[`${row.referralFixtureId}-form-v2`,`${row.referralFixtureId}-order-v1`],payerId='DEMO_PAYER_A',commandId='packet-'+row.revision)=>desk.setPacket({...common(row,commandId),payerId,documentIds});
const review=(desk,row,commandId='review-'+row.revision,decision='approve')=>desk.review({commandId,tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision,reviewer:`${row.tenant}-reviewer`,expectedHash:row.reviewHash,decision,reasonCode:decision==='approve'?'packet-checked':'needs-follow-up'});
const enqueue=(desk,row,commandId='enqueue-'+row.revision)=>desk.enqueue({...common(row,commandId),expectedHash:row.reviewHash});
function ready(desk,tenant='acme',n=1){let row=desk.intake(input(desk,tenant,n));row=packet(desk,row);row=consent(desk,row);return review(desk,row);}
const reject=(fn,pattern)=>assert.throws(fn,pattern);

test('synthetic referral becomes a reviewed local queue assignment without clinical or provider actions',t=>{
 const {desk}=setup(t);let row=desk.intake(input(desk));assert.equal(row.status,'held');assert.equal(row.consent.granted,false);assert.deepEqual(row.readiness.missingKinds,['order']);
 row=packet(desk,row);row=consent(desk,row);assert.equal(row.status,'review-required');reject(()=>enqueue(desk,row),/independently reviewed/);row=review(desk,row);assert.equal(row.status,'ready');row=enqueue(desk,row);assert.equal(row.status,'queued');
 row=desk.assign({...common(row,'assign'),assignee:'acme-staff'});assert.equal(row.status,'assigned');assert.equal(row.queue.assignee,'acme-staff');assert.equal(desk.state(owner).queue.length,1);assert.equal(desk.verifyAudit(owner).valid,true);assert.equal(desk.state(owner).audit.eventCount,6);
});
test('consent revocation atomically holds queue and assignment; regrant never revives old review',t=>{
 const{desk}=setup(t);let row=enqueue(desk,ready(desk));row=desk.assign({...common(row,'assigned'),assignee:'acme-staff'});const oldHash=row.reviewHash;row=consent(desk,row,'revoke','revoke');assert.equal(row.status,'held');assert.equal(row.queue.status,'held');assert.equal(row.queue.assignee,null);reject(()=>desk.assign({...common(row,'forbidden-assignment'),assignee:'acme-staff'}),/eligible/);
 row=consent(desk,row,'grant','regrant');assert.notEqual(row.reviewHash,oldHash);assert.equal(row.review,null);reject(()=>enqueue(desk,row),/independently reviewed/);row=review(desk,row,'new-review');row=enqueue(desk,row,'reenqueue');assert.equal(row.queue.generation,2);assert.equal(desk.state(owner).queue.length,1);
});
test('packet revision and changed fictional checklist invalidate review and actual local queue',t=>{
 const{desk}=setup(t);let row=enqueue(desk,ready(desk));const oldHash=row.reviewHash;row=packet(desk,row,row.documentIds,'DEMO_PAYER_B','payer-change');assert.equal(row.packetVersion,3);assert.notEqual(row.reviewHash,oldHash);assert.equal(row.queue.status,'held');assert.deepEqual(row.readiness.missingKinds,['supporting_document']);reject(()=>review(desk,row),/readiness hold/);
 row=packet(desk,row,[...row.documentIds,`${row.referralFixtureId}-support-v1`],'DEMO_PAYER_B','complete-B');row=review(desk,row);row=enqueue(desk,row);assert.equal(row.queue.generation,2);
});
for(const kind of ['unknown','missing','superseded','expired'])test(`administrative ${kind} fixture never authorizes a queue`,t=>{
 const{desk}=setup(t);let row=desk.intake(input(desk,'acme',kind==='expired'?2:1));row=consent(desk,row);
 if(kind==='unknown')row=packet(desk,row,[], 'UNKNOWN_DEMO');else if(kind==='missing')row=packet(desk,row,[]);else if(kind==='superseded')row=packet(desk,row,[`${row.referralFixtureId}-form-v1`,`${row.referralFixtureId}-order-v1`]);else row=packet(desk,row);
 assert.equal(row.status,'held');assert.ok(row.readiness.holds.length);reject(()=>review(desk,row),/readiness hold/);reject(()=>enqueue(desk,row));assert.equal(desk.state(owner).queue.length,0);
});
test('caller cannot introduce patient names clinical text payer policies or arbitrary source events',t=>{
 const{desk}=setup(t),sample=input(desk);for(const extra of [{patientName:'not accepted'},{clinicalText:'not accepted'},{documents:[]},{sourceEventId:'unregistered-source'},{referralFixtureId:'external-referral'}])reject(()=>desk.intake({...sample,...extra}));assert.equal(desk.state(owner).cases.length,0);
});
test('closed consent proofs are bound to tenant referral and decision',t=>{
 const{desk}=setup(t),row=desk.intake(input(desk));for(const proofId of ['unknown','ref-beta-01-consent-grant','ref-acme-02-consent-grant','ref-acme-01-consent-revoke'])reject(()=>desk.setConsent({...common(row,'bad-proof-'+proofId),decision:'grant',proofId}));assert.equal(desk.receipt({tenant:'acme',caseId:row.caseId}).consent.revision,0);
});
test('document selectors are case-owned and unambiguous, not caller-supplied clinical payloads',t=>{
 const{desk}=setup(t),row=desk.intake(input(desk));for(const ids of [['ref-beta-01-form-v2'],['ref-acme-02-form-v2'],['unknown'],['ref-acme-01-form-v1','ref-acme-01-form-v2'],['ref-acme-01-form-v2','ref-acme-01-form-v2'],[{}]])reject(()=>packet(desk,row,ids));reject(()=>packet(desk,row,[],'real-payer'));assert.equal(desk.state(owner).cases[0].packetVersion,1);
});
test('staff review must be independent, hash-bound and consistent with the closed reason',t=>{
 const{desk}=setup(t);let row=desk.intake({...input(desk),actor:'acme-dual-role'});row=packet(desk,row);row=consent(desk,row);
 const base={commandId:'review',tenant:'acme',caseId:row.caseId,expectedRevision:row.revision,reviewer:'acme-reviewer',expectedHash:row.reviewHash,decision:'approve',reasonCode:'packet-checked'};
 for(const delta of [{reviewer:'acme-dual-role'},{expectedHash:'old'},{reviewer:'beta-reviewer'},{reasonCode:'needs-follow-up'},{decision:'approve-care'}])reject(()=>desk.review({...base,...delta}));row=review(desk,row,'rejected','reject');assert.equal(row.status,'review-required');reject(()=>enqueue(desk,row));
});
test('all current case transitions use compare-and-swap and rejected stale commands have no effects',t=>{
 const{desk}=setup(t);let row=ready(desk),before=desk.state(owner);const stale={...common(row,'stale'),expectedRevision:row.revision-1};for(const fn of [()=>desk.setPacket({...stale,payerId:row.payerId,documentIds:row.documentIds}),()=>desk.setConsent({...stale,decision:'revoke',proofId:'ref-acme-01-consent-revoke'}),()=>desk.enqueue({...stale,expectedHash:row.reviewHash}),()=>desk.assign({...stale,assignee:'acme-staff'}),()=>desk.review({commandId:'stale',tenant:'acme',caseId:row.caseId,expectedRevision:row.revision-1,reviewer:'acme-reviewer',expectedHash:row.reviewHash,decision:'approve',reasonCode:'packet-checked'})])reject(fn,/revision changed/);assert.deepEqual(desk.state(owner),before);
});
test('immutable command replay and source event identity prevent duplicate referrals and queue generations',t=>{
 const{desk}=setup(t),sample=input(desk);let row=desk.intake(sample);assert.equal(desk.intake(sample).caseId,row.caseId);reject(()=>desk.intake({...sample,commandId:'another-intake'}),/Source event/);reject(()=>desk.intake({...sample,actor:'acme-dual-role'}),/immutable intent/);row=packet(desk,row);row=consent(desk,row);row=review(desk,row);const intent={...common(row,'enqueue-stable'),expectedHash:row.reviewHash};row=desk.enqueue(intent);assert.equal(desk.enqueue(intent).revision,row.revision);reject(()=>desk.enqueue({...intent,commandId:'second-enqueue',expectedRevision:row.revision}),/active local queue/);reject(()=>desk.assign({...common(row,'enqueue-stable'),assignee:'acme-staff'}),/immutable intent/);assert.equal(desk.state(owner).queue.length,1);
});
test('tenant scopes selectors actor roles and data copies remain separate',t=>{
 const{desk}=setup(t),acme=enqueue(desk,ready(desk)),beta=enqueue(desk,ready(desk,'beta'));assert.equal(desk.state(owner).queue.length,1);assert.equal(desk.state({tenant:'beta'}).queue[0].caseId,beta.caseId);reject(()=>desk.receipt({tenant:'beta',caseId:acme.caseId}));reject(()=>desk.assign({...common(acme,'wrong-staff'),assignee:'beta-staff'}));
 const catalog=desk.catalog();catalog.documents[0].isCurrent=true;const state=desk.state(owner);state.cases[0].consent.granted=false;assert.equal(desk.state(owner).cases[0].consent.granted,true);for(const tenant of [['acme'],null,{},1]){reject(()=>desk.state({tenant}));reject(()=>desk.receipt({tenant,caseId:acme.caseId}));}
});
for(const bad of [null,[],{}, {constructor:'bad'}, {tenant:'acme',commandId:()=>{}}, {tenant:'acme',commandId:Infinity}])test(`strict intake schema rejects ${JSON.stringify(bad)}`,t=>{const{desk}=setup(t);reject(()=>desk.intake(bad));assert.equal(desk.verifyAudit(owner).eventCount,0);});
test('trusted clock supports exclusive expiry without pretending the persisted queue was background-updated',t=>{
 let clock='2026-10-25T12:00:00.000Z';const{desk}=setup(t,{clock:()=>clock});let row=enqueue(desk,ready(desk)),before=desk.verifyAudit(owner).eventCount;clock='2026-12-01T00:00:00.000Z';row=desk.receipt({tenant:'acme',caseId:row.caseId});assert.equal(row.status,'held');assert.equal(row.queue.status,'queued');assert.equal(row.queue.effectiveStatus,'held');reject(()=>desk.assign({...common(row,'expired-assign'),assignee:'acme-staff'}),/eligible/);assert.equal(desk.verifyAudit(owner).eventCount,before);
});
for(const clock of ['2026-02-30T00:00:00.000Z','2026-10-25T12:00:00Z','2100-01-01T00:00:00.000Z',null])test(`invalid injected clock fails closed ${String(clock)}`,t=>{const{desk}=setup(t,{clock:()=>clock});reject(()=>desk.intake(input(desk)));assert.equal(desk.verifyAudit(owner).eventCount,0);});
for(const trigger of ['queue','head'])test(`SQLite ${trigger} failure rolls back case queue event and anchor together`,t=>{
 const{db,desk}=setup(t);const row=ready(desk),before=desk.state(owner);db.exec(trigger==='queue'?"CREATE TRIGGER reject_queue BEFORE INSERT ON referral_queue BEGIN SELECT RAISE(ABORT,'synthetic queue failure'); END;":"CREATE TRIGGER reject_head BEFORE UPDATE ON referral_head BEGIN SELECT RAISE(ABORT,'synthetic head failure'); END;");reject(()=>enqueue(desk,row));assert.deepEqual(desk.state(owner),before);
});
test('revocation rollback cannot partially clear review or assignment',t=>{
 const{db,desk}=setup(t);const row=enqueue(desk,ready(desk)),before=desk.state(owner);db.exec("CREATE TRIGGER reject_hold BEFORE UPDATE ON referral_queue BEGIN SELECT RAISE(ABORT,'synthetic hold failure'); END;");reject(()=>consent(desk,row,'revoke'));assert.deepEqual(desk.state(owner),before);
});
for(const sql of ["UPDATE referral_events SET request='{}' WHERE seq=1","DELETE FROM referral_events WHERE seq=(SELECT MAX(seq) FROM referral_events)","DELETE FROM referral_head","UPDATE referral_cases SET body='{}'","DELETE FROM referral_queue"])test(`anchored integrity rejects ${sql}`,t=>{
 const{db,desk}=setup(t);enqueue(desk,ready(desk));db.exec(sql);assert.equal(desk.verifyAudit(owner).valid,false);reject(()=>desk.state(owner));
});
test('missing durable head is not reseeded by owned reopen',t=>{
 const dir=temp(t),path=join(dir,'head.sqlite');let desk=openReferral(path);desk.intake(input(desk));desk.close();const db=new DatabaseSync(path);db.exec('DELETE FROM referral_head');db.close();reject(()=>openReferral(path),/lost its durable head/);const check=new DatabaseSync(path);assert.equal(check.prepare('SELECT COUNT(*) AS n FROM referral_head').get().n,0);check.close();
});
test('real process restart recovers assignment and original queue command without duplicate effects',t=>{
 const dir=temp(t),path=join(dir,'restart.sqlite'),desk=openReferral(path);const row=ready(desk),intent={...common(row,'durable-enqueue'),expectedHash:row.reviewHash};desk.enqueue(intent);desk.close();
 const code=`import{openReferral}from${JSON.stringify(moduleUrl)};const d=openReferral(${JSON.stringify(path)});const r=d.enqueue(${JSON.stringify(intent)});const a=d.assign({...${JSON.stringify(common({...row,revision:row.revision+1},'after-restart'))},assignee:'acme-staff'});console.log(JSON.stringify({same:r.caseId,assignment:a.queue.assignee,state:d.state({tenant:'acme'})}));d.close();`;
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',windowsHide:true}));assert.equal(result.same,row.caseId);assert.equal(result.assignment,'acme-staff');assert.equal(result.state.queue.length,1);assert.equal(result.state.audit.eventCount,6);
});
async function child(path,intent,method){const code=`import{openReferral}from${JSON.stringify(moduleUrl)};const d=openReferral(${JSON.stringify(path)});try{d[${JSON.stringify(method)}](${JSON.stringify(intent)});console.log('accepted');}catch(e){console.log('rejected:'+e.message);}finally{d.close();}`;return new Promise((resolveChild,rejectChild)=>{const p=spawn(process.execPath,['--input-type=module','-e',code],{windowsHide:true});let out='',err='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('error',rejectChild);p.on('exit',code=>code===0?resolveChild(out.trim()):rejectChild(Error(err)));});}
for(const race of ['enqueue-enqueue','enqueue-revoke'])test(`two independent processes arbitrate ${race} with one accepted revision`,async t=>{
 const dir=temp(t),path=join(dir,'race.sqlite');let desk=openReferral(path),row=ready(desk);desk.close();const first={...common(row,'race-enqueue-one'),expectedHash:row.reviewHash},second=race==='enqueue-enqueue'?{...first,commandId:'race-enqueue-two'}:{...common(row,'race-revoke'),decision:'revoke',proofId:'ref-acme-01-consent-revoke'};
 const results=await Promise.all([child(path,first,'enqueue'),child(path,second,race==='enqueue-enqueue'?'enqueue':'setConsent')]);assert.equal(results.filter(r=>r==='accepted').length,1);assert.equal(results.filter(r=>r.startsWith('rejected:')).length,1);desk=openReferral(path);try{assert.ok(desk.state(owner).queue.length<=1);row=desk.receipt({tenant:'acme',caseId:row.caseId});if(race==='enqueue-revoke'){if(row.consent.granted)row=consent(desk,row,'revoke','fresh-revocation');assert.equal(row.status,'held');if(row.queue)assert.equal(row.queue.status,'held');reject(()=>desk.assign({...common(row,'forbidden-after-revoke'),assignee:'acme-staff'}));}assert.equal(desk.verifyAudit(owner).valid,true);}finally{desk.close();}
});
test('source and registry revision changes invalidate authority but retain readable historical receipts',async t=>{
 const dir=temp(t),path=join(dir,'stale.sqlite');let desk=openReferral(path);const row=ready(desk);desk.close();desk=openReferral(path,{registryRevision:'new-policy-snapshot'});assert.equal(desk.receipt({tenant:'acme',caseId:row.caseId}).stale,true);reject(()=>enqueue(desk,row),/Source\/configuration/);desk.close();
 const core=join(dir,'referral-core.mjs'),fixture=join(dir,'referral-fixtures.mjs');copyFileSync(new URL('./referral-core.mjs',import.meta.url),core);copyFileSync(new URL('./referral-fixtures.mjs',import.meta.url),fixture);const mod=await import(pathToFileURL(core).href),local=mod.openReferral(':memory:');try{const localRow=ready(local);writeFileSync(fixture,readFileSync(fixture,'utf8')+'\n// source drift\n');assert.equal(local.receipt({tenant:'acme',caseId:localRow.caseId}).stale,true);reject(()=>enqueue(local,localRow),/Loaded source changed/);}finally{local.close();}
});


for(const edited of ['packet','consent'])test(`independent review excludes the current ${edited} source editor`,t=>{
 const{desk}=setup(t);let row=desk.intake(input(desk));
 row=desk.setPacket({...common(row,'prepared-packet'),actor:edited==='packet'?'acme-dual-role':'acme-intake',payerId:'DEMO_PAYER_A',documentIds:['ref-acme-01-form-v2','ref-acme-01-order-v1']});
 row=desk.setConsent({...common(row,'prepared-consent'),actor:edited==='consent'?'acme-dual-role':'acme-intake',decision:'grant',proofId:'ref-acme-01-consent-grant'});
 const before=desk.state(owner);reject(()=>desk.review({commandId:'source-editor-self-review',tenant:'acme',caseId:row.caseId,expectedRevision:row.revision,reviewer:'acme-dual-role',expectedHash:row.reviewHash,decision:'approve',reasonCode:'packet-checked'}),/independent/);assert.deepEqual(desk.state(owner),before);
 row=review(desk,row,'independent-review');row=enqueue(desk,row,'independent-enqueue');assert.equal(row.queue.status,'queued');assert.equal(desk.state(owner).queue.length,1);
});
