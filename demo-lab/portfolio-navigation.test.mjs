import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createLabServer,openStore } from './server.mjs';
import { portfolioInventory } from './project-inventory.mjs';
import { mountHumanStudio } from './human-studio.mjs';
import { mountWorkbench } from './workbench-ui.mjs';
import { mountFlagships } from './flagships-ui.mjs';
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Destination did not select its requested project');}

test('all 73 inventory destinations load locally, research endpoints validate writes and expose no arbitrary files',async t=>{
  const db=openStore(':memory:'),server=createLabServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const inventory=await (await fetch(base+'/api/project-inventory')).json();assert.deepEqual(inventory,portfolioInventory());
  for(const row of inventory){const response=await fetch(base+row.href);assert.equal(response.status,200,row.href);assert.match(response.headers.get('content-type'),/text\/html/);}
  for(const path of ['/projects.css','/projects-ui.mjs','/research.css','/research-ui.mjs'])assert.equal((await fetch(base+path)).status,200);
  for(const row of inventory.filter(p=>p.collection==='research'))assert.equal((await fetch(base+'/api/research/blueprint?project='+row.id)).status,200);
  assert.equal((await fetch(base+'/api/research/blueprint?project=../../AGENTS.md')).status,404);
  const fixture=await (await fetch(base+'/api/research/example')).json();
  const post=(kind,body,extra={})=>fetch(base+'/api/research/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...extra},body:JSON.stringify(body)});
  assert.equal((await post('compile',fixture.compile,{'Origin':'https://foreign.test'})).status,403);
  assert.equal((await post('compile',fixture.compile,{'X-Demo-Client':''})).status,403);
  assert.equal((await post('compile',fixture.compile)).status,200);
  const answer=await (await post('answer',fixture.answer)).json();assert.equal(answer.status,'supported');assert.equal(answer.citations.length,3);
  assert.equal((await post('constructor',{})).status,404);assert.equal((await post('answer',{...fixture.answer,extra:'rejected'})).status,400);
  assert.equal((await post('receipt',{tenant:'foreign',id:answer.id})).status,400);
  assert.equal((await post('compile',{tenant:'x',sources:[],excess:'x'.repeat(33000)})).status,400);
});

test('every human and engineering inventory deep link selects its own executable interface',()=>{
  for(const row of portfolioInventory().filter(p=>['life-data','engineering'].includes(p.collection))){
    const human=row.collection==='life-data',html=human?'<main id="humanStudio"></main>':readFileSync(new URL('./workbench.html',import.meta.url),'utf8');
    const dom=new JSDOM(html,{url:'http://127.0.0.1:5680'+row.href});
    try{if(human){mountHumanStudio(dom.window.document);assert.match(dom.window.document.getElementById('humanDetail').textContent,new RegExp(row.id));}
    else{mountWorkbench(dom.window.document);assert.equal(dom.window.document.querySelector('[aria-pressed=true]').dataset.project,row.id);}}finally{dom.window.close();}
  }
});

test('automation destination opens the requested build and human route opens its separate collection',async t=>{
  const db=openStore(':memory:'),server=createLabServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  for(const target of ['/?project=PM-01','/?human=DATA-06']){
    const dom=new JSDOM(readFileSync(new URL('./index.html',import.meta.url),'utf8'),{url:base+target,runScripts:'outside-only'}),w=dom.window;
    try{w.fetch=(path,options)=>fetch(base+path,options);w.eval(readFileSync(new URL('./studio.js',import.meta.url),'utf8'));await until(()=>w.document.getElementById(target.includes('human')?'humanStudio':'labShell').hidden===false);
      if(target.includes('project'))assert.match(w.document.getElementById('projectId').textContent,/^PM-01/);
      else{mountHumanStudio(w.document);assert.match(w.document.getElementById('humanDetail').textContent,/DATA-06/);}
      await until(()=>w.document.querySelectorAll('[data-node]').length===5);
    }finally{w.close();}
  }
});

test('flagship query links select the requested system and preserve unknown-ID fallback',async()=>{
  for(const row of portfolioInventory().filter(p=>p.collection==='business-systems')){
    const dom=new JSDOM(readFileSync(new URL('./flagships.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:5680'+row.href});
    const projects=portfolioInventory().filter(p=>p.collection==='business-systems').map(p=>({id:p.id,title:p.title,problem:p.summary,discipline:'Local',deepLink:'/',source:{hash:'local',files:[]},sourceCurrent:true,sources:[]}));
    try{await mountFlagships(dom.window.document,async(kind)=>kind==='catalog'?{projects}: {input:{}},()=>{},new URLSearchParams(dom.window.location.search).get('project'));
      assert.match(dom.window.document.getElementById('title').textContent,new RegExp(row.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    }finally{dom.window.close();}
  }
});
