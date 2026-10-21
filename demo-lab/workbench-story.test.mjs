import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {workbenchProjects} from './workbench-core.mjs';
import {scenarioInput,traceRows} from './workbench-story.mjs';
import {mountWorkbench} from './workbench-ui.mjs';
test('claim scenarios isolate approval, tenant and changed-claim outcomes without mutating fixtures',()=>{
 const p=workbenchProjects[0],original=JSON.stringify(p.fixture);
 for(const [key,status,reason] of [['approved','verified-excerpt',''],['changed','review','semantic review'],['unapproved','review','not approved'],['tenant','review','another tenant']]){
  const x=scenarioInput(p.id,key,p.fixture),r=p.run(x);
  assert.equal(r.decisions.length,1);assert.equal(r.decisions[0].status,status);
  assert.ok(r.decisions[0].reasons.join().includes(reason));
  assert.equal(traceRows(p.id,x,r)[0].status,status);
  if(key==='changed')assert.match(traceRows(p.id,x,r)[0].input,/24 cookies.*Cited quote: Each box contains 12 cookies/);
 }
 assert.equal(JSON.stringify(p.fixture),original);
 assert.throws(()=>scenarioInput(p.id,'invented',p.fixture),/Unknown/);
});
test('action scenarios distinguish a confirmed non-write from an uncertain committed write',()=>{
 const p=workbenchProjects[1];
 for(const [key,statuses,total] of [['success',['completed','duplicate'],12],['timeout-before',['retryable','completed'],12],['timeout-after',['uncertain','reconcile'],12],['conflict',['completed','conflict'],12],['unapproved',['blocked','blocked'],0]]){
  const x=scenarioInput(p.id,key,p.fixture),r=p.run(x);
  assert.deepEqual(r.decisions.map(d=>d.status),statuses);
  assert.equal(r.decisions.at(-1).simulatorTotal,total);
  assert.match(traceRows(p.id,x,r).at(-1).output,new RegExp(`total: ${total} units`));
 }
});
test('scenario changes invalidate visible results and exports; input edits reset scenario label',()=>{
 const dom=new JSDOM(readFileSync(new URL('./workbench.html',import.meta.url),'utf8'),{url:'http://localhost/engineering'}),d=dom.window.document;
 try{
  mountWorkbench(d);const run=d.getElementById('run');run.click();assert.equal(d.getElementById('export').disabled,false);
  assert.equal(d.querySelector('#scenario option[value=""]').disabled,true);
  const choose=d.getElementById('scenario');choose.value='unapproved';choose.dispatchEvent(new dom.window.Event('change'));
  assert.equal(d.getElementById('export').disabled,true);assert.equal(d.querySelector('.decision-trace'),null);
  run.click();assert.match(d.querySelector('.decision-trace').textContent,/Source is not approved/);
  d.getElementById('input').dispatchEvent(new dom.window.Event('input'));assert.equal(d.getElementById('scenario').value,'');
  d.querySelector('[data-project="ENG-02"]').click();assert.equal(d.getElementById('export').disabled,true);
  assert.match(d.getElementById('engineering-notes').textContent,/durably/);
 }finally{dom.window.close();}
});
