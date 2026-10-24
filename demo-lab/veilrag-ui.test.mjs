import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {openVeilRag,veilRag} from './veilrag-core.mjs';
import {mountVeilRag} from './veilrag-ui.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('VeilRAG UI did not settle.');}
async function setup(t,decorate=api=>api,options={}){
  const dom=new JSDOM(readFileSync(new URL('./veilrag.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680/veilrag'}),store=openVeilRag(':memory:',options),d=dom.window.document,calls=[],exported=[];
  const api=async(kind,body)=>{calls.push({kind,body:structuredClone(body)});return kind==='verify-audit'?store.api.verifyAudit(body):store.api[kind](body);};
  await mountVeilRag(d,decorate(api),value=>exported.push(value));t.after(()=>{dom.window.close();store.close();});
  const $=id=>d.getElementById(id),event=(id,type='input')=>$(id).dispatchEvent(new dom.window.Event(type));
  const click=async id=>{$(id).click();await until(()=>!$('veilProtect').disabled);await tick();};
  const choose=id=>{$('veilScenario').value=id;event('veilScenario','change');};
  const edit=value=>{$('veilInput').value=typeof value==='string'?value:JSON.stringify(value);event('veilInput');};
  const latest=()=>store.api.history({tenant:'acme'}).receipts[0];
  return {dom,d,$,calls,store,exported,event,click,choose,edit,latest};
}

test('catalog is read-only; protected frames, generation and explicit restoration use actual core behavior',async t=>{
  const x=await setup(t);assert.equal(x.calls.length,1);assert.equal(x.store.api.history({tenant:'acme'}).receipts.length,0);assert.equal(x.$('veilReveal').disabled,true);
  assert.match(x.d.body.textContent,/Only exact, case-sensitive declared literals/);assert.match(x.d.body.textContent,/not general PII detection/);
  await x.click('veilProtect');assert.equal(x.latest().status,'protected');assert.equal(x.$('veilPlaintext').hidden,true);assert.equal(x.$('veilGenerate').disabled,false);
  const input=JSON.parse(x.$('veilInput').value);for(const item of input.entities)assert.equal(x.$('veilReceipt').textContent.includes(item.value),false);
  await x.click('veilGenerate');assert.equal(x.latest().status,'generated');assert.equal(x.$('veilReveal').disabled,false);assert.equal(x.$('veilPlaintext').hidden,true);
  await x.click('veilReveal');assert.equal(x.$('veilPlaintext').hidden,false);assert.match(x.$('veilPlaintext').textContent,/Ada Example/);assert.match(x.$('veilPlaintext').textContent,/Northstar Example Ltd/);
  await x.click('veilExport');assert.equal(x.exported.length,1);for(const item of input.entities)assert.equal(JSON.stringify(x.exported[0]).includes(item.value),false);
  assert.equal(x.$('veilPlaintext').hidden,true);assert.deepEqual(x.calls.slice(-2).map(call=>call.kind),['receipt','verify-audit']);
  await x.click('veilVerify');assert.match(x.$('veilVerification').textContent,/audit chain valid/);
});

test('declared-literal leakage from the child fixture blocks restoration and omits its output',async t=>{
  const x=await setup(t);x.choose('block-literal-leak');await x.click('veilProtect');await x.click('veilGenerate');
  assert.equal(x.latest().status,'blocked');assert.match(x.$('veilReceipt').textContent,/declared_literal_leak/);assert.equal(x.$('veilReveal').disabled,true);assert.equal(x.$('veilPlaintext').hidden,true);
  assert.equal(x.$('veilReceipt').textContent.includes('Ada Example'),false);await x.click('veilExport');assert.equal(x.exported.length,1);assert.equal('sanitizedOutput'in x.exported[0],false);
});

test('an unknown alias blocks restoration',async t=>{
  const x=await setup(t);x.choose('block-foreign-alias');await x.click('veilProtect');await x.click('veilGenerate');
  assert.equal(x.latest().status,'blocked');assert.match(x.$('veilReceipt').textContent,/unknown_alias/);assert.equal(x.$('veilReveal').disabled,true);
});

test('expiry is rechecked before export and purging clears visible plaintext',async t=>{
  let now=1000;const x=await setup(t,api=>api,{key:Buffer.alloc(32,7),clock:()=>now,ttlMs:100});await x.click('veilProtect');await x.click('veilGenerate');await x.click('veilReveal');
  assert.equal(x.$('veilPlaintext').hidden,false);now=1100;await x.click('veilExport');assert.equal(x.exported.length,0);assert.equal(x.$('veilPlaintext').hidden,true);assert.equal(x.$('veilExport').disabled,true);assert.match(x.$('veilNotice').textContent,/expired/);
  await x.click('veilPurge');assert.match(x.$('veilNotice').textContent,/1 expired local vault entries purged/);assert.equal(x.latest().status,'expired');assert.equal(x.$('veilReveal').disabled,true);
});

test('a recipient outside this tenant cannot restore and no plaintext is displayed',async t=>{
  const x=await setup(t);await x.click('veilProtect');await x.click('veilGenerate');const option=x.d.createElement('option');option.value='beta-reviewer';option.textContent='Unconfigured-for-this-tenant fixture';x.$('veilRecipient').append(option);x.$('veilRecipient').value='beta-reviewer';x.event('veilRecipient','change');
  await x.click('veilReveal');assert.match(x.$('veilNotice').textContent,/recipient has no local restoration grant/);assert.equal(x.$('veilPlaintext').hidden,true);assert.equal(x.store.api.audit({tenant:'acme'}).events.some(row=>row.kind==='restored'),false);
});

test('editing input clears restored plaintext and invalidates generation and export',async t=>{
  const x=await setup(t);await x.click('veilProtect');await x.click('veilGenerate');await x.click('veilReveal');assert.equal(x.$('veilPlaintext').hidden,false);
  const value=JSON.parse(x.$('veilInput').value);value.frames.query+=' Changed.';x.edit(value);assert.equal(x.$('veilPlaintext').hidden,true);assert.equal(x.$('veilGenerate').disabled,true);assert.equal(x.$('veilExport').disabled,true);assert.equal(x.$('veilReveal').disabled,true);
});

test('a late restore response cannot reveal plaintext after the request was edited',async t=>{
  let release;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='restore')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  await x.click('veilProtect');await x.click('veilGenerate');x.$('veilReveal').click();await until(()=>Boolean(release));assert.equal(x.$('veilExport').disabled,true);x.edit('{');release();await until(()=>!x.$('veilProtect').disabled);
  assert.equal(x.$('veilPlaintext').hidden,true);assert.match(x.$('veilReceipt').textContent,/fields edited/);assert.equal(x.$('veilReveal').disabled,true);
});

test('a late protection response cannot overwrite edited input; history recovers the saved receipt',async t=>{
  let release;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='protect')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  x.$('veilProtect').click();await until(()=>Boolean(release));x.edit('{');release();await until(()=>!x.$('veilProtect').disabled);assert.equal(x.$('veilGenerate').disabled,true);
  await x.click('veilRestoreExample');await x.click('veilRefresh');x.$('veilHistory').querySelector('button').click();await until(()=>!x.$('veilProtect').disabled);assert.match(x.$('veilReceipt').textContent,/Sanitized frames saved/);assert.equal(x.$('veilGenerate').disabled,false);
});

test('a lost protection response retries unchanged intent without duplicate sessions',async t=>{
  let fail=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='protect'&&fail){fail=false;throw Error('Synthetic response interrupted after save.');}return value;});
  await x.click('veilProtect');assert.equal(x.$('veilExport').disabled,true);assert.equal(x.store.api.history({tenant:'acme'}).receipts.length,1);await x.click('veilProtect');assert.equal(x.store.api.history({tenant:'acme'}).receipts.length,1);assert.equal(x.latest().status,'protected');
});

test('malformed JSON and command replay conflicts do not produce false confirmed evidence',async t=>{
  const x=await setup(t);x.edit('{');await x.click('veilProtect');assert.match(x.$('veilNotice').textContent,/JSON|property name/i);assert.equal(x.store.api.history({tenant:'acme'}).receipts.length,0);
  await x.click('veilRestoreExample');await x.click('veilProtect');const value=JSON.parse(x.$('veilInput').value);value.frames.query+=' Changed.';x.edit(value);await x.click('veilProtect');assert.match(x.$('veilNotice').textContent,/reused with different input/);assert.equal(x.$('veilExport').disabled,true);assert.equal(x.store.api.history({tenant:'acme'}).receipts.length,1);
});

test('busy generation blocks duplicate actions and late generation cannot restore an edited request',async t=>{
  let release;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='generate')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  await x.click('veilProtect');x.$('veilGenerate').click();await until(()=>Boolean(release));x.$('veilGenerate').click();assert.equal(x.calls.filter(call=>call.kind==='generate').length,1);assert.equal(x.$('veilReveal').disabled,true);x.edit('{');release();await until(()=>!x.$('veilProtect').disabled);assert.equal(x.$('veilReveal').disabled,true);assert.equal(x.$('veilPlaintext').hidden,true);
});

test('restored and sanitized markup renders as inert text',async t=>{
  const x=await setup(t),value=JSON.parse(x.$('veilInput').value);value.frames.query+=' <img src=x onerror=alert(1)>';x.edit(value);await x.click('veilProtect');await x.click('veilGenerate');await x.click('veilReveal');
  assert.match(x.$('veilPlaintext').textContent,/<img/);assert.equal(x.d.querySelectorAll('img').length,0);
});


test('stale status without a stale flag stops export and gives fresh-session recovery',async t=>{
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='receipt'){const next={...value,status:'stale'};delete next.stale;delete next.sanitized;delete next.sanitizedOutput;return next;}return value;});
  await x.click('veilProtect');await x.click('veilExport');
  assert.equal(x.exported.length,0);assert.equal(x.$('veilExport').disabled,true);assert.equal(x.$('veilReveal').disabled,true);
  await x.click('veilRefresh');x.$('veilHistory').querySelector('button').click();await until(()=>!x.$('veilProtect').disabled);
  assert.match(x.$('veilReceipt').textContent,/Historical session|Historical evidence/);assert.match(x.$('veilReceipt').textContent,/Restart.*new command ID/);
  const previous=JSON.parse(x.$('veilInput').value);await x.click('veilFresh');const fresh=JSON.parse(x.$('veilInput').value);
  assert.notEqual(fresh.commandId,previous.commandId);assert.deepEqual(fresh.frames,previous.frames);assert.equal(x.$('veilPlaintext').hidden,true);
});

test('actual vault key loss explains irreversible old plaintext and fresh-session recovery succeeds',async t=>{
  let lost=false,replacement,x;
  x=await setup(t,api=>async(kind,body)=>{if(lost&&!replacement)replacement=veilRag(x.store.db,{key:Buffer.alloc(32,181)});return replacement&&kind!=='catalog'?replacement[kind](body):api(kind,body);});
  await x.click('veilProtect');await x.click('veilGenerate');lost=true;await x.click('veilReveal');
  assert.match(x.$('veilNotice').textContent,/Previous plaintext cannot be restored after key loss/);assert.equal(x.$('veilPlaintext').hidden,true);
  await x.click('veilFresh');await x.click('veilProtect');await x.click('veilGenerate');await x.click('veilReveal');
  assert.equal(x.$('veilPlaintext').hidden,false);assert.match(x.$('veilPlaintext').textContent,/Ada Example/);
});

test('persisted generation claim is unconfirmed and offers explicit recovery without automatic retry',async t=>{
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);return kind==='protect'?{...value,status:'generating'}:value;});
  await x.click('veilProtect');assert.match(x.$('veilReceipt').textContent,/Generation claimed.*result not confirmed/);
  assert.match(x.$('veilReceipt').textContent,/saved claim does not prove a child is still running/);assert.equal(x.$('veilGenerate').disabled,true);assert.equal(x.$('veilExport').disabled,true);
  assert.equal(x.calls.filter(call=>call.kind==='generate').length,0);await x.click('veilFresh');assert.match(x.$('veilNotice').textContent,/Fresh session command prepared/);
});
