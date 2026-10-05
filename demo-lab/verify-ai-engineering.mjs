import {writeFileSync} from 'node:fs';
const results=[];
for(const id of ['PM-01','EA-01','AGT-01','INV-01','OPS-01']){const r=await fetch('http://127.0.0.1:5680/api/run/'+id,{method:'POST',headers:{'X-Demo-Client':'local-showcase','Content-Type':'application/json'},body:'{}'});const result=await r.json();results.push({projectId:id,passed:r.ok,...result});console.log(id,r.status,result.engineDurationMs||result.error);}
writeFileSync('reports/ai-engineering-executions.json',JSON.stringify({recordedAt:new Date().toISOString(),scope:'Changed local n8n wrappers and local GHL simulator; no hosted LLM or provider benchmark',results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
