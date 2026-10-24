/** Repeatable local review. Does not invoke hosted services or rewrite source. */
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),dir=new URL('./',import.meta.url);
const tests=readdirSync(dir).filter(n=>n.endsWith('.test.mjs')||n==='test.mjs').map(n=>'demo-lab/'+n);
const commands=[['Repair evidence',['demo-lab/verify-repair.mjs']],['Regression suite',['--test','--test-reporter=tap',...tests]],['API benchmark',['demo-lab/benchmark.mjs']]];
const checks=[];
for(const [name,args]of commands){const start=performance.now(),r=spawnSync(process.execPath,args,{cwd:fileURLToPath(root),encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,windowsHide:true});const output=(r.stdout??'')+(r.stderr??'');checks.push({name,passed:r.status===0,durationMs:Math.round(performance.now()-start),testCount:name==='Regression suite'?Number(output.match(/# tests (\d+)/)?.[1]??0):null,error:r.error?.message??null,output});console.log(name+': '+(r.status===0?'PASS':'FAIL'));}
const n8n=JSON.parse(readFileSync(new URL('../reports/n8n-local-executions.json',import.meta.url),'utf8'));
const benchmark=JSON.parse(readFileSync(new URL('../reports/local-api-benchmark.json',import.meta.url),'utf8'));
const sourceHashes=Object.fromEntries(readdirSync(dir).filter(n=>/\.(mjs|css|html)$/.test(n)).sort().map(n=>[n,createHash('sha256').update(readFileSync(new URL(n,dir))).digest('hex')]));
const report={reviewedAt:new Date().toISOString(),passed:checks.every(c=>c.passed),checks,sourceHashes,n8n:{recordedAt:n8n.measuredAt,passed:n8n.passed,projects:n8n.projects.length,replayPassed:n8n.replayPassed,slowest:[...n8n.projects].sort((a,b)=>b.engineDurationMs-a.engineDurationMs).slice(0,3).map(p=>({id:p.projectId,engineDurationMs:p.engineDurationMs})),scope:n8n.scope},benchmark:{recordedAt:benchmark.measuredAt,passed:benchmark.passed,scope:benchmark.scope,phases:benchmark.phases},scope:'Recorded local checks, not a production certification. n8n results are from the separately dated execution report; this command does not rerun n8n. Regenerate after edits.'};
writeFileSync(new URL('./build-review.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
if(!report.passed)process.exitCode=1;
