import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {DatabaseSync} from 'node:sqlite';
import {legalDesk} from './legal-core.mjs';
import {mountLegal} from './legal-ui.mjs';
const methods={'set-parties':'setParties','review-conflict':'reviewConflict','create-matter':'createMatter','propose-deadline':'proposeDeadline','review-deadline':'reviewDeadline','record-deadline':'recordDeadline','verify-audit':'verifyAudit'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(t,decorate=api=>api,options={}){
 const dom=new JSDOM(readFileSync(new URL('./legal.html',import.meta.url),'utf8'),{url:'http://127.0.0.1/industry/legal?project=LEGAL-01'}),d=dom.window.document,db=new DatabaseSync(':memory:'),store={...legalDesk(db,options),close:()=>db.close()},calls=[],exported=[];
 const base=async(kind,body)=>{calls.push({kind,body:structuredClone(body)});return store[methods[kind]??kind](body);};
 const mounted=await mountLegal(d,decorate(base),value=>exported.push(value));
 t.after(()=>{store.close();dom.window.close();});const $=id=>d.getElementById(id),event=id=>$(id).dispatchEvent(new dom.window.Event('change'));
 const settle=async()=>{for(let i=0;i<300;i++){if(!mounted.isBusy()){await tick();return;}await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Legal UI did not settle');};
 const click=async id=>{assert.equal($(id).disabled,false,`${id} must be available`);$(id).click();await settle();};
 const change=(id,value)=>{$(id).value=value;event(id);};
 const ack=id=>{$(id).checked=true;event(id);};
 const approveConflict=async()=>{ack('legalConflictAck');await click('legalApproveConflict');};
 const matter=async()=>{await click('legalIntake');await approveConflict();await click('legalCreateMatter');};
 const dateReady=async()=>{await matter();await click('legalProposeDeadline');ack('legalDeadlineAck');await click('legalApproveDeadline');};
 const parties=ids=>{for(const option of $('legalParties').options)option.selected=ids.includes(option.value);event('legalParties');};
 const recover=async(index=0)=>{await click('legalRefresh');const buttons=$('legalHistory').querySelectorAll('button');assert.ok(buttons.length);buttons[index].click();await settle();};
 return{db,dom,d,$,event,click,change,ack,settle,parties,approveConflict,matter,dateReady,recover,store,calls,exported,current:()=>mounted.getCurrent()};
}
test('catalog is read-only, partial scope is visible, and independent reviews precede actual local effects',async t=>{
 const x=await setup(t);assert.deepEqual(x.calls.map(r=>r.kind),['catalog']);assert.equal(x.store.state({tenant:'acme'}).cases.length,0);assert.match(x.d.body.textContent,/not authenticated identities/);assert.match(x.$('legalClock').textContent,/fixed synthetic snapshot/);
 await x.click('legalIntake');assert.equal(x.$('legalCreateMatter').disabled,true);assert.equal(x.$('legalApproveConflict').disabled,true);x.ack('legalConflictAck');await x.click('legalApproveConflict');await x.click('legalCreateMatter');assert.equal(x.current().matter.effectiveStatus,'recorded');await x.click('legalProposeDeadline');assert.equal(x.$('legalRecordDeadline').disabled,true);x.ack('legalDeadlineAck');await x.click('legalApproveDeadline');await x.click('legalRecordDeadline');assert.equal(x.store.state({tenant:'acme'}).deadlines.length,1);assert.match(x.$('legalEffects').textContent,/Local matter rows: 1.*Local calendar rows: 1/);await x.click('legalExport');assert.equal(x.exported.length,1);assert.deepEqual(x.calls.slice(-2).map(r=>r.kind),['verify-audit','receipt']);assert.equal(x.$('legalRecordDeadline').disabled,true);
});
test('exact pinned relationship remains held while professional follow-up can be recorded',async t=>{
 const x=await setup(t);x.change('legalSource','acme-matched-intake');await x.click('legalIntake');assert.equal(x.current().conflict.matches[0].kind,'exact');x.ack('legalConflictAck');assert.equal(x.$('legalApproveConflict').disabled,true);await x.click('legalReturnConflict');assert.equal(x.current().conflictReview.decision,'return');assert.equal(x.$('legalCreateMatter').disabled,true);assert.equal(x.store.state({tenant:'acme'}).matters.length,0);
});
test('additional ambiguous party invalidates no-match review and disables automatic matter creation',async t=>{
 const x=await setup(t);await x.click('legalIntake');await x.approveConflict();x.parties(['acme-willow','acme-copper-ambiguous']);assert.equal(x.$('legalCreateMatter').disabled,true);assert.equal(x.$('legalExport').disabled,true);await x.click('legalSaveParties');assert.equal(x.current().conflict.hold,true);assert.equal(x.current().conflict.matches[0].kind,'ambiguous');assert.equal(x.current().conflictReview,null);x.ack('legalConflictAck');assert.equal(x.$('legalApproveConflict').disabled,true);
});
test('omitting a pinned source party fails and recovery preserves its saved conflict hold',async t=>{
 const x=await setup(t);x.change('legalSource','acme-matched-intake');await x.click('legalIntake');x.parties(['acme-willow']);await x.click('legalSaveParties');assert.equal(x.current(),null);assert.match(x.$('legalNotice').textContent,/Pinned source parties/);await x.recover();assert.equal(x.current().conflict.hold,true);assert.deepEqual(x.current().partyIds,['acme-copper-exact']);
});
test('dual-role current party editor cannot approve its own source',async t=>{
 const x=await setup(t);await x.click('legalIntake');x.change('legalOperator','acme-dual-role');x.parties(['acme-willow']);await x.click('legalSaveParties');x.change('legalReviewer','acme-dual-role');x.ack('legalConflictAck');assert.equal(x.$('legalApproveConflict').disabled,true);assert.equal(x.$('legalReturnConflict').disabled,true);x.change('legalReviewer','acme-reviewer');assert.equal(x.$('legalConflictAck').checked,false);await x.approveConflict();assert.equal(x.current().conflictReview.reviewer,'acme-reviewer');
});
for(const fixture of ['expired','superseded'])test(`supplied ${fixture} date stays held but accepts follow-up without a calendar row`,async t=>{
 const x=await setup(t);await x.matter();x.change('legalDeadline',`acme-supplied-${fixture}`);await x.click('legalProposeDeadline');x.ack('legalDeadlineAck');assert.equal(x.$('legalApproveDeadline').disabled,true);await x.click('legalReturnDeadline');assert.equal(x.current().deadlineReview.decision,'return');assert.equal(x.$('legalRecordDeadline').disabled,true);assert.equal(x.store.state({tenant:'acme'}).deadlines.length,0);
});
test('a new saved date proposal holds the existing calendar and requires fresh independent review',async t=>{
 const x=await setup(t);await x.dateReady();await x.click('legalRecordDeadline');const old=x.current().deadlineHash;x.change('legalDeadline','acme-supplied-expired');assert.equal(x.$('legalRecordDeadline').disabled,true);await x.click('legalProposeDeadline');assert.notEqual(x.current().deadlineHash,old);assert.equal(x.current().calendar.effectiveStatus,'held');assert.equal(x.current().deadlineReview,null);assert.equal(x.$('legalRecordDeadline').disabled,true);
});
test('an unsaved date selector cannot authorize a different saved proposal',async t=>{
 const x=await setup(t);await x.dateReady();x.change('legalDeadline','acme-supplied-expired');x.ack('legalDeadlineAck');assert.equal(x.$('legalApproveDeadline').disabled,true);assert.equal(x.$('legalReturnDeadline').disabled,true);assert.equal(x.$('legalRecordDeadline').disabled,true);await x.click('legalRefresh');assert.equal(x.$('legalDeadline').value,'acme-supplied-future');assert.equal(x.$('legalRecordDeadline').disabled,false);
});
test('refresh explicitly discards unsaved parties and clears old acknowledgments',async t=>{
 const x=await setup(t);await x.click('legalIntake');await x.approveConflict();x.parties(['acme-willow','acme-copper-ambiguous']);await x.click('legalRefresh');assert.deepEqual(Array.from(x.$('legalParties').selectedOptions).map(o=>o.value),['acme-willow']);assert.equal(x.$('legalConflictAck').checked,false);assert.equal(x.$('legalCreateMatter').disabled,false);
});
test('switching tenant clears prior authority and displayed effects instead of relabeling old evidence',async t=>{
 const x=await setup(t);await x.matter();x.change('legalTenant','beta');assert.equal(x.current(),null);assert.equal(x.$('legalHistory').textContent,'');assert.equal(x.$('legalEffects').textContent,'');assert.equal(x.$('legalAudit').textContent,'');assert.equal(x.$('legalCreateMatter').disabled,true);await x.click('legalIntake');assert.equal(x.current().tenant,'beta');assert.match(x.$('legalReceipt').textContent,/beta-clear-intake/);
});
test('foreign operator errors leave no actionable receipt and recovery restores the real saved revision',async t=>{
 const x=await setup(t);await x.click('legalIntake');const option=x.d.createElement('option');option.value='beta-intake';x.$('legalOperator').append(option);x.change('legalOperator','beta-intake');x.parties(['acme-willow']);await x.click('legalSaveParties');assert.equal(x.current(),null);assert.equal(x.$('legalCreateMatter').disabled,true);await x.recover();assert.equal(x.current().revision,1);
});
test('lost intake acknowledgment can retry identical immutable command without duplicating a case',async t=>{
 let lost=true;const x=await setup(t,api=>async(kind,body)=>{const result=await api(kind,body);if(kind==='intake'&&lost){lost=false;throw Error('Injected lost acknowledgment');}return result;});await x.click('legalIntake');assert.equal(x.current(),null);assert.equal(x.store.state({tenant:'acme'}).cases.length,1);await x.click('legalIntake');assert.equal(x.store.state({tenant:'acme'}).cases.length,1);assert.equal(x.current().revision,1);assert.equal(new Set(x.calls.filter(c=>c.kind==='intake').map(c=>c.body.commandId)).size,1);
});
test('lost mutation acknowledgment is recoverable without retaining unsafe old authority',async t=>{
 let lost=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='create-matter'&&lost){lost=false;throw Error('Injected committed response loss');}return value;});await x.click('legalIntake');await x.approveConflict();await x.click('legalCreateMatter');assert.equal(x.current(),null);assert.equal(x.$('legalProposeDeadline').disabled,true);await x.recover();assert.equal(x.current().matter.effectiveStatus,'recorded');assert.equal(x.store.state({tenant:'acme'}).matters.length,1);
});
test('late old review response is replaced by a newer atomic state snapshot',async t=>{
 let store;const x=await setup(t,api=>async(kind,body)=>{const result=await api(kind,body);if(kind==='review-conflict'){store.setParties({commandId:'concurrent-parties',tenant:result.tenant,caseId:result.caseId,expectedRevision:result.revision,actor:'acme-intake',partyIds:['acme-willow','acme-copper-ambiguous']});}return result;});store=x.store;await x.click('legalIntake');await x.approveConflict();assert.equal(x.current().revision,3);assert.equal(x.current().conflict.hold,true);assert.equal(x.current().conflictReview,null);assert.equal(x.$('legalCreateMatter').disabled,true);
});
test('a late read from the previous tenant cannot restore its authority',async t=>{
 let release,hold=false;const x=await setup(t,api=>async(kind,body)=>{const result=await api(kind,body);if(hold&&kind==='state')await new Promise(resolve=>release=resolve);return result;});await x.click('legalIntake');hold=true;x.$('legalRefresh').click();for(let i=0;i<20&&!release;i++)await tick();assert.ok(release);x.change('legalTenant','beta');release();await x.settle();assert.equal(x.current(),null);assert.equal(x.$('legalCreateMatter').disabled,true);assert.equal(x.$('legalEffects').textContent,'');
});
test('concurrent revision change during export blocks download and requires recovery',async t=>{
 let store,change=false;const x=await setup(t,api=>async(kind,body)=>{const result=await api(kind,body);if(change&&kind==='verify-audit'){const row=store.state({tenant:'acme'}).cases[0];store.setParties({commandId:'export-change',tenant:row.tenant,caseId:row.caseId,expectedRevision:row.revision,actor:'acme-intake',partyIds:['acme-willow','acme-copper-ambiguous']});}return result;});store=x.store;await x.click('legalIntake');await x.approveConflict();change=true;await x.click('legalExport');assert.equal(x.exported.length,0);assert.equal(x.current(),null);assert.match(x.$('legalNotice').textContent,/Saved evidence changed/);
});
test('derived deadline expiry blocks export even without a case revision change',async t=>{
 let clock='2026-10-25T12:00:00.000Z';const x=await setup(t,api=>api,{clock:()=>clock});await x.dateReady();await x.click('legalRecordDeadline');const revision=x.current().revision;clock='2026-10-28T16:00:00.000Z';await x.click('legalExport');assert.equal(x.exported.length,0);await x.recover();assert.equal(x.current().revision,revision);assert.equal(x.current().calendar.effectiveStatus,'held');assert.equal(x.$('legalRecordDeadline').disabled,true);
});
test('failed atomic state refresh discards prior actionable receipt after a committed mutation',async t=>{
 let fail=false;const x=await setup(t,api=>async(kind,body)=>{if(fail&&kind==='state')throw Error('Injected read failure');return api(kind,body);});await x.click('legalIntake');fail=true;x.ack('legalConflictAck');await x.click('legalApproveConflict');assert.equal(x.current(),null);assert.equal(x.$('legalCreateMatter').disabled,true);assert.equal(x.store.state({tenant:'acme'}).cases[0].conflictReview.decision,'approve');
});
test('audit verification failure cannot publish an export receipt',async t=>{
 let fail=false;const x=await setup(t,api=>async(kind,body)=>kind==='verify-audit'&&fail?{valid:false}:api(kind,body));await x.click('legalIntake');fail=true;await x.click('legalExport');assert.equal(x.exported.length,0);assert.equal(x.current(),null);
});


test('standalone audit failure clears actionable authority and stale saved effects after actual database corruption',async t=>{
 const x=await setup(t);await x.click('legalIntake');await x.approveConflict();assert.equal(x.$('legalCreateMatter').disabled,false);assert.equal(x.$('legalExport').disabled,false);x.ack('legalConflictAck');x.db.exec("UPDATE legal_events SET hash='corrupted' WHERE seq=1");await x.click('legalVerify');assert.equal(x.current(),null);assert.equal(x.$('legalConflictAck').checked,false);assert.equal(x.$('legalDeadlineAck').checked,false);for(const id of ['legalCreateMatter','legalRecordDeadline','legalExport'])assert.equal(x.$(id).disabled,true);for(const id of ['legalHistory','legalEffects','legalAudit'])assert.equal(x.$(id).textContent,'');assert.match(x.$('legalVerification').textContent,/verification failed/);assert.match(x.$('legalNotice').textContent,/authority unavailable/);assert.equal(x.exported.length,0);
});
