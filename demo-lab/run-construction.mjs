import assert from 'node:assert/strict';
import { openConstruction } from './construction-core.mjs';
const desk=openConstruction(':memory:');
try{
  const catalog=desk.catalog(),tenant='acme';
  for(const sample of catalog.documentExamples.slice(0,2)){
    let doc=desk.submitDocument(sample.input);
    doc=desk.reviewDocument({commandId:`verify-${sample.id}`,tenant,documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'verify',note:'Checked the manually supplied synthetic manifest only.'});
    assert.equal(doc.status,'verified');
  }
  let order=desk.createOrder(catalog.orderExamples[0].input);
  assert.throws(()=>desk.recordCommitment({commandId:'blocked-unreviewed',tenant,orderId:order.orderId,actor:'acme-operator',expectedHash:order.reviewHash}),/independent/);
  for(const [role,reviewer]of [['project_manager','acme-manager'],['finance','acme-finance']])order=desk.reviewOrder({commandId:`review-${role}`,tenant,orderId:order.orderId,reviewer,role,expectedHash:order.reviewHash,decision:'approve',note:'Checked exact synthetic scope, USD cents, schedule and current document-set hash.'});
  assert.equal(order.status,'ready');
  order=desk.recordCommitment({commandId:'commit',tenant,orderId:order.orderId,actor:'acme-operator',expectedHash:order.reviewHash});assert.equal(order.status,'committed');
  const current=desk.state({tenant}),insurance=current.documents.find(d=>d.kind==='insurance');
  desk.reviewDocument({commandId:'revoke-insurance',tenant,documentId:insurance.documentId,reviewer:'acme-compliance',expectedHash:insurance.contentHash,expectedRevision:insurance.revision,decision:'revoke',note:'Synthetic document revoked after the historical commitment.'});
  const after=desk.receipt({tenant,orderId:order.orderId}),state=desk.state({tenant}),audit=desk.verifyAudit({tenant});
  assert.equal(after.status,'committed');assert.equal(after.readiness.ready,false);assert.equal(state.commitments.length,1);assert.equal(state.budgets[0].committedCents,125000);assert.equal(audit.valid,true);
  console.log(JSON.stringify({scope:catalog.scope,clock:catalog.clock,order:{status:after.status,version:after.version,amountCents:after.amountCents,currentReadiness:after.readiness},localEffects:{commitments:state.commitments.length,budgets:state.budgets},audit},null,2));
}finally{desk.close();}
