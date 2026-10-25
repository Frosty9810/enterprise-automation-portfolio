import assert from 'node:assert/strict';
import {openReferral} from './referral-core.mjs';
const desk=openReferral(':memory:');
try{
 const tenant='acme',sample=desk.catalog().intakeExamples.find(x=>x.id==='ref-acme-01').input;
 const command=(row,commandId)=>({commandId,tenant,caseId:row.caseId,expectedRevision:row.revision,actor:'acme-intake'});
 let row=desk.intake(sample);assert.equal(row.status,'held');
 row=desk.setPacket({...command(row,'complete-packet'),payerId:'DEMO_PAYER_A',documentIds:['ref-acme-01-form-v2','ref-acme-01-order-v1']});
 row=desk.setConsent({...command(row,'synthetic-grant'),decision:'grant',proofId:'ref-acme-01-consent-grant'});
 row=desk.review({commandId:'staff-review',tenant,caseId:row.caseId,expectedRevision:row.revision,reviewer:'acme-reviewer',expectedHash:row.reviewHash,decision:'approve',reasonCode:'packet-checked'});
 row=desk.enqueue({...command(row,'enqueue'),expectedHash:row.reviewHash});
 row=desk.assign({...command(row,'assign'),assignee:'acme-staff'});assert.equal(row.status,'assigned');
 const assigned={status:row.status,assignee:row.queue.assignee,generation:row.queue.generation};
 row=desk.setConsent({...command(row,'withdraw-source'),decision:'revoke',proofId:'ref-acme-01-consent-revoke'});assert.equal(row.queue.status,'held');assert.equal(row.queue.assignee,null);
 row=desk.setConsent({...command(row,'new-source-grant'),decision:'grant',proofId:'ref-acme-01-consent-grant'});assert.equal(row.review,null);assert.throws(()=>desk.enqueue({...command(row,'old-review-cannot-return'),expectedHash:row.reviewHash}),/independently reviewed/);
 row=desk.review({commandId:'fresh-staff-review',tenant,caseId:row.caseId,expectedRevision:row.revision,reviewer:'acme-reviewer',expectedHash:row.reviewHash,decision:'approve',reasonCode:'packet-checked'});
 row=desk.enqueue({...command(row,'new-queue-generation'),expectedHash:row.reviewHash});
 const state=desk.state({tenant});assert.equal(state.queue.length,1);assert.equal(state.queue[0].generation,2);assert.equal(state.audit.valid,true);
 console.log(JSON.stringify({scope:state.scope,clock:desk.catalog().clock,initialAssignment:assigned,afterRegrant:{status:row.status,generation:row.queue.generation},actualLocalQueueRows:state.queue.length,consentRevision:row.consent.revision,audit:state.audit},null,2));
}finally{desk.close();}
