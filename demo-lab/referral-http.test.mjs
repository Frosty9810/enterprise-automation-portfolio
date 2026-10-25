import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabServer,openStore} from './server.mjs';
async function setup(t){
 const db=openStore(':memory:'),server=createLabServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();});let seq=0;
 const catalog=await(await fetch(base+'/api/referral/catalog')).json();
 const post=async(kind,body,headers={})=>{const r=await fetch(base+'/api/referral/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...headers},body:JSON.stringify(body)});return {status:r.status,value:await r.json()};};
 const mutate=(kind,body)=>post(kind,{...body,commandId:`http-${++seq}`});const ok=async pending=>{const r=await pending;assert.equal(r.status,200,JSON.stringify(r.value));return r.value;};
 const sample=()=>structuredClone(catalog.intakeExamples.find(r=>r.input.referralFixtureId==='ref-acme-01').input);
 const common=row=>({tenant:row.tenant,caseId:row.caseId,actor:`${row.tenant}-intake`,expectedRevision:row.revision});
 const consent=(row,decision)=>mutate('set-consent',{...common(row),decision,proofId:`${row.referralFixtureId}-consent-${decision}`});
 const approve=row=>mutate('review',{tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision,reviewer:`${row.tenant}-reviewer`,expectedHash:row.reviewHash,decision:'approve',reasonCode:'packet-checked'});
 const ready=async()=>{let row=await ok(mutate('intake',sample()));row=await ok(mutate('set-packet',{...common(row),payerId:'DEMO_PAYER_A',documentIds:[`${row.referralFixtureId}-form-v2`,`${row.referralFixtureId}-order-v1`]}));row=await ok(consent(row,'grant'));return ok(approve(row));};
 return{db,base,catalog,post,mutate,ok,sample,common,consent,approve,ready};
}
test('referral HTTP uses dedicated inventory route and independently reviewed synthetic packet for one local administrative row',async t=>{
 const x=await setup(t);for(const path of ['/referral?project=MED-01','/referral.css','/referral-ui.mjs'])assert.equal((await fetch(x.base+path)).status,200,path);
 assert.match((await fetch(x.base+'/referral')).headers.get('content-security-policy'),/script-src 'self'/);
 const inventory=await(await fetch(x.base+'/api/project-inventory')).json();assert.equal(inventory.length,73);assert.equal(inventory.find(row=>row.id==='MED-01').href,'/referral?project=MED-01');assert.match(x.catalog.clock.mode,/fixed/i);
 let row=await x.ready();const command={commandId:'enqueue-once',...x.common(row),expectedHash:row.reviewHash};row=await x.ok(x.post('enqueue',command));assert.equal((await x.post('enqueue',command)).status,200);
 row=await x.ok(x.mutate('assign',{...x.common(row),assignee:'acme-staff'}));assert.equal(row.queue.assignee,'acme-staff');
 const state=await x.ok(x.post('state',{tenant:'acme'}));assert.equal(state.queue.length,1);assert.equal(state.queue[0].effectiveStatus,'assigned');assert.equal(state.audit.valid,true);assert.equal(state.cases[0].revision,row.revision);
 assert.equal((await x.post('receipt',{tenant:'beta',caseId:row.caseId})).status,400);
});
test('referral HTTP consent revocation atomically holds queued work and regrant cannot revive old review',async t=>{
 const x=await setup(t);let row=await x.ready();row=await x.ok(x.mutate('enqueue',{...x.common(row),expectedHash:row.reviewHash}));const old=x.common(row),oldHash=row.reviewHash;
 row=await x.ok(x.consent(row,'revoke'));assert.equal(row.queue.effectiveStatus,'held');assert.equal(row.review,null);
 assert.equal((await x.mutate('assign',{...old,assignee:'acme-staff'})).status,400);
 row=await x.ok(x.consent(row,'grant'));assert.notEqual(row.reviewHash,oldHash);assert.equal((await x.mutate('enqueue',{...x.common(row),expectedHash:oldHash})).status,400);
 row=await x.ok(x.approve(row));row=await x.ok(x.mutate('enqueue',{...x.common(row),expectedHash:row.reviewHash}));
 const state=await x.ok(x.post('state',{tenant:'acme'}));assert.equal(state.queue.length,1);assert.equal(state.queue[0].generation,2);assert.equal(state.audit.valid,true);
});
test('referral HTTP fictional unknown payer and expired current fixture hold administrative review without older fallback',async t=>{
 const x=await setup(t);let row=await x.ok(x.mutate('intake',x.sample()));row=await x.ok(x.consent(row,'grant'));
 row=await x.ok(x.mutate('set-packet',{...x.common(row),payerId:'UNKNOWN_DEMO',documentIds:[`${row.referralFixtureId}-form-v2`,`${row.referralFixtureId}-order-v1`]}));assert.equal(row.readiness.ready,false);assert.equal((await x.approve(row)).status,400);
 const sample=structuredClone(x.catalog.intakeExamples.find(item=>item.input.referralFixtureId==='ref-acme-02').input);let expired=await x.ok(x.mutate('intake',sample));expired=await x.ok(x.consent(expired,'grant'));expired=await x.ok(x.mutate('set-packet',{...x.common(expired),payerId:'DEMO_PAYER_A',documentIds:[`${expired.referralFixtureId}-form-v2`,`${expired.referralFixtureId}-order-v1`]}));assert.equal(expired.readiness.ready,false);assert.match(expired.readiness.holds.join(' '),/expired/);
 expired=await x.ok(x.mutate('set-packet',{...x.common(expired),payerId:'DEMO_PAYER_A',documentIds:[`${expired.referralFixtureId}-form-v1`,`${expired.referralFixtureId}-order-v1`]}));assert.match(expired.readiness.holds.join(' '),/superseded/);assert.equal((await x.approve(expired)).status,400);assert.equal((await x.post('state',{tenant:'acme'})).value.queue.length,0);
});
test('referral HTTP rejects clinical payload fields, forged fixture IDs, malformed selectors and browser intent without creating cases',async t=>{
 const x=await setup(t),sample=x.sample();assert.equal((await x.post('intake',sample,{'Origin':'https://foreign.example'})).status,403);assert.equal((await x.post('intake',sample,{'X-Demo-Client':''})).status,403);assert.equal((await fetch(x.base+'/api/referral/catalog',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 for(const body of [null,[],{...sample,patientName:'Not an accepted field'},{...sample,clinicalText:'No clinical payload accepted'},{...sample,tenant:['acme']},{...sample,referralFixtureId:'foreign-case'},{...sample,sourceEventId:'arbitrary-event'},{...sample,extra:'x'.repeat(33000)}])assert.equal((await x.post('intake',body)).status,400);
 for(const kind of ['constructor','__proto__','close','delete'])assert.equal((await x.post(kind,{})).status,404);assert.equal((await fetch(x.base+'/referral-core.mjs')).status,404);assert.equal((await x.post('state',{tenant:'acme'})).value.cases.length,0);
});
