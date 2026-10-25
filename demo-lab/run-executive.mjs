import assert from 'node:assert/strict';
import {openExecutive} from './executive-core.mjs';
const desk=openExecutive(':memory:');
try{
 const tenant='acme',identity={tenant,actor:'acme-principal'};
 const command=(row,commandId,actor='acme-assistant')=>({commandId,tenant,actor,caseId:row.caseId,expectedRevision:row.revision});
 const input={commandId:'synthetic-intake',tenant,actor:'acme-assistant',sourceFixtureId:'src-acme-a-v2',commitmentId:'src-acme-a-v2-choice-1',recipient:'acme-assistant'};
 let row=desk.ingest(input);assert.throws(()=>desk.recordTask({...command(row,'blocked-before-review'),expectedHash:row.reviewHash}),/independent review/);
 row=desk.review({...command(row,'principal-review','acme-principal'),expectedHash:row.reviewHash,decision:'approve',reasonCode:'checked'});
 const first={...command(row,'first-task'),expectedHash:row.reviewHash};row=desk.recordTask(first);assert.equal(desk.recordTask(first).revision,row.revision);
 row=desk.setAccess({...command(row,'revoke','acme-principal'),targetActor:'acme-assistant',decision:'revoke'});assert.equal(row.task.status,'held');
 assert.deepEqual(desk.state({tenant,actor:'acme-assistant'}).cases,[]);assert.deepEqual(desk.audit({tenant,actor:'acme-assistant'}).events,[]);
 row=desk.setAccess({...command(row,'regrant','acme-principal'),targetActor:'acme-assistant',decision:'grant'});assert.equal(row.review,null);
 assert.throws(()=>desk.recordTask({...command(row,'blocked-old-review'),expectedHash:row.reviewHash}),/independent review/);
 assert.throws(()=>desk.review({...command(row,'blocked-access-editor','acme-principal'),expectedHash:row.reviewHash,decision:'approve',reasonCode:'checked'}),/must differ/);
 row=desk.review({...command(row,'delegate-review','acme-delegate'),expectedHash:row.reviewHash,decision:'approve',reasonCode:'checked'});
 row=desk.recordTask({...command(row,'fresh-task'),expectedHash:row.reviewHash});const state=desk.state(identity),audit=desk.verifyAudit(identity),denied=desk.state({tenant,actor:'acme-observer'});
 assert.equal(state.tasks.length,1);assert.equal(row.task.generation,2);assert.equal(audit.valid,true);assert.equal(denied.cases.length,0);assert.equal(denied.tasks.length,0);assert.equal(state.decisions.length,2);
 console.log(JSON.stringify({scope:desk.catalog().scope,clock:desk.catalog().clock,source:{id:row.sourceFixtureId,version:row.source.version},localEffects:{tasks:state.tasks.length,generation:row.task.generation,effectiveStatus:row.task.effectiveStatus,decisions:state.decisions.length},access:{deniedActorVisibleCases:denied.cases.length,deniedActorVisibleTasks:denied.tasks.length},audit},null,2));
}finally{desk.close();}
