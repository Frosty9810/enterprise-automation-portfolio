import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer, openStore, runDomain } from './server.mjs';
import { maintenance, commitments, extraProjects } from './extra-scenarios.mjs';

test('maintenance emergency rule overrides routine access routing', () => {
  assert.equal(maintenance({description:'Gas leak in boiler room',accessApproved:false}).queue,'human_emergency_operator');
  assert.equal(maintenance({description:'Broken cupboard',accessApproved:false}).queue,'access_confirmation');
  assert.equal(maintenance({description:'Broken cupboard',accessApproved:true}).queue,'vendor_review');
  assert.equal(maintenance({description:'Fire',accessApproved:true}).dispatchAllowed,false);
});
test('commitment dedupe and sharing rules are explicit', () => {
  const result=commitments(extraProjects[1].fixture);
  assert.equal(result.retainedCount,1);
  assert.equal(result.items[0].status,'needs_owner_review');
  assert.equal(result.externalActions,0);
  assert.throws(()=>commitments({items:[{}]}));
  assert.throws(()=>commitments({items:[]}));
  const first=extraProjects[1].fixture.items[0];
  assert.throws(()=>commitments({items:[first,{...first,owner:'Different owner'}]}),/Conflicting/);
});
test('new scenario domain entry points execute source', async()=>{
  for(const id of ['PM-01','EA-01','IMP-01']){
    const result=await runDomain(id,{registerPath:':memory:'});assert.equal(result.status,'passed');assert.equal(result.sourceHash.length,64);assert.ok(result.output.length>20);
  }
});

test('GHL simulator validates, updates, deduplicates and reports faults over HTTP', async t=>{
  const db=openStore(':memory:');
  const server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
  const headers={'X-Demo-Client':'local-showcase','Authorization':'Bearer LOCAL_DEMO_ONLY','Version':'v3','Content-Type':'application/json'};
  const body={locationId:'DEMO_LOCATION',email:'demo@example.com',firstName:'First'};
  const post=(value=body,extra={})=>fetch(base+'/contacts/upsert',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(value)});
  const first=await(await post()).json();assert.equal(first.new,true);
  const again=await(await post({...body,firstName:'Updated'})).json();assert.equal(again.new,false);assert.equal(first.contact.id,again.contact.id);
  assert.equal(again.contact.firstName,'Updated');
  await Promise.all(Array.from({length:20},()=>post()));
  assert.equal(db.prepare('SELECT count(*) AS total FROM contacts').get().total,1);
  assert.equal((await post({...body,locationId:'OTHER'})).status,422);
  assert.equal((await post({...body,email:'broken'})).status,422);
  assert.equal((await post(body,{Authorization:'wrong'})).status,401);
  assert.equal((await post(body,{Version:'wrong'})).status,400);
  const limited=await post(body,{'X-Demo-Fault':'rate-limit'});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'1');
  assert.equal((await post(body,{'Origin':'https://unrelated.example'})).status,403);
  assert.equal((await post(body,{'X-Demo-Client':''})).status,403);
  const uncertain={...body,email:'uncertain@example.com'};
  await assert.rejects(fetch(base+'/contacts/upsert',{method:'POST',headers:{...headers,'X-Demo-Fault':'timeout-after-write'},body:JSON.stringify(uncertain),signal:AbortSignal.timeout(100)}));
  const reconciled=await(await post(uncertain)).json();assert.equal(reconciled.new,false);
  assert.equal(db.prepare('SELECT count(*) AS total FROM contacts').get().total,2);
});

test('execution activity reports observed stages and persists failed and successful runs', async t => {
  const db = openStore(':memory:');
  let release;
  let fail = true;
  const server = createLabServer(db, async (id, progress) => {
    progress('importing', 'Import started');
    await new Promise(resolve => { release = resolve; });
    progress('executing', 'Execution started');
    if (fail) throw new Error('Deliberate test failure');
    return {projectId:id,status:'passed',contactId:'test-contact'};
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
  const post=()=>fetch(base+'/api/run/PM-01',{method:'POST',headers:{'X-Demo-Client':'local-showcase'},body:'{}'});
  async function waitStarted(){
    for(let i=0;i<100;i++){
      const state=await(await fetch(base+'/api/activity')).json();
      if(state.busy && release)return state;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    throw new Error('Execution did not start');
  }
  const pending=post();
  const active=await waitStarted();
  assert.equal(active.activity.projectId,'PM-01');
  assert.deepEqual(active.activity.events.map(e=>e.stage),['importing']);
  assert.equal((await post()).status,409);
  release();
  assert.equal((await pending).status,500);
  let state=await(await fetch(base+'/api/activity')).json();
  assert.equal(state.busy,false);
  assert.equal(state.activity.status,'failed');
  assert.equal(state.activity.events.at(-1).stage,'failed');
  fail=false;release=null;
  const next=post();await waitStarted();release();
  const response=await next;assert.equal(response.status,200);
  const result=await response.json();assert.ok(result.wallDurationMs>=0);
  const history=await(await fetch(base+'/api/runs')).json();
  assert.equal(history.runs.length,2);
  assert.equal(history.runs[0].status,'passed');
  assert.equal(history.runs[1].status,'failed');
  assert.equal(history.runs[0].evidence.timeline.at(-1).stage,'saving');
});

test('showcase exposes source-backed inventories and only whitelisted downloads', async t => {
  const { projects } = await import('./catalog.mjs');
  const db=openStore(':memory:');
  const server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
  for(const p of projects){
    const response=await fetch(base+'/api/showcase/'+p.id);
    assert.equal(response.status,200,p.id);
    const profile=await response.json();
    assert.ok(profile.tools.some(tool=>tool.name==='n8n'));
    assert.ok(profile.artifacts.some(file=>file.key==='source'));
    assert.ok(profile.artifacts.every(file=>!('path' in file)));
    for(const file of profile.artifacts){
      const download=await fetch(base+file.url);
      assert.equal(download.status,200,file.url);
      assert.match(download.headers.get('content-disposition'),/^attachment;/);
      assert.equal(download.headers.get('x-content-type-options'),'nosniff');
      assert.ok((await download.text()).length>0);
    }
  }
  for(const path of ['/api/showcase/UNKNOWN','/api/artifacts/RE-01/.env','/api/artifacts/UNKNOWN/source','/api/artifacts/RE-01/source/extra','/api/artifacts/RE-01/%2e%2e%2fserver.mjs']){
    assert.equal((await fetch(base+path)).status,404,path);
  }
});

test('roadmap projects execute normal and adverse expected-output cases', async()=>{
  const { suites,evaluateRoadmap,construction }=await import('./roadmap-scenarios.mjs');
  for(const id of Object.keys(suites)){
    const result=evaluateRoadmap(id);
    assert.equal(result.evaluation.passed,6,id);
    const domain=await runDomain(id,{registerPath:':memory:'});
    assert.equal(JSON.parse(domain.output).evaluation.passed,6);
    assert.equal(domain.sourceHash.length,64);
  }
  const input=structuredClone(suites['CON-01'].cases[0].input);
  const first=construction(input);
  assert.equal(first.ledger.length,2);
  assert.equal(first.ledger[1].previous,first.ledger[0].hash);
  input.approvals[0].amountCents++;
  assert.notEqual(construction(input).ledgerHead,first.ledgerHead);
  input.approvals[1].actor=input.approvals[0].actor;
  assert.equal(construction(input).queue,'exception_review');
});

test('every project passes the shared adversarial handoff matrix', async()=>{
  const {projects}=await import('./catalog.mjs');
  const {evaluateHandoff}=await import('./acceptance.mjs');
  for(const p of projects){const result=evaluateHandoff(p.id);assert.equal(result.passed,result.total,p.id);assert.equal(result.total,7)}
});

test('separate regression cases pass and never imply blind holdout coverage', async()=>{
  const {evaluateRegression,regressionCases}=await import('./regression-cases.mjs');
  assert.equal(regressionCases.length,12);
  for(const id of ['CON-01','MED-01','LEGAL-01','INS-01']){
    const report=evaluateRegression(id);assert.equal(report.total,3);assert.equal(report.passed,3);assert.match(report.scope,/Not a blind holdout/);
  }
  assert.equal(evaluateRegression('ECOM-01').total,0);
});

test('external dashboard assets and workflow architecture match the source',async t=>{
  const db=openStore(':memory:');const server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
  const home=await fetch(base);const html=await home.text();
  assert.match(html,/src="\/studio.js"/);assert.doesNotMatch(html,/<script>\s*const/);
  assert.match(home.headers.get('content-security-policy'),/script-src 'self';/);
  assert.equal((await fetch(base+'/studio.js')).status,200);
  assert.equal((await fetch(base+'/studio.css')).status,200);
  const profile=await(await fetch(base+'/api/showcase/CON-01')).json();
  const workflow=await(await fetch(base+'/api/artifacts/CON-01/demo-workflow')).json();
  assert.deepEqual(profile.architecture.nodes.map(n=>n.name),workflow.nodes.map(n=>n.name));
  assert.equal(profile.architecture.edges.length,4);
  assert.equal(profile.regression.passed,3);
});
