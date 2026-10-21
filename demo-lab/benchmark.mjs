/** Actual loopback HTTP/SQLite benchmark, isolated from the showcase database. */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { createLabServer, openStore } from './server.mjs';

const db=openStore(':memory:');
const server=createLabServer(db);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/contacts/upsert`;
const headers={'X-Demo-Client':'local-showcase',Authorization:'Bearer LOCAL_DEMO_ONLY',Version:'v3','Content-Type':'application/json'};
const call=async i=>{
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({locationId:'DEMO_LOCATION',email:`bench-${i%100}@example.com`,firstName:'Demo'}),signal:AbortSignal.timeout(5000)});
  const result=await response.json();
  if(!response.ok||!result.contact?.id)throw new Error('Incorrect response');
};
const phases=[];
try{
  for(let i=0;i<100;i++)await call(i);
  for(const concurrency of [1,8,32]){
    const samples=[];let next=0;let errors=0;
    const started=performance.now();
    await Promise.all(Array.from({length:concurrency},async()=>{
      while(next<1000){const i=next++;const start=performance.now();try{await call(i)}catch{errors++}samples.push(performance.now()-start)}
    }));
    const duration=performance.now()-started;
    samples.sort((a,b)=>a-b);
    phases.push({concurrency,requests:1000,errors,p50Ms:samples[499],p95Ms:samples[949],p99Ms:samples[989],durationMs:duration,requestsPerSecond:1000000/duration});
  }
  const count=db.prepare('SELECT count(*) AS total FROM contacts').get().total;
  const report={measuredAt:new Date().toISOString(),scope:'Loopback HTTP plus in-memory SQLite contact upsert; excludes n8n, hosted GHL and disk durability',node:process.version,cpu:os.cpus()[0]?.model,warmup:100,phases,uniqueContacts:count,passed:phases.every(p=>p.errors===0)&&count===100};
  writeFileSync(new URL('../reports/local-api-benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(!report.passed)process.exitCode=1;
}finally{await new Promise(resolve=>server.close(resolve));db.close()}
