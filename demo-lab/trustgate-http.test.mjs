import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer,openStore } from './server.mjs';

async function setup(t) {
  const db=openStore(':memory:'),server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const catalog=await (await fetch(base+'/api/trustgate/catalog')).json();
  const post=async(kind,body,extra={})=>{
    const response=await fetch(base+'/api/trustgate/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...extra},body:JSON.stringify(body)});
    return {status:response.status,value:await response.json()};
  };
  const proposal=id=>structuredClone(catalog.scenarios.find(row=>row.id===id).proposal);
  return {db,base,catalog,post,proposal};
}

test('TrustGate HTTP runs an actual reviewed local effect and keeps repeats idempotent',async t=>{
  const x=await setup(t);
  for(const path of ['/trustgate','/trustgate.css','/trustgate-ui.mjs'])assert.equal((await fetch(x.base+path)).status,200,path);
  assert.equal((await fetch(x.base+'/trustgate')).headers.get('content-security-policy').includes("script-src 'self'"),true);
  const prepare=await x.post('prepare',x.proposal('reviewed-task'));assert.equal(prepare.status,200);assert.equal(prepare.value.status,'pending_review');
  const receipt=prepare.value,identity={tenant:receipt.tenant,receiptId:receipt.id};
  assert.equal((await x.post('execute',identity)).status,400);
  assert.equal((await x.post('state',{tenant:receipt.tenant})).value.tasks.length,0);
  const review={...identity,reviewer:'acme-reviewer',decision:'approve',note:'Inspect the synthetic summary in an internal review task only.',expectedHash:receipt.proposalHash};
  assert.equal((await x.post('review',{...review,expectedHash:'0'.repeat(64)})).status,400);
  assert.equal((await x.post('review',review)).value.status,'ready');
  const result=await x.post('execute',identity);assert.equal(result.status,200);assert.equal(result.value.status,'executed');assert.equal(result.value.effect.kind,'internal-draft');
  const replay=await x.post('execute',identity);assert.equal(replay.value.replayed,true);assert.deepEqual(replay.value.effect,result.value.effect);
  const state=(await x.post('state',{tenant:receipt.tenant})).value;assert.equal(state.tasks.length,1);assert.equal(state.publicNotes.length,0);
  assert.equal((await x.post('history',{tenant:receipt.tenant})).value.receipts.length,1);
  assert.equal((await x.post('receipt',identity)).value.id,receipt.id);
  assert.equal((await x.post('verify-audit',{tenant:receipt.tenant})).value.valid,true);
  assert.equal((await x.post('audit',{tenant:receipt.tenant})).value.events.length,3);
});

test('TrustGate HTTP rejects hostile boundaries, forged authority and unsafe source flow without effects',async t=>{
  const x=await setup(t),proposal=x.proposal('public-read');
  assert.equal((await x.post('prepare',proposal,{Origin:'https://foreign.test'})).status,403);
  assert.equal((await x.post('prepare',proposal,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await x.post('prepare',proposal,{'X-Demo-Client':''})).status,403);
  for(const extra of [{args:{policyId:'chosen-free-value'}},{grants:['all']},{sources:[]},{approved:true}])assert.equal((await x.post('prepare',{...proposal,...extra})).status,400);
  assert.equal((await x.post('prepare',{...proposal,tool:'send-payment'})).status,400);
  assert.equal((await x.post('prepare',{...proposal,actor:'beta-operator'})).status,400);
  assert.equal((await x.post('prepare',{...proposal,bindings:{policyId:{sourceId:'beta-intent-public',key:'policyId'}}})).status,400);
  assert.equal((await x.post('prepare',JSON.parse('{"tenant":"acme","__proto__":{"grants":["all"]}}'))).status,400);
  assert.equal((await x.post('constructor',{})).status,404);
  assert.equal((await x.post('prepare',{...proposal,excess:'x'.repeat(33000)})).status,400);
  for(const scenario of ['blocked-private','blocked-injection','blocked-identity']){
    const result=await x.post('prepare',x.proposal(scenario));assert.equal(result.status,200);assert.equal(result.value.status,'blocked');
    assert.equal((await x.post('execute',{tenant:'acme',receiptId:result.value.id})).status,400);
    assert.equal((await x.post('review',{tenant:'acme',receiptId:result.value.id,reviewer:'acme-reviewer',decision:'approve',note:'Cannot override this hold.',expectedHash:result.value.proposalHash})).status,400);
  }
  const state=(await x.post('state',{tenant:'acme'})).value;assert.equal(state.tasks.length,0);assert.equal(state.publicNotes.length,0);
  assert.equal((await x.post('verify-audit',{tenant:'acme'})).value.valid,true);
});
