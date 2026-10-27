import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { constructionDesk, openConstruction } from './construction-core.mjs';

const owner={tenant:'acme'},moduleUrl=new URL('./construction-core.mjs',import.meta.url).href;
function setup(t,options={}){const db=new DatabaseSync(':memory:'),desk=constructionDesk(db,options);t.after(()=>db.close());return {db,desk};}
function temp(t){const dir=mkdtempSync(join(tmpdir(),'construction-test-'));t.after(()=>{if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw Error('Unexpected temporary path.');rmSync(dir,{recursive:true,force:true});});return dir;}
const docInput=(desk,kind='insurance',suffix='',tenant='acme')=>{const sample=desk.catalog().documentExamples.find(row=>row.input.tenant===tenant&&row.input.kind===kind&&row.id!=='expired-insurance');return {...sample.input,commandId:`doc-${tenant}-${kind}-${suffix||'one'}`,sourceId:`source-${tenant}-${kind}-${suffix||'one'}`};};
function verify(desk,doc,commandId='verify-'+doc.documentId,decision='verify',reviewer='acme-compliance'){return desk.reviewDocument({commandId,tenant:doc.tenant,documentId:doc.documentId,reviewer,expectedHash:doc.contentHash,expectedRevision:doc.revision,decision,note:'Reviewed manually supplied synthetic fields only.'});}
function documents(desk,tenant='acme'){return ['insurance','license'].map(kind=>verify(desk,desk.submitDocument(docInput(desk,kind,'one',tenant)),undefined,'verify',`${tenant}-compliance`));}
function input(desk,suffix='one',tenant='acme'){return {...desk.catalog().orderExamples.find(row=>row.input.tenant===tenant&&row.id!=='over-budget').input,commandId:`order-${tenant}-${suffix}`,sourceIssueId:`issue-${tenant}-${suffix}`};}
function review(desk,order,role='project_manager',suffix='',reviewer=role==='project_manager'?`${order.tenant}-manager`:`${order.tenant}-finance`,decision='approve'){return desk.reviewOrder({commandId:`review-${order.orderId}-${role}-${suffix||'one'}`,tenant:order.tenant,orderId:order.orderId,reviewer,role,expectedHash:order.reviewHash,decision,note:'Checked synthetic scope, exact cents and document-set hash.'});}
function ready(desk,suffix='one',amountCents=125000,tenant='acme'){let order=desk.createOrder({...input(desk,suffix,tenant),amountCents});order=review(desk,order);return review(desk,order,'finance');}
const commit=(desk,order,commandId='commit-'+order.orderId)=>desk.recordCommitment({commandId,tenant:order.tenant,orderId:order.orderId,actor:`${order.tenant}-operator`,expectedHash:order.reviewHash});
const propose=(desk,row,extra={})=>desk.proposeReversal({commandId:'undo-'+row.orderId,tenant:row.tenant,orderId:row.orderId,actor:'acme-operator',expectedRevision:row.revision,reasonCode:'scope-withdrawn',note:'Synthetic full scope withdrawn.',...extra});
const rr=(desk,row,role='project_manager',extra={})=>desk.reviewReversal({commandId:'undo-review-'+role+'-'+row.revision,tenant:row.tenant,orderId:row.orderId,reviewer:role==='project_manager'?'acme-manager':'acme-finance',role,expectedRevision:row.revision,expectedHash:row.reversalHash,decision:'approve',note:'Checked original exact cents and full withdrawal.',...extra});
const postInput=row=>({commandId:'post-'+row.orderId,tenant:row.tenant,orderId:row.orderId,actor:'acme-operator',expectedRevision:row.revision,expectedHash:row.reversalHash});
function pending(desk,suffix='one',amount=125000){documents(desk);return propose(desk,commit(desk,ready(desk,suffix,amount)));}
function authorized(desk,suffix='one',amount=125000){let row=pending(desk,suffix,amount);row=rr(desk,row);return rr(desk,row,'finance');}
function snapshot(db){return JSON.stringify(['events','head','documents','orders','commitments','budgets'].map(name=>db.prepare('SELECT * FROM construction_'+name+' ORDER BY 1').all()));}
function unchanged(db,action,code){const before=snapshot(db);assert.throws(action,code?error=>error.code===code:undefined);assert.equal(snapshot(db),before);}

test('full reversal preserves the original and credits once; exact replay returns the latest receipt',t=>{
 const {db,desk}=setup(t);documents(desk);let row=commit(desk,ready(desk));const original=structuredClone(row.commitment),proposalInput={commandId:'undo-'+row.orderId,tenant:'acme',orderId:row.orderId,actor:'acme-operator',expectedRevision:row.revision,reasonCode:'scope-withdrawn',note:'Synthetic full scope withdrawn.'};
 assert.equal(Object.hasOwn(row,'reversal'),false);assert.equal(row.reversalStatus,'not-proposed');row=desk.proposeReversal(proposalInput);const fingerprint=row.reversalHash;assert.equal(row.reversalStatus,'pending');row=rr(desk,row);row=rr(desk,row,'finance');assert.equal(row.reversalHash,fingerprint);assert.equal(row.reversalStatus,'ready');const request=postInput(row);row=desk.recordReversal(request);
 assert.equal(row.status,'committed');assert.equal(row.reversalStatus,'reversed');assert.deepEqual(row.commitment,original);assert.equal(row.reversal.entry.reversesEntryId,original.id);assert.equal(row.reversal.entry.amountCents,-original.amountCents);assert.equal(row.reversal.entry.kind,'full-reversal');
 const state=desk.state(owner),before=snapshot(db);assert.equal(state.commitments.length,2);assert.equal(state.budgets[0].committedCents,0);assert.equal(state.budgets[0].remainingCents,1000000);assert.deepEqual(desk.recordReversal(request),row);assert.deepEqual(desk.proposeReversal(proposalInput),row);assert.equal(snapshot(db),before);assert.equal(desk.verifyAudit(owner).valid,true);
 unchanged(db,()=>desk.recordReversal({...request,commandId:'different-post',expectedRevision:row.revision}),'conflict');unchanged(db,()=>propose(desk,row,{commandId:'second-proposal'}),'conflict');
 unchanged(db,()=>desk.recordReversal({...request,expectedHash:'0'.repeat(64)}),'conflict');
});

test('proposal and review enforce strict fields, committed state, roles, both requesters and CAS without effects',t=>{
 const {db,desk}=setup(t);documents(desk);let row=ready(desk);unchanged(db,()=>propose(desk,row),'conflict');row=commit(desk,row);
 for(const extra of [{reasonCode:'partial-refund'},{amountCents:1},{note:''},{actor:'beta-operator'},{expectedRevision:row.revision-1},{expectedRevision:1.5}])unchanged(db,()=>propose(desk,row,extra));
 row=propose(desk,row,{actor:'acme-dual-role'});const old=row;
 for(const extra of [{reviewer:'acme-dual-role'},{reviewer:'acme-operator'},{expectedHash:'0'.repeat(64)},{expectedRevision:row.revision-1},{role:'operator'},{amountCents:0},{decision:'maybe'}])unchanged(db,()=>rr(desk,row,'project_manager',extra));
 unchanged(db,()=>desk.recordReversal(postInput(row)),'conflict');row=rr(desk,row);unchanged(db,()=>rr(desk,old,'finance'),'stale');row=rr(desk,row,'finance',{decision:'reject'});assert.equal(row.reversalStatus,'pending');unchanged(db,()=>desk.recordReversal(postInput(row)),'conflict');row=rr(desk,row,'finance',{commandId:'replacement-finance'});assert.equal(row.reversalStatus,'ready');assert.equal(desk.verifyAudit(owner).valid,true);
});

test('dual-role reviewer cannot approve both roles, and original requester is excluded even when proposer differs',t=>{
 const {db,desk}=setup(t);documents(desk);let row=desk.createOrder({...input(desk),actor:'acme-dual-role'});row=review(desk,row);row=review(desk,row,'finance');row=commit(desk,row);row=propose(desk,row);unchanged(db,()=>rr(desk,row,'finance',{reviewer:'acme-dual-role'}),'conflict');
 const second=commit(desk,ready(desk,'second'));let p=propose(desk,second,{commandId:'undo-second'});p=rr(desk,p,'project_manager',{reviewer:'acme-dual-role',commandId:'dual-manager'});unchanged(db,()=>rr(desk,p,'finance',{reviewer:'acme-dual-role'}),'conflict');
});

test('reversal hash ignores current compliance revocation and expiry; undo does not restore site readiness',t=>{
 let clock='2026-10-24T12:00:00.000Z';const {desk}=setup(t,{clock:()=>clock});let row=authorized(desk),fingerprint=row.reversalHash;const doc=desk.state(owner).documents.find(d=>d.kind==='insurance');verify(desk,doc,'revoke-for-undo','revoke');clock='2027-02-01T12:00:00.000Z';row=desk.receipt({tenant:'acme',orderId:row.orderId});assert.equal(row.readiness.ready,false);assert.equal(row.reversalHash,fingerprint);assert.equal(row.reversalReviewsCurrent,true);row=desk.recordReversal(postInput(row));assert.equal(row.reversalStatus,'reversed');assert.equal(row.readiness.ready,false);assert.equal(desk.state(owner).budgets[0].committedCents,0);
});

test('posted order remains immutable and cannot reuse old revise, original review or commitment paths',t=>{
 const {db,desk}=setup(t);let row=authorized(desk);row=desk.recordReversal(postInput(row));unchanged(db,()=>review(desk,row,'finance','again'),'conflict');unchanged(db,()=>commit(desk,row,'commit-again'),'conflict');
 unchanged(db,()=>desk.reviseOrder({commandId:'revise-again',tenant:'acme',actor:'acme-operator',orderId:row.orderId,expectedRevision:row.revision,scope:row.scope,amountCents:1,scheduleImpactDays:0,channel:'email',reference:'Synthetic',content:'No new commitment authority.',receivedAt:'2026-10-24T11:30:00.000Z'}),'conflict');
});

test('SQL failure after posting starts rolls back order, negative row, credit and audit together',t=>{
 const {db,desk}=setup(t);const row=authorized(desk),request=postInput(row),before=snapshot(db);db.exec("CREATE TRIGGER reject_negative BEFORE INSERT ON construction_commitments WHEN json_extract(NEW.body,'$.amountCents')<0 BEGIN SELECT RAISE(ABORT,'synthetic-negative-fault'); END;");assert.throws(()=>desk.recordReversal(request),/synthetic-negative-fault/);assert.equal(snapshot(db),before);db.exec('DROP TRIGGER reject_negative');assert.equal(desk.recordReversal(request).reversalStatus,'reversed');assert.equal(desk.verifyAudit(owner).valid,true);
});

test('credited capacity is actually consumable by a separately reviewed new commitment',t=>{
 const {db,desk}=setup(t);let row=authorized(desk,'full',1000000);const blocked=ready(desk,'blocked',1);unchanged(db,()=>commit(desk,blocked,'over-budget'),'conflict');row=desk.recordReversal(postInput(row));const next=commit(desk,ready(desk,'replacement',1000000));assert.equal(next.commitment.amountCents,1000000);assert.equal(desk.state(owner).budgets[0].committedCents,1000000);assert.equal(desk.state(owner).commitments.length,3);assert.equal(desk.verifyAudit(owner).valid,true);
});

for(const sql of ["UPDATE construction_commitments SET body=json_set(body,'$.amountCents',-1) WHERE json_extract(body,'$.kind')='full-reversal'", "DELETE FROM construction_commitments WHERE json_extract(body,'$.kind')='full-reversal'", "UPDATE construction_orders SET body=json_set(body,'$.reversal.originalEntryId','missing')", "UPDATE construction_budgets SET body=json_set(body,'$.remainingCents',1000001)" ])test('reversal materialization tamper is detected: '+sql,t=>{const {db,desk}=setup(t);const row=authorized(desk);desk.recordReversal(postInput(row));db.exec(sql);assert.equal(desk.verifyAudit(owner).valid,false);assert.throws(()=>desk.state(owner),error=>error.code==='integrity_failed');});

test('native file reopen keeps original and negative entries; config drift blocks new intent but preserves reads',t=>{
 const path=join(temp(t),'ledger.sqlite');let desk=openConstruction(path),row=authorized(desk);const request=postInput(row);row=desk.recordReversal(request);desk.close();desk=openConstruction(path);assert.deepEqual(desk.recordReversal(request),row);assert.equal(desk.state(owner).commitments.length,2);desk.close();desk=openConstruction(path,{registryRevision:'changed'});try{assert.equal(desk.receipt({tenant:'acme',orderId:row.orderId}).stale,true);assert.equal(desk.verifyAudit(owner).valid,true);assert.equal(desk.recordReversal(request).reversalStatus,'reversed');}finally{desk.close();}
});

test('two independent native processes competing to post cannot credit twice',async t=>{
 const path=join(temp(t),'race.sqlite'),desk=openConstruction(path);const row=authorized(desk),request=postInput(row);desk.close();const script=`import{openConstruction}from${JSON.stringify(moduleUrl)};const d=openConstruction(process.env.CON_DB);try{try{const row=d.recordReversal(JSON.parse(process.env.CON_REQUEST));console.log(JSON.stringify({status:row.reversalStatus}));}catch(e){console.log(JSON.stringify({error:e.code}));}}finally{d.close();}`;
 const run=commandId=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',script],{env:{...process.env,CON_DB:path,CON_REQUEST:JSON.stringify({...request,commandId})}});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>code?reject(Error(err)):resolve(JSON.parse(out)));});const results=await Promise.all([run('race-one'),run('race-two')]);assert.equal(results.filter(r=>r.status==='reversed').length,1);assert.equal(results.filter(r=>r.error==='stale').length,1);const reopened=openConstruction(path);try{assert.equal(reopened.state(owner).commitments.length,2);assert.equal(reopened.state(owner).budgets[0].committedCents,0);assert.equal(reopened.verifyAudit(owner).valid,true);}finally{reopened.close();}
});
