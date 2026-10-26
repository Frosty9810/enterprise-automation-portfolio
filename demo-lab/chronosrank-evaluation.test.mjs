import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,mkdtempSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {chronosRank} from './chronosrank-core.mjs';
import {validateChronosEvaluationSet,scoreChronosEvaluationCase,evaluateChronosRankSuite,getChronosRankEvaluationCatalog} from './chronosrank-evaluation.mjs';
const suiteId='chronosrank-independent-v1',files=['chronosrank-core.mjs','chronosrank-fixtures.mjs','chronosrank-evaluation.mjs','chronosrank-evaluation-corpus.json','chronosrank-evaluation-labels.json'];
const corpus=JSON.parse(readFileSync(new URL('./chronosrank-evaluation-corpus.json',import.meta.url))),labels=JSON.parse(readFileSync(new URL('./chronosrank-evaluation-labels.json',import.meta.url))),clone=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const run=()=>evaluateChronosRankSuite({suiteId});
function isolated(t,{set,edit=source=>source}={}){
 const dir=mkdtempSync(join(tmpdir(),'chronos-evaluation-test-'));t.after(()=>{if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw Error('Unexpected temporary path.');rmSync(dir,{recursive:true,force:true});});
 for(const name of files)copyFileSync(new URL('./'+name,import.meta.url),join(dir,name));
 if(set){writeFileSync(join(dir,files[3]),JSON.stringify(set.corpus));writeFileSync(join(dir,files[4]),JSON.stringify(set.labels));}
 const source=join(dir,files[2]);writeFileSync(source,edit(readFileSync(source,'utf8')));return{dir,load:()=>import(pathToFileURL(source).href)};
}
const source=(memoryId,text,recordedAt,extra={})=>({commandId:'remember-'+memoryId,tenant:'acme',kind:'remember',memoryId,entity:'dispatch',text,provenance:{sourceId:'source-'+memoryId,quote:text},recordedAt,validFrom:recordedAt,expiresAt:null,...extra});
const query=(extra={})=>({tenant:'acme',entity:'dispatch',query:'delivery port north',asOf:'2026-10-23T12:00:00.000Z',threshold:50,limit:1,...extra});
const independentTestSet=()=>{
 const old=source('old','delivery port north','2026-10-20T09:00:00.000Z',{expiresAt:'2026-10-22T00:00:00.000Z'}),current=source('current','delivery port south','2026-10-21T09:00:00.000Z'),future=source('future','delivery port north future','2026-10-25T09:00:00.000Z');
 const cases=[
  {id:'expired-stronger',title:'Expired exact match outranks current partial match only in the blind method',category:'mechanism-probe',events:[old,current,{...source('beta-same','delivery port north','2026-10-21T09:00:00.000Z'),tenant:'beta'},future],query:query()},
  {id:'not-yet-valid',title:'Recorded but not yet valid',category:'mechanism-probe',events:[source('scheduled','delivery port north','2026-10-20T09:00:00.000Z',{validFrom:'2026-10-26T09:00:00.000Z'})],query:query()},
  {id:'explicit-expire-equality',title:'Expire is effective at equality',category:'mechanism-probe',events:[source('expired-explicitly','delivery port north','2026-10-20T09:00:00.000Z'),{commandId:'expire-current',tenant:'acme',kind:'expire',memoryId:'expired-explicitly',recordedAt:'2026-10-23T12:00:00.000Z'}],query:query()},
  {id:'no-predecessor-revival',title:'Expired successor does not revive predecessor',category:'mechanism-probe',events:[source('predecessor','delivery port north','2026-10-20T09:00:00.000Z'),source('successor','delivery port south','2026-10-21T09:00:00.000Z',{kind:'supersede',supersedes:'predecessor',expiresAt:'2026-10-22T00:00:00.000Z'})],query:query()},
  {id:'nfkc-same-text-tie',title:'Equivalent normalized text may choose a useful subset in raw ID order',category:'mechanism-probe',events:[source('a-lower','Ｄｅｌｉｖｅｒｙ PORT NORTH','2026-10-20T09:00:00.000Z'),source('B-upper','Delivery port north','2026-10-20T09:00:00.000Z')],query:query({threshold:100})},
  {id:'distinct-text-tie',title:'Distinct exact-token texts tie and abstain',category:'mechanism-probe',events:[source('choice-a','delivery port north Tuesday','2026-10-20T09:00:00.000Z'),source('choice-b','delivery port north Friday','2026-10-20T09:00:00.000Z')],query:query({threshold:100})},
  {id:'floor-threshold-66',title:'Two of three tokens reaches floor66',category:'mechanism-probe',events:[source('two-tokens','delivery port south','2026-10-20T09:00:00.000Z')],query:query({threshold:66})},
  {id:'floor-threshold-67',title:'Two of three tokens cannot meet67',category:'mechanism-probe',events:[source('two-tokens','delivery port south','2026-10-20T09:00:00.000Z')],query:query({threshold:67})},
  {id:'genuine-current-distractor',title:'Lexical relevance can still miss intended context',category:'mechanism-probe',events:[source('wrong-context','delivery port north training','2026-10-20T09:00:00.000Z'),source('useful-context','delivery port south case','2026-10-20T09:00:00.000Z')],query:query()}
 ];
 const authored=[
  ['expired-stronger','retrieved',['current'],['old','future']],['not-yet-valid','abstained',[],['scheduled']],['explicit-expire-equality','abstained',[],['expired-explicitly']],['no-predecessor-revival','abstained',[],['predecessor','successor']],['nfkc-same-text-tie','retrieved',['B-upper','a-lower'],[]],['distinct-text-tie','abstained',[],[]],['floor-threshold-66','retrieved',['two-tokens'],[]],['floor-threshold-67','abstained',[],[]],['genuine-current-distractor','retrieved',['useful-context'],[]]
 ].map(([id,expectedStatus,goldMemoryIds,forbiddenTemporalMemoryIds])=>({id,expectedStatus,goldMemoryIds,forbiddenTemporalMemoryIds,rationale:'Mechanism-only test intent; not part of the independently authored published challenge.'}));
 return{corpus:{schemaVersion:1,suiteId,scope:'Small adverse mechanism fixtures; not benchmark evidence.',cases},labels:{schemaVersion:1,suiteId,authorship:{kind:'independent-ai-fixture-author',humanReviewed:false,note:'Mechanism-test placeholder satisfying the fixed schema; this copied test set is not the independently authored published challenge.'},cases:authored}};
};

test('separately authored labels remain pending human review and join by case identity rather than array order',()=>{
 const reversed=clone(labels);reversed.cases.reverse();assert.deepEqual(validateChronosEvaluationSet(corpus,reversed),validateChronosEvaluationSet(corpus,labels));assert.equal(labels.authorship.humanReviewed,false);
});
for(const[name,change]of [
 ['unknown corpus schema',(c,l)=>c.schemaVersion=2],['unknown suite',(c,l)=>l.suiteId='unknown'],['extra oracle',(c,l)=>c.oracle=true],['duplicate case',(c,l)=>c.cases.push(clone(c.cases[0]))],['missing label',(c,l)=>l.cases.pop()],['foreign label',(c,l)=>l.cases[0].id='foreign'],['duplicate label',(c,l)=>l.cases.push(clone(l.cases[0]))],['human acceptance fabricated',(c,l)=>l.authorship.humanReviewed=true],['unknown query field',(c,l)=>c.cases[0].query.requestId='injected'],['offset timestamp',(c,l)=>c.cases[0].query.asOf='2026-10-23T12:00:00+00:00'],['impossible time',(c,l)=>c.cases[0].query.asOf='2026-02-30T12:00:00.000Z'],['empty lexical query',(c,l)=>c.cases[0].query.query='?!'],['noninteger threshold',(c,l)=>c.cases[0].query.threshold=50.5],['zero limit',(c,l)=>c.cases[0].query.limit=0],['too large limit',(c,l)=>c.cases[0].query.limit=11],['foreign memory label',(c,l)=>l.cases[0].goldMemoryIds=['foreign']],['event source injection',(c,l)=>c.cases[0].events[0].provider='paid']
])test('strict diagnostic schema rejects '+name,()=>{const c=clone(corpus),l=clone(labels);change(c,l);assert.throws(()=>validateChronosEvaluationSet(c,l));});

test('temporal label metadata cannot omit an invalid memory, borrow another entity, overlap gold or invent a failure',()=>{
 const set=independentTestSet();assert.equal(validateChronosEvaluationSet(set.corpus,set.labels).caseCount,9);
 for(const mutate of [s=>s.labels.cases[0].forbiddenTemporalMemoryIds.pop(),s=>s.labels.cases[0].forbiddenTemporalMemoryIds.push('current'),s=>s.labels.cases[0].goldMemoryIds=['old'],s=>s.labels.cases[0].goldMemoryIds=['beta-same'],s=>s.labels.cases[1].goldMemoryIds=['scheduled']]){const changed=clone(set);mutate(changed);assert.throws(()=>validateChronosEvaluationSet(changed.corpus,changed.labels));}
 const proto=JSON.parse('{"__proto__":{"oracle":true}}');assert.throws(()=>validateChronosEvaluationSet(proto,labels));
});

test('any nonempty useful gold subset may agree while evidence recall keeps the complete gold denominator',()=>{
 const label={id:'subset',expectedStatus:'retrieved',goldMemoryIds:['useful-a','useful-b'],forbiddenTemporalMemoryIds:['old'],rationale:'Two alternative useful sources.'};const score=scoreChronosEvaluationCase({status:'retrieved',selectedMemoryIds:['useful-a']},label);assert.equal(score.caseCorrect,true);assert.equal(score.applicableOnlyRecall,true);assert.deepEqual(score.evidence,{intersection:1,returned:1,gold:2,precision:1,recall:.5});
 const mixed=scoreChronosEvaluationCase({status:'retrieved',selectedMemoryIds:['useful-a','old','other']},label);assert.equal(mixed.caseCorrect,false);assert.equal(mixed.decisionCorrect,true);assert.equal(mixed.wrongRecall,2);assert.equal(mixed.wrongRecallCases,true);assert.equal(mixed.labelForbiddenTemporalRecalls,1);assert.equal(mixed.labelForbiddenTemporalCases,true);assert.equal(mixed.evidence.precision,1/3);
});

test('false recall, false abstention and zero denominators cannot become fabricated perfect retrieval',()=>{
 const abstain={id:'none',expectedStatus:'abstained',goldMemoryIds:[],forbiddenTemporalMemoryIds:['expired'],rationale:'No applicable source.'},empty=scoreChronosEvaluationCase({status:'abstained',selectedMemoryIds:[]},abstain);assert.equal(empty.caseCorrect,true);assert.equal(empty.applicableOnlyRecall,false);assert.deepEqual(empty.evidence,{intersection:0,returned:0,gold:0,precision:null,recall:null});
 const recall=scoreChronosEvaluationCase({status:'retrieved',selectedMemoryIds:['expired']},abstain);assert.equal(recall.falseRecallOnAbstention,true);assert.equal(recall.wrongRecall,1);assert.equal(recall.labelForbiddenTemporalRecalls,1);assert.equal(recall.evidence.precision,0);assert.equal(recall.evidence.recall,null);
 const miss=scoreChronosEvaluationCase({status:'abstained',selectedMemoryIds:[]},{...abstain,expectedStatus:'retrieved',goldMemoryIds:['current']});assert.equal(miss.falseAbstention,true);assert.equal(miss.evidence.precision,null);assert.equal(miss.evidence.recall,0);
 for(const observed of [{status:'retrieved',selectedMemoryIds:[]},{status:'abstained',selectedMemoryIds:['expired']},{status:'retrieved',selectedMemoryIds:['expired','expired']}])assert.throws(()=>scoreChronosEvaluationCase(observed,abstain));
});

test('real temporal eligibility is compared against a deliberately recorded-only baseline without changing core behavior',async t=>{
 const set=independentTestSet(),x=isolated(t,{set}),module=await x.load(),report=module.evaluateChronosRankSuite({suiteId}),row=id=>report.cases.find(c=>c.id===id);
 assert.deepEqual(row('expired-stronger').chronos.selectedMemoryIds,['current']);assert.deepEqual(row('expired-stronger').temporalBlind.selectedMemoryIds,['old']);assert.deepEqual(row('expired-stronger').temporalBlind.excluded.find(e=>e.memoryId==='future'),{memoryId:'future',reason:'not-yet-recorded'});assert.equal(row('expired-stronger').temporalBlind.score.labelForbiddenTemporalRecalls,1);assert.equal(row('expired-stronger').ledger.eventCount,3);assert.equal(row('expired-stronger').ledger.entryCount,4);assert.equal(row('expired-stronger').timeline.length,4);
 for(const id of ['not-yet-valid','explicit-expire-equality','no-predecessor-revival']){assert.equal(row(id).chronos.status,'abstained');assert.equal(row(id).temporalBlind.status,'retrieved');assert.ok(row(id).temporalBlind.score.labelForbiddenTemporalRecalls>0);}
 for(const method of ['chronos','temporalBlind']){assert.deepEqual(row('nfkc-same-text-tie')[method].selectedMemoryIds,['B-upper']);assert.equal(row('nfkc-same-text-tie')[method].score.caseCorrect,true);assert.equal(row('nfkc-same-text-tie')[method].score.evidence.recall,.5);assert.equal(row('distinct-text-tie')[method].status,'abstained');assert.equal(row('floor-threshold-66')[method].selected[0].score,66);assert.equal(row('floor-threshold-67')[method].status,'abstained');assert.equal(row('genuine-current-distractor')[method].score.caseCorrect,false);assert.equal(row('genuine-current-distractor')[method].score.wrongRecall,1);assert.equal(row('genuine-current-distractor')[method].score.labelForbiddenTemporalRecalls,0);}
});

test('published challenge executes the unchanged real core and reports real ledger heads and exclusions',()=>{
 const report=run();assert.equal(report.cases.length,corpus.cases.length);
 for(const item of corpus.cases){const row=report.cases.find(c=>c.id===item.id),db=new DatabaseSync(':memory:');try{const desk=chronosRank(db),timeline=[];for(const event of item.events){const actual=desk.append(event);if(!actual.replayed)timeline.push(actual.event);}const actual=desk.retrieve({requestId:'independent-test',...item.query});for(const field of ['status','selected','excluded','explanation','algorithmVersion'])assert.deepEqual(row.chronos[field],actual[field],item.id+' '+field);assert.deepEqual(row.timeline,timeline);assert.equal(row.ledger.memoryHead,actual.ledgerHead);assert.equal(row.ledger.eventCount,desk.verifyAudit({tenant:item.query.tenant}).eventCount);assert.equal(row.ledger.entryCount,desk.verifyAudit({tenant:item.query.tenant}).entryCount);assert.equal(row.ledger.verified,true);
  for(const method of ['chronos','temporalBlind']){assert.deepEqual(row[method].selectedMemoryIds,row[method].selected.map(m=>m.memoryId));assert.deepEqual(row[method].score,scoreChronosEvaluationCase({status:row[method].status,selectedMemoryIds:row[method].selectedMemoryIds},row.label));assert.ok(row[method].selected.every(m=>m.entity===item.query.entity&&m.recordedAt<=item.query.asOf));for(const selected of row[method].selected)assert.ok(timeline.some(event=>event.tenant===item.query.tenant&&event.memoryId===selected.memoryId&&event.kind!=='expire'&&event.text===selected.text));}
 }finally{db.close();}}
});

test('aggregate case agreement, useful-subset recall and temporal wrong-memory counts use every explicit denominator',()=>{
 const report=run();for(const method of ['chronos','temporalBlind']){const metric=report.metrics[method],count=key=>report.cases.filter(row=>row[method].score[key]).length,sum=key=>report.cases.reduce((n,row)=>n+row[method].score[key],0);assert.equal(metric.cases,report.cases.length);for(const key of ['caseCorrect','decisionCorrect','applicableOnlyRecall','falseRecallOnAbstention','falseAbstention','wrongRecallCases','labelForbiddenTemporalCases'])assert.equal(metric[key],count(key));for(const key of ['wrongRecall','labelForbiddenTemporalRecalls'])assert.equal(metric[key],sum(key));assert.equal(metric.expectedRetrieved+metric.expectedAbstained,metric.cases);assert.equal(metric.caseAccuracy,metric.caseCorrect/metric.cases);assert.equal(metric.applicableOnlyRecallRate,metric.expectedRetrieved?metric.applicableOnlyRecall/metric.expectedRetrieved:null);for(const key of ['intersection','returned','gold'])assert.equal(metric.evidence[key],report.cases.reduce((n,row)=>n+row[method].score.evidence[key],0));assert.equal(metric.evidence.precision,metric.evidence.returned?metric.evidence.intersection/metric.evidence.returned:null);assert.equal(metric.evidence.recall,metric.evidence.gold?metric.evidence.intersection/metric.evidence.gold:null);}
});

test('frozen labels affect scoring but cannot select, exclude or reorder actual memories',async t=>{
 const set=independentTestSet(),label=set.labels.cases.find(c=>c.id==='genuine-current-distractor');label.goldMemoryIds=['wrong-context'];const x=isolated(t,{set}),module=await x.load(),changed=module.evaluateChronosRankSuite({suiteId}),originalSet=independentTestSet(),other=isolated(t,{set:originalSet}),original=(await other.load()).evaluateChronosRankSuite({suiteId});
 for(const row of changed.cases){const old=original.cases.find(c=>c.id===row.id);for(const method of ['chronos','temporalBlind']){const a=clone(row[method]),b=clone(old[method]);delete a.score;delete b.score;assert.deepEqual(a,b);}}
 assert.equal(changed.cases.find(c=>c.id===label.id).chronos.score.caseCorrect,true);assert.equal(original.cases.find(c=>c.id===label.id).chronos.score.caseCorrect,false);assert.notEqual(changed.hashes.labels,original.hashes.labels);
});

test('report fingerprints recompute independently and omit only the measurement timestamp and report hash itself',()=>{
 const first=run(),second=run(),stable=clone(first);delete stable.measuredAt;delete stable.hashes.report;assert.equal(first.hashes.report,digest(stable));assert.equal(first.hashes.report,second.hashes.report);assert.deepEqual({...first,measuredAt:null},{...second,measuredAt:null});const catalog=getChronosRankEvaluationCatalog();assert.equal(catalog.implementationHash,first.hashes.implementation);assert.equal(catalog.stale,false);assert.deepEqual(catalog.methods,['chronos','temporal-blind']);
});

test('only the one fixed suite is callable; no custom timeline paths providers or oracle IDs are accepted',()=>{
 for(const value of [null,[],{},true,{suiteId:'unknown'},{suiteId,goldMemoryIds:['oracle']},{suiteId,events:[]},{suiteId,path:'private'},{suiteId,provider:'paid'}])assert.throws(()=>evaluateChronosRankSuite(value));
});

test('evaluation leaves normal lab runtime files and frozen corpus/label bytes untouched',()=>{
 const runtime=new URL('./.runtime/',import.meta.url),before=existsSync(runtime)?readdirSync(runtime).sort():null,raw=files.filter(name=>name.endsWith('.json')).map(name=>[name,readFileSync(new URL(name,import.meta.url),'utf8')]);run();assert.deepEqual(existsSync(runtime)?readdirSync(runtime).sort():null,before);for(const[name,body]of raw)assert.equal(readFileSync(new URL(name,import.meta.url),'utf8'),body);
});

test('core, imported fixture, runner and data byte drift invalidate loaded authority and exact restoration can recover',async t=>{
 const x=isolated(t),module=await x.load(),original=module.getChronosRankEvaluationCatalog();for(const name of files){const p=join(x.dir,name),raw=readFileSync(p);writeFileSync(p,Buffer.concat([raw,Buffer.from('\n')]));const stale=module.getChronosRankEvaluationCatalog();assert.equal(stale.stale,true,name);assert.notEqual(stale.implementationHash,original.implementationHash);assert.throws(()=>module.evaluateChronosRankSuite({suiteId}),/restart/);writeFileSync(p,raw);assert.equal(module.getChronosRankEvaluationCatalog().stale,false);}assert.equal(module.evaluateChronosRankSuite({suiteId}).hashes.implementation,original.implementationHash);
});

test('relevant byte mutation during a run rejects the entire result at its final guard',async t=>{
 const x=isolated(t,{edit:source=>source.replace('const after=disk();',"globalThis.__chronosEvaluationDuringRun?.();const after=disk();")}),module=await x.load(),p=join(x.dir,'chronosrank-evaluation-labels.json');globalThis.__chronosEvaluationDuringRun=()=>writeFileSync(p,readFileSync(p,'utf8')+'\n');try{assert.throws(()=>module.evaluateChronosRankSuite({suiteId}),/during evaluation/);}finally{delete globalThis.__chronosEvaluationDuringRun;}
});
