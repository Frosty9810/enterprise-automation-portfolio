import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createLabServer,openStore} from './server.mjs';

async function setup(t) {
  const db=openStore(':memory:'),server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  let sequence=0;
  const identity={tenant:'acme',actor:'acme-assistant'};
  const post=async(operation,body,headers={})=>{
    const response=await fetch(`${base}/api/industry/executive/${operation}`,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...headers},body:JSON.stringify(body)});
    return {status:response.status,value:await response.json()};
  };
  const invoke=async(operation,body)=>{const result=await post(operation,body);assert.equal(result.status,200,JSON.stringify(result.value));return result.value;};
  const command=(row,actor='acme-assistant')=>({...identity,actor,commandId:`completion-http-${++sequence}`,caseId:row.caseId,expectedRevision:row.revision});
  const intake=()=>invoke('ingest',{...identity,commandId:`completion-intake-${++sequence}`,sourceFixtureId:'src-acme-a-v2',commitmentId:'src-acme-a-v2-choice-1',recipient:'acme-assistant'});
  const approve=(row,actor='acme-principal')=>invoke('review',{...command(row,actor),expectedHash:row.reviewHash,decision:'approve',reasonCode:'checked'});
  const record=row=>invoke('record-task',{...command(row),expectedHash:row.reviewHash});
  const request=row=>({...identity,caseId:row.caseId,expectedRevision:row.revision,expectedHash:row.reviewHash});
  const snapshot=()=>JSON.stringify(['events','head','cases','tasks','decisions'].map(name=>db.prepare(`SELECT * FROM executive_${name} ORDER BY 1`).all()));
  return {db,base,post,invoke,command,intake,approve,record,request,snapshot};
}

const complete = (x,row) => ({...x.command(row),expectedHash:row.reviewHash,expectedGeneration:row.task.generation,reasonCode:'reported-complete'});

test('EA completion HTTP preserves one task, rejects calendar export and replays without another event',async t=>{
 const x=await setup(t),row=await x.record(await x.approve(await x.intake())),intent=complete(x,row);
 const done=await x.invoke('complete-task',intent);
 assert.equal(done.status,'completed');assert.equal(done.task.status,'completed');
 assert.equal(done.task.generation,row.task.generation);assert.equal(done.task.recordedAt,row.task.recordedAt);
 assert.equal(done.revision,row.revision+1);assert.equal(done.task.completion.actor,'acme-assistant');
 const before=x.snapshot();assert.deepEqual(await x.invoke('complete-task',intent),done);assert.equal(x.snapshot(),before);
 assert.equal((await x.post('calendar-export',x.request(done))).status,400);
 assert.equal((await x.post('record-task',{...x.command(done),expectedHash:done.reviewHash})).status,400);
 assert.equal(x.snapshot(),before);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM executive_tasks').get().n,1);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM executive_events').get().n,4);
});

test('EA completion HTTP rejects stale or supplied authority with zero writes',async t=>{
 const x=await setup(t),row=await x.record(await x.approve(await x.intake())),intent=complete(x,row),before=x.snapshot();
 for(const body of [null,[],{...intent,expectedGeneration:0},{...intent,expectedGeneration:'1'},{...intent,expectedHash:'0'.repeat(64)},{...intent,expectedRevision:0},{...intent,reasonCode:'sent-email'},{...intent,asOf:'2026-10-25T12:00:00.000Z'},{...intent,actor:'acme-observer'},{...intent,tenant:'beta',actor:'beta-assistant'}]){
  assert.equal((await x.post('complete-task',body)).status,400);assert.equal(x.snapshot(),before);
 }
});

test('EA completion HTTP preserves terminal history through revocation and filters the removed actor',async t=>{
 const x=await setup(t);let row=await x.record(await x.approve(await x.intake()));
 const intent=complete(x,row);row=await x.invoke('complete-task',intent);const historical=row.task;
 row=await x.invoke('set-access',{...x.command(row,'acme-principal'),targetActor:'acme-assistant',decision:'revoke'});
 assert.equal(row.task.status,'completed');assert.deepEqual(row.task.completion,historical.completion);
 const before=x.snapshot();assert.equal((await x.post('complete-task',intent)).status,400);assert.equal(x.snapshot(),before);
 const hidden=await x.invoke('state',{tenant:'acme',actor:'acme-assistant'});assert.equal(hidden.tasks.length,0);assert.equal(hidden.cases.length,0);
 row=await x.invoke('set-access',{...x.command(row,'acme-principal'),targetActor:'acme-assistant',decision:'grant'});
 assert.equal(row.task.status,'completed');assert.equal((await x.post('record-task',{...x.command(row),expectedHash:row.reviewHash})).status,400);
});

test('EA completion HTTP retains transport and immutable intent boundaries',async t=>{
 const x=await setup(t),row=await x.record(await x.approve(await x.intake())),intent=complete(x,row),before=x.snapshot();
 for(const headers of [{'X-Demo-Client':''},{Origin:'https://outside.example'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await x.post('complete-task',intent,headers)).status,403);
 const hostStatus=await new Promise((resolve,reject)=>{const req=httpRequest(x.base+'/api/industry/executive/complete-task',{method:'POST',headers:{Host:'outside.example','Content-Type':'application/json','X-Demo-Client':'local-showcase'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify(intent));});
 assert.equal(hostStatus,403);assert.equal((await fetch(x.base+'/api/industry/executive/complete-task')).status,404);assert.equal((await fetch(x.base+'/api/industry/executive/complete-task',{method:'PUT'})).status,405);assert.equal(x.snapshot(),before);
 await x.invoke('complete-task',intent);const completed=x.snapshot();assert.equal((await x.post('complete-task',{...intent,expectedGeneration:2})).status,400);assert.equal(x.snapshot(),completed);
});
