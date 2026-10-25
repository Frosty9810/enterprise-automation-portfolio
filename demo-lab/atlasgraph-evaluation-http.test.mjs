import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createLabServer,openStore} from './server.mjs';
async function setup(t){
 const db=openStore(':memory:'),server=createLabServer(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(body,headers={})=>{const response=await fetch(base+'/api/research-evaluation/run',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase',...headers},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
 return{db,base,post};
}
const suite={suiteId:'atlasgraph-independent-v1'};
test('evaluation HTTP serves its closed page/assets/catalog and links from the existing AtlasGraph workbench',async t=>{
 const x=await setup(t);const page=await fetch(x.base+'/research-evaluation?project=AtlasGraph');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.match(await page.text(),/AtlasGraph/);
 for(const asset of ['/atlasgraph-evaluation.css','/atlasgraph-evaluation-ui.mjs']){const r=await fetch(x.base+asset);assert.equal(r.status,200);assert.equal(r.headers.get('x-content-type-options'),'nosniff');}
 assert.match(await(await fetch(x.base+'/research?project=AtlasGraph')).text(),/research-evaluation/);
 const r=await fetch(x.base+'/api/research-evaluation/catalog'),catalog=await r.json();assert.equal(r.status,200);assert.equal(catalog.suiteId,suite.suiteId);assert.ok(catalog.caseCount>=12);assert.equal(catalog.stale,false);assert.match(catalog.implementationHash,/^[a-f0-9]{64}$/);assert.equal(catalog.labelAuthorship.humanReviewed,false);
});
test('evaluation HTTP recomputes reproducible reports without touching normal AtlasGraph workbench state',async t=>{
 const x=await setup(t);const original=()=>x.db.prepare('SELECT * FROM atlas_current').all();assert.deepEqual(original(),[]);
 const first=await x.post(suite),second=await x.post(suite);assert.equal(first.status,200);assert.equal(second.status,200);const a=first.value,b=second.value;
 assert.equal(a.suiteId,suite.suiteId);assert.equal(a.hashes.report,b.hashes.report);assert.ok(a.cases.length>=12);assert.equal(a.metrics.graph.cases,a.cases.length);assert.equal(a.metrics.flatLexical.cases,a.cases.length);
 for(const method of ['graph','flatLexical']){assert.ok(a.metrics[method].caseCorrect<=a.cases.length);assert.equal(a.metrics[method].supported+a.metrics[method].abstained,a.cases.length);for(const row of a.cases)assert.ok(['supported','abstained'].includes(row[method].status));}
 assert.deepEqual(original(),[]);assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM atlas_receipts').get().n,0);assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n,0);
});
test('evaluation HTTP rejects arbitrary suites, injected datasets, malformed payloads and unknown operations',async t=>{
 const x=await setup(t);
 for(const body of [null,[],{},true,{suiteId:'private'},{...suite,corpus:{}},{...suite,labels:[]},{...suite,path:'C:/private'},{...suite,model:'paid-provider'},{suiteId:'x'.repeat(33000)}])assert.equal((await x.post(body)).status,400);
 const malformed=await fetch(x.base+'/api/research-evaluation/run',{method:'POST',headers:{'X-Demo-Client':'local-showcase'},body:'{broken'});assert.equal(malformed.status,400);
 for(const operation of ['constructor','close','upload','delete','catalog'])assert.equal((await fetch(x.base+'/api/research-evaluation/'+operation,{method:'POST',headers:{'X-Demo-Client':'local-showcase'},body:'{}'})).status,404);
 for(const path of ['/atlasgraph-evaluation.mjs','/atlasgraph-evaluation-corpus.json','/atlasgraph-evaluation-labels.json','/research-evaluation/../server.mjs'])assert.equal((await fetch(x.base+path)).status,404);
});
test('evaluation HTTP requires exact loopback authority, origin and explicit POST intent',async t=>{
 const x=await setup(t);assert.equal((await x.post(suite,{'X-Demo-Client':''})).status,403);assert.equal((await x.post(suite,{Origin:'https://foreign.example'})).status,403);
 for(const headers of [{Origin:'null'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await fetch(x.base+'/api/research-evaluation/catalog',{headers})).status,403);
 const status=await new Promise((resolve,reject)=>{const req=request(x.base+'/api/research-evaluation/catalog',{headers:{Host:'foreign.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(status,403);
 assert.equal((await fetch(x.base+'/api/research-evaluation/run',{method:'PUT'})).status,405);
});
