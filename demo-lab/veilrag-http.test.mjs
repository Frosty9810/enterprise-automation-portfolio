import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer,openStore } from './server.mjs';

async function setup(t) {
  const db=openStore(':memory:'),server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const catalog=await (await fetch(base+'/api/veilrag/catalog')).json();
  const post=async(kind,body,extra={})=>{
    const response=await fetch(base+'/api/veilrag/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...extra},body:JSON.stringify(body)});
    return {status:response.status,value:await response.json()};
  };
  return {db,base,catalog,post,sample:id=>structuredClone(catalog.scenarios.find(row=>row.id===id).input)};
}

test('Veil HTTP sends sanitized frames to the child and restores only through an explicit local recipient action',async t=>{
  const x=await setup(t);
  for(const path of ['/veilrag','/veilrag.css','/veilrag-ui.mjs'])assert.equal((await fetch(x.base+path)).status,200,path);
  assert.match((await fetch(x.base+'/veilrag')).headers.get('content-security-policy'),/script-src 'self'/);
  const input=x.sample('declared-literals'),protectedResult=await x.post('protect',input);assert.equal(protectedResult.status,200);assert.equal(protectedResult.value.status,'protected');
  const identity={tenant:'acme',receiptId:protectedResult.value.id};
  for(const entity of input.entities)assert.equal(JSON.stringify(protectedResult.value.sanitized).includes(entity.value),false);
  const generated=await x.post('generate',identity);assert.equal(generated.status,200);assert.equal(generated.value.status,'generated');
  for(const entity of input.entities)assert.equal(generated.value.sanitizedOutput.includes(entity.value),false);
  assert.equal((await x.post('restore',{...identity,recipient:'beta-reviewer'})).status,400);
  assert.equal((await x.post('receipt',{...identity,tenant:'beta'})).status,400);
  const restored=await x.post('restore',{...identity,recipient:'acme-reviewer'});assert.equal(restored.status,200);assert.equal(restored.value.status,'restored');
  for(const entity of input.entities)assert.equal(restored.value.output.includes(entity.value),true);
  assert.equal((await x.post('protect',input)).value.id,identity.receiptId);
  assert.equal((await x.post('generate',identity)).value.status,'generated');
  assert.equal((await x.post('restore',{...identity,recipient:'acme-reviewer'})).value.output,restored.value.output);
  const history=(await x.post('history',{tenant:'acme'})).value,audit=(await x.post('audit',{tenant:'acme'})).value;
  assert.equal(history.receipts.length,1);assert.equal(audit.events.filter(row=>row.kind==='generated').length,1);assert.equal(audit.events.filter(row=>row.kind==='restored').length,1);
  // These synthetic entity values must not appear unmasked in this fixture's saved evidence.
  // Protocol metadata is intentionally plaintext; arbitrary substring absence is not promised.
  for(const entity of input.entities)assert.equal(JSON.stringify({history,audit}).includes(entity.value),false);
  assert.equal((await x.post('verify-audit',{tenant:'acme'})).value.valid,true);
});

test('Veil HTTP blocks declared-literal and foreign-alias fixture output before any restoration',async t=>{
  const x=await setup(t);
  for(const scenario of ['block-literal-leak','block-foreign-alias']){
    const saved=(await x.post('protect',x.sample(scenario))).value,identity={tenant:'acme',receiptId:saved.id};
    const result=await x.post('generate',identity);assert.equal(result.status,200);assert.equal(result.value.status,'blocked');assert.equal(Object.hasOwn(result.value,'sanitizedOutput'),false);
    assert.equal((await x.post('restore',{...identity,recipient:'acme-reviewer'})).status,400);
  }
  assert.equal((await x.post('verify-audit',{tenant:'acme'})).value.valid,true);
});

test('Veil HTTP rejects browser boundary violations, injected options and complete-wire literal collisions without writes',async t=>{
  const x=await setup(t),sample=x.sample('declared-literals');
  assert.equal((await x.post('protect',sample,{'Origin':'https://foreign.example'})).status,403);
  assert.equal((await x.post('protect',sample,{'X-Demo-Client':''})).status,403);
  assert.equal((await fetch(x.base+'/api/veilrag/catalog',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  for(const input of [null,[],{...sample,key:'not-accepted'},{...sample,ttlMs:3600000},{...sample,frames:{...sample.frames,query:'x'.repeat(33000)}}])assert.equal((await x.post('protect',input)).status,400);
  const collision={...sample,commandId:'wire-collision',entities:[{id:'protocol',value:'profile'}],frames:{query:'Explain profile',context:[],history:[],tools:[]}};
  assert.equal((await x.post('protect',collision)).status,400);
  for(const kind of ['constructor','__proto__','delete','close'])assert.equal((await x.post(kind,{tenant:'acme'})).status,404);
  assert.equal((await x.post('history',{tenant:'acme'})).value.receipts.length,0);
});
