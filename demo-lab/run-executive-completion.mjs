import assert from 'node:assert/strict';
import {executiveDesk} from './executive-core.mjs';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');
try{
 let asOf='2026-10-25T12:00:00.000Z';
 const desk=executiveDesk(db,{clock:()=>asOf}),assistant={tenant:'acme',actor:'acme-assistant'},principal={tenant:'acme',actor:'acme-principal'};
 const common=(row,commandId,actor=assistant.actor)=>({commandId,tenant:'acme',actor,caseId:row.caseId,expectedRevision:row.revision});
 let row=desk.ingest({commandId:'intake',...assistant,sourceFixtureId:'src-acme-a-v2',commitmentId:'src-acme-a-v2-choice-1',recipient:assistant.actor});
 row=desk.review({...common(row,'review',principal.actor),expectedHash:row.reviewHash,decision:'approve',reasonCode:'checked'});
 row=desk.recordTask({...common(row,'record'),expectedHash:row.reviewHash});
 const request={...common(row,'complete'),expectedHash:row.reviewHash,expectedGeneration:row.task.generation,reasonCode:'reported-complete'},originalTask={...row.task};
 asOf='2026-10-25T16:00:00.000Z';
 row=desk.completeTask(request);
 assert.equal(row.status,'completed');assert.equal(row.readiness.ready,false);assert.equal(row.task.generation,1);assert.equal(row.task.recordedAt,originalTask.recordedAt);assert.equal(row.task.completion.asOf,asOf);
 assert.deepEqual(desk.completeTask(request),row);
 assert.throws(()=>desk.calendarExport({...assistant,caseId:row.caseId,expectedRevision:row.revision,expectedHash:row.reviewHash}));
 row=desk.setAccess({...common(row,'revoke',principal.actor),targetActor:assistant.actor,decision:'revoke'});
 assert.equal(row.task.status,'completed');assert.equal(desk.state(assistant).tasks.length,0);assert.throws(()=>desk.completeTask(request));
 row=desk.setAccess({...common(row,'grant',principal.actor),targetActor:assistant.actor,decision:'grant'});
 assert.equal(row.task.status,'completed');assert.equal(row.review,null);
 assert.throws(()=>desk.recordTask({...common(row,'no-reopen'),expectedHash:row.reviewHash}));
 assert.equal(desk.completeTask(request).revision,row.revision);
 const state=desk.state(principal),audit=desk.verifyAudit(principal);
 assert.equal(state.tasks.length,1);assert.equal(state.decisions.length,1);assert.equal(audit.eventCount,6);assert.equal(audit.valid,true);
 console.log(JSON.stringify({scope:'Synthetic local operator report only; no real task, message or provider outcome verified.',status:row.status,generation:row.task.generation,originalRecordedAt:row.task.recordedAt,completion:row.task.completion,schedulingHolds:row.readiness.holds,taskCount:state.tasks.length,decisionCount:state.decisions.length,audit},null,2));
}finally{db.close();}
