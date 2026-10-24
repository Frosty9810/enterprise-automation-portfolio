import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { openChronosRank } from './chronosrank-core.mjs';
import { mountChronosRank } from './chronosrank-ui.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(condition){for(let i=0;i<200;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('ChronosRank UI did not settle.');}
const memory=(extra={})=>({commandId:'ui-seed',tenant:'acme',kind:'remember',memoryId:'ui-policy',entity:'ui-policy',text:'Synthetic invoice payment term is thirty days.',provenance:{sourceId:'ui-source',quote:'Synthetic invoice payment term is thirty days.'},recordedAt:'2026-11-01T09:00:00.000Z',validFrom:'2026-11-01T09:00:00.000Z',expiresAt:null,...extra});
async function setup(t,decorate=api=>api){
  const dom=new JSDOM(readFileSync(new URL('./chronosrank.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680/chronosrank'}),store=openChronosRank(),calls=[],exported=[],d=dom.window.document;
  const api=async(kind,body)=>{calls.push({kind,body:structuredClone(body)});return kind==='catalog'?store.catalog():kind==='verify-audit'?store.verifyAudit(body):store[kind](body);};
  const view=await mountChronosRank(d,decorate(api),value=>exported.push(value));
  t.after(()=>{dom.window.close();store.close();});
  const $=id=>d.getElementById(id),event=(id,type='input')=>$(id).dispatchEvent(new dom.window.Event(type));
  const click=async id=>{$(id).click();await until(()=>!$('chronosRetrieve').disabled);await tick();};
  const editEvent=value=>{$('chronosEvent').value=typeof value==='string'?value:JSON.stringify(value);event('chronosEvent');};
  const append=async value=>{editEvent(value);await click('chronosAppend');};
  const query=(extra={})=>{const values={entity:'ui-policy',query:'invoice payment term',asOf:'2026-11-02T09:00:00.000Z',threshold:100,limit:3,...extra};for(const [id,key]of[['chronosEntity','entity'],['chronosQuery','query'],['chronosAsOf','asOf'],['chronosThreshold','threshold'],['chronosLimit','limit']]){$(id).value=values[key];event(id);}return values;};
  const chooseCase=id=>{$('chronosCase').value=id;event('chronosCase','change');};
  const chooseTenant=id=>{$('chronosTenant').value=id;event('chronosTenant','change');};
  return {dom,d,$,store,calls,exported,view,event,click,editEvent,append,query,chooseCase,chooseTenant};
}

test('first-use retrieval cannot advance an empty tenant past the bundled timeline',async t=>{
  const x=await setup(t);await x.click('chronosRetrieve');
  assert.match(x.$('chronosNotice').textContent,/Append the synthetic timeline or one event first/);
  assert.equal(x.calls.some(call=>call.kind==='retrieve'),false);
  assert.equal(x.store.history({tenant:'acme'}).knowledgeWatermark,null);
  assert.equal(x.store.history({tenant:'acme'}).receipts.length,0);
  await x.click('chronosLoad');await x.click('chronosRetrieve');
  assert.match(x.$('chronosReceipt').textContent,/Valid memories selected/);
  assert.equal(x.store.history({tenant:'acme'}).receipts.length,1);
});

test('catalog loading performs no writes and explicit timeline commands replay without duplicate events',async t=>{
  const x=await setup(t);
  assert.deepEqual([...x.$('chronosTenant').options].map(option=>option.value),['acme','beta']);
  assert.equal(x.calls.length,1);assert.equal(x.store.history({tenant:'acme'}).events.length,0);
  assert.equal(x.$('chronosExport').disabled,true);
  await x.click('chronosLoad');
  const expected=x.store.catalog().example.events.filter(event=>event.tenant==='acme').length;
  assert.equal(x.store.history({tenant:'acme'}).events.length,expected);
  assert.match(x.$('chronosTimeline').textContent,/delivery-v1/);
  await x.click('chronosLoad');assert.equal(x.store.history({tenant:'acme'}).events.length,expected);
  assert.match(x.$('chronosNotice').textContent,/commands confirmed/);
});

test('an interrupted timeline batch reports partial progress and safe retry confirms all saved commands',async t=>{
  let seen=0,fail=true;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='append'&&++seen===2&&fail){fail=false;throw Error('Synthetic batch response interrupted.');}return value;});
  await x.click('chronosLoad');assert.equal(x.store.history({tenant:'acme'}).events.length,2);
  assert.match(x.$('chronosNotice').textContent,/response interrupted/);assert.doesNotMatch(x.$('chronosNotice').textContent,/commands confirmed/);
  await x.click('chronosRefresh');assert.match(x.$('chronosTimeline').textContent,/Memory events · 2/);
  await x.click('chronosLoad');assert.equal(x.store.history({tenant:'acme'}).events.length,5);
});

test('switching tenant during a timeline batch stops further old-tenant appends',async t=>{
  let release,seen=0;
  const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='append'&&++seen===2)return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  x.$('chronosLoad').click();await until(()=>Boolean(release));x.chooseTenant('beta');release();await until(()=>!x.$('chronosRetrieve').disabled);
  assert.equal(x.store.history({tenant:'acme'}).events.length,2);assert.equal(x.store.history({tenant:'beta'}).events.length,0);
  assert.equal(x.$('chronosTenant').value,'beta');assert.doesNotMatch(x.$('chronosNotice').textContent,/commands confirmed/);
  await x.click('chronosLoad');assert.equal(x.store.history({tenant:'beta'}).events.length,1);
});

test('retrieval displays real provenance and lexical scores then rechecks the saved receipt before export',async t=>{
  const x=await setup(t);await x.append(memory());x.query();await x.click('chronosRetrieve');
  const receipt=x.store.history({tenant:'acme'}).receipts[0];
  assert.equal(receipt.status,'retrieved');assert.match(x.$('chronosReceipt').textContent,/Valid memories selected/);
  assert.match(x.$('chronosReceipt').textContent,/Lexical token overlap: 100%/);
  assert.match(x.$('chronosReceipt').textContent,/Source ui-source/);
  assert.equal(x.$('chronosReceipt').querySelector('blockquote').textContent,memory().provenance.quote);
  assert.equal(x.$('chronosFeedbackPanel').hidden,false);assert.equal(x.$('chronosFeedback').disabled,true);
  await x.click('chronosExport');assert.equal(x.exported.length,1);assert.equal(x.exported[0].id,receipt.id);
  assert.deepEqual(x.calls.slice(-2).map(call=>call.kind),['receipt','verify-audit']);
  await x.click('chronosVerify');assert.match(x.$('chronosVerification').textContent,/audit chain valid/);
  assert.match(x.d.body.textContent,/not confidence/);assert.match(x.d.body.textContent,/no trained reranker/);
});

test('as-of cases show scheduled replacement, no predecessor revival and ambiguity abstention',async t=>{
  const x=await setup(t);await x.click('chronosLoad');
  for(const id of ['before-change','replacement-boundary','no-revival','expiry-boundary','ambiguous','below-threshold']){
    x.chooseCase(id);const fixture=x.store.catalog().example.queries.find(query=>query.id===id);await x.click('chronosRetrieve');
    const receipt=x.store.history({tenant:'acme'}).receipts.find(row=>row.query===fixture.request.query&&row.asOf===fixture.request.asOf);
    assert.equal(receipt.status,fixture.expected.status);
    assert.match(x.$('chronosReceipt').textContent,fixture.expected.status==='retrieved'?/Valid memories selected/:/Abstained from retrieval/);
    if(id==='replacement-boundary')assert.match(x.$('chronosReceipt').textContent,/superseded/);
    if(id==='no-revival')assert.equal(x.$('chronosReceipt').querySelectorAll('.memory-card').length,0);
  }
});

test('feedback is bound to the exact receipt and unchanged feedback commands replay once',async t=>{
  const x=await setup(t);await x.append(memory());x.query();await x.click('chronosRetrieve');
  x.$('chronosFeedbackNote').value='The source and date answer this synthetic question.';x.event('chronosFeedbackNote');
  assert.equal(x.$('chronosFeedback').disabled,false);await x.click('chronosFeedback');await x.click('chronosFeedback');
  const history=x.store.history({tenant:'acme'});assert.equal(history.feedback.length,1);
  assert.equal(history.feedback[0].receiptId,history.receipts[0].id);
  assert.match(x.$('chronosFeedbackHistory').textContent,/source and date/);
  x.$('chronosFeedbackNote').value='x'.repeat(501);x.event('chronosFeedbackNote');assert.equal(x.$('chronosFeedback').disabled,true);
});

test('changing tenant clears current receipt, feedback and visible history before reading its separate ledger',async t=>{
  const x=await setup(t);await x.click('chronosLoad');await x.click('chronosRetrieve');assert.equal(x.$('chronosExport').disabled,false);
  x.chooseTenant('beta');assert.equal(x.$('chronosExport').disabled,true);assert.equal(x.$('chronosFeedbackPanel').hidden,true);
  assert.doesNotMatch(x.$('chronosTimeline').textContent,/delivery-v1/);assert.equal(x.$('chronosCase').options.length,1);
  await x.click('chronosLoad');await x.click('chronosRetrieve');
  assert.match(x.$('chronosReceipt').textContent,/Tenant beta/);assert.match(x.$('chronosReceipt').textContent,/beta-delivery/);
  assert.doesNotMatch(x.$('chronosTimeline').textContent,/delivery-v1/);
  assert.equal(x.store.history({tenant:'acme'}).receipts.length,1);assert.equal(x.store.history({tenant:'beta'}).receipts.length,1);
});

test('the visible ingestion watermark advances with retrieval and rejects later backdated events',async t=>{
  const x=await setup(t);await x.append(memory());assert.match(x.$('chronosWatermark').textContent,/2026-11-01T09:00:00.000Z/);
  x.query();await x.click('chronosRetrieve');assert.match(x.$('chronosWatermark').textContent,/2026-11-02T09:00:00.000Z/);
  await x.append(memory({commandId:'backdated-command',memoryId:'backdated-memory'}));assert.match(x.$('chronosNotice').textContent,/watermark/i);
  assert.equal(x.store.history({tenant:'acme'}).events.length,1);
  await x.append(memory({commandId:'current-command',memoryId:'current-memory',recordedAt:'2026-11-02T09:00:00.000Z',validFrom:'2026-11-02T09:00:00.000Z'}));
  assert.equal(x.store.history({tenant:'acme'}).events.length,2);x.chooseTenant('beta');assert.doesNotMatch(x.$('chronosWatermark').textContent,/2026-11-02/);
});

test('malformed events, mismatched tenant and invalid retrieval fields recover without saving false evidence',async t=>{
  const x=await setup(t);x.editEvent('{');await x.click('chronosAppend');assert.match(x.$('chronosNotice').textContent,/JSON|property name/i);
  x.editEvent(memory({tenant:'beta'}));await x.click('chronosAppend');assert.match(x.$('chronosNotice').textContent,/tenant must match/);
  assert.equal(x.store.history({tenant:'acme'}).events.length,0);
  await x.append(memory());x.query({threshold:0});await x.click('chronosRetrieve');assert.match(x.$('chronosNotice').textContent,/threshold/i);
  assert.equal(x.$('chronosExport').disabled,true);assert.equal(x.store.history({tenant:'acme'}).receipts.length,0);
  x.query();await x.click('chronosRetrieve');assert.match(x.$('chronosReceipt').textContent,/Valid memories selected/);
});

test('a late retrieval response cannot overwrite edited fields and the saved result remains inspectable in history',async t=>{
  let release;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='retrieve')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  await x.append(memory());x.query();x.$('chronosRetrieve').click();await until(()=>Boolean(release));
  assert.equal(x.$('chronosAppend').disabled,true);assert.equal(x.$('chronosExport').disabled,true);
  x.$('chronosQuery').value='changed request';x.event('chronosQuery');release();await until(()=>!x.$('chronosRetrieve').disabled);
  assert.match(x.$('chronosReceipt').textContent,/fields edited/);assert.equal(x.$('chronosExport').disabled,true);
  await x.click('chronosRefresh');x.$('chronosHistory').querySelector('button').click();await until(()=>!x.$('chronosRetrieve').disabled);
  assert.match(x.$('chronosReceipt').textContent,/Valid memories selected/);
});

test('switching tenant during an in-flight request suppresses its old response and permits recovery',async t=>{
  let release;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='retrieve')return new Promise(resolve=>{release=()=>resolve(value);});return value;});
  await x.append(memory());x.query();x.$('chronosRetrieve').click();await until(()=>Boolean(release));x.chooseTenant('beta');release();await until(()=>!x.$('chronosRetrieve').disabled);
  assert.equal(x.$('chronosTenant').value,'beta');assert.doesNotMatch(x.$('chronosReceipt').textContent,/ui-source/);
  assert.equal(x.$('chronosExport').disabled,true);await x.click('chronosRefresh');assert.match(x.$('chronosHistory').textContent,/No retrieval receipts/);
});

test('lost append response recovers the committed event and retries its unchanged command without a duplicate',async t=>{
  let fail=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='append'&&fail){fail=false;throw Error('Simulated lost response after local commit.');}return value;});
  await x.append(memory());assert.match(x.$('chronosNotice').textContent,/lost response/);assert.equal(x.$('chronosExport').disabled,true);
  assert.equal(x.store.history({tenant:'acme'}).events.length,1);await x.click('chronosRefresh');assert.match(x.$('chronosTimeline').textContent,/ui-policy/);
  await x.click('chronosAppend');assert.equal(x.store.history({tenant:'acme'}).events.length,1);
});

test('a lost retrieval response reuses the unchanged request identity and recovers one saved receipt',async t=>{
  let fail=true;const x=await setup(t,api=>async(kind,body)=>{const value=await api(kind,body);if(kind==='retrieve'&&fail){fail=false;throw Error('Retrieval response interrupted after commit.');}return value;});
  await x.append(memory());x.query();const requestId=x.$('chronosRequestId').textContent;await x.click('chronosRetrieve');
  assert.equal(x.$('chronosExport').disabled,true);assert.equal(x.$('chronosRequestId').textContent,requestId);
  await x.click('chronosRetrieve');assert.match(x.$('chronosReceipt').textContent,/Saved request replayed/);
  assert.equal(x.store.history({tenant:'acme'}).receipts.length,1);
});

test('export rechecks source drift and refuses to label an old memory snapshot current',async t=>{
  const x=await setup(t);await x.append(memory());x.query();await x.click('chronosRetrieve');
  x.store.append(memory({commandId:'later-command',memoryId:'later-memory',recordedAt:'2026-11-03T09:00:00.000Z',validFrom:'2026-11-03T09:00:00.000Z'}));
  await x.click('chronosExport');assert.equal(x.exported.length,0);assert.equal(x.$('chronosExport').disabled,true);
  assert.match(x.$('chronosReceipt').textContent,/Historical snapshot/);assert.match(x.$('chronosNotice').textContent,/ledger changed/);
  assert.equal(x.$('chronosFeedbackPanel').hidden,true);
  const oldId=x.$('chronosRequestId').textContent;
  await x.click('chronosRetrieve');assert.equal(x.$('chronosRequestId').textContent,oldId);assert.match(x.$('chronosReceipt').textContent,/Historical snapshot/);
  await x.click('chronosNewRequest');assert.notEqual(x.$('chronosRequestId').textContent,oldId);
  assert.equal(x.$('chronosAsOf').value,'2026-11-02T09:00:00.000Z');assert.equal(x.$('chronosQuery').value,'invoice payment term');
  await x.click('chronosRetrieve');assert.match(x.$('chronosReceipt').textContent,/Current memory snapshot/);assert.equal(x.$('chronosExport').disabled,false);
  await x.click('chronosExport');assert.equal(x.exported.length,1);assert.equal(x.store.history({tenant:'acme'}).receipts.length,2);
});

test('memory text and exact provenance render as inert text even when they contain markup',async t=>{
  const x=await setup(t),text='Synthetic invoice <img src=x onerror=alert(1)> payment term.';
  await x.append(memory({text,provenance:{sourceId:'ui-source',quote:text}}));x.query();await x.click('chronosRetrieve');
  assert.equal(x.$('chronosReceipt').querySelectorAll('img,script,iframe').length,0);assert.equal(x.$('chronosTimeline').querySelectorAll('img,script,iframe').length,0);
  assert.match(x.$('chronosReceipt').textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(x.$('chronosReceipt').querySelector('blockquote').textContent,text);
});

test('failed audit verification prevents export and a later successful verification recovers',async t=>{
  let fail=true;const x=await setup(t,api=>async(kind,body)=>kind==='verify-audit'&&fail?{valid:false,eventCount:0,entryCount:0,head:null}:api(kind,body));
  await x.append(memory());x.query();await x.click('chronosRetrieve');await x.click('chronosExport');
  assert.equal(x.exported.length,0);assert.match(x.$('chronosNotice').textContent,/audit chain failed/);
  fail=false;await x.click('chronosExport');assert.equal(x.exported.length,1);
});

test('catalog failure leaves write and retrieval actions disabled with the actionable failure visible',async t=>{
  const x=await setup(t,()=>async()=>{throw Error('Local catalog unavailable.');});
  assert.match(x.$('chronosNotice').textContent,/catalog unavailable/);
  for(const id of ['chronosLoad','chronosAppend','chronosRetrieve','chronosRefresh','chronosExport'])assert.equal(x.$(id).disabled,true);
});
