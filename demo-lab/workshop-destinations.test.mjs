import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {createLabServer,openStore} from './server.mjs';
import {passport,projectPassports} from './project-passports.mjs';
import {portfolioInventory} from './project-inventory.mjs';
import {mountWorkshop} from './workshop.mjs';
import {mountMaintenance} from './maintenance-ui.mjs';
import {mountConstruction} from './construction-ui.mjs';
import {mountReferral} from './referral-ui.mjs';
import {mountLegal} from './legal-ui.mjs';
import {mountInsurance} from './insurance-ui.mjs';
import {mountExecutive} from './executive-ui.mjs';

const html=name=>readFileSync(new URL(name,import.meta.url),'utf8');
async function until(check){for(let i=0;i<300;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Destination did not finish loading.');}
async function setup(t){
  const db=openStore(':memory:'),server=createLabServer(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  return 'http://127.0.0.1:'+server.address().port;
}
const desks=new Map([
  ['PM-01',{path:'/maintenance',api:'/api/maintenance/',mount:mountMaintenance,clock:'pmClock',select:'pmScenario'}],
  ['CON-01',{path:'/construction',api:'/api/construction/',mount:mountConstruction,clock:'conClock',select:'conContext'}],
  ['MED-01',{path:'/referral',api:'/api/referral/',mount:mountReferral,clock:'refClock',select:'refFixture'}],
  ['LEGAL-01',{path:'/industry/legal',api:'/api/industry/legal/',mount:mountLegal,clock:'legalClock',select:'legalSource'}],
  ['INS-01',{path:'/industry/insurance',api:'/api/industry/insurance/',mount:mountInsurance,clock:'insClock',select:'insEvent'}],
  ['EA-01',{path:'/industry/executive',api:'/api/industry/executive/',mount:mountExecutive,clock:'exClock',select:'exSource'}],
]);
async function openStudio(base,target){
  const response=await fetch(base+target);assert.equal(response.status,200);
  const dom=new JSDOM(await response.text(),{url:base+target,runScripts:'outside-only'});
  dom.window.fetch=(path,options)=>fetch(base+path,options);
  dom.window.eval(html('./studio.js'));
  const requested=new URL(base+target).searchParams.get('project');
  const expected=projectPassports().some(p=>p.id===requested)?requested:'ECOM-01';
  await until(()=>/Choose a project|Unknown project link/.test(dom.window.document.getElementById('status').textContent)&&dom.window.document.querySelector('#toolContent a[href="/api/artifacts/'+expected+'/source"]'));
  return dom;
}

test('every workshop domain link opens its own current executable destination, including six industry desks',async t=>{
  const base=await setup(t),inventory=portfolioInventory().filter(row=>row.collection==='automation');
  const workshop=new JSDOM(html('./workshop.html'),{url:base+'/workshop'});
  t.after(()=>workshop.window.close());
  await mountWorkshop(workshop.window.document,(path,options)=>fetch(base+path,options),workshop.window.location,{randomUUID});
  assert.equal(projectPassports().length,27);assert.equal(inventory.length,27);
  for(const p of projectPassports())await t.test(p.id,async()=>{
    const d=workshop.window.document;d.getElementById('project').value=p.id;
    d.getElementById('project').dispatchEvent(new workshop.window.Event('change'));
    const destination=d.getElementById('domain').getAttribute('href');
    assert.equal(destination,inventory.find(row=>row.id===p.id).href);
    const url=new URL(destination,base);assert.equal(url.hash,'');assert.equal(url.searchParams.get('project'),p.id);
    const desk=desks.get(p.id);
    if(!desk){
      assert.equal(url.pathname,'/');const dom=await openStudio(base,destination);
      try{await until(()=>!dom.window.document.getElementById('labShell').hidden);assert.equal(dom.window.document.getElementById('projectId').textContent.split(' / ')[0],p.id);}
      finally{dom.window.close();}
      return;
    }
    assert.equal(url.pathname,desk.path);
    const response=await fetch(url);assert.equal(response.status,200);
    const dom=new JSDOM(await response.text(),{url:url.href});
    try{
      assert.ok(dom.window.document.title.startsWith(p.id+' |'));
      await desk.mount(dom.window.document,async(kind,body)=>{
        const response=await fetch(base+desk.api+kind,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});
        assert.equal(response.status,200,desk.api+kind);return response.json();
      },()=>assert.fail('Navigation must not export data.'));
      assert.match(dom.window.document.getElementById(desk.clock).textContent,/fixed|synthetic/i);
      assert.ok(dom.window.document.getElementById(desk.select).options.length>0);
    }finally{dom.window.close();}
  });
});

test('root default and invalid project destinations retain their explicit fallback',async t=>{
  const base=await setup(t);
  for(const target of ['/','/?project=UNKNOWN','/?project=__proto__']){
    const dom=await openStudio(base,target);
    try{
      assert.equal(dom.window.document.getElementById('labShell').hidden,true);
      assert.equal(dom.window.document.getElementById('projectId').textContent.split(' / ')[0],'ECOM-01');
      if(target!=='/')assert.match(dom.window.document.getElementById('status').textContent,/Unknown project link/);
    }finally{dom.window.close();}
  }
  for(const id of ['UNKNOWN','__proto__','../escape'])assert.throws(()=>passport(id),/Unknown project/);
});
