import assert from 'node:assert/strict';
import { openConstruction } from './construction-core.mjs';
// Synthetic in-memory acceptance only: never records payments or external cancellations.
const desk=openConstruction(':memory:'),tenant='acme';
try {
 const catalog=desk.catalog();
 for(const sample of catalog.documentExamples.filter(r=>r.input.tenant===tenant&&r.id!=='expired-insurance').slice(0,2)){
  const doc=desk.submitDocument(sample.input);desk.reviewDocument({commandId:'verify-'+doc.documentId,tenant,documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'verify',note:'Synthetic certificate checked locally.'});
 }
 let row=desk.createOrder(catalog.orderExamples[0].input);
 for(const [role,reviewer]of [['project_manager','acme-manager'],['finance','acme-finance']])row=desk.reviewOrder({commandId:'original-'+role,tenant,orderId:row.orderId,reviewer,role,expectedHash:row.reviewHash,decision:'approve',note:'Reviewed original synthetic scope and cents.'});
 row=desk.recordCommitment({commandId:'commit-original',tenant,orderId:row.orderId,actor:'acme-operator',expectedHash:row.reviewHash});const original=structuredClone(row.commitment);
 const doc=desk.state({tenant}).documents.find(d=>d.kind==='insurance');desk.reviewDocument({commandId:'revoke-current',tenant,documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'revoke',note:'Synthetic current evidence revoked; undo remains possible.'});
 row=desk.proposeReversal({commandId:'propose-undo',tenant,orderId:row.orderId,actor:'acme-operator',expectedRevision:row.revision,reasonCode:'scope-withdrawn',note:'Entire synthetic change withdrawn.'});
 assert.throws(()=>desk.recordReversal({commandId:'unreviewed-undo',tenant,orderId:row.orderId,actor:'acme-operator',expectedRevision:row.revision,expectedHash:row.reversalHash}),/independent/);
 for(const [role,reviewer]of [['project_manager','acme-manager'],['finance','acme-finance']])row=desk.reviewReversal({commandId:'undo-'+role,tenant,orderId:row.orderId,reviewer,role,expectedRevision:row.revision,expectedHash:row.reversalHash,decision:'approve',note:'Independently reviewed full local reversal of original entry.'});
 const request={commandId:'post-undo',tenant,orderId:row.orderId,actor:'acme-operator',expectedRevision:row.revision,expectedHash:row.reversalHash};row=desk.recordReversal(request);assert.deepEqual(row.commitment,original);assert.deepEqual(desk.recordReversal(request),row);
 const state=desk.state({tenant}),audit=desk.verifyAudit({tenant});assert.equal(row.reversalStatus,'reversed');assert.equal(row.readiness.ready,false);assert.equal(state.commitments.length,2);assert.equal(state.budgets[0].committedCents,0);assert.equal(audit.valid,true);
 console.log(JSON.stringify({scope:'Synthetic full local commitment reversal only; no payments, refunds, contract cancellation, schedule change or site-work authority.',status:row.status,reversalStatus:row.reversalStatus,currentReadiness:row.readiness,original:row.commitment,reversal:row.reversal.entry,budgets:state.budgets,audit},null,2));
} finally {desk.close();}
