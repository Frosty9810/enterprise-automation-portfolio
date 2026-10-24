import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabServer,openStore} from './server.mjs';
async function setup(t){
 const db=openStore(':memory:'), server=createLabServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
 const catalog=await(await fetch(base+'/api/construction/catalog')).json();let seq=0;
 const post=async(kind,body,headers={})=>{const r=await fetch(base+'/api/construction/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...headers},body:JSON.stringify(body)});return{status:r.status,value:await r.json()};};
 const mutate=(kind,body)=>post(kind,{...body,commandId:`http-${++seq}`});
 const ok=async promise=>{const r=await promise;assert.equal(r.status,200,JSON.stringify(r.value));return r.value;};
 const sampleOrder=()=>structuredClone(catalog.orderExamples.find(x=>x.input.tenant==='acme').input);
 const documents=async()=>{const result=[];for(const kind of ['insurance','license']){const sample=structuredClone(catalog.documentExamples.find(x=>x.input.tenant==='acme'&&x.input.kind===kind).input);const doc=await ok(mutate('submit-document',sample));result.push(await ok(mutate('review-document',{tenant:'acme',documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'verify',note:'Checked supplied synthetic provenance and document fields.'})));}return result;};
 const identity=order=>({tenant:order.tenant,orderId:order.orderId});
 const review=async(order,role)=>ok(mutate('review-order',{...identity(order),reviewer:role==='finance'?'acme-finance':'acme-manager',role,expectedHash:order.reviewHash,decision:'approve',note:'Reviewed exact change, current documents, budget and schedule.'}));
 const approved=async()=>{await documents();let order=await ok(mutate('create-order',sampleOrder()));order=await review(order,'project_manager');return review(order,'finance');};
 return{db,base,catalog,post,mutate,ok,sampleOrder,documents,identity,review,approved};
}
test('construction HTTP exposes dedicated inventory route, reviewed document provenance and one real local cost commitment',async t=>{
 const x=await setup(t);for(const path of ['/construction?project=CON-01','/construction.css','/construction-ui.mjs'])assert.equal((await fetch(x.base+path)).status,200,path);
 assert.match((await fetch(x.base+'/construction')).headers.get('content-security-policy'),/script-src 'self'/);
 const inventory=await(await fetch(x.base+'/api/project-inventory')).json();assert.equal(inventory.length,73);assert.equal(inventory.find(p=>p.id==='CON-01').href,'/construction?project=CON-01');
 assert.match(x.catalog.clock.mode,/fixed/i);let order=await x.approved();
 const command={commandId:'exact-commitment',...x.identity(order),actor:'acme-operator',expectedHash:order.reviewHash};
 order=await x.ok(x.post('record-commitment',command));assert.equal((await x.post('record-commitment',command)).status,200);
 const state=await x.ok(x.post('state',{tenant:'acme'}));assert.equal(state.commitments.length,1);assert.equal(state.commitments[0].amountCents,x.sampleOrder().amountCents);
 assert.equal((await x.post('verify-audit',{tenant:'acme'})).value.valid,true);
 assert.equal((await x.post('receipt',{tenant:'beta',orderId:order.orderId})).status,400);
});
test('construction HTTP rejects stale amount reviews, unreviewed document replacement and missing compliance authority',async t=>{
 const x=await setup(t);let order=await x.ok(x.mutate('create-order',x.sampleOrder()));
 assert.equal((await x.mutate('record-commitment',{...x.identity(order),actor:'acme-operator',expectedHash:order.reviewHash})).status,400);
 await x.documents();order=await x.ok(x.post('receipt',x.identity(order)));order=await x.review(order,'project_manager');order=await x.review(order,'finance');
 const oldHash=order.reviewHash, sample=x.sampleOrder();
 order=await x.ok(x.mutate('revise-order',{...x.identity(order),actor:'acme-operator',expectedRevision:order.revision,scope:sample.scope+' revised',amountCents:sample.amountCents+100,scheduleImpactDays:sample.scheduleImpactDays,channel:sample.channel,reference:sample.reference,content:sample.content+' revised',receivedAt:sample.receivedAt}));
 assert.notEqual(order.reviewHash,oldHash);assert.equal((await x.mutate('record-commitment',{...x.identity(order),actor:'acme-operator',expectedHash:oldHash})).status,400);
 order=await x.review(order,'project_manager');order=await x.review(order,'finance');
 const docSample=structuredClone(x.catalog.documentExamples.find(p=>p.input.tenant==='acme'&&p.input.kind==='insurance').input);docSample.sourceId='http-replacement-insurance';docSample.content+=' replacement';
 await x.ok(x.mutate('submit-document',docSample));
 assert.equal((await x.mutate('record-commitment',{...x.identity(order),actor:'acme-operator',expectedHash:order.reviewHash})).status,400);
 assert.equal((await x.post('state',{tenant:'acme'})).value.commitments.length,0);
});
test('construction HTTP rejects foreign browser intent, malformed selectors, forged approval fields and unknown operations without effects',async t=>{
 const x=await setup(t),sample=x.sampleOrder();
 assert.equal((await x.post('create-order',sample,{'Origin':'https://foreign.example'})).status,403);assert.equal((await x.post('create-order',sample,{'X-Demo-Client':''})).status,403);
 assert.equal((await fetch(x.base+'/api/construction/catalog',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 for(const body of [null,[],{...sample,approved:true},{...sample,tenant:['acme']},{...sample,amountCents:1.5},{...sample,content:'x'.repeat(33000)}])assert.equal((await x.post('create-order',body)).status,400);
 for(const kind of ['constructor','__proto__','close','delete'])assert.equal((await x.post(kind,{})).status,404);
 assert.equal((await fetch(x.base+'/construction-core.mjs')).status,404);
 assert.equal((await x.post('state',{tenant:'acme'})).value.commitments.length,0);
});

test('construction HTTP requires current compliance revision so a stale verify cannot undo a newer revocation',async t=>{
 const x=await setup(t);const sample=structuredClone(x.catalog.documentExamples.find(p=>p.input.tenant==='acme'&&p.input.kind==='insurance').input);
 let doc=await x.ok(x.mutate('submit-document',sample));
 const body=()=>({tenant:'acme',documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'verify',note:'Reviewed the exact current document revision.'});
 const missing=body();delete missing.expectedRevision;assert.equal((await x.mutate('review-document',missing)).status,400);
 doc=await x.ok(x.mutate('review-document',body()));const staleVerify=body();
 doc=await x.ok(x.mutate('review-document',{...body(),decision:'revoke'}));assert.equal(doc.status,'revoked');
 assert.equal((await x.mutate('review-document',staleVerify)).status,400);
 const saved=await x.ok(x.post('document-receipt',{tenant:'acme',documentId:doc.documentId}));assert.equal(saved.status,'revoked');assert.equal(saved.revision,doc.revision);
 doc=await x.ok(x.mutate('review-document',body()));assert.equal(doc.status,'verified');
});
