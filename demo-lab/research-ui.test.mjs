import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { openAtlasGraph } from './atlasgraph-core.mjs';
import { mountResearch } from './research-ui.mjs';
import { portfolioInventory } from './project-inventory.mjs';
const fixture = JSON.parse(readFileSync(new URL('./atlasgraph-example.json', import.meta.url),'utf8'));
const flush = () => new Promise(resolve=>setImmediate(resolve));
async function until(fn) { for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Research view did not settle'); }
async function setup(t, override) {
  const dom = new JSDOM(readFileSync(new URL('./research.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680/research?project=AtlasGraph'});
  const store = openAtlasGraph(), exported=[];
  const api = async(kind,body)=>kind==='catalog'?{projects:portfolioInventory().filter(x=>x.collection==='research')}:kind==='example'?structuredClone(fixture):kind==='review-error'?store.reviewError(body):store[kind](body);
  const d=dom.window.document, view=await mountResearch(d,override?override(api):api,value=>exported.push(value));
  t.after(()=>{dom.window.close();store.close();});
  const click = async id=>{d.getElementById(id).click();await until(()=>!d.getElementById('compile').disabled);};
  return {dom,d,store,api,view,click,exported};
}
test('research view compiles real graph, renders cited path and refreshes saved history before export',async t=>{
  const x=await setup(t);await x.click('compile');assert.match(x.d.getElementById('compileState').textContent,/Compiled snapshot/);
  await x.click('answer');assert.match(x.d.getElementById('researchResult').textContent,/Required structured evidence collected/);
  assert.equal(x.d.querySelectorAll('.citation').length,3);assert.match(x.d.getElementById('researchHistory').textContent,/supported/);
  await x.click('exportResearch');assert.equal(x.exported.length,1);assert.equal(x.exported[0].stale,false);
  x.d.getElementById('researchSearch').value='customs';await x.click('searchResearch');assert.ok(x.d.querySelectorAll('#searchResults button').length>=2);
  x.d.querySelector('#searchResults button').click();await until(()=>!x.d.getElementById('compile').disabled);assert.match(x.d.getElementById('pageEvidence').textContent,/Compiled page/);
});
test('missing evidence records a reviewable Error Book entry and a note is required to resolve it',async t=>{
  const x=await setup(t);await x.click('compile');const answer={...fixture.answer,requestId:'ui-missing',requiredClaims:['notPresent']};
  x.d.getElementById('answerInput').value=JSON.stringify(answer);x.d.getElementById('answerInput').dispatchEvent(new x.dom.window.Event('input'));await x.click('answer');
  assert.match(x.d.getElementById('researchResult').textContent,/Abstained/);assert.equal(x.d.querySelectorAll('.error-entry').length,1);
  x.d.querySelector('.error-entry button').click();assert.match(x.d.getElementById('researchNotice').textContent,/Add a review note/);
  x.d.querySelector('.error-entry input').value='Add the missing reviewed policy in a new source version.';
  x.d.querySelector('.error-entry button').click();await until(()=>!x.d.getElementById('compile').disabled);
  assert.match(x.d.getElementById('researchErrors').textContent,/accepted/);assert.equal(x.d.querySelectorAll('.error-entry button').length,0);
});
test('a changed source snapshot blocks export of a previously current receipt',async t=>{
  const x=await setup(t);await x.click('compile');await x.click('answer');
  const next=structuredClone(fixture.compile);next.sources[0].version='ui-v2';next.sources[0].title+=' revised';x.store.compile(next);
  await x.click('exportResearch');assert.equal(x.exported.length,0);assert.equal(x.d.getElementById('exportResearch').disabled,true);
  assert.match(x.d.getElementById('researchNotice').textContent,/Sources changed/);assert.match(x.d.getElementById('researchResult').textContent,/Stale source snapshot/);
});
test('editing inputs discards a pending answer and malformed source JSON cannot retain export authority',async t=>{
  let release;const x=await setup(t,api=>async(kind,body)=>kind==='answer'?new Promise(resolve=>{release=()=>resolve(api(kind,body));}):api(kind,body));
  await x.click('compile');x.d.getElementById('answer').click();await until(()=>Boolean(release));
  x.d.getElementById('answerInput').value='{}';x.d.getElementById('answerInput').dispatchEvent(new x.dom.window.Event('input'));release();await until(()=>!x.d.getElementById('compile').disabled);
  assert.equal(x.d.getElementById('exportResearch').disabled,true);assert.match(x.d.getElementById('researchResult').textContent,/Question edited/);
  x.d.getElementById('compileInput').value='{';x.d.getElementById('compileInput').dispatchEvent(new x.dom.window.Event('input'));await x.click('compile');
  assert.equal(x.d.getElementById('answer').disabled,true);assert.equal(x.d.getElementById('exportResearch').disabled,true);
  await x.click('resetResearch');assert.equal(JSON.parse(x.d.getElementById('compileInput').value).tenant,fixture.compile.tenant);
});
test('blueprint-only projects hide execution controls and unknown projects do not impersonate AtlasGraph',async t=>{
  const x=await setup(t);for(const id of ['DocksideSLM','VeilRAG']){x.view.select(id);assert.equal(x.d.getElementById('researchWorkbench').hidden,true);assert.match(x.d.getElementById('researchNotice').textContent,/still pending/);}
  x.view.select('TrustGate');assert.equal(x.d.getElementById('researchWorkbench').hidden,true);assert.equal(x.d.getElementById('researchBuild').hidden,false);assert.equal(x.d.getElementById('researchBuild').getAttribute('href'),'/trustgate?project=TrustGate');assert.match(x.d.getElementById('researchNotice').textContent,/partial local tool gateway/);
  x.view.select('ChronosRank');assert.equal(x.d.getElementById('researchWorkbench').hidden,true);assert.equal(x.d.getElementById('researchBuild').hidden,false);assert.equal(x.d.getElementById('researchBuild').getAttribute('href'),'/chronosrank?project=ChronosRank');assert.match(x.d.getElementById('researchBuild').textContent,/ChronosRank/);assert.match(x.d.getElementById('researchNotice').textContent,/partial local memory build/);
  x.view.select('__proto__');assert.equal(x.d.getElementById('researchWorkbench').hidden,true);assert.equal(x.d.getElementById('researchTitle').textContent,'Unknown research project');
});
