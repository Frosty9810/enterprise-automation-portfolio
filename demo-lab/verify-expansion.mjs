import {writeFileSync} from 'node:fs';
const results=[];
for(const id of ['INV-01','CRM-01','AGT-01','OPS-01']){const r=await fetch('http://127.0.0.1:5680/api/run/'+id,{method:'POST',headers:{'X-Demo-Client':'local-showcase','Content-Type':'application/json'},body:'{}'});const result=await r.json();results.push({projectId:id,passed:r.ok,...result});console.log(id,r.status,result.engineDurationMs||result.error);}
writeFileSync('reports/business-expansion-executions.json',JSON.stringify({recordedAt:new Date().toISOString(),scope:'Four local n8n wrappers and synthetic GHL simulator; not hosted products',results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
