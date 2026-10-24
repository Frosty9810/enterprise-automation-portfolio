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
const revise=(desk,order,amountCents=200000,commandId='revise-'+order.orderId)=>desk.reviseOrder({commandId,tenant:order.tenant,actor:order.requester,orderId:order.orderId,expectedRevision:order.revision,scope:order.scope,amountCents,scheduleImpactDays:3,channel:'email',reference:'Synthetic revised source',content:'Synthetic amended scope and price submitted for fresh review.',receivedAt:'2026-10-24T11:30:00.000Z'});

test('local business flow records one exact commitment and retains historical cost after current compliance revocation',t=>{
 const {desk}=setup(t);assert.equal(desk.readiness({tenant:'acme',siteId:'site-acme',subcontractorId:'sub-acme'}).ready,false);
 const docs=documents(desk);let order=ready(desk);assert.equal(order.status,'ready');order=commit(desk,order);assert.equal(order.status,'committed');
 let state=desk.state(owner);assert.equal(state.commitments.length,1);assert.equal(state.budgets[0].committedCents,125000);assert.equal(state.budgets[0].remainingCents,875000);
 verify(desk,docs[0],'revoke-current','revoke');order=desk.receipt({tenant:'acme',orderId:order.orderId});assert.equal(order.status,'committed');assert.equal(order.readiness.ready,false);assert.equal(desk.state(owner).commitments.length,1);assert.equal(desk.verifyAudit(owner).valid,true);
});
test('source content hash binds actual supplied UTF8 bytes while metadata binds the exact document receipt',t=>{
 const {desk}=setup(t),source=docInput(desk),doc=desk.submitDocument(source);assert.equal(doc.sourceContentHash,createHash('sha256').update(source.content).digest('hex'));assert.match(doc.contentHash,/^[a-f0-9]{64}$/);
 assert.equal(doc.channel,'pdf-manifest');assert.match(doc.scope,/not parsed PDFs/);assert.equal(doc.review,null);
});
test('document verification must be independent, configured and bound to the exact hash',t=>{
 const {desk}=setup(t),doc=desk.submitDocument({...docInput(desk),actor:'acme-dual-role'});
 assert.throws(()=>verify(desk,doc,'self','verify','acme-dual-role'),/independent/);assert.throws(()=>verify(desk,{...doc,contentHash:'forged'}),/exact document hash/);assert.throws(()=>verify(desk,doc,'foreign','verify','beta-compliance'),/configured/);
 assert.equal(desk.documentReceipt({tenant:'acme',documentId:doc.documentId}).status,'unverified');assert.equal(desk.verifyAudit(owner).eventCount,1);
});
test('new unverified and expired document versions supersede older verified evidence without fallback',t=>{
 const {desk}=setup(t);const prior=documents(desk);const replacement=desk.submitDocument(docInput(desk,'insurance','replacement'));
 assert.equal(replacement.version,2);assert.match(desk.readiness({tenant:'acme',siteId:'site-acme',subcontractorId:'sub-acme'}).reasons.join(' '),/unverified/);assert.throws(()=>verify(desk,prior[0],'old-verify'),/Superseded/);
 verify(desk,replacement);assert.equal(desk.readiness({tenant:'acme',siteId:'site-acme',subcontractorId:'sub-acme'}).ready,true);
 const expired=desk.submitDocument(desk.catalog().documentExamples.find(r=>r.id==='expired-insurance').input);verify(desk,expired);assert.match(desk.readiness({tenant:'acme',siteId:'site-acme',subcontractorId:'sub-acme'}).reasons.join(' '),/expired/);assert.equal(desk.history(owner).documents.length,4);
});
test('exclusive certificate expiry rechecks at review and atomic commitment time',t=>{
 let clock='2026-10-24T12:00:00.000Z';const {desk}=setup(t,{clock:()=>clock});
 for(const kind of ['insurance','license'])verify(desk,desk.submitDocument({...docInput(desk,kind),validUntil:'2026-10-24T13:00:00.000Z'}));
 const order=ready(desk);clock='2026-10-24T13:00:00.000Z';assert.throws(()=>commit(desk,order),/expired/);assert.throws(()=>review(desk,order,'finance','after-expiry'),/Readiness hold/);assert.equal(desk.state(owner).commitments.length,0);
});
test('document revoke and reverify cannot revive earlier order approvals',t=>{
 const {desk}=setup(t),docs=documents(desk),order=ready(desk),oldHash=order.reviewHash;
 const revoked=verify(desk,docs[0],'revoke','revoke');verify(desk,revoked,'reverify');let current=desk.receipt({tenant:'acme',orderId:order.orderId});assert.notEqual(current.reviewHash,oldHash);assert.equal(current.reviewsCurrent,false);assert.equal(current.status,'review-required');
 assert.throws(()=>commit(desk,order),/current order/);current=review(desk,current,'project_manager','fresh');current=review(desk,current,'finance','fresh');assert.equal(commit(desk,current).status,'committed');
});
test('reviewed document renewal changes order fingerprint and needs both fresh reviewers',t=>{
 const {desk}=setup(t);documents(desk);const order=ready(desk);verify(desk,desk.submitDocument(docInput(desk,'license','renewal')));let current=desk.receipt({tenant:'acme',orderId:order.orderId});assert.equal(current.readiness.ready,true);assert.equal(current.reviewsCurrent,false);assert.throws(()=>commit(desk,order),/current order/);current=review(desk,current,'project_manager','renewal');assert.throws(()=>commit(desk,current),/independent/);current=review(desk,current,'finance','renewal');assert.equal(commit(desk,current).status,'committed');
});
test('revision changes scope cost schedule and provenance without mutating old audited versions',t=>{
 const {desk}=setup(t);documents(desk);const order=ready(desk),before=desk.audit(owner).events.length;const updated=revise(desk,order);assert.equal(updated.version,2);assert.equal(updated.amountCents,200000);assert.deepEqual(updated.reviews,{});assert.notEqual(updated.reviewHash,order.reviewHash);assert.equal(desk.audit(owner).events.length,before+1);assert.throws(()=>commit(desk,order),/current order/);assert.throws(()=>revise(desk,order,250000,'stale-revise'),/revision changed/);
});
test('manager and finance must be distinct and both independent of the requester',t=>{
 const {desk}=setup(t);documents(desk);let order=desk.createOrder({...input(desk),actor:'acme-dual-role'});assert.throws(()=>review(desk,order,'project_manager','self','acme-dual-role'),/independent/);
 order=desk.createOrder(input(desk,'second'));order=review(desk,order,'project_manager','dual','acme-dual-role');assert.throws(()=>review(desk,order,'finance','same','acme-dual-role'),/distinct/);assert.throws(()=>commit(desk,order),/independent/);
});
test('rejected review and forged or old hashes cannot post costs',t=>{
 const {desk}=setup(t);documents(desk);let order=desk.createOrder(input(desk));order=review(desk,order);order=review(desk,order,'finance','reject','acme-finance','reject');assert.equal(order.status,'review-required');assert.throws(()=>commit(desk,order),/independent/);assert.throws(()=>desk.recordCommitment({commandId:'forged',tenant:'acme',orderId:order.orderId,actor:'acme-operator',expectedHash:'forged'}),/current order/);assert.equal(desk.state(owner).commitments.length,0);
});
test('command replay recovers current receipt and never repeats a cost or mutates source identity',t=>{
 const {desk}=setup(t);documents(desk);const source=input(desk),order=desk.createOrder(source);assert.equal(desk.createOrder(source).orderId,order.orderId);assert.throws(()=>desk.createOrder({...source,scope:'Different intent'}),/immutable intent/);assert.throws(()=>desk.createOrder({...source,commandId:'new-source-command'}),/Source issue/);
 let current=review(desk,order);current=review(desk,current,'finance');current=commit(desk,current);assert.equal(desk.createOrder(source).status,'committed');assert.equal(commit(desk,current).status,'committed');assert.equal(desk.state(owner).commitments.length,1);assert.throws(()=>commit(desk,current,'second-commit'),/already exists/);assert.throws(()=>revise(desk,current),/immutable/);
});
test('document source IDs and command IDs are immutable across operation kinds',t=>{
 const {desk}=setup(t),source=docInput(desk),doc=desk.submitDocument(source);assert.equal(desk.submitDocument(source).documentId,doc.documentId);assert.throws(()=>desk.submitDocument({...source,commandId:'different-command'}),/Source ID/);assert.throws(()=>desk.submitDocument({...source,content:'Changed'}),/immutable intent/);assert.throws(()=>desk.createOrder({...input(desk),commandId:source.commandId}),/immutable intent/);
});
test('local budget uses exact positive cents and rejected overflow leaves ledger unchanged',t=>{
 const {desk}=setup(t);documents(desk);const first=ready(desk,'first',700000),second=ready(desk,'second',400000);commit(desk,first);const before=desk.verifyAudit(owner).eventCount;assert.throws(()=>commit(desk,second),/budget would be exceeded/);assert.equal(desk.verifyAudit(owner).eventCount,before);assert.equal(desk.state(owner).budgets[0].remainingCents,300000);assert.equal(desk.state(owner).commitments.length,1);
});
for(const amount of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,1000000001])test(`reject invalid USD cents ${amount} before recording an order`,t=>{const {desk}=setup(t);assert.throws(()=>desk.createOrder({...input(desk),amountCents:amount}));assert.equal(desk.history(owner).orders.length,0);});
for(const fields of [{tenant:['acme']},{tenant:'foreign'},{actor:'beta-operator'},{siteId:'site-beta'},{subcontractorId:'sub-beta'},{currency:'EUR'},{scheduleImpactDays:366},{scheduleImpactDays:-1},{scope:'\u0000'},{channel:'url'},{receivedAt:'2026-10-24T13:00:00.000Z'},{receivedAt:'2026-02-30T12:00:00.000Z'},{receivedAt:'2026-10-24T12:00:00Z'}])test(`strict order schema rejects ${JSON.stringify(fields)}`,t=>{const {desk}=setup(t);assert.throws(()=>desk.createOrder({...input(desk),...fields}));assert.equal(desk.verifyAudit(owner).eventCount,0);});
test('strict document input rejects future sources impossible intervals unknown fields and dangerous object shapes',t=>{
 const {desk}=setup(t),source=docInput(desk);for(const fields of [{validUntil:'2026-10-24T00:00:00Z'},{validUntil:'2026-02-30T00:00:00.000Z'},{kind:'invented'},{verified:true},{content:'x'.repeat(4001)},{tenant:['acme']},{receivedAt:'2026-10-25T00:00:00.000Z'}])assert.throws(()=>desk.submitDocument({...source,...fields}));for(const body of [null,[],Object.create({tenant:'acme'}),JSON.parse('{"__proto__":{}}')])assert.throws(()=>desk.submitDocument(body));assert.equal(desk.history(owner).documents.length,0);
});
test('every selector is a scalar tenant and all saved data is returned as isolated copies',t=>{
 const {desk}=setup(t),docs=documents(desk),order=ready(desk);for(const tenant of [['acme'],null,1,{value:'acme'}]){for(const method of ['history','state','audit','verifyAudit'])assert.throws(()=>desk[method]({tenant}),/Unknown configured tenant/);assert.throws(()=>desk.receipt({tenant,orderId:order.orderId}),/Unknown configured tenant/);assert.throws(()=>desk.documentReceipt({tenant,documentId:docs[0].documentId}),/Unknown configured tenant/);}
 assert.throws(()=>desk.receipt({tenant:'beta',orderId:order.orderId}),/not found/);assert.throws(()=>desk.documentReceipt({tenant:'beta',documentId:docs[0].documentId}),/not found/);
 const catalog=desk.catalog();catalog.sites[0].budgetCents=999999999;docs[0].review.decision='revoke';order.reviews.finance.decision='reject';assert.equal(commit(desk,desk.receipt({tenant:'acme',orderId:order.orderId})).status,'committed');assert.equal(desk.state({tenant:'beta'}).commitments.length,0);
});
test('tenant budgets and document sets remain separate',t=>{
 const {desk}=setup(t);documents(desk);documents(desk,'beta');commit(desk,ready(desk,'one',800000));commit(desk,ready(desk,'beta',900000,'beta'));assert.equal(desk.state(owner).budgets[0].committedCents,800000);assert.equal(desk.state({tenant:'beta'}).budgets[0].committedCents,900000);assert.equal(desk.state(owner).documents.length,2);
});
test('SQL trigger failures roll back commitment budget order revision event and anchor together',t=>{
 const {db,desk}=setup(t);documents(desk);const order=ready(desk),before=desk.state(owner),audit=desk.verifyAudit(owner);db.exec("CREATE TRIGGER fail_budget BEFORE UPDATE ON construction_budgets BEGIN SELECT RAISE(ABORT,'synthetic budget failure'); END;");assert.throws(()=>commit(desk,order),/synthetic budget failure/);assert.deepEqual(desk.state(owner),before);assert.deepEqual(desk.verifyAudit(owner),audit);db.exec('DROP TRIGGER fail_budget');assert.equal(commit(desk,order).status,'committed');
});
for(const statement of ["UPDATE construction_events SET request='{}' WHERE seq=1","DELETE FROM construction_events WHERE seq=(SELECT MAX(seq) FROM construction_events)","DELETE FROM construction_head","UPDATE construction_documents SET body='{}'","UPDATE construction_orders SET body='{}'","DELETE FROM construction_commitments","DELETE FROM construction_budgets"])test(`durable integrity rejects ${statement}`,t=>{
 const {db,desk}=setup(t);documents(desk);commit(desk,ready(desk));db.exec(statement);assert.equal(desk.verifyAudit(owner).valid,false);assert.throws(()=>desk.state(owner));assert.throws(()=>desk.createOrder(input(desk,'after-corruption')));
});
test('missing head and deleted baseline cannot be silently reinitialized after reopening',t=>{
 const path=join(temp(t),'broken.sqlite');let desk=openConstruction(path);documents(desk);desk.close();let db=new DatabaseSync(path);db.exec('DELETE FROM construction_head');db.close();assert.throws(()=>openConstruction(path),/lost its durable head/);db=new DatabaseSync(path);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM construction_head').get().n,0);db.close();
});
test('a real separate process reopens the order and exact replay never creates a second ledger entry',t=>{
 const path=join(temp(t),'restart.sqlite');let desk=openConstruction(path);documents(desk);const order=ready(desk);commit(desk,order);desk.close();
 const code=`import{openConstruction}from${JSON.stringify(moduleUrl)};const d=openConstruction(${JSON.stringify(path)});try{const r=d.recordCommitment(${JSON.stringify({commandId:'commit-'+order.orderId,tenant:'acme',orderId:order.orderId,actor:'acme-operator',expectedHash:order.reviewHash})});console.log(JSON.stringify({status:r.status,count:d.state({tenant:'acme'}).commitments.length,audit:d.verifyAudit({tenant:'acme'}).valid}));}finally{d.close();}`;
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',windowsHide:true}));assert.deepEqual(result,{status:'committed',count:1,audit:true});desk=openConstruction(path);assert.equal(desk.state(owner).budgets[0].committedCents,125000);desk.close();
});
test('two independent processes cannot oversubscribe the same local change budget',async t=>{
 const path=join(temp(t),'race.sqlite');const desk=openConstruction(path);documents(desk);const orders=[ready(desk,'race-a',700000),ready(desk,'race-b',700000)];desk.close();
 const workers=orders.map(order=>{const body={commandId:'race-'+order.orderId,tenant:'acme',orderId:order.orderId,actor:'acme-operator',expectedHash:order.reviewHash};const code=`import{openConstruction}from${JSON.stringify(moduleUrl)};const d=openConstruction(${JSON.stringify(path)});console.log('READY');process.stdin.once('data',()=>{try{d.recordCommitment(${JSON.stringify(body)});console.log('COMMITTED');}catch(e){console.log('HELD:'+e.message);}finally{d.close();process.stdin.destroy();}});`;const child=spawn(process.execPath,['--input-type=module','-e',code],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';const readyPromise=new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('READY'))resolve();});child.once('error',reject);child.once('exit',code=>{if(!output.includes('READY'))reject(Error('Worker failed before ready: '+code));});});const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Worker exit '+code)));});return {child,readyPromise,done,output:()=>output};});
 const timer=setTimeout(()=>workers.forEach(w=>w.child.kill()),12000);t.after(()=>{clearTimeout(timer);workers.forEach(w=>{if(w.child.exitCode===null)w.child.kill();});});await Promise.all(workers.map(w=>w.readyPromise));workers.forEach(w=>w.child.stdin.end('go'));await Promise.all(workers.map(w=>w.done));assert.equal(workers.filter(w=>w.output().includes('COMMITTED')).length,1);assert.equal(workers.filter(w=>w.output().includes('budget would be exceeded')).length,1);const check=openConstruction(path);assert.equal(check.state(owner).commitments.length,1);assert.equal(check.state(owner).budgets[0].remainingCents,300000);assert.equal(check.verifyAudit(owner).valid,true);check.close();
});
test('source and configuration changes make prior review authority stale while preserving history',async t=>{
 const dir=temp(t),path=join(dir,'config.sqlite');let desk=openConstruction(path);documents(desk);const order=ready(desk);desk.close();desk=openConstruction(path,{registryRevision:'fixture-v2'});assert.equal(desk.receipt({tenant:'acme',orderId:order.orderId}).stale,true);assert.throws(()=>commit(desk,order),/Source\/configuration/);desk.close();
 const core=join(dir,'construction-core.mjs'),fixtures=join(dir,'construction-fixtures.mjs');copyFileSync(new URL('./construction-core.mjs',import.meta.url),core);copyFileSync(new URL('./construction-fixtures.mjs',import.meta.url),fixtures);const isolated=await import(pathToFileURL(core).href),local=isolated.openConstruction(':memory:');documents(local);const readyOrder=ready(local);writeFileSync(fixtures,readFileSync(fixtures,'utf8')+'\n// byte drift\n');assert.equal(local.receipt({tenant:'acme',orderId:readyOrder.orderId}).stale,true);assert.throws(()=>commit(local,readyOrder),/Loaded source changed/);local.close();
});


test('separate database handles reject a stale verification after revocation without another event',t=>{
 const path=join(temp(t),'document-cas.sqlite'),first=openConstruction(path);const doc=verify(first,first.submitDocument(docInput(first)));const second=openConstruction(path);
 try{
  const staleBody={commandId:'stale-verify',tenant:'acme',documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'verify',note:'This intent was prepared before revocation.'};
  const revoked=verify(first,doc,'revoke-current','revoke'),before=first.verifyAudit(owner);assert.throws(()=>second.reviewDocument(staleBody),/review revision changed/);assert.deepEqual(first.verifyAudit(owner),before);assert.equal(second.documentReceipt({tenant:'acme',documentId:doc.documentId}).status,'revoked');
  const reverified=second.reviewDocument({...staleBody,commandId:'fresh-verify',expectedRevision:revoked.revision,note:'Fresh saved revoked revision explicitly reviewed again.'});assert.equal(reverified.status,'verified');assert.equal(reverified.revision,revoked.revision+1);
 }finally{second.close();first.close();}
});


test('an expired certificate received after its expiry is retained as held evidence, not treated as an invalid source',t=>{
 const {desk}=setup(t),source={...docInput(desk),receivedAt:'2026-10-24T11:00:00.000Z',validUntil:'2026-10-20T00:00:00.000Z'};
 const doc=verify(desk,desk.submitDocument(source));assert.equal(doc.status,'verified');assert.equal(doc.receivedAt,source.receivedAt);
 const readiness=desk.readiness({tenant:'acme',siteId:'site-acme',subcontractorId:'sub-acme'});assert.equal(readiness.ready,false);assert.match(readiness.reasons.join(' '),/insurance document has expired/);
});
