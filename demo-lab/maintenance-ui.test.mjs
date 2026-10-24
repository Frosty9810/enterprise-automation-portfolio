import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { openMaintenance } from './maintenance-core.mjs';
import { mountMaintenance } from './maintenance-ui.mjs';

const tick = () => new Promise(resolve=>setImmediate(resolve));
async function until(fn) {
  for(let i=0;i<300;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,5));}
  throw Error('Maintenance UI did not settle.');
}
async function setup(t, decorate = api=>api) {
  const dom=new JSDOM(readFileSync(new URL('./maintenance.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680/maintenance'});
  const store=openMaintenance(':memory:'), d=dom.window.document, calls=[], exported=[];
  const methods={'grant-access':'grantAccess','revoke-access':'revokeAccess','verify-audit':'verifyAudit'};
  const api=async(kind,body)=>{calls.push({kind,body:structuredClone(body)});return store[methods[kind] ?? kind](body);};
  const mounted=await mountMaintenance(d,decorate(api),value=>exported.push(value));
  t.after(()=>{dom.window.close();store.close();});
  const $=id=>d.getElementById(id),event=(id,type='input')=>$(id).dispatchEvent(new dom.window.Event(type));
  const click=async id=>{assert.equal($(id).disabled,false,`${id} must be available`);$(id).click();await until(()=>!$('pmIntake').disabled);await tick();};
  const choose=id=>{$('pmScenario').value=id;event('pmScenario','change');};
  const edit=value=>{$('pmInput').value=typeof value==='string'?value:JSON.stringify(value);event('pmInput');};
  const note=value=>{$('pmNote').value=value;event('pmNote');};
  const approve=async()=>{note('Reviewed synthetic request, access, vendor and exact proposal.');$('pmAck').checked=true;event('pmAck','change');await click('pmApprove');};
  const ready=async()=>{await click('pmIntake');await click('pmAccess');await click('pmPropose');await approve();};
  const state=(tenant='acme')=>store.state({tenant});
  const current=()=>mounted.getCurrent();
  const recover=async()=>{await click('pmRefresh');const buttons=$('pmHistory').querySelectorAll('button');assert.ok(buttons.length);buttons[buttons.length-1].click();await until(()=>!$('pmIntake').disabled);await tick();};
  return {dom,d,$,event,click,choose,edit,note,approve,ready,store,calls,exported,state,current,recover};
}

test('catalog has no writes; happy path requires exact independent review and records local effects only',async t=>{
  const x=await setup(t);assert.equal(x.calls.length,1);assert.equal(x.state().cases.length,0);
  assert.match(x.$('pmClock').textContent,/fixed synthetic/);assert.match(x.d.body.textContent,/not authenticated identities/);
  await x.click('pmIntake');assert.equal(x.current().status,'access-required');assert.equal(x.$('pmDispatch').disabled,true);
  await x.click('pmAccess');await x.click('pmPropose');assert.equal(x.current().status,'awaiting-review');
  assert.equal(x.$('pmApprove').disabled,true);assert.match(x.$('pmReceipt').textContent,new RegExp(x.current().proposal.hash));
  await x.approve();assert.equal(x.current().status,'ready');await x.click('pmDispatch');
  assert.equal(x.current().status,'delivered');assert.equal(x.state().bookings.length,1);assert.equal(x.state().receiverRecords.length,1);
  assert.match(x.$('pmEffects').textContent,/Bookings: 1 | Receiver records: 1/);
  assert.equal(x.$('pmDispatch').disabled,true);await x.click('pmExport');assert.equal(x.exported.length,1);
  assert.deepEqual(x.calls.slice(-2).map(item=>item.kind),['verify-audit','receipt']);
  x.note('Operator fixture reports work complete.');await x.click('pmComplete');assert.equal(x.current().status,'reported-complete');
  assert.match(x.$('pmReceipt').textContent,/no physical visit has been verified/);
});

test('known text and structured emergency triggers remain human holds with no dispatch',async t=>{
  const x=await setup(t);
  for(const scenario of ['emergency-gas','emergency-flag']){
    x.choose(scenario);await x.click('pmIntake');assert.equal(x.current().status,'emergency-hold');
    for(const id of ['pmAccess','pmPropose','pmApprove','pmDispatch'])assert.equal(x.$(id).disabled,true);
    assert.match(x.$('pmReceipt').textContent,/Human operator hold/);
  }
  assert.equal(x.state().receiverRecords.length,0);assert.equal(x.state().bookings.length,0);
});

test('a different tenant fixture cannot grant access; history recovers current authority',async t=>{
  const x=await setup(t);await x.click('pmIntake');x.$('pmOccupant').value='beta-tenant';x.event('pmOccupant','change');
  await x.click('pmAccess');assert.equal(x.current(),null);assert.equal(x.$('pmDispatch').disabled,true);
  assert.match(x.$('pmNotice').textContent,/could not establish current state/);
  await x.recover();assert.equal(x.current().status,'access-required');assert.equal(x.current().access.windows.length,0);
});

test('revocation invalidates exact proposal approval and blocks dispatch',async t=>{
  const x=await setup(t);await x.ready();const hash=x.current().proposal.hash;
  await x.click('pmRevoke');assert.equal(x.current().proposal,null);assert.equal(x.current().review,null);
  assert.equal(x.$('pmDispatch').disabled,true);assert.equal(x.current().access.revoked,true);
  assert.ok(hash);assert.equal(x.state().receiverRecords.length,0);
});

test('offline attempt stays queued, then a local online attempt books only once',async t=>{
  const x=await setup(t);await x.ready();x.$('pmProfile').value='offline';x.event('pmProfile','change');await x.click('pmDispatch');
  assert.equal(x.current().status,'queued');assert.equal(x.state().receiverRecords.length,0);
  x.$('pmProfile').value='online';x.event('pmProfile','change');await x.click('pmDispatch');
  assert.equal(x.current().status,'delivered');assert.equal(x.state().receiverRecords.length,1);assert.equal(x.state().bookings.length,1);
});

test('lost receiver acknowledgement permits reconciliation and never another dispatch',async t=>{
  const x=await setup(t);await x.ready();x.$('pmProfile').value='lose-response';await x.click('pmDispatch');
  assert.equal(x.current().status,'uncertain');assert.equal(x.state().receiverRecords.length,1);
  assert.equal(x.$('pmDispatch').disabled,true);assert.equal(x.$('pmCancel').disabled,true);
  await x.click('pmReconcile');assert.equal(x.current().status,'delivered');assert.equal(x.state().receiverRecords.length,1);
});

test('revocation after uncertain delivery retains receiver evidence and human follow-up',async t=>{
  const x=await setup(t);await x.ready();x.$('pmProfile').value='lose-response';await x.click('pmDispatch');
  await x.click('pmRevoke');assert.equal(x.current().status,'access-revoked');assert.equal(x.current().requiresFollowUp,true);
  assert.equal(x.$('pmDispatch').disabled,true);assert.equal(x.$('pmComplete').disabled,true);
  assert.equal(x.$('pmReconcile').disabled,false);await x.click('pmReconcile');
  assert.equal(x.current().status,'access-revoked');assert.equal(x.state().receiverRecords.length,1);
  assert.match(x.$('pmReceipt').textContent,/human operator follow-up required/);
});

test('cross-case overlap is rejected against the actual persisted booking',async t=>{
  const x=await setup(t);x.$('pmWindows').value='[{"start":"2026-10-24T13:00:00.000Z","end":"2026-10-24T14:00:00.000Z"}]';
  await x.ready();await x.click('pmDispatch');assert.equal(x.state().bookings.length,1);
  await x.click('pmRestore');await x.click('pmIntake');await x.click('pmAccess');await x.click('pmPropose');
  assert.equal(x.current(),null);assert.match(x.$('pmNotice').textContent,/No eligible vendor\/window/);
  await x.recover();assert.equal(x.current().status,'planning-review');assert.equal(x.$('pmDispatch').disabled,true);
  assert.equal(x.state().bookings.length,1);assert.equal(x.state().receiverRecords.length,1);
});

test('lost intake response retries one immutable command and recovers one saved case',async t=>{
  let first=true;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='intake'&&first){first=false;throw Error('Synthetic browser response lost');}return value;});
  await x.click('pmIntake');assert.equal(x.current(),null);assert.equal(x.state().cases.length,1);
  await x.click('pmIntake');assert.equal(x.state().cases.length,1);assert.equal(x.current().status,'access-required');
  const calls=x.calls.filter(item=>item.kind==='intake');assert.equal(calls[0].body.commandId,calls[1].body.commandId);
});

test('lost dispatch browser response fails closed; history recovers committed receiver state',async t=>{
  let first=true;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='dispatch'&&first){first=false;throw Error('Synthetic browser response lost');}return value;});
  await x.ready();await x.click('pmDispatch');assert.equal(x.current(),null);assert.equal(x.$('pmExport').disabled,true);
  assert.equal(x.state().receiverRecords.length,1);await x.recover();assert.equal(x.current().status,'delivered');
  assert.equal(x.$('pmDispatch').disabled,true);assert.equal(x.state().receiverRecords.length,1);
});

test('editing intake during a late response cannot install authority for the old case',async t=>{
  let release,started=false;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='intake'){started=true;await new Promise(resolve=>release=resolve);}return value;});
  x.$('pmIntake').click();await until(()=>started);const changed=JSON.parse(x.$('pmInput').value);changed.description='A different supplied issue';x.edit(changed);
  release();await until(()=>!x.$('pmIntake').disabled);assert.equal(x.current(),null);assert.equal(x.$('pmDispatch').disabled,true);
  assert.match(x.$('pmReceipt').textContent,/Input changed/);assert.equal(x.state().cases.length,1);
});

test('an intake edit during export prevents downloading a stale current receipt',async t=>{
  let hold=false,release,started=false;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='verify-audit'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});
  await x.ready();hold=true;x.$('pmExport').click();await until(()=>started);x.edit('{"different":"intent"}');release();
  await until(()=>!x.$('pmIntake').disabled);assert.equal(x.exported.length,0);assert.equal(x.current(),null);
});

test('supplied markup stays inert in saved receipt and audit evidence',async t=>{
  const x=await setup(t);const input=JSON.parse(x.$('pmInput').value);input.description='<img src=x onerror="alert(1)"><script>steal()</script> dripping tap';x.edit(input);
  await x.click('pmIntake');assert.match(x.$('pmReceipt').textContent,/<img src=x/);assert.equal(x.d.querySelector('img'),null);
  assert.equal(x.d.querySelectorAll('script').length,1);assert.equal(x.d.querySelector('script').src,'http://127.0.0.1:5680/maintenance-ui.mjs');
});

test('beta tenant recovery keeps ownership isolated and cancellation releases a booked slot',async t=>{
  const x=await setup(t);x.choose('beta-routine');await x.ready();await x.click('pmDispatch');
  assert.equal(x.state('beta').receiverRecords.length,1);assert.equal(x.state('acme').receiverRecords.length,0);
  x.note('Operator fixture cancelled; follow up locally.');await x.click('pmCancel');assert.equal(x.current().status,'cancelled');
  assert.equal(x.$('pmDispatch').disabled,true);assert.equal(x.$('pmComplete').disabled,true);
  await x.click('pmVerify');assert.match(x.$('pmVerification').textContent,/audit chain valid/);
});


test('emergency follow-up never implies an access revocation or receiver handoff',async t=>{
  const x=await setup(t);x.choose('emergency-gas');await x.click('pmIntake');
  assert.match(x.$('pmReceipt').textContent,/Human emergency procedure required/);
  assert.doesNotMatch(x.$('pmReceipt').textContent,/Access revoked after receiver handoff/);
  assert.equal(x.state().receiverRecords.length,0);
});
test('stale saved authority is explicitly historical and cannot dispatch or export',async t=>{
  let stale=false;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(stale&&kind==='receipt')value.stale=true;return value;});
  await x.ready();stale=true;await x.click('pmRefresh');
  assert.match(x.$('pmReceipt').textContent,/Historical receipt: source or configuration changed/);
  assert.equal(x.$('pmDispatch').disabled,true);assert.equal(x.$('pmExport').disabled,true);
});
test('scenario source preview is explicitly illustrative when the intake editor changes',async t=>{
  const x=await setup(t);assert.match(x.$('pmSource').textContent,/Illustrative scenario preview/);
  const input=JSON.parse(x.$('pmInput').value);input.description='An edited dripping tap report';x.edit(input);
  assert.match(x.$('pmSource').textContent,/Manual edits do not update this illustrative preview/);
  await x.click('pmIntake');assert.match(x.$('pmReceipt').textContent,/An edited dripping tap report/);
  assert.match(x.$('pmReceipt').textContent,new RegExp(input.sourceIssueId));
});


test('export rechecks the consistent receipt after audit when another actor revokes access',async t=>{
  let hold=false,release,started=false;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='verify-audit'&&hold){started=true;await new Promise(resolve=>release=resolve);}return value;});
  await x.ready();hold=true;x.$('pmExport').click();await until(()=>started);
  const saved=x.current();x.store.revokeAccess({commandId:'external-revocation',tenant:saved.tenant,caseId:saved.caseId,actor:'acme-tenant',note:'Occupant revoked during audit response.'});
  release();await until(()=>!x.$('pmIntake').disabled);assert.equal(x.exported.length,0);assert.equal(x.current(),null);
  assert.equal(x.$('pmDispatch').disabled,true);assert.match(x.$('pmNotice').textContent,/Saved evidence changed/);
});


for(const profile of ['online','lose-response'])test(`post-send ${profile} revocation holds capacity until reconciled explicit cancellation`,async t=>{
  const x=await setup(t);await x.ready();x.$('pmProfile').value=profile;await x.click('pmDispatch');await x.click('pmRevoke');
  assert.equal(x.state().bookings[0].status,'active');x.note('Operator follows up and cancels the local receiver intent.');
  if(profile==='lose-response'){assert.equal(x.$('pmCancel').disabled,true);await x.click('pmReconcile');}
  assert.equal(x.$('pmCancel').disabled,false);await x.click('pmCancel');
  assert.equal(x.current().status,'cancelled');assert.equal(x.state().bookings[0].status,'cancelled');assert.equal(x.state().receiverRecords[0].status,'cancelled-locally');
});
