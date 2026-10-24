import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer, openStore } from './server.mjs';
async function setup(t) {
  const db=openStore(':memory:'), server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const catalog=await (await fetch(base+'/api/maintenance/catalog')).json();
  const post=async(kind,body,headers={})=>{const response=await fetch(base+'/api/maintenance/'+kind,{method:'POST',headers:{'X-Demo-Client':'local-showcase','Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
  let seq=0; const fresh=(kind,body)=>post(kind,{commandId:`http-${++seq}`,...body});
  const sample=id=>structuredClone(catalog.scenarios.find(row=>row.id===id).input);
  const identity=receipt=>({tenant:receipt.tenant,caseId:receipt.caseId});
  const operator=receipt=>({...identity(receipt),actor:`${receipt.tenant}-operator`});
  const ready=async()=>{const input=sample('routine-plumbing');input.commandId=`intake-${++seq}`;input.sourceIssueId=`source-${seq}`;
    let r=(await post('intake',input)).value;
    r=(await fresh('grant-access',{...identity(r),actor:'acme-tenant',windows:[{start:'2026-10-24T13:00:00.000Z',end:'2026-10-24T16:00:00.000Z'}]})).value;
    r=(await fresh('propose',operator(r))).value;
    return (await fresh('review',{...identity(r),reviewer:'acme-reviewer',expectedHash:r.proposal.hash,decision:'approve',note:'Synthetic request, consent and exact vendor slot reviewed.'})).value;};
  return {db,base,catalog,post,fresh,sample,identity,operator,ready};
}
test('PM HTTP serves inventory deep link and requires consent plus exact independent review before local receiver effects',async t=>{
  const x=await setup(t);
  for(const path of ['/maintenance?project=PM-01','/maintenance.css','/maintenance-ui.mjs'])assert.equal((await fetch(x.base+path)).status,200,path);
  const page=await fetch(x.base+'/maintenance');assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.match(await page.text(),/PM-01/);
  const inventory=await (await fetch(x.base+'/api/project-inventory')).json();assert.equal(inventory.find(row=>row.id==='PM-01').href,'/maintenance?project=PM-01');assert.equal(inventory.length,73);
  assert.match(x.catalog.clock.mode,/Fixed synthetic/);
  let r=(await x.post('intake',x.sample('routine-plumbing'))).value;
  assert.equal((await x.fresh('dispatch',{...x.operator(r),receiverProfileId:'online'})).status,400);
  r=(await x.fresh('grant-access',{...x.identity(r),actor:'acme-tenant',windows:[{start:'2026-10-24T13:00:00.000Z',end:'2026-10-24T16:00:00.000Z'}]})).value;
  r=(await x.fresh('propose',x.operator(r))).value;
  assert.equal((await x.fresh('review',{...x.identity(r),reviewer:'acme-reviewer',expectedHash:'forged',decision:'approve',note:'Invalid snapshot.'})).status,400);
  r=(await x.fresh('review',{...x.identity(r),reviewer:'acme-reviewer',expectedHash:r.proposal.hash,decision:'approve',note:'Exact saved proposal checked.'})).value;
  r=(await x.fresh('dispatch',{...x.operator(r),receiverProfileId:'online'})).value;assert.equal(r.status,'delivered');
  assert.equal((await x.post('state',{tenant:'acme'})).value.receiverRecords.length,1);
  assert.equal((await x.post('receipt',{...x.identity(r),tenant:'beta'})).status,400);
  assert.equal((await x.fresh('complete',{...x.operator(r),expectedRevision:r.revision-1,note:'Stale.'})).status,400);
  r=(await x.fresh('complete',{...x.operator(r),expectedRevision:r.revision,note:'Operator fixture reports repair, no physical proof.'})).value;assert.equal(r.status,'reported-complete');
  assert.equal((await x.post('verify-audit',{tenant:'acme'})).value.valid,true);
});
test('PM HTTP keeps offline work, reconciles actual lost acknowledgement and blocks emergency routine dispatch',async t=>{
  const x=await setup(t);let r=await x.ready();
  r=(await x.fresh('dispatch',{...x.operator(r),receiverProfileId:'offline'})).value;assert.equal(r.status,'queued');assert.equal((await x.post('state',{tenant:'acme'})).value.receiverRecords.length,0);
  r=(await x.fresh('dispatch',{...x.operator(r),receiverProfileId:'lose-response'})).value;assert.equal(r.status,'uncertain');
  assert.equal((await x.fresh('dispatch',{...x.operator(r),receiverProfileId:'online'})).status,400);
  r=(await x.fresh('reconcile',x.operator(r))).value;assert.equal(r.status,'delivered');assert.equal((await x.post('state',{tenant:'acme'})).value.receiverRecords.length,1);
  const emergency=(await x.post('intake',x.sample('emergency-gas'))).value;assert.equal(emergency.status,'emergency-hold');
  assert.equal((await x.fresh('propose',x.operator(emergency))).status,400);assert.equal((await x.fresh('dispatch',{...x.operator(emergency),receiverProfileId:'online'})).status,400);
});
test('PM HTTP enforces browser intent, closed schemas/operations and leaves no effects on rejected requests',async t=>{
  const x=await setup(t), input=x.sample('routine-plumbing');
  assert.equal((await x.post('intake',input,{'Origin':'https://foreign.example'})).status,403);assert.equal((await x.post('intake',input,{'X-Demo-Client':''})).status,403);
  assert.equal((await fetch(x.base+'/api/maintenance/catalog',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  for(const body of [null,[],{...input,approved:true},{...input,asOf:'2026-10-24T12:00:00.000Z'},{...input,description:'x'.repeat(33000)}])assert.equal((await x.post('intake',body)).status,400);
  for(const kind of ['constructor','__proto__','close','delete'])assert.equal((await x.post(kind,{tenant:'acme'})).status,404);
  assert.equal((await fetch(x.base+'/maintenance-core.mjs')).status,404);
  assert.equal((await x.post('state',{tenant:'acme'})).value.cases.length,0);
});
