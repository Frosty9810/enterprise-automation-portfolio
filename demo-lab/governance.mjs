import {spawn} from 'node:child_process';
import {openSync,closeSync,unlinkSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {govern,requiredRoles} from './governor-core.mjs';
import {sourceSnapshot,saveGovernance} from './governance-state.mjs';
const dir=new URL('./',import.meta.url),lock=new URL('./.runtime/governor.lock',dir);
mkdirSync(new URL('./.runtime/',dir),{recursive:true});
// Prevent overlapping review runs; never silently delete another runner's lock.
let fd;try{fd=openSync(lock,'wx');}catch{throw Error('Governor already running or a stale lock exists in .runtime/governor.lock. Inspect it before removing.');}
const runId=randomUUID(),startedAt=new Date().toISOString();
try{
 saveGovernance({runId,startedAt,results:[],governor:{decision:'incomplete-evidence',reasons:['Review is running. Previous approval does not apply.']}});
 const before=sourceSnapshot();
 const results=await Promise.all(requiredRoles.map(role=>new Promise(resolve=>{const start=performance.now();let stdout='',stderr='',settled=false;const child=spawn(process.execPath,[fileURLToPath(new URL('./governance-worker.mjs',dir)),role],{cwd:fileURLToPath(dir),windowsHide:true});const finish=(exitCode,error)=>{if(settled)return;settled=true;clearTimeout(timer);let parsed;try{parsed=JSON.parse(stdout.trim().split('\n').at(-1));}catch{}resolve({role,snapshot:before,status:exitCode===0&&parsed?.status==='passed'?'passed':'failed',checks:parsed?.checks??0,exitCode,durationMs:Math.round(performance.now()-start),error:error??null,output:(stderr+'\n'+stdout).slice(-30000)});};const timer=setTimeout(()=>{child.kill();finish(null,'Specialist exceeded 90 seconds.');},90000);child.stdout.on('data',b=>{stdout+=b;if(stdout.length>4e6){child.kill();finish(null,'Output limit exceeded.');}});child.stderr.on('data',b=>{stderr+=b;if(stderr.length>4e6){child.kill();finish(null,'Output limit exceeded.');}});child.on('error',e=>finish(null,e.message));child.on('close',code=>finish(code));})));
 const after=sourceSnapshot(),decision=govern({before,after,results});const report={runId,startedAt,completedAt:new Date().toISOString(),before,after,results,governor:decision,mode:'Deterministic local specialists; no model calls',aiReview:'AI specialists are invoked separately by the Codex workflow in PORTFOLIO-AGENTS.md. This runner does not fabricate AI reviews.'};saveGovernance(report);console.log(JSON.stringify({roles:results.map(({role,status,checks})=>({role,status,checks})),...decision},null,2));if(decision.decision!=='approved-local-checks')process.exitCode=1;
}catch(error){saveGovernance({runId,startedAt,completedAt:new Date().toISOString(),results:[],governor:{decision:'incomplete-evidence',reasons:[error.message]}});process.exitCode=1;console.error(error.message);}finally{closeSync(fd);unlinkSync(lock);}
