import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createLabServer,openStore} from './server.mjs';

async function setup(t){
 const db=openStore(':memory:'),server=createLabServer(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
 const catalog=await(await fetch(base+'/api/construction/catalog')).json();let seq=0;
 const post=async(kind,body,headers={})=>{const response=await fetch(base+'/api/construction/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...headers},body:JSON.stringify(body)});return{status:response.status,value:await response.json()};};
 const ok=async(kind,body)=>{const result=await post(kind,body);assert.equal(result.status,200,JSON.stringify(result.value));return result.value;};
 const command=body=>({...body,commandId:`reverse-http-${++seq}`});
 const identity=row=>({tenant:row.tenant,orderId:row.orderId,expectedRevision:row.revision});
 const committed=async()=>{
   const documents=[];
   for(const kind of ['insurance','license']){const sample=structuredClone(catalog.documentExamples.find(x=>x.input.tenant==='acme'&&x.input.kind===kind).input);let row=await ok('submit-document',command(sample));row=await ok('review-document',command({tenant:'acme',documentId:row.documentId,reviewer:'acme-compliance',expectedHash:row.contentHash,expectedRevision:row.revision,decision:'verify',note:'Checked fictional source.'}));documents.push(row);}
   let row=await ok('create-order',command(structuredClone(catalog.orderExamples.find(x=>x.input.tenant==='acme').input)));
   for(const role of ['project_manager','finance'])row=await ok('review-order',command({tenant:'acme',orderId:row.orderId,reviewer:role==='finance'?'acme-finance':'acme-manager',role,expectedHash:row.reviewHash,decision:'approve',note:'Checked exact fictional change.'}));
   row=await ok('record-commitment',command({tenant:'acme',orderId:row.orderId,actor:'acme-operator',expectedHash:row.reviewHash}));return{row,documents};
 };
 const propose=(row,extra={})=>ok('propose-reversal',command({...identity(row),actor:'acme-operator',reasonCode:'change-cancelled',note:'Synthetic change withdrawn; reverse the full local commitment.',...extra}));
 const review=(row,role,extra={})=>ok('review-reversal',command({...identity(row),reviewer:role==='finance'?'acme-finance':'acme-manager',role,expectedHash:row.reversalHash,decision:'approve',note:'Checked original entry and full local reversal.',...extra}));
 const approved=async row=>review(await review(await propose(row),'project_manager'),'finance');
 const recordRequest=row=>command({...identity(row),actor:'acme-operator',expectedHash:row.reversalHash});
 const state=()=>ok('state',{tenant:'acme'});
 const snapshot=()=>JSON.stringify(['documents','orders','commitments','budgets','events','head'].map(name=>db.prepare(`SELECT * FROM construction_${name} ORDER BY 1`).all()));
 return{db,base,catalog,post,ok,command,identity,committed,propose,review,approved,recordRequest,state,snapshot};
}

test('CON HTTP preserves original posting and credits one full linked reversal, including lost-response replay',async t=>{
 const x=await setup(t);let{row}=await x.committed();const original=structuredClone(row.commitment),before=await x.state();
 row=await x.approved(row);const request=x.recordRequest(row);row=await x.ok('record-reversal',request);
 assert.deepEqual(row.commitment,original);const state=await x.state();assert.equal(state.commitments.length,2);
 assert.deepEqual(state.commitments.find(entry=>entry.id===original.id),original);
 const credit=state.commitments.find(entry=>entry.id!==original.id);assert.equal(credit.amountCents,-original.amountCents);assert.equal(credit.reversesEntryId,original.id);assert.equal(credit.siteId,original.siteId);assert.equal(credit.currency,original.currency);
 assert.equal(state.budgets[0].committedCents,0);assert.equal(state.budgets[0].remainingCents,before.budgets[0].budgetCents);
 const snapshot=x.snapshot();assert.deepEqual(await x.ok('record-reversal',request),row);assert.equal(x.snapshot(),snapshot);
 assert.equal((await x.post('record-reversal',{...request,commandId:'second-credit'})).status,400);
 assert.equal((await x.post('record-reversal',{...request,actor:'acme-dual-role'})).status,400);
 assert.equal((await x.ok('verify-audit',{tenant:'acme'})).valid,true);
});

test('CON HTTP can undo historical cost during a current compliance hold without clearing that hold',async t=>{
 const x=await setup(t);let{row,documents}=await x.committed();row=await x.propose(row);const hash=row.reversalHash,doc=documents[0];
 await x.ok('review-document',x.command({tenant:'acme',documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'revoke',note:'Fictional evidence withdrawn.'}));
 row=await x.ok('receipt',{tenant:'acme',orderId:row.orderId});assert.equal(row.readiness.ready,false);assert.equal(row.reversalHash,hash);
 row=await x.review(row,'project_manager');row=await x.review(row,'finance');row=await x.ok('record-reversal',x.recordRequest(row));
 assert.equal(row.readiness.ready,false);assert.ok(row.readiness.reasons.some(value=>/revoked/u.test(value)));
 assert.equal((await x.state()).budgets[0].committedCents,0);
 assert.equal((await x.post('record-commitment',x.command({tenant:'acme',orderId:row.orderId,actor:'acme-operator',expectedHash:row.reviewHash}))).status,400);
});

test('CON HTTP rejects stale, unapproved, cross-tenant and caller-selected credit authority without effects',async t=>{
 const x=await setup(t);let{row}=await x.committed();const proposal=x.command({...x.identity(row),actor:'acme-operator',reasonCode:'change-cancelled',note:'Synthetic full reversal.'});
 for(const body of [null,[],{...proposal,amountCents:-1},{...proposal,approved:true},{...proposal,expectedRevision:0},{...proposal,reasonCode:'refund-anything'},{...proposal,tenant:'beta',actor:'beta-operator'}]){
   const before=x.snapshot();assert.equal((await x.post('propose-reversal',body)).status,400);assert.equal(x.snapshot(),before);
 }
 row=await x.ok('propose-reversal',proposal);const stale=row;assert.equal((await x.post('record-reversal',x.recordRequest(row))).status,400);
 assert.equal((await x.post('review-reversal',x.command({...x.identity(row),reviewer:'acme-operator',role:'project_manager',expectedHash:row.reversalHash,decision:'approve',note:'Self approval rejected.'}))).status,400);
 row=await x.review(row,'project_manager');
 assert.equal((await x.post('review-reversal',x.command({...x.identity(stale),reviewer:'acme-finance',role:'finance',expectedHash:stale.reversalHash,decision:'approve',note:'Old revision rejected.'}))).status,400);
 row=await x.review(row,'finance',{decision:'reject'});assert.equal((await x.post('record-reversal',x.recordRequest(row))).status,400);
 row=await x.review(row,'finance');const request=x.recordRequest(row);
 for(const body of [{...request,expectedHash:'0'.repeat(64)},{...request,amountCents:-125000},{...request,budgetCents:1000000},{...request,asOf:'2026-10-24T12:00:00.000Z'}]){
   const before=x.snapshot();assert.equal((await x.post('record-reversal',body)).status,400);assert.equal(x.snapshot(),before);
 }
});

test('CON HTTP competing reversal commands credit at most once and remain within loopback/intent/static boundaries',async t=>{
 const x=await setup(t);let{row}=await x.committed();row=await x.approved(row);const request=x.recordRequest(row),before=x.snapshot();
 for(const headers of [{Origin:'https://foreign.example'},{'X-Demo-Client':''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await x.post('record-reversal',request,headers)).status,403);
 const hostStatus=await new Promise((resolve,reject)=>{const request=httpRequest(x.base+'/api/construction/record-reversal',{method:'POST',headers:{Host:'foreign.example','Content-Type':'application/json','X-Demo-Client':'local-showcase'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);request.end('{}');});assert.equal(hostStatus,403);
 assert.equal((await fetch(x.base+'/api/construction/record-reversal')).status,404);assert.equal((await fetch(x.base+'/api/construction/record-reversal',{method:'PUT'})).status,405);
 for(const path of ['/construction-core.mjs','/construction-fixtures.mjs'])assert.equal((await fetch(x.base+path)).status,404);
 assert.equal(x.snapshot(),before);
 const results=await Promise.all([x.post('record-reversal',request),x.post('record-reversal',{...request,commandId:'competing-reversal'})]);assert.deepEqual(results.map(value=>value.status).sort(),[200,400]);
 const state=await x.state();assert.equal(state.commitments.length,2);assert.equal(state.budgets[0].committedCents,0);assert.equal((await x.ok('verify-audit',{tenant:'acme'})).valid,true);
});
