import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer, openStore } from './server.mjs';

async function setup(t) {
  const db=openStore(':memory:'),server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const catalog=await (await fetch(base+'/api/chronosrank/catalog')).json();
  const post=async(kind,body,extra={})=>{
    const response=await fetch(base+'/api/chronosrank/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...extra},body:JSON.stringify(body)});
    return {status:response.status,value:await response.json()};
  };
  return {db,base,catalog,post};
}

test('ChronosRank HTTP persists events, retrieves exact sources, replays and records feedback',async t=>{
  const x=await setup(t),{events,retrieval}=x.catalog.example;
  for(const path of ['/chronosrank','/chronosrank.css','/chronosrank-ui.mjs'])assert.equal((await fetch(x.base+path)).status,200,path);
  assert.match((await fetch(x.base+'/chronosrank')).headers.get('content-security-policy'),/script-src 'self'/);
  for(const event of events)assert.equal((await x.post('append',event)).status,200);
  assert.equal((await x.post('append',events[0])).value.replayed,true);
  const result=await x.post('retrieve',retrieval);assert.equal(result.status,200);assert.equal(result.value.status,'retrieved');
  assert.ok(result.value.selected.length>0);assert.ok(result.value.excluded.length>0);
  for(const fact of result.value.selected){assert.ok(fact.provenance.quote.includes(fact.text));assert.equal(fact.entity,retrieval.entity);}
  assert.equal((await x.post('retrieve',retrieval)).value.replayed,true);
  assert.equal((await x.post('retrieve',{...retrieval,query:'immutable request conflict'})).status,400);
  const identity={tenant:retrieval.tenant,receiptId:result.value.id};
  assert.equal((await x.post('receipt',identity)).value.id,result.value.id);
  assert.equal((await x.post('receipt',{...identity,tenant:'foreign'})).status,400);
  const feedback={...identity,commandId:'http-feedback',outcome:'useful',note:'Synthetic source and time window checked.'};
  assert.equal((await x.post('feedback',feedback)).status,200);assert.equal((await x.post('feedback',feedback)).value.replayed,true);
  const history=(await x.post('history',{tenant:retrieval.tenant})).value;
  assert.equal(history.receipts.length,1);assert.equal(history.feedback.length,1);
  assert.equal((await x.post('verify-audit',{tenant:retrieval.tenant})).value.valid,true);
});

test('ChronosRank HTTP rejects foreign browser intent, malformed fields and prototype operations without writes',async t=>{
  const x=await setup(t),event=x.catalog.example.events[0],tenant=event.tenant;
  assert.equal((await x.post('append',event,{'Origin':'https://foreign.example'})).status,403);
  assert.equal((await x.post('append',event,{'X-Demo-Client':''})).status,403);
  assert.equal((await fetch(x.base+'/api/chronosrank/catalog',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  for(const body of [null,[],{...event,unexpected:true},{...event,recordedAt:'2026-02-30T00:00:00.000Z'},{...event,text:'x'.repeat(33000)}])assert.equal((await x.post('append',body)).status,400);
  for(const operation of ['constructor','__proto__','delete','close'])assert.equal((await x.post(operation,{tenant})).status,404);
  assert.equal((await x.post('history',{tenant})).value.events.length,0);
});
