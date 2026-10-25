import assert from 'node:assert/strict';
import {openLegal} from './legal-core.mjs';
const desk=openLegal(':memory:');let seq=0;const commandId=()=>`legal-acceptance-${++seq}`,identity=row=>({tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision}),operator=row=>({commandId:commandId(),...identity(row),actor:'acme-intake'});
try{
 let row=desk.intake({commandId:commandId(),tenant:'acme',actor:'acme-intake',sourceId:'acme-clear-intake'});
 assert.throws(()=>desk.createMatter({...operator(row),expectedHash:row.conflictHash}),/review/);
 row=desk.reviewConflict({commandId:commandId(),...identity(row),reviewer:'acme-reviewer',expectedHash:row.conflictHash,decision:'approve',reasonCode:'synthetic-no-match-checked'});
 row=desk.createMatter({...operator(row),expectedHash:row.conflictHash});
 row=desk.proposeDeadline({...operator(row),deadlineFixtureId:'acme-supplied-future'});
 row=desk.reviewDeadline({commandId:commandId(),...identity(row),reviewer:'acme-reviewer',expectedHash:row.deadlineHash,decision:'approve',reasonCode:'supplied-date-checked'});
 const posted={...operator(row),expectedHash:row.deadlineHash};row=desk.recordDeadline(posted);assert.equal(desk.recordDeadline(posted).revision,row.revision);
 let held=desk.intake({commandId:commandId(),tenant:'acme',actor:'acme-intake',sourceId:'acme-matched-intake'});
 assert.throws(()=>desk.setParties({...operator(held),partyIds:['acme-willow']}),/Pinned/);
 assert.throws(()=>desk.reviewConflict({commandId:commandId(),...identity(held),reviewer:'acme-reviewer',expectedHash:held.conflictHash,decision:'approve',reasonCode:'synthetic-no-match-checked'}),/cannot be cleared/);
 held=desk.reviewConflict({commandId:commandId(),...identity(held),reviewer:'acme-reviewer',expectedHash:held.conflictHash,decision:'return',reasonCode:'conflict-follow-up'});
 assert.throws(()=>desk.createMatter({...operator(held),expectedHash:held.conflictHash}),/review/);
 const state=desk.state({tenant:'acme'}),audit=desk.verifyAudit({tenant:'acme'});assert.equal(state.matters.length,1);assert.equal(state.deadlines.length,1);assert.equal(state.deadlines[0].effectiveStatus,'recorded');assert.equal(audit.valid,true);assert.equal(audit.eventCount,8);
 console.log(JSON.stringify({scope:desk.catalog().scope,clock:desk.catalog().clock,localEffects:{cases:state.cases.length,matters:state.matters.length,calendarRows:state.deadlines.length},recorded:{conflictHash:row.conflictHash,dateHash:row.deadlineHash,dateSource:row.deadlineProposal.fixture.sourceReference},held:{status:held.status,matches:held.conflict.matches,review:held.conflictReview},audit},null,2));
}finally{desk.close();}
