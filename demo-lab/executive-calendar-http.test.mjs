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
  const command=(row,actor='acme-assistant')=>({...identity,actor,commandId:`calendar-http-${++sequence}`,caseId:row.caseId,expectedRevision:row.revision});
  const intake=()=>invoke('ingest',{...identity,commandId:`calendar-intake-${++sequence}`,sourceFixtureId:'src-acme-a-v2',commitmentId:'src-acme-a-v2-choice-1',recipient:'acme-assistant'});
  const approve=(row,actor='acme-principal')=>invoke('review',{...command(row,actor),expectedHash:row.reviewHash,decision:'approve',reasonCode:'checked'});
  const record=row=>invoke('record-task',{...command(row),expectedHash:row.reviewHash});
  const request=row=>({...identity,caseId:row.caseId,expectedRevision:row.revision,expectedHash:row.reviewHash});
  const snapshot=()=>JSON.stringify(['events','head','cases','tasks','decisions'].map(name=>db.prepare(`SELECT * FROM executive_${name} ORDER BY 1`).all()));
  return {db,base,post,invoke,command,intake,approve,record,request,snapshot};
}
const unfold=value=>value.replace(/\r\n[ \t]/gu,'');

test('EA calendar HTTP returns one repeatable reviewed UTC event without changing any durable rows',async t=>{
  const x=await setup(t),row=await x.record(await x.approve(await x.intake())),before=x.snapshot();
  const artifact=await x.invoke('calendar-export',x.request(row));
  assert.equal(artifact.kind,'synthetic-executive-calendar-snapshot');
  assert.equal(artifact.tenant,'acme');assert.equal(artifact.caseId,row.caseId);
  assert.equal(artifact.revision,row.revision);assert.equal(artifact.reviewHash,row.reviewHash);
  assert.equal(artifact.taskGeneration,row.task.generation);assert.equal(artifact.sequence,row.revision);
  assert.equal(artifact.mediaType,'text/calendar;charset=utf-8');assert.match(artifact.filename,/^[a-zA-Z0-9._-]+\.ics$/u);
  const content=unfold(artifact.content);
  for(const value of ['BEGIN:VCALENDAR\r\n','VERSION:2.0\r\n','BEGIN:VEVENT\r\n','DTSTART:20261025T130000Z\r\n','DTEND:20261025T140000Z\r\n','STATUS:TENTATIVE\r\n','TRANSP:TRANSPARENT\r\n',`UID:${artifact.uid}\r\n`,`SEQUENCE:${row.revision}\r\n`])assert.ok(content.includes(value),value);
  assert.equal(content.match(/BEGIN:VEVENT/gu).length,1);
  assert.ok(content.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'));
  for(const forbidden of ['SYNTHETIC SOURCE A V2','allowedActors','METHOD:','ATTENDEE','ORGANIZER','BEGIN:VALARM','src-acme-b'])assert.ok(!content.includes(forbidden),forbidden);
  assert.ok(artifact.audit.valid);assert.equal(artifact.audit.eventCount,3);
  assert.deepEqual(await x.invoke('calendar-export',x.request(row)),artifact);
  assert.equal(x.snapshot(),before);
});

test('EA calendar HTTP denies unrecorded, revoked and regranted-but-unreviewed tasks and preserves stable identity after fresh review',async t=>{
  const x=await setup(t);let row=await x.intake();
  for(let step=0;step<2;step++){
    const before=x.snapshot();assert.equal((await x.post('calendar-export',x.request(row))).status,400);assert.equal(x.snapshot(),before);
    if(step===0)row=await x.approve(row);
  }
  row=await x.record(row);const first=await x.invoke('calendar-export',x.request(row)),old=x.request(row);
  row=await x.invoke('set-access',{...x.command(row,'acme-principal'),targetActor:'acme-assistant',decision:'revoke'});
  for(const request of [old,{...x.request(row),actor:'acme-principal'},{...x.request(row),actor:'acme-observer'},{...x.request(row),tenant:'beta',actor:'beta-principal'}]){
    const before=x.snapshot(),denied=await x.post('calendar-export',request);assert.equal(denied.status,400);assert.ok(!JSON.stringify(denied.value).includes(row.task.actionText));assert.equal(x.snapshot(),before);
  }
  row=await x.invoke('set-access',{...x.command(row,'acme-principal'),targetActor:'acme-assistant',decision:'grant'});
  assert.equal((await x.post('calendar-export',x.request(row))).status,400);
  row=await x.record(await x.approve(row,'acme-delegate'));
  const second=await x.invoke('calendar-export',x.request(row));
  assert.equal(second.uid,first.uid);assert.ok(second.sequence>first.sequence);assert.equal(second.taskGeneration,2);
  assert.equal((await x.post('calendar-export',old)).status,400);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM executive_tasks').get().n,1);
});

test('EA calendar HTTP rejects changed proposals, stale revision/fingerprint and supplied authority/content',async t=>{
  const x=await setup(t);let row=await x.record(await x.approve(await x.intake()));const original=x.request(row);
  for(const body of [null,[],{...original,expectedRevision:0},{...original,expectedHash:'0'.repeat(64)},{...original,commandId:'not-a-write'},{...original,content:'BEGIN:VCALENDAR'},{...original,asOf:'2026-10-25T12:00:00.000Z'},{...original,actor:['acme-assistant']},{...original,expectedRevision:String(row.revision)}]){
    const before=x.snapshot();assert.equal((await x.post('calendar-export',body)).status,400);assert.equal(x.snapshot(),before);
  }
  row=await x.invoke('revise',{...x.command(row),sourceFixtureId:row.sourceFixtureId,commitmentId:'src-acme-a-v2-choice-2',recipient:row.recipient});
  assert.equal((await x.post('calendar-export',original)).status,400);
  assert.equal((await x.post('calendar-export',x.request(row))).status,400);
  row=await x.record(await x.approve(row));
  assert.match(unfold((await x.invoke('calendar-export',x.request(row))).content),/DTSTART:20261025T140000Z\r\n/u);
});

test('EA calendar HTTP retains method, loopback, intent and static-source boundaries',async t=>{
  const x=await setup(t),row=await x.record(await x.approve(await x.intake())),body=x.request(row),before=x.snapshot();
  for(const headers of [{'X-Demo-Client':''},{Origin:'https://outside.example'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await x.post('calendar-export',body,headers)).status,403,JSON.stringify(headers));
  // Node fetch replaces Host; use the HTTP transport to exercise the actual header.
  const hostStatus=await new Promise((resolve,reject)=>{
    const request=httpRequest(x.base+'/api/industry/executive/calendar-export',{method:'POST',headers:{Host:'outside.example','Content-Type':'application/json','X-Demo-Client':'local-showcase'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});
    request.on('error',reject);request.end(JSON.stringify(body));
  });
  assert.equal(hostStatus,403);
  assert.equal((await fetch(x.base+'/api/industry/executive/calendar-export')).status,404);
  assert.equal((await fetch(x.base+'/api/industry/executive/calendar-export',{method:'PUT'})).status,405);
  for(const path of ['/executive-calendar.mjs','/executive-core.mjs','/industry-desks/executive.json'])assert.equal((await fetch(x.base+path)).status,404);
  assert.equal(x.snapshot(),before);
});
