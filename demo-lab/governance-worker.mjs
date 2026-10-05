import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {mountWorkbench} from './workbench-ui.mjs';
import {workbenchProjects} from './workbench-core.mjs';
const role=process.argv[2],dir=new URL('./',import.meta.url);let checks=0;
if(role==='implementation'){
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.mjs')&&!n.endsWith('.test.mjs'))){const r=spawnSync(process.execPath,['--check',fileURLToPath(new URL(name,dir))],{encoding:'utf8',timeout:10000,windowsHide:true});if(r.status!==0)throw Error(name+': '+r.stderr);checks++;}
 for(const p of workbenchProjects){const result=p.run(structuredClone(p.fixture));if(!result.summary||!result.scope||!Array.isArray(result.decisions))throw Error(p.id+' has incomplete evidence');checks++;}
}else if(role==='regression'){
 const files=readdirSync(dir).filter(n=>n.endsWith('.test.mjs')||n==='test.mjs');const r=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd:fileURLToPath(dir),encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,windowsHide:true});checks=Number(r.stdout?.match(/# tests (\d+)/)?.[1]??0);if(r.status!==0||!checks)throw Error((r.stdout??'')+(r.stderr??''));
}else if(role==='presentation'){
 const dom=new JSDOM(readFileSync(new URL('./workbench.html',dir),'utf8'),{url:'http://localhost/engineering'}),d=dom.window.document;mountWorkbench(d);
 for(const p of workbenchProjects){d.querySelector(`[data-project="${p.id}"]`).click();d.getElementById('run').click();if(d.getElementById('error').textContent||d.getElementById('export').disabled)throw Error(p.id+' cannot be presented');if(!d.getElementById('description').textContent||!d.getElementById('limit').textContent)throw Error(p.id+' lacks explanation or scope');checks++;}dom.window.close();
}else throw Error('Unknown specialist role');
console.log(JSON.stringify({role,checks,status:'passed'}));
