import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { openConstruction } from './construction-core.mjs';
import { mountConstruction } from './construction-ui.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Construction UI did not settle.');}
async function setup(t,decorate=api=>api){
  const dom=new JSDOM(readFileSync(new URL('./construction.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680/construction?project=CON-01'}),d=dom.window.document,store=openConstruction(':memory:'),calls=[],exports=[];
  const methods={'submit-document':'submitDocument','review-document':'reviewDocument','document-receipt':'documentReceipt','create-order':'createOrder','revise-order':'reviseOrder','review-order':'reviewOrder','record-commitment':'recordCommitment','verify-audit':'verifyAudit'};
  const api=async(kind,body)=>{calls.push({kind,body:structuredClone(body)});return store[methods[kind]??kind](body);};
  const mounted=await mountConstruction(d,decorate(api),value=>exports.push(value));t.after(()=>{dom.window.close();store.close();});
  const $=id=>d.getElementById(id),event=(id,type='input')=>$(id).dispatchEvent(new dom.window.Event(type));
  const settle=async()=>{await until(()=>!$('conRefresh').disabled);await tick();};
  const click=async id=>{assert.equal($(id).disabled,false,`${id} must be available`);$(id).click();await settle();};
  const select=(id,value)=>{$(id).value=value;event(id,'change');};
  const edit=(id,value)=>{$(id).value=typeof value==='string'?value:JSON.stringify(value);event(id);};
  const note=(id,value)=>{$(id).value=value;event(id);};
  const document=()=>mounted.getDocument(),order=()=>mounted.getOrder(),state=(tenant='acme')=>store.state({tenant});
  const verify=async()=>{note('conDocumentNote','Independently checked exact supplied fixture content and expiry.');$('conDocumentAck').checked=true;event('conDocumentAck','change');await click('conVerifyDocument');return document();};
  const saveVerify=async id=>{select('conDocumentExample',id);await click('conSubmitDocument');return verify();};
  const readyDocs=async(tenant='acme')=>[await saveVerify(tenant==='acme'?'insurance':'beta-insurance'),await saveVerify(tenant==='acme'?'license':'beta-license')];
  const approve=async(role='project_manager')=>{select('conReviewRole',role);note('conOrderNote','Checked exact source, scope, cents, schedule and current evidence fingerprint.');$('conOrderAck').checked=true;event('conOrderAck','change');await click('conApproveOrder');};
  const readyOrder=async()=>{await click('conCreateOrder');await approve();await approve('finance');return order();};
  const recoverOrder=async orderId=>{await click('conRefresh');const buttons=[...$('conOrderHistory').querySelectorAll('button')];const button=orderId?buttons.find(button=>button.textContent.includes(orderId)):buttons.at(-1);assert.ok(button);button.click();await settle();return order();};
  return{dom,d,$,event,click,select,edit,note,verify,saveVerify,readyDocs,approve,readyOrder,recoverOrder,store,calls,exports,document,order,state,settle};
}

test('construction catalog does not write, and actual local cost needs two independent exact approvals',async t=>{
 const x=await setup(t);assert.equal(x.calls.length,1);assert.equal(x.state().documents.length,0);assert.equal(x.state().commitments.length,0);
 assert.match(x.$('conClock').textContent,/Fixed synthetic|fixed synthetic/);assert.match(x.d.body.textContent,/not authenticated identities/);assert.match(x.d.body.textContent,/not parsed PDFs/);
 await x.readyDocs();await x.click('conCreateOrder');assert.equal(x.$('conCommit').disabled,true);assert.match(x.$('conOrderReceipt').textContent,/\$1250\.00 USD/);
 assert.equal(x.$('conApproveOrder').disabled,true);await x.approve();assert.equal(x.$('conCommit').disabled,true);await x.approve('finance');assert.equal(x.order().status,'ready');
 const hash=x.order().reviewHash;assert.match(x.$('conOrderReceipt').textContent,new RegExp(hash));await x.click('conCommit');assert.equal(x.order().status,'committed');
 assert.equal(x.state().commitments.length,1);assert.equal(x.state().budgets[0].committedCents,125000);assert.equal(x.state().budgets[0].remainingCents,875000);
 assert.equal(x.$('conCommit').disabled,true);assert.equal(x.$('conReviseOrder').disabled,true);assert.match(x.$('conCommitments').textContent,/1 entries/);
 await x.click('conExport');assert.equal(x.exports.length,1);assert.deepEqual(x.calls.slice(-2).map(call=>call.kind),['verify-audit','receipt']);
});
test('missing evidence and an expired current insurance version retain explicit holds',async t=>{
 const x=await setup(t);await x.click('conReadiness');assert.match(x.$('conReadinessReceipt').textContent,/held|missing/i);
 await x.saveVerify('expired-insurance');await x.saveVerify('license');await x.click('conCreateOrder');assert.equal(x.order().readiness.ready,false);assert.equal(x.$('conApproveOrder').disabled,true);assert.equal(x.$('conCommit').disabled,true);assert.match(x.$('conReadinessReceipt').textContent,/expired/i);
});
test('new document version never silently falls back to an older verified version',async t=>{
 const x=await setup(t);await x.readyDocs();const saved=await x.readyOrder();const oldHash=saved.reviewHash;
 x.select('conDocumentExample','insurance');await x.click('conSubmitDocument');assert.equal(x.document().version,2);assert.equal(x.order(),null);assert.equal(x.$('conCommit').disabled,true);
 await x.recoverOrder(saved.orderId);assert.notEqual(x.order().reviewHash,oldHash);assert.equal(x.order().readiness.ready,false);assert.equal(x.order().status,'review-required');
 await x.verify();await x.recoverOrder(saved.orderId);assert.equal(x.order().readiness.ready,true);assert.equal(x.order().status,'review-required');assert.equal(x.$('conCommit').disabled,true);
});
test('revocation retains historical local commitments while current readiness becomes held',async t=>{
 const x=await setup(t);const docs=await x.readyDocs();const saved=await x.readyOrder();await x.click('conCommit');
 const button=[...x.$('conDocumentHistory').querySelectorAll('button')].find(button=>button.textContent.includes(docs[0].documentId));button.click();await x.settle();
 x.note('conDocumentNote','Reviewer revoked supplied fixture verification.');x.$('conDocumentAck').checked=true;x.event('conDocumentAck','change');await x.click('conRevokeDocument');
 assert.equal(x.state().commitments.length,1);await x.recoverOrder(saved.orderId);assert.equal(x.order().status,'committed');assert.equal(x.order().readiness.ready,false);assert.match(x.$('conOrderReceipt').textContent,/Later document holds do not erase/);
});
test('amount revision clears both prior approvals and prevents draft edits acting as saved authority',async t=>{
 const x=await setup(t);await x.readyDocs();await x.readyOrder();const old=x.order(),draft=JSON.parse(x.$('conOrderInput').value);draft.amountCents=130001;x.edit('conOrderInput',draft);
 assert.equal(x.$('conCommit').disabled,true);assert.equal(x.$('conExport').disabled,true);assert.match(x.$('conOrderReceipt').textContent,/Draft edits are not saved/);
 await x.click('conReviseOrder');assert.equal(x.order().version,2);assert.equal(x.order().amountCents,130001);assert.deepEqual(x.order().reviews,{});assert.notEqual(x.order().reviewHash,old.reviewHash);assert.equal(x.$('conCommit').disabled,true);
 assert.match(x.$('conOrderReceipt').textContent,/\$1300\.01 USD/);
});
test('rejected approval cannot authorize a local cost commitment',async t=>{
 const x=await setup(t);await x.readyDocs();await x.click('conCreateOrder');x.note('conOrderNote','Manager rejects supplied change scope.');x.$('conOrderAck').checked=true;x.event('conOrderAck','change');await x.click('conRejectOrder');
 assert.equal(x.order().reviews.project_manager.decision,'reject');await x.approve('finance');assert.equal(x.$('conCommit').disabled,true);assert.equal(x.state().commitments.length,0);
});
test('budget overrun is rejected without ledger effects after exact review',async t=>{
 const x=await setup(t);await x.readyDocs();x.select('conOrderExample','over-budget');await x.readyOrder();await x.click('conCommit');
 assert.equal(x.order(),null);assert.match(x.$('conNotice').textContent,/budget/i);assert.equal(x.state().commitments.length,0);assert.equal(x.state().budgets[0].committedCents,0);
});
test('role changes reset exact acknowledgement and foreign compliance selector is rejected',async t=>{
 const x=await setup(t);await x.click('conSubmitDocument');x.select('conCompliance','beta-compliance');x.note('conDocumentNote','Cannot act as a foreign fixture.');x.$('conDocumentAck').checked=true;x.event('conDocumentAck','change');await x.click('conVerifyDocument');
 assert.equal(x.document(),null);assert.equal(x.state().documents[0].status,'unverified');
 await x.readyDocs();await x.click('conCreateOrder');x.note('conOrderNote','Review note.');x.$('conOrderAck').checked=true;x.event('conOrderAck','change');x.select('conReviewRole','finance');assert.equal(x.$('conOrderAck').checked,false);assert.equal(x.$('conApproveOrder').disabled,true);
});
test('lost document response retries one immutable command instead of creating a second version',async t=>{
 let first=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='submit-document'&&first){first=false;throw Error('Synthetic lost browser response');}return value;});
 await x.click('conSubmitDocument');assert.equal(x.document(),null);assert.equal(x.state().documents.length,1);await x.click('conSubmitDocument');assert.equal(x.state().documents.length,1);assert.equal(x.document().version,1);
 const calls=x.calls.filter(call=>call.kind==='submit-document');assert.equal(calls[0].body.commandId,calls[1].body.commandId);
});
test('lost commitment browser response recovers exactly one durable local cost entry',async t=>{
 let first=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='record-commitment'&&first){first=false;throw Error('Synthetic lost browser response');}return value;});
 await x.readyDocs();const saved=await x.readyOrder();await x.click('conCommit');assert.equal(x.order(),null);assert.equal(x.state().commitments.length,1);await x.recoverOrder(saved.orderId);assert.equal(x.order().status,'committed');assert.equal(x.$('conCommit').disabled,true);assert.equal(x.state().commitments.length,1);
});
test('editing document while its response is delayed prevents installing authority for old input',async t=>{
 let release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='submit-document'){started=true;await new Promise(resolve=>release=resolve);}return value;});
 x.$('conSubmitDocument').click();await until(()=>started);const changed=JSON.parse(x.$('conDocumentInput').value);changed.content='Different manual source';x.edit('conDocumentInput',changed);release();await x.settle();
 assert.equal(x.document(),null);assert.equal(x.$('conVerifyDocument').disabled,true);assert.equal(x.state().documents.length,1);
});
test('editing order while its response is delayed cannot restore old review authority',async t=>{
 let release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='create-order'){started=true;await new Promise(resolve=>release=resolve);}return value;});
 await x.readyDocs();x.$('conCreateOrder').click();await until(()=>started);const changed=JSON.parse(x.$('conOrderInput').value);changed.amountCents=50000;x.edit('conOrderInput',changed);release();await x.settle();assert.equal(x.order(),null);assert.equal(x.$('conCommit').disabled,true);assert.equal(x.state().orders.length,1);
});
test('a document revoked by another actor during held export verification blocks the old snapshot',async t=>{
 let hold=false,release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='verify-audit'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});
 const docs=await x.readyDocs();await x.readyOrder();hold=true;x.$('conExport').click();await until(()=>started);
 x.store.reviewDocument({commandId:'outside-revoke',tenant:'acme',documentId:docs[0].documentId,reviewer:'acme-compliance',expectedHash:docs[0].contentHash,expectedRevision:docs[0].revision,decision:'revoke',note:'Revoked while export waits.'});release();await x.settle();assert.equal(x.exports.length,0);assert.equal(x.order(),null);assert.match(x.$('conNotice').textContent,/Saved order evidence changed/);
});
test('editing source input during held export cannot download the old order',async t=>{
 let hold=false,release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='verify-audit'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});
 await x.readyDocs();await x.readyOrder();hold=true;x.$('conExport').click();await until(()=>started);x.edit('conOrderInput','{"different":"intent"}');release();await x.settle();assert.equal(x.exports.length,0);assert.equal(x.$('conCommit').disabled,true);
});
test('supplied source markup stays inert in receipt and state views',async t=>{
 const x=await setup(t);const input=JSON.parse(x.$('conDocumentInput').value);input.content='<img src=x onerror="alert(1)"><script>notExecuted()</script>';x.edit('conDocumentInput',input);await x.click('conSubmitDocument');assert.match(x.$('conDocumentReceipt').textContent,/<img src=x/);assert.equal(x.d.querySelector('img'),null);assert.equal(x.d.querySelectorAll('script').length,1);
});
test('separate tenant context has distinct documents, budget and commitment history',async t=>{
 const x=await setup(t);x.select('conContext','beta:site-beta:sub-beta');await x.readyDocs('beta');await x.readyOrder();await x.click('conCommit');
 assert.equal(x.state('beta').commitments.length,1);assert.equal(x.state('acme').commitments.length,0);assert.equal(x.order().tenant,'beta');assert.match(x.$('conBudgets').textContent,/site-beta/);
});
test('malformed source input cannot create a document or retained approval',async t=>{
 const x=await setup(t);x.edit('conDocumentInput','not-json');await x.click('conSubmitDocument');assert.equal(x.state().documents.length,0);assert.equal(x.$('conVerifyDocument').disabled,true);
});

test('revoking and reverifying one document cannot revive an old change-order approval',async t=>{
 const x=await setup(t);const docs=await x.readyDocs();const saved=await x.readyOrder(),oldHash=saved.reviewHash;
 const button=[...x.$('conDocumentHistory').querySelectorAll('button')].find(button=>button.textContent.includes(docs[0].documentId));button.click();await x.settle();
 x.note('conDocumentNote','Withdraw previous fixture verification.');x.$('conDocumentAck').checked=true;x.event('conDocumentAck','change');await x.click('conRevokeDocument');
 await x.verify();await x.recoverOrder(saved.orderId);assert.notEqual(x.order().reviewHash,oldHash);assert.equal(x.order().readiness.ready,true);assert.equal(x.order().status,'review-required');assert.equal(x.$('conCommit').disabled,true);
});


test('a second revoke after reverification is a new immutable command despite identical note and fixed clock',async t=>{
 const x=await setup(t);await x.click('conSubmitDocument');
 const act=async id=>{x.note('conDocumentNote','Same reviewer note at the same fixed scenario clock.');x.$('conDocumentAck').checked=true;x.event('conDocumentAck','change');await x.click(id);};
 await act('conVerifyDocument');await act('conRevokeDocument');const first=x.document();assert.equal(first.status,'revoked');
 await act('conVerifyDocument');assert.equal(x.document().status,'verified');await act('conRevokeDocument');
 assert.equal(x.document().status,'revoked');assert.equal(x.document().revision,first.revision+2);
 const revokes=x.calls.filter(call=>call.kind==='review-document'&&call.body.decision==='revoke');assert.equal(revokes.length,2);assert.notEqual(revokes[0].body.commandId,revokes[1].body.commandId);
});


test('a late new verification intent cannot override a concurrently revoked document revision',async t=>{
 let hold=false,release,started=false;
 const x=await setup(t,api=>async(kind,body)=>{if(hold&&kind==='review-document'&&body.decision==='verify'){started=true;await new Promise(resolve=>release=resolve);}return api(kind,body);});
 await x.click('conSubmitDocument');await x.verify();const saved=x.document();
 hold=true;x.note('conDocumentNote','A late new verification intent based on the displayed revision.');x.$('conDocumentAck').checked=true;x.event('conDocumentAck','change');x.$('conVerifyDocument').click();await until(()=>started);
 x.store.reviewDocument({commandId:'outside-revoke-before-verify',tenant:saved.tenant,documentId:saved.documentId,reviewer:'acme-compliance',expectedHash:saved.contentHash,expectedRevision:saved.revision,decision:'revoke',note:'Concurrent reviewer revoked this document.'});
 release();await x.settle();assert.equal(x.document(),null);assert.match(x.$('conNotice').textContent,/revision|stale/i);
 const actual=x.store.documentReceipt({tenant:saved.tenant,documentId:saved.documentId});assert.equal(actual.status,'revoked');assert.equal(actual.revision,saved.revision+1);
 await x.click('conRefresh');const button=[...x.$('conDocumentHistory').querySelectorAll('button')].find(button=>button.textContent.includes(saved.documentId));button.click();await x.settle();assert.equal(x.document().status,'revoked');assert.equal(x.document().revision,actual.revision);
});

for(const mutation of ['submit-document','review-document'])test(`document ${mutation} intent clears ready order authority before a held response and later editor change`,async t=>{
 let hold=false,release,started=false;
 const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(hold&&kind===mutation){started=true;await new Promise(resolve=>release=resolve);}return value;});
 await x.readyDocs();if(mutation==='submit-document')x.select('conDocumentExample','insurance');const saved=await x.readyOrder();assert.equal(x.$('conCommit').disabled,false);
 hold=true;
 if(mutation==='submit-document')x.$('conSubmitDocument').click();else{x.note('conDocumentNote','Revoke while the browser response is held.');x.$('conDocumentAck').checked=true;x.event('conDocumentAck','change');x.$('conRevokeDocument').click();}
 await until(()=>started);assert.equal(x.order(),null);assert.equal(x.$('conCommit').disabled,true);
 const changed=JSON.parse(x.$('conDocumentInput').value);changed.content='Another unsaved document draft';x.edit('conDocumentInput',changed);release();await x.settle();
 assert.equal(x.order(),null);assert.equal(x.$('conCommit').disabled,true);assert.equal(x.$('conExport').disabled,true);assert.equal(x.store.receipt({tenant:saved.tenant,orderId:saved.orderId}).readiness.ready,false);
});
test('a malformed document mutation intent cannot retain an otherwise ready order',async t=>{
 const x=await setup(t);await x.readyDocs();await x.readyOrder();x.$('conDocumentInput').value='not-json';await x.click('conSubmitDocument');assert.equal(x.order(),null);assert.equal(x.$('conCommit').disabled,true);assert.equal(x.state().commitments.length,0);
});
test('recovering a superseded document labels the historical version read-only',async t=>{
 const x=await setup(t);const docs=await x.readyDocs();x.select('conDocumentExample','insurance');await x.click('conSubmitDocument');assert.equal(x.document().version,2);
 const old=[...x.$('conDocumentHistory').querySelectorAll('button')].find(button=>button.textContent.includes(docs[0].documentId));old.click();await x.settle();assert.equal(x.document().version,1);assert.match(x.$('conDocumentReceipt').textContent,/Historical \/ Superseded document version 1/);
 x.note('conDocumentNote','A historical version is not the current verification target.');x.$('conDocumentAck').checked=true;x.event('conDocumentAck','change');assert.equal(x.$('conVerifyDocument').disabled,true);assert.equal(x.$('conRevokeDocument').disabled,true);
});
test('refresh rereads the selected document revision after an external revocation',async t=>{
 const x=await setup(t);await x.click('conSubmitDocument');await x.verify();const saved=x.document();
 x.store.reviewDocument({commandId:'external-revocation-before-refresh',tenant:saved.tenant,documentId:saved.documentId,reviewer:'acme-compliance',expectedHash:saved.contentHash,expectedRevision:saved.revision,decision:'revoke',note:'Another fixture reviewer revoked this document.'});
 await x.click('conRefresh');assert.equal(x.document().status,'revoked');assert.equal(x.document().revision,saved.revision+1);assert.match(x.$('conDocumentReceipt').textContent,/revoked/);assert.equal(x.$('conDocumentAck').checked,false);assert.equal(x.$('conRevokeDocument').disabled,true);
});


test('fresher history and readiness invalidate a held older order receipt without restoring authority',async t=>{
 let hold=false,release,started=false;
 const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='receipt'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});
 await x.readyDocs();const saved=await x.readyOrder();hold=true;x.$('conRefresh').click();await until(()=>started);
 const doc=x.state().documents.find(row=>row.kind==='insurance');x.store.reviewDocument({commandId:'external-revoke-during-order-refresh',tenant:doc.tenant,documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'revoke',note:'A newer compliance hold supersedes the selected order snapshot.'});
 release();await x.settle();assert.equal(x.order(),null);assert.equal(x.$('conCommit').disabled,true);assert.equal(x.$('conExport').disabled,true);
 assert.match(x.$('conOrderReceipt').textContent,/Fresh saved evidence changed/);assert.equal(x.store.receipt({tenant:saved.tenant,orderId:saved.orderId}).readiness.ready,false);assert.equal(x.state().commitments.length,0);
});


test('refresh retains unsaved order text and blocks authority until an explicit revision or saved recovery',async t=>{
 const x=await setup(t);await x.readyDocs();const saved=await x.readyOrder();const draft=JSON.parse(x.$('conOrderInput').value);draft.amountCents=999999;draft.scope='Unsaved revised scope';x.edit('conOrderInput',draft);
 await x.click('conRefresh');assert.equal(JSON.parse(x.$('conOrderInput').value).amountCents,999999);assert.equal(x.order().amountCents,saved.amountCents);assert.equal(x.$('conCommit').disabled,true);assert.equal(x.$('conExport').disabled,true);assert.equal(x.$('conOrderAck').checked,false);assert.match(x.$('conOrderReceipt').textContent,/Unsaved editor changes are retained/);
 await x.click('conReviseOrder');assert.equal(x.order().amountCents,999999);assert.equal(x.order().status,'review-required');assert.equal(x.$('conCommit').disabled,true);
});
for(const change of ['revoke','renew-verified'])test(`standalone readiness refresh invalidates an old order after ${change}`,async t=>{
 const x=await setup(t);await x.readyDocs();await x.readyOrder();let doc=x.state().documents.find(row=>row.kind==='insurance');
 if(change==='revoke')x.store.reviewDocument({commandId:'external-readiness-revoke',tenant:doc.tenant,documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'revoke',note:'New compliance hold.'});
 else{const sample=structuredClone(x.store.catalog().documentExamples.find(row=>row.id==='insurance').input);doc=x.store.submitDocument({...sample,commandId:'renew-readiness-source',sourceId:'renew-readiness-source'});x.store.reviewDocument({commandId:'verify-renewed-readiness-source',tenant:doc.tenant,documentId:doc.documentId,reviewer:'acme-compliance',expectedHash:doc.contentHash,expectedRevision:doc.revision,decision:'verify',note:'Newly reviewed supplied renewal.'});}
 await x.click('conReadiness');assert.equal(x.order(),null);assert.equal(x.$('conCommit').disabled,true);assert.equal(x.$('conExport').disabled,true);assert.equal(x.state().commitments.length,0);
});
