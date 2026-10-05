/** Requires the local server. Runs every workflow with actual n8n, then replays RE-01. */
import { writeFileSync } from 'node:fs';
import { projects } from './catalog.mjs';

const results=[];
for(const project of projects){
  const started=performance.now();
  try{
    const response=await fetch(`http://127.0.0.1:5680/api/run/${project.id}`,{method:'POST',headers:{'X-Demo-Client':'local-showcase','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(180000)});
    const data=await response.json();
    results.push({projectId:project.id,passed:response.ok&&data.status==='passed',wallDurationMs:performance.now()-started,...data});
    console.log(`${response.ok?'PASS':'FAIL'} ${project.id}`,response.ok?`${data.engineDurationMs} ms engine`:data.error);
  }catch(error){results.push({projectId:project.id,passed:false,error:error.message});console.log(`FAIL ${project.id}: ${error.message}`)}
}
const contactsBefore=(await(await fetch('http://127.0.0.1:5680/api/contacts')).json()).contacts;
const replay=await(await fetch('http://127.0.0.1:5680/api/run/RE-01',{method:'POST',headers:{'X-Demo-Client':'local-showcase','Content-Type':'application/json'},body:'{}'})).json();
const contactsAfter=(await(await fetch('http://127.0.0.1:5680/api/contacts')).json()).contacts;
const replayPassed=replay.status==='passed'&&replay.created===false&&contactsBefore.length===contactsAfter.length;
const report={measuredAt:new Date().toISOString(),n8nVersion:'2.38.1',ghlMode:'local simulator',
  scope:'Actual n8n execution of local showcase wrappers, original demo entry points and simulator HTTP calls; not the original full business workflows or hosted GHL.',
  projects:results,replayPassed,contacts:contactsAfter.length,passed:results.every(r=>r.passed)&&replayPassed};
writeFileSync(new URL('../reports/n8n-local-executions.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`Overall: ${results.filter(r=>r.passed).length}/${projects.length}, replay ${replayPassed?'PASS':'FAIL'}`);
if(!report.passed)process.exitCode=1;
