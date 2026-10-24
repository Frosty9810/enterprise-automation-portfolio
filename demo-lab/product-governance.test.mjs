import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {productDesk,productExample,evaluateProduct,policyHash,canonical,hash} from './product-governance.mjs';
import {mountProductStudio} from './product-studio.mjs';
import {createLabServer,openStore} from './server.mjs';

test('original Python policy rejects invented numbers and validates real inputs',async()=>{
  const input=structuredClone(productExample);
  const good=await evaluateProduct(input);assert.equal(good.decision.action,'auto_publish');
  input.candidate.description+=' 999 customers.';
  const bad=await evaluateProduct(input);assert.equal(bad.decision.action,'blocked');assert.ok(bad.decision.reasons.includes('numeric_fact_introduced'));
  input.candidate.warranty_months=true;await assert.rejects(evaluateProduct(input),/whole number/);
});

test('durable review binds exact payload, source revision and policy; replay does not duplicate events',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'product-desk-')),file=join(directory,'desk.sqlite');
  let db=new DatabaseSync(file),desk=productDesk(db);
  const input=structuredClone(productExample),policy=policyHash(),decision=await evaluateProduct(input);
  try{
    const first=desk.save(input,decision,policy);
    assert.equal(desk.save(JSON.parse(JSON.stringify(input)),decision,policy).receiptId,first.receiptId);
    assert.equal(desk.audit().length,1);
    assert.throws(()=>desk.export(first.receiptId,policy),/review required/);
    desk.review(first.receiptId,'Demo reviewer',policy);
    desk.review(first.receiptId,'Demo reviewer',policy);
    assert.equal(desk.audit().length,2);
    assert.throws(()=>desk.review(first.receiptId,'Another reviewer',policy),/retained/);
    db.close();db=new DatabaseSync(file);desk=productDesk(db);
    assert.equal(desk.export(first.receiptId,policy).status,'reviewed_local_draft');
    assert.equal(desk.export(first.receiptId,policy).externalActions,0);
    assert.throws(()=>desk.export(first.receiptId,'b'.repeat(64)),/Policy changed/);
    const changed=structuredClone(input);changed.source.material='veneer';
    assert.throws(()=>desk.save(changed,decision,policy),/identity conflict/);
    changed.source.revision++;changed.candidate.material='veneer';
    const latest=desk.save(changed,await evaluateProduct(changed),policy);
    assert.throws(()=>desk.export(first.receiptId,policy),/Source changed/);
    assert.throws(()=>desk.save(input,decision,policy),/Stale/);
    assert.throws(()=>desk.export(latest.receiptId,policy),/review required/);
    let previous='GENESIS';for(const event of desk.audit()){assert.equal(event.previous,previous);assert.equal(event.eventHash,hash(canonical({kind:event.kind,receiptId:event.receiptId,detail:event.detail,previous})));previous=event.eventHash;}
  }finally{db.close();rmSync(file);rmdirSync(directory);}
});

test('changed candidate creates a new receipt and blocked drafts cannot be reviewed',async()=>{
  const db=new DatabaseSync(':memory:'),desk=productDesk(db),input=structuredClone(productExample),policy=policyHash();
  try{const first=desk.save(input,await evaluateProduct(input),policy);desk.review(first.receiptId,'Demo reviewer',policy);input.candidate.warranty_months=12;const second=desk.save(input,await evaluateProduct(input),policy);assert.notEqual(first.receiptId,second.receiptId);assert.throws(()=>desk.review(second.receiptId,'Demo reviewer',policy),/Blocked/);assert.equal(second.review,null);}finally{db.close();}
});

test('HTTP product flow uses the original policy, persists review and does not publish',async t=>{
  const db=openStore(':memory:'),server=createLabServer(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const base=`http://127.0.0.1:${server.address().port}`,post=(route,body)=>fetch(base+'/api/product/'+route,{method:'POST',headers:{'X-Demo-Client':'local-showcase','Content-Type':'application/json'},body:JSON.stringify(body)});
  const first=await(await post('evaluate',productExample)).json();assert.ok(first.receiptId);
  assert.equal((await post('export',{receiptId:first.receiptId})).status,400);
  assert.equal((await post('review',{receiptId:first.receiptId,reviewer:'Demo reviewer'})).status,200);
  const exported=await(await post('export',{receiptId:first.receiptId})).json();assert.equal(exported.externalActions,0);
  const invalid=structuredClone(productExample);invalid.candidate.warranty_months=true;assert.equal((await post('evaluate',invalid)).status,400);
  assert.equal((await(await fetch(base+'/api/product/audit')).json()).events.length,2);
  assert.ok((await fetch(base+'/product-governance')).headers.get('content-security-policy').includes("script-src 'self'"));
});

test('UI invalidates review on edits and ignores evaluations finishing after a draft changes',async()=>{
  const dom=new JSDOM(readFileSync(new URL('./product-studio.html',import.meta.url),'utf8')),d=dom.window.document;
  let release,exportCount=0;
  const receipt={receiptId:'a'.repeat(64),sourceRevision:7,policyHash:'b'.repeat(64),input:structuredClone(productExample),decision:{decision:{action:'auto_publish',reasons:[]}},review:null};
  const api=async(path)=>path.endsWith('example')?structuredClone(productExample):path.endsWith('audit')?{events:[]}:path.endsWith('evaluate')?new Promise(resolve=>{release=()=>resolve(structuredClone(receipt));}):path.endsWith('review')?{...receipt,review:{reviewer:'Demo reviewer'}}:{...receipt,review:{reviewer:'Demo reviewer'}};
  const ui=mountProductStudio(d,api,()=>exportCount++);await ui.init();
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  d.getElementById('candidateForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();
  d.getElementById('title').value='Changed';d.getElementById('title').dispatchEvent(new dom.window.Event('input'));release();await flush();
  assert.ok(d.getElementById('error').textContent.includes('changed during evaluation'));assert.equal(d.getElementById('approve').disabled,true);
  d.getElementById('candidateForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();release();await flush();
  d.getElementById('ack').checked=true;d.getElementById('ack').dispatchEvent(new dom.window.Event('change'));d.getElementById('approve').click();await flush();assert.equal(d.getElementById('export').disabled,false);
  d.getElementById('export').click();await flush();assert.equal(exportCount,1);
  d.getElementById('description').dispatchEvent(new dom.window.Event('input'));assert.equal(d.getElementById('ack').checked,false);assert.equal(d.getElementById('export').disabled,true);
  dom.window.close();
});
