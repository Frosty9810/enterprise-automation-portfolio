import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {JSDOM} from 'jsdom';
import {mountSalesforce} from './salesforce-ui.mjs';
import {salesforceDesk,salesforceScope} from './salesforce-core.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
test('late record refresh cannot resurrect prior scenario cards or counters',async()=>{
 const dom=new JSDOM(readFileSync(new URL('./salesforce.html',import.meta.url),'utf8')),d=dom.window.document;
 const db=new DatabaseSync(':memory:'),desk=salesforceDesk(db);let release;
 const api=async(kind,body)=>{
  if(kind==='config')return {scope:salesforceScope};
  if(kind==='start')return desk.start(body.scenario);
  if(kind==='full-run')return desk.fullRun();
  if(kind==='evaluate')return desk.submit(body.runId,desk.event(body.runId,body.recordId));
  if(kind==='state')return new Promise(resolve=>{const captured=desk.state(body.runId);release=()=>resolve(captured);});
  throw Error('Unexpected action');
 };
 try{
  await mountSalesforce(d,api,()=>{});d.getElementById('full').click();await flush();
  assert.equal(d.getElementById('confirmed').textContent,'3');
  d.getElementById('evaluate').click();await flush();assert.equal(typeof release,'function');
  d.getElementById('scenario').value='field_denied';d.getElementById('scenario').dispatchEvent(new dom.window.Event('change'));
  assert.equal(d.getElementById('confirmed').textContent,'0');assert.equal(d.getElementById('run-id').textContent,'');
  release();await flush();assert.equal(d.querySelectorAll('.record').length,0);
  assert.equal(d.getElementById('confirmed').textContent,'0');assert.equal(d.getElementById('review').disabled,true);assert.equal(d.getElementById('export').disabled,true);
 }finally{dom.window.close();db.close();}
});
