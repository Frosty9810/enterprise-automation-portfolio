import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { openTrustGate, trustGate } from './trustgate-core.mjs';
import { mountTrustGate } from './trustgate-ui.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(condition) { for (let i=0;i<200;i++) { if(condition())return; await new Promise(resolve=>setTimeout(resolve,5)); } throw Error('TrustGate UI did not settle.'); }
async function setup(t, decorate = api => api) {
  const dom = new JSDOM(readFileSync(new URL('./trustgate.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680/trustgate'});
  const store = openTrustGate(), exported = [], calls = [], d=dom.window.document;
  const api=async(kind,body)=>{calls.push({kind,body:structuredClone(body)});return kind==='catalog'?store.catalog():kind==='verify-audit'?store.verifyAudit(body):store[kind](body);};
  const view=await mountTrustGate(d,decorate(api),value=>exported.push(value));
  t.after(()=>{dom.window.close();store.close();});
  const $=id=>d.getElementById(id);
  const event=(id,type)=>$(id).dispatchEvent(new dom.window.Event(type));
  const click=async id=>{$(id).click();await until(()=>!$('trustPrepare').disabled);await tick();};
  const scenario=id=>{$('trustScenario').value=id;event('trustScenario','change');};
  const proposal=()=>JSON.parse($('trustProposal').value);
  const edit=value=>{$('trustProposal').value=typeof value==='string'?value:JSON.stringify(value);event('trustProposal','input');};
  const reviewer=(who='acme-reviewer',note='Checked the exact registered values for this local fixture only.')=>{
    $('trustReviewer').value=who;event('trustReviewer','change');
    $('trustReviewNote').value=note;event('trustReviewNote','input');
    $('trustReviewAck').checked=true;event('trustReviewAck','change');
  };
  return {dom,d,$,store,view,exported,calls,click,scenario,proposal,edit,event,reviewer};
}

test('TrustGate UI resolves actual public source bindings, performs a SQL read and verifies its export',async t=>{
  const x=await setup(t);
  assert.equal(x.$('trustScenario').options.length,6);
  assert.match(x.$('trustCatalog').textContent,/read-public-policy/);
  assert.match(x.$('trustCatalog').textContent,/trusted-user/);
  assert.match(x.$('trustCatalog').textContent,/untrusted-document/);
  assert.match(x.$('trustCatalog').textContent,/internal-price/);
  assert.equal(x.$('trustExecute').disabled,true);
  await x.click('trustPrepare');
  assert.match(x.$('trustReceipt').textContent,/Ready for this local tool/);
  assert.match(x.$('trustReceipt').textContent,/policyId ← policyId/);
  assert.match(x.$('trustReceipt').textContent,/intent-public/);
  assert.equal(x.$('trustExecute').disabled,false);
  assert.deepEqual(x.store.state({tenant:'acme'}),{tasks:[],publicNotes:[]});
  await x.click('trustExecute');
  assert.match(x.$('trustReceipt').textContent,/Local tool executed/);
  assert.match(x.$('trustReceipt').textContent,/Synthetic public delivery policy/);
  assert.equal(x.$('trustExecute').disabled,true);
  await x.click('trustVerify');
  assert.match(x.$('trustVerification').textContent,/valid · 2 events/);
  await x.click('trustExport');
  assert.equal(x.exported.length,1);assert.equal(x.exported[0].effect.kind,'policy-read');
  assert.equal(x.exported[0].stale,false);
  assert.deepEqual(x.calls.slice(-2).map(row=>row.kind),['receipt','verify-audit']);
});

test('reviewed task requires a reviewer, note and scope acknowledgement before exactly one real local write',async t=>{
  const x=await setup(t);x.scenario('reviewed-task');await x.click('trustPrepare');
  assert.match(x.$('trustReceipt').textContent,/Local review required/);
  assert.match(x.$('trustReceipt').textContent,/supplier-email/);
  assert.match(x.$('trustReceipt').textContent,/The synthetic supplier estimates delivery on Friday/);
  assert.equal(x.$('trustReviewPanel').hidden,false);
  assert.equal(x.$('trustApprove').disabled,true);
  assert.equal(x.$('trustExecute').disabled,true);
  x.$('trustReviewAck').checked=true;x.event('trustReviewAck','change');assert.equal(x.$('trustApprove').disabled,true);
  x.reviewer();assert.equal(x.$('trustApprove').disabled,false);
  const hash=x.$('trustExpectedHash').value;assert.match(hash,/^[a-f0-9]{64}$/);
  await x.click('trustApprove');
  assert.equal(x.calls.find(row=>row.kind==='review').body.expectedHash,hash);
  assert.equal(x.$('trustExecute').disabled,false);
  assert.equal(x.store.state({tenant:'acme'}).tasks.length,0);
  await x.click('trustExecute');
  const tasks=x.store.state({tenant:'acme'}).tasks;assert.equal(tasks.length,1);
  assert.equal(tasks[0].summary,'The synthetic supplier estimates delivery on Friday.');
  assert.match(x.$('trustEffects').textContent,/1 local review tasks/);
  const auditCount=x.store.verifyAudit({tenant:'acme'}).eventCount;
  await x.click('trustPrepare');
  assert.match(x.$('trustReceipt').textContent,/Saved intent replayed/);
  assert.equal(x.store.state({tenant:'acme'}).tasks.length,1);
  assert.equal(x.store.verifyAudit({tenant:'acme'}).eventCount,auditCount);
});

test('public note stages only a local outbox record and a rejection prevents its effect',async t=>{
  const x=await setup(t);x.scenario('public-note');await x.click('trustPrepare');x.reviewer();await x.click('trustReject');
  assert.match(x.$('trustReceipt').textContent,/Rejected by local reviewer/);
  assert.equal(x.$('trustExecute').disabled,true);assert.equal(x.store.state({tenant:'acme'}).publicNotes.length,0);
  x.scenario('public-note');await x.click('trustPrepare');x.reviewer();await x.click('trustApprove');await x.click('trustExecute');
  const notes=x.store.state({tenant:'acme'}).publicNotes;assert.equal(notes.length,1);
  assert.equal(notes[0].body,'Synthetic delivery review is in progress.');
  assert.match(x.$('trustEffects').textContent,/1 staged local public notes/);
  assert.match(x.d.body.textContent,/Nothing is sent or published/);
});

test('all blocked fixtures and missing actor grants show actual policy reasons without execution authority',async t=>{
  const x=await setup(t);
  for(const [scenario,reason] of [['blocked-private',/internal data cannot enter a public sink/],['blocked-injection',/instruction-marked source is blocked/],['blocked-identity',/target identity requires trusted user intent/]]){
    x.scenario(scenario);await x.click('trustPrepare');
    assert.match(x.$('trustReceipt').textContent,/Blocked by source and tool policy/);assert.match(x.$('trustReceipt').textContent,reason);
    assert.equal(x.$('trustExecute').disabled,true);assert.equal(x.$('trustReviewPanel').hidden,true);
  }
  x.scenario('reviewed-task');x.edit({...x.proposal(),actor:'acme-reader'});await x.click('trustPrepare');
  assert.match(x.$('trustReceipt').textContent,/does not have the configured tool scope/);
  assert.deepEqual(x.store.state({tenant:'acme'}),{tasks:[],publicNotes:[]});
});

test('review controls exclude the same dual-role actor and clear acknowledgement on changed review inputs',async t=>{
  const x=await setup(t);x.scenario('reviewed-task');x.edit({...x.proposal(),actor:'acme-dual-role'});await x.click('trustPrepare');
  assert.equal([...x.$('trustReviewer').options].some(option=>option.value==='acme-dual-role'),false);
  assert.equal([...x.$('trustReviewer').options].some(option=>option.value==='acme-reader'),false);
  x.reviewer();assert.equal(x.$('trustApprove').disabled,false);
  x.$('trustReviewNote').value='A revised decision note.';x.event('trustReviewNote','input');
  assert.equal(x.$('trustReviewAck').checked,false);assert.equal(x.$('trustApprove').disabled,true);
  x.reviewer('acme-reviewer','x'.repeat(501));assert.equal(x.$('trustApprove').disabled,true);
  assert.equal(x.$('trustReviewNote').maxLength,500);
});

test('proposal edits clear visible authority and immutable command conflicts need a fresh restored ID',async t=>{
  const x=await setup(t);await x.click('trustPrepare');const saved=x.proposal();assert.equal(x.$('trustExport').disabled,false);
  x.edit('{');assert.equal(x.$('trustExecute').disabled,true);assert.equal(x.$('trustExport').disabled,true);
  await x.click('trustPrepare');assert.match(x.$('trustNotice').textContent,/JSON|property name/i);
  x.edit({...saved,actor:'acme-reader'});await x.click('trustPrepare');
  assert.match(x.$('trustNotice').textContent,/Command identity already has a different proposal/);
  assert.equal(x.$('trustExecute').disabled,true);assert.equal(x.$('trustExport').disabled,true);
  await x.click('trustRestore');assert.notEqual(x.proposal().commandId,saved.commandId);await x.click('trustPrepare');
  assert.equal(x.$('trustExecute').disabled,false);
});

test('a late prepared response cannot overwrite the next selected scenario or restore export authority',async t=>{
  let release;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='prepare')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  x.$('trustPrepare').click();await until(()=>Boolean(release));
  assert.equal(x.$('trustExecute').disabled,true);assert.equal(x.$('trustRefresh').disabled,true);
  x.scenario('blocked-private');release();await until(()=>!x.$('trustPrepare').disabled);
  assert.match(x.$('trustReceipt').textContent,/Proposal changed/);
  assert.equal(x.$('trustExecute').disabled,true);assert.equal(x.$('trustExport').disabled,true);
  assert.equal(x.proposal().tool,'stage-public-note');
});

test('a late execution response cannot overwrite an edited proposal, while its real saved effect remains discoverable',async t=>{
  let release;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='execute')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  x.scenario('reviewed-task');await x.click('trustPrepare');x.reviewer();await x.click('trustApprove');
  x.$('trustExecute').click();await until(()=>Boolean(release));x.scenario('public-note');release();await until(()=>!x.$('trustPrepare').disabled);
  assert.match(x.$('trustReceipt').textContent,/Proposal changed/);assert.equal(x.$('trustExport').disabled,true);
  assert.equal(x.store.state({tenant:'acme'}).tasks.length,1);
  await x.click('trustRefresh');assert.match(x.$('trustEffects').textContent,/1 local review tasks/);
});

test('lost execution response disables retry authority and saved history recovers the actual confirmed result',async t=>{
  let fail=true;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='execute'&&fail){fail=false;throw Error('Simulated lost response after local commit.');}return value;});
  x.scenario('reviewed-task');await x.click('trustPrepare');x.reviewer();await x.click('trustApprove');await x.click('trustExecute');
  assert.match(x.$('trustNotice').textContent,/lost response/);
  assert.match(x.$('trustReceipt').textContent,/Refresh history/);
  assert.equal(x.$('trustExecute').disabled,true);assert.equal(x.$('trustExport').disabled,true);
  assert.equal(x.store.state({tenant:'acme'}).tasks.length,1);
  await x.click('trustRefresh');x.$('trustHistory').querySelector('button').click();await until(()=>!x.$('trustPrepare').disabled);
  assert.match(x.$('trustReceipt').textContent,/Local tool executed/);assert.equal(x.$('trustExecute').disabled,true);
  await x.click('trustExport');assert.equal(x.exported.length,1);assert.equal(x.exported[0].status,'executed');
  assert.equal(x.store.state({tenant:'acme'}).tasks.length,1);
});

test('export rechecks actual policy freshness and audit integrity instead of trusting a previously visible receipt',async t=>{
  const x=await setup(t);await x.click('trustPrepare');
  trustGate(x.store.db,{policyVersion:'test-policy-revision'});
  await x.click('trustExport');assert.equal(x.exported.length,0);assert.equal(x.$('trustExport').disabled,true);
  assert.match(x.$('trustReceipt').textContent,/Stale policy or source snapshot/);
  assert.match(x.$('trustNotice').textContent,/policy or sources changed/);
  const y=await setup(t);await y.click('trustPrepare');
  y.store.db.prepare('UPDATE trustgate_audit SET body=? WHERE tenant=?').run('{}','acme');
  await y.click('trustExport');assert.equal(y.exported.length,0);assert.match(y.$('trustNotice').textContent,/Audit integrity failed/);
});

test('editing while export verification is pending prevents a late download and untrusted text renders as text',async t=>{
  let release;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='catalog'){value.sources[0].values.title='<img src=x onerror=alert(1)>';return value;}if(kind==='verify-audit')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  assert.match(x.$('trustCatalog').textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(x.d.querySelector('img'),null);
  await x.click('trustPrepare');x.$('trustExport').click();await until(()=>Boolean(release));x.edit('{');release();await until(()=>!x.$('trustPrepare').disabled);
  assert.equal(x.exported.length,0);assert.equal(x.$('trustExport').disabled,true);assert.match(x.$('trustReceipt').textContent,/Proposal edited/);
});
