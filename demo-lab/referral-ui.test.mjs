import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {openReferral} from './referral-core.mjs';
import {mountReferral} from './referral-ui.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Referral UI did not settle.');}
async function setup(t,decorate=api=>api,options={}){
 const dom=new JSDOM(readFileSync(new URL('./referral.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680/referral?project=MED-01'}),d=dom.window.document,store=openReferral(':memory:',options),calls=[],exports=[];
 const methods={'set-packet':'setPacket','set-consent':'setConsent','verify-audit':'verifyAudit'};
 const api=async(kind,body)=>{calls.push({kind,body:structuredClone(body)});return store[methods[kind]??kind](body);};
 const mounted=await mountReferral(d,decorate(api),value=>exports.push(value));t.after(()=>{dom.window.close();store.close();});
 const $=id=>d.getElementById(id),event=(id,type='change')=>$(id).dispatchEvent(new dom.window.Event(type));
 const settle=async()=>{await until(()=>!$('refRefresh').disabled);await tick();};
 const click=async id=>{assert.equal($(id).disabled,false,`${id} must be available`);$(id).click();await settle();};
 const select=(id,value)=>{$(id).value=value;event(id);};
 const current=()=>mounted.getCurrent(),snapshot=()=>mounted.getSnapshot(),state=(tenant='acme')=>store.state({tenant});
 const refs=()=>current()?.referralFixtureId??$('refFixture').value;
 const docs=(ids)=>{for(const box of $('refDocuments').querySelectorAll('input')){box.checked=ids.includes(box.value);box.dispatchEvent(new dom.window.Event('change'));}};
 const fullDocs=()=>[`${refs()}-form-v2`,`${refs()}-order-v1`];
 const packet=async(ids=fullDocs(),payer='DEMO_PAYER_A')=>{select('refPayer',payer);docs(ids);await click('refSavePacket');};
 const grant=async()=>{select('refConsentProof',`${refs()}-consent-grant`);await click('refGrant');};
 const revoke=async()=>{select('refConsentProof',`${refs()}-consent-revoke`);await click('refRevoke');};
 const approve=async(decision='approve')=>{select('refReason',decision==='approve'?'packet-checked':'needs-follow-up');$('refAck').checked=true;event('refAck');await click(decision==='approve'?'refApprove':'refReject');};
 const ready=async()=>{await click('refIntake');await packet();await grant();await approve();return current();};
 const recover=async()=>{await click('refRefresh');const button=[...$('refHistory').querySelectorAll('button')].find(row=>row.textContent.includes($('refFixture').value));assert.ok(button);button.click();await settle();};
 return{dom,d,$,event,click,select,docs,packet,grant,revoke,approve,ready,recover,settle,store,calls,exports,current,snapshot,state,refs};
}
test('catalog exposes only controlled synthetic selections and creates no case',async t=>{
 const x=await setup(t);assert.equal(x.calls.length,1);assert.equal(x.state().cases.length,0);assert.equal(x.d.querySelector('textarea,input[type="text"],input[type="file"]'),null);
 assert.match(x.d.body.textContent,/not patient names/);assert.match(x.d.body.textContent,/not authenticated identities/);assert.match(x.$('refClock').textContent,/Fixed synthetic/);
});
test('a complete consented independently reviewed packet produces one local queue row and a real assignment',async t=>{
 const x=await setup(t);await x.ready();assert.equal(x.current().status,'ready');assert.match(x.$('refReceipt').textContent,new RegExp(x.current().reviewHash));
 await x.click('refEnqueue');assert.equal(x.state().queue.length,1);assert.equal(x.current().queue.effectiveStatus,'queued');assert.equal(x.$('refEnqueue').disabled,true);
 x.select('refAssignee','acme-staff-backup');await x.click('refAssign');assert.equal(x.state().queue[0].assignee,'acme-staff-backup');assert.equal(x.current().status,'assigned');
 assert.match(x.$('refQueueReceipt').textContent,/assigned/);assert.equal(x.snapshot().audit.valid,true);assert.equal(x.state().queue.length,1);
});
test('missing documents and unknown fictional payer remain explicit administrative holds',async t=>{
 const x=await setup(t);await x.click('refIntake');assert.match(x.$('refReadiness').textContent,/consent/);assert.match(x.$('refReadiness').textContent,/Missing synthetic order/);
 await x.grant();assert.equal(x.$('refApprove').disabled,true);await x.packet(undefined,'UNKNOWN_DEMO');assert.match(x.$('refReadiness').textContent,/Unknown fictional payer/);assert.equal(x.$('refEnqueue').disabled,true);assert.equal(x.state().queue.length,0);
});
test('registered expired and superseded document selections cannot clear the local gate',async t=>{
 const x=await setup(t);x.select('refFixture','ref-acme-02');await x.click('refIntake');await x.packet();await x.grant();assert.match(x.$('refReadiness').textContent,/expired/);assert.equal(x.$('refApprove').disabled,true);
 x.select('refFixture','ref-acme-01');await x.click('refIntake');await x.packet(['ref-acme-01-form-v1','ref-acme-01-order-v1']);await x.grant();assert.match(x.$('refReadiness').textContent,/superseded/);assert.equal(x.$('refEnqueue').disabled,true);
});
test('consent revocation holds the same queue row and regrant requires fresh review for another generation',async t=>{
 const x=await setup(t);await x.ready();await x.click('refEnqueue');const first=x.current().queue.generation;await x.revoke();assert.equal(x.current().queue.status,'held');assert.equal(x.state().queue.length,1);assert.equal(x.$('refAssign').disabled,true);
 await x.grant();assert.equal(x.current().review,null);assert.equal(x.$('refEnqueue').disabled,true);await x.approve();await x.click('refEnqueue');assert.equal(x.current().queue.generation,first+1);assert.equal(x.state().queue.length,1);
});
test('packet changes invalidate review and persist a queue hold before re-review',async t=>{
 const x=await setup(t);await x.ready();await x.click('refEnqueue');await x.packet(['ref-acme-01-form-v2']);assert.equal(x.current().review,null);assert.equal(x.current().queue.status,'held');assert.equal(x.$('refEnqueue').disabled,true);assert.match(x.$('refReadiness').textContent,/Missing synthetic order/);
});
test('review reason and exact acknowledgement must match the chosen administrative decision',async t=>{
 const x=await setup(t);await x.click('refIntake');await x.packet();await x.grant();assert.equal(x.$('refApprove').disabled,true);x.$('refAck').checked=true;x.event('refAck');assert.equal(x.$('refApprove').disabled,false);assert.equal(x.$('refReject').disabled,true);
 x.select('refReason','needs-follow-up');assert.equal(x.$('refAck').checked,false);x.$('refAck').checked=true;x.event('refAck');await x.click('refReject');assert.equal(x.current().review.reasonCode,'needs-follow-up');assert.equal(x.$('refEnqueue').disabled,true);
});
test('unsaved packet and consent selections survive refresh without enabling queue or export',async t=>{
 const x=await setup(t);await x.ready();x.select('refPayer','DEMO_PAYER_B');x.select('refConsentProof','ref-acme-01-consent-revoke');await x.click('refRefresh');assert.equal(x.$('refPayer').value,'DEMO_PAYER_B');assert.equal(x.$('refConsentProof').value,'ref-acme-01-consent-revoke');assert.equal(x.$('refEnqueue').disabled,true);assert.equal(x.$('refExport').disabled,true);assert.match(x.$('refDraft').textContent,/Unsaved packet selections/);
 await x.click('refSavePacket');assert.equal(x.current().payerId,'DEMO_PAYER_B');assert.equal(x.$('refExport').disabled,true);await x.click('refRevoke');assert.equal(x.current().consent.granted,false);
});
test('lost intake response recovers the pinned source event without a second case',async t=>{
 let first=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='intake'&&first){first=false;throw Error('Synthetic browser response lost');}return value;});
 await x.click('refIntake');assert.equal(x.current(),null);assert.equal(x.state().cases.length,1);await x.click('refIntake');assert.equal(x.current().status,'held');assert.equal(x.state().cases.length,1);assert.equal(x.calls.filter(row=>row.kind==='intake').length,1);
});
test('lost enqueue response is recovered from actual queue state with no duplicate row',async t=>{
 let first=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='enqueue'&&first){first=false;throw Error('Synthetic browser response lost');}return value;});
 await x.ready();await x.click('refEnqueue');assert.equal(x.current(),null);assert.equal(x.state().queue.length,1);await x.recover();assert.equal(x.current().queue.effectiveStatus,'queued');assert.equal(x.$('refEnqueue').disabled,true);assert.equal(x.state().queue.length,1);
});
test('a packet edit during a delayed intake response cannot install old authority',async t=>{
 let release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='intake'){started=true;await new Promise(resolve=>release=resolve);}return value;});
 x.$('refIntake').click();await until(()=>started);x.select('refPayer','DEMO_PAYER_B');release();await x.settle();assert.equal(x.current(),null);assert.equal(x.$('refEnqueue').disabled,true);assert.equal(x.$('refPayer').value,'DEMO_PAYER_B');
});
test('an external consent revocation between mutation receipt and atomic state clears old authority',async t=>{
 let hold=false,release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='review'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});
 await x.click('refIntake');await x.packet();await x.grant();hold=true;x.$('refAck').checked=true;x.event('refAck');x.$('refApprove').click();await until(()=>started);
 const row=x.state().cases[0];x.store.setConsent({commandId:'external-revoke',tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision,actor:'acme-intake',decision:'revoke',proofId:'ref-acme-01-consent-revoke'});release();await x.settle();assert.equal(x.current(),null);assert.equal(x.$('refEnqueue').disabled,true);assert.match(x.$('refReadiness').textContent,/not currently granted/);
});
test('changed saved evidence cannot silently replace the base of retained drafts on repeated refresh',async t=>{
 const x=await setup(t);await x.ready();x.select('refPayer','DEMO_PAYER_B');const row=x.state().cases[0];x.store.setConsent({commandId:'external-draft-revoke',tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision,actor:'acme-intake',decision:'revoke',proofId:'ref-acme-01-consent-revoke'});
 await x.click('refRefresh');assert.equal(x.current(),null);await x.click('refRefresh');assert.equal(x.current(),null);assert.equal(x.$('refSavePacket').disabled,true);assert.equal(x.$('refPayer').value,'DEMO_PAYER_B');await x.recover();assert.equal(x.$('refPayer').value,'DEMO_PAYER_A');
});
test('export reads verified atomic state last and rejects a concurrent consent change',async t=>{
 let hold=false,release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='verify-audit'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});
 await x.ready();hold=true;x.$('refExport').click();await until(()=>started);const row=x.state().cases[0];x.store.setConsent({commandId:'export-revoke',tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision,actor:'acme-intake',decision:'revoke',proofId:'ref-acme-01-consent-revoke'});release();await x.settle();assert.equal(x.exports.length,0);assert.equal(x.current(),null);assert.equal(x.$('refEnqueue').disabled,true);
});
test('a new fixture selection during held export suppresses the old download',async t=>{
 let hold=false,release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='state'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});await x.ready();hold=true;x.$('refExport').click();await until(()=>started);x.select('refFixture','ref-acme-02');release();await x.settle();assert.equal(x.exports.length,0);assert.equal(x.current(),null);assert.equal(x.$('refFixture').value,'ref-acme-02');
});
test('context switch during a held response cannot restore another tenant record',async t=>{
 let hold=false,release,started=false;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='intake'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});hold=true;x.$('refIntake').click();await until(()=>started);x.select('refTenant','beta');release();await x.settle();assert.equal(x.current(),null);assert.equal(x.$('refTenant').value,'beta');assert.equal(x.state('beta').cases.length,0);assert.equal(x.$('refEnqueue').disabled,true);
});
test('beta fixture packets and queue rows remain distinct and closed labels stay inert',async t=>{
 const x=await setup(t);x.select('refTenant','beta');await x.ready();await x.click('refEnqueue');assert.equal(x.state('beta').queue.length,1);assert.equal(x.state('acme').queue.length,0);assert.equal(x.d.querySelector('img'),null);assert.equal(x.d.querySelectorAll('script').length,1);assert.match(x.$('refFixtureSource').textContent,/SYNTHETIC-beta/);
});
test('snapshot export is explicitly point-in-time evidence and contains no external submission claim',async t=>{
 const x=await setup(t);await x.ready();await x.click('refExport');assert.equal(x.exports.length,1);assert.equal(x.exports[0].audit.valid,true);assert.match(x.exports[0].scope,/point-in-time synthetic local snapshot/);assert.equal(x.exports[0].case.caseId,x.current().caseId);
});


test('current packet and consent source editors are visible and cannot select themselves for independent review',async t=>{
 const x=await setup(t);await x.ready();let row=x.state().cases[0];x.store.setPacket({commandId:'dual-editor',tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision,actor:'acme-dual-role',payerId:row.payerId,documentIds:row.documentIds});await x.recover();assert.match(x.$('refReceipt').textContent,/packet acme-dual-role/);
 x.select('refReviewer','acme-dual-role');x.$('refAck').checked=true;x.event('refAck');assert.equal(x.$('refApprove').disabled,true);assert.equal(x.$('refReject').disabled,true);assert.match(x.d.body.textContent,/current packet\/consent source editors/);
});
