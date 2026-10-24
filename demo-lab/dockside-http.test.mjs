import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer,openStore } from './server.mjs';

async function setup(t) {
  const db=openStore(':memory:'),server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const catalog=await (await fetch(base+'/api/dockside/catalog')).json();
  const post=async(kind,body,extra={})=>{
    const response=await fetch(base+'/api/dockside/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...extra},body:JSON.stringify(body)});
    return {status:response.status,value:await response.json()};
  };
  const sample=id=>structuredClone(catalog.scenarios.find(row=>row.id===id).input);
  const approve=receipt=>post('review',{tenant:receipt.tenant,receiptId:receipt.receiptId,reviewer:'acme-reviewer',expectedHash:receipt.contentHash,decision:'approve',note:'Synthetic source and supplied arithmetic checked.'});
  return {db,base,catalog,post,sample,approve};
}

test('Dockside HTTP requires exact review and performs one real local receiver write',async t=>{
  const x=await setup(t);
  for(const path of ['/dockside','/dockside.css','/dockside-ui.mjs'])assert.equal((await fetch(x.base+path)).status,200,path);
  assert.match((await fetch(x.base+'/dockside')).headers.get('content-security-policy'),/script-src 'self'/);
  const input=x.sample('valid-invoice'),submitted=await x.post('submit',input);assert.equal(submitted.status,200);assert.equal(submitted.value.status,'awaiting-review');
  const receipt=submitted.value,identity={tenant:'acme',receiptId:receipt.receiptId};
  assert.equal((await x.post('sync',identity)).status,400);
  assert.equal((await x.post('review',{...identity,reviewer:'acme-reviewer',expectedHash:'forged',decision:'approve',note:'Cannot approve a different snapshot.'})).status,400);
  assert.equal((await x.post('receipt',{...identity,tenant:'beta'})).status,400);
  assert.equal((await x.approve(receipt)).value.status,'ready');
  const delivered=await x.post('sync',{...identity,receiverProfileId:'online'});assert.equal(delivered.status,200);assert.equal(delivered.value.status,'delivered');
  assert.equal((await x.post('sync',{...identity,receiverProfileId:'lose-response'})).value.status,'delivered');
  assert.equal((await x.post('submit',input)).value.receiptId,receipt.receiptId);
  const state=(await x.post('state',{tenant:'acme'})).value;assert.equal(state.erpRecords.length,1);assert.equal(state.erpRecords[0].receiptId,receipt.receiptId);
  assert.equal((await x.post('state',{tenant:'beta'})).value.erpRecords.length,0);
  assert.equal((await x.post('verify-audit',{tenant:'acme'})).value.valid,true);
});

test('Dockside HTTP preserves offline work and reconciles an uncertain receiver effect without a second posting',async t=>{
  const x=await setup(t),receipt=(await x.post('submit',x.sample('uncertain-response'))).value,identity={tenant:'acme',receiptId:receipt.receiptId};
  await x.approve(receipt);
  assert.equal((await x.post('sync',{...identity,receiverProfileId:'offline'})).value.status,'offline');
  assert.equal((await x.post('state',{tenant:'acme'})).value.erpRecords.length,0);
  assert.equal((await x.post('sync',{...identity,receiverProfileId:'lose-response'})).value.status,'uncertain');
  assert.equal((await x.post('state',{tenant:'acme'})).value.erpRecords.length,1);
  assert.equal((await x.post('sync',{...identity,receiverProfileId:'online'})).status,400);
  assert.equal((await x.post('reconcile',identity)).value.status,'delivered');
  assert.equal((await x.post('reconcile',identity)).value.status,'delivered');
  assert.equal((await x.post('state',{tenant:'acme'})).value.erpRecords.length,1);
  const rejected=(await x.post('submit',x.sample('bad-total'))).value;assert.equal(rejected.status,'rejected');
  assert.equal((await x.approve(rejected)).status,400);
  assert.equal((await x.post('sync',{tenant:'acme',receiptId:rejected.receiptId})).status,400);
  assert.equal((await x.post('state',{tenant:'acme'})).value.erpRecords.length,1);
});

test('Dockside HTTP rejects foreign browser intent and forged fields without creating jobs',async t=>{
  const x=await setup(t),input=x.sample('valid-invoice');
  assert.equal((await x.post('submit',input,{'Origin':'https://foreign.example'})).status,403);
  assert.equal((await x.post('submit',input,{'X-Demo-Client':''})).status,403);
  assert.equal((await fetch(x.base+'/api/dockside/catalog',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  for(const body of [null,[],{...input,approved:true},{...input,document:{...input.document,text:'x'.repeat(33000)}}])assert.equal((await x.post('submit',body)).status,400);
  for(const kind of ['constructor','__proto__','delete','close'])assert.equal((await x.post(kind,{tenant:'acme'})).status,404);
  assert.equal((await x.post('state',{tenant:'acme'})).value.jobs.length,0);
});
