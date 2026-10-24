import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {openDockside} from './dockside-core.mjs';
import {mountDockside} from './dockside-ui.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Dockside UI did not settle.');}
async function setup(t,decorate=api=>api){
  const dom=new JSDOM(readFileSync(new URL('./dockside.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680/dockside'}),store=openDockside(),d=dom.window.document,calls=[],exported=[];
  const api=async(kind,body)=>{calls.push({kind,body:structuredClone(body)});return kind==='verify-audit'?store.verifyAudit(body):store[kind](body);};
  await mountDockside(d,decorate(api),value=>exported.push(value));t.after(()=>{dom.window.close();store.close();});
  const $=id=>d.getElementById(id),event=(id,type='input')=>$(id).dispatchEvent(new dom.window.Event(type));
  const click=async id=>{$(id).click();await until(()=>!$('dockSubmit').disabled);await tick();};
  const choose=id=>{$('dockScenario').value=id;event('dockScenario','change');};
  const edit=value=>{$('dockInput').value=typeof value==='string'?value:JSON.stringify(value);event('dockInput');};
  const approve=async()=>{$('dockReviewNote').value='Checked the synthetic source and supplied fields.';event('dockReviewNote');$('dockAck').checked=true;event('dockAck','change');await click('dockApprove');};
  const latest=()=>store.history({tenant:'acme'}).receipts.at(-1);
  return {dom,d,$,calls,store,exported,event,click,choose,edit,approve,latest};
}

test('catalog loading does not write; submission requires an explicit exact-content review',async t=>{
  const x=await setup(t);assert.equal(x.calls.length,1);assert.equal(x.store.history({tenant:'acme'}).receipts.length,0);
  assert.match(x.$('dockSource').textContent,/SYNTHETIC invoice/);assert.match(x.d.body.textContent,/not extracted by OCR or an SLM/);
  assert.equal(x.$('dockSync').disabled,true);await x.click('dockSubmit');assert.equal(x.latest().status,'awaiting-review');assert.equal(x.$('dockApprove').disabled,true);
  assert.match(x.$('dockReceipt').textContent,/Structured validation passed/);assert.match(x.$('dockReceipt').textContent,new RegExp(x.latest().contentHash));
  await x.approve();assert.equal(x.latest().status,'ready');assert.equal(x.$('dockSync').disabled,false);assert.equal(x.$('dockReconcile').disabled,true);
});

test('offline delivery stays queued; online retry creates one actual receiver record and export rechecks evidence',async t=>{
  const x=await setup(t);await x.click('dockSubmit');await x.approve();x.$('dockProfile').value='offline';await x.click('dockSync');
  assert.equal(x.latest().status,'offline');assert.equal(x.store.state({tenant:'acme'}).erpRecords.length,0);assert.match(x.$('dockReceipt').textContent,/Queued after an offline attempt/);
  x.$('dockProfile').value='online';await x.click('dockSync');assert.equal(x.latest().status,'delivered');assert.equal(x.store.state({tenant:'acme'}).erpRecords.length,1);
  assert.match(x.$('dockEffects').textContent,/Actual local receiver · 1 records/);assert.equal(x.$('dockSync').disabled,true);
  await x.click('dockExport');assert.equal(x.exported.length,1);assert.equal(x.exported[0].status,'delivered');assert.deepEqual(x.calls.slice(-2).map(call=>call.kind),['receipt','verify-audit']);
  await x.click('dockVerify');assert.match(x.$('dockVerification').textContent,/audit chain valid/);
});

test('lost receiver confirmation requires reconciliation and never posts a duplicate',async t=>{
  const x=await setup(t);await x.click('dockSubmit');await x.approve();x.$('dockProfile').value='lose-response';await x.click('dockSync');
  assert.equal(x.latest().status,'uncertain');assert.equal(x.$('dockSync').disabled,true);assert.equal(x.$('dockReconcile').disabled,false);assert.equal(x.store.state({tenant:'acme'}).erpRecords.length,1);
  await x.click('dockReconcile');assert.equal(x.latest().status,'delivered');assert.equal(x.store.state({tenant:'acme'}).erpRecords.length,1);assert.equal(x.$('dockReconcile').disabled,true);
});

test('inconsistent totals are visibly rejected and cannot be approved or delivered',async t=>{
  const x=await setup(t);x.choose('bad-total');await x.click('dockSubmit');assert.equal(x.latest().status,'rejected');assert.match(x.$('dockReceipt').textContent,/total/i);
  assert.equal(x.$('dockReviewPanel').hidden,true);assert.equal(x.$('dockSync').disabled,true);assert.equal(x.store.state({tenant:'acme'}).erpRecords.length,0);
});

test('manual rejection persists its note and stops delivery',async t=>{
  const x=await setup(t);await x.click('dockSubmit');x.$('dockReviewNote').value='Synthetic source needs correction.';x.event('dockReviewNote');x.$('dockAck').checked=true;x.event('dockAck','change');await x.click('dockReject');
  assert.equal(x.latest().status,'review-rejected');assert.match(x.$('dockReceipt').textContent,/Synthetic source needs correction/);assert.equal(x.$('dockSync').disabled,true);
});

test('malformed JSON and changed replay recover without false saved evidence',async t=>{
  const x=await setup(t);x.edit('{');await x.click('dockSubmit');assert.match(x.$('dockNotice').textContent,/JSON|property name/i);assert.equal(x.store.history({tenant:'acme'}).receipts.length,0);
  await x.click('dockRestore');await x.click('dockSubmit');const value=JSON.parse(x.$('dockInput').value);value.document.text+=' Changed.';x.edit(value);await x.click('dockSubmit');
  assert.match(x.$('dockNotice').textContent,/Command ID was already used/);assert.equal(x.$('dockExport').disabled,true);assert.equal(x.store.history({tenant:'acme'}).receipts.length,1);
});

test('a late response cannot overwrite edited input and history can recover the committed receipt',async t=>{
  let release;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='submit')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  x.$('dockSubmit').click();await until(()=>Boolean(release));assert.equal(x.$('dockRefresh').disabled,true);x.edit('{');release();await until(()=>!x.$('dockSubmit').disabled);
  assert.equal(x.$('dockExport').disabled,true);assert.match(x.$('dockReceipt').textContent,/fields edited/);await x.click('dockRestore');await x.click('dockRefresh');x.$('dockHistory').querySelector('button').click();await until(()=>!x.$('dockSubmit').disabled);
  assert.match(x.$('dockReceipt').textContent,/Awaiting local review/);
});

test('lost submit response retries the exact command without a duplicate',async t=>{
  let fail=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='submit'&&fail){fail=false;throw Error('Synthetic response lost after local commit.');}return value;});
  await x.click('dockSubmit');assert.equal(x.$('dockExport').disabled,true);assert.equal(x.store.history({tenant:'acme'}).receipts.length,1);await x.click('dockSubmit');assert.equal(x.store.history({tenant:'acme'}).receipts.length,1);assert.match(x.$('dockReceipt').textContent,/Awaiting local review/);
});

test('superseded receipts fail the export freshness recheck',async t=>{
  const x=await setup(t);await x.click('dockSubmit');const next=JSON.parse(x.$('dockInput').value);next.commandId='ui-next-version';next.document.version=2;next.document.text+=' Revised.';x.store.submit(next);
  await x.click('dockExport');assert.equal(x.exported.length,0);assert.equal(x.$('dockExport').disabled,true);assert.match(x.$('dockNotice').textContent,/stale or superseded/);
});

test('source and review strings render as inert text',async t=>{
  const x=await setup(t),value=JSON.parse(x.$('dockInput').value);value.document.text='<img src=x onerror=alert(1)> Synthetic invoice.';x.edit(value);await x.click('dockSubmit');
  assert.equal(x.d.querySelectorAll('img').length,0);assert.match(x.$('dockSource').textContent,/<img/);assert.match(x.$('dockReceipt').textContent,/<img/);
});
