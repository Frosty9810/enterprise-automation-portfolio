import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {chronosRank} from './chronosrank-core.mjs';

const SUITE='chronosrank-independent-v1';
const FILES=['chronosrank-core.mjs','chronosrank-fixtures.mjs','chronosrank-evaluation.mjs','chronosrank-evaluation-corpus.json','chronosrank-evaluation-labels.json'];
const LIMITS=Object.freeze({maxCases:24,maxEventsPerCase:64,maxCorpusBytes:2000000,maxLabelsBytes:240000,maxQueryTokens:32,maxSelected:10});
const POLICY=Object.freeze({
 chronos:'Existing ChronosRank ledger retrieval applies recordedAt, validFrom, exclusive expiry, effective supersession and explicit expiration before its unchanged lexical ranking and tie abstention.',
 temporalBlind:'Recorded-visible temporal-blind lexical baseline: actual checked ledger memories from the requested tenant/entity with recordedAt <= asOf only; deliberately ignores validFrom, expiresAt, effective successors and explicit expire events.',
 lexicalScoring:'Both use distinct Unicode NFKC lowercase letter/number query tokens; floor(100 * matching query tokens / query tokens), same supplied threshold/limit, raw memory-ID tie order, and abstention when distinct normalized texts tie at the top score.',
 labelScoring:'Separately AI-authored synthetic intent labels. A retrieved case agrees when every selected memory is gold and selection is nonempty; any useful gold subset suffices. Page/memory set overlap and forbidden-temporal labels have explicit denominators; no human truth or complete gold recovery is implied.'
});
const SCOPE='Local synthetic diagnostic of the existing deterministic ChronosRank temporal ledger versus a recorded-visible but temporally blind lexical baseline. Independently AI-authored intent labels are not human-reviewed truth. No trained reranker, vector search, model, provider, production quality or whole-blueprint acceptance is measured.';
const copy=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(canonical(value))).digest('hex');
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const fail=message=>{throw Error('ChronosRank evaluation: '+message);};
function safe(value,depth=0){
 if(depth>16)fail('JSON depth exceeds 16 levels.');
 if(value===null||typeof value==='boolean'||typeof value==='string')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(!value||typeof value!=='object'||![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))fail('Only finite plain JSON is accepted.');
 if(Object.keys(value).length>1000)fail('Collection too large.');
 for(const[key,item]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))fail('Prototype keys are forbidden.');safe(item,depth+1);}
}
function shape(value,keys){safe(value);if(!value||typeof value!=='object'||Array.isArray(value)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))fail('Invalid fields; expected '+keys.join(', ')+'.');}
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))fail('Invalid '+label+'.');}
function id(value){text(value,80,'identifier');if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))fail('Invalid identifier format.');}
function list(value,min,max,label){if(!Array.isArray(value)||value.length<min||value.length>max)fail('Invalid '+label+' count.');}
function distinct(values,label){if(new Set(values).size!==values.length)fail('Duplicate '+label+'.');}
function integer(value,min,max,label){if(!Number.isInteger(value)||value<min||value>max)fail('Invalid '+label+'.');}
function instant(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('Timestamp must be real canonical UTC milliseconds.');}
const tokens=value=>[...new Set(value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[])];
const normalizedText=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const byMemoryId=(a,b)=>a.memoryId<b.memoryId?-1:a.memoryId>b.memoryId?1:0;
function querySchema(value){
 shape(value,['tenant','entity','query','asOf','threshold','limit']);id(value.tenant);id(value.entity);text(value.query,500,'query');instant(value.asOf);
 if(!tokens(value.query).length||tokens(value.query).length>LIMITS.maxQueryTokens)fail('Query must contain one through 32 distinct tokens.');
 integer(value.threshold,1,100,'threshold');integer(value.limit,1,LIMITS.maxSelected,'selection limit');
}
function labelSchema(value){
 shape(value,['id','expectedStatus','goldMemoryIds','forbiddenTemporalMemoryIds','rationale']);id(value.id);
 if(!['retrieved','abstained'].includes(value.expectedStatus))fail('Invalid expected status.');text(value.rationale,4000,'label rationale');
 for(const key of ['goldMemoryIds','forbiddenTemporalMemoryIds']){list(value[key],0,LIMITS.maxEventsPerCase,key);value[key].forEach(id);distinct(value[key],key);}
 if(value.expectedStatus==='retrieved'&&!value.goldMemoryIds.length)fail('A retrieved label needs gold memory IDs.');
 if(value.expectedStatus==='abstained'&&value.goldMemoryIds.length)fail('An abstention label must have no gold recall.');
 if(value.goldMemoryIds.some(memoryId=>value.forbiddenTemporalMemoryIds.includes(memoryId)))fail('Gold and temporally forbidden memories cannot overlap.');
}
function makeLedger(item){
 const db=new DatabaseSync(':memory:');
 try{
  const desk=chronosRank(db),timeline=[];
  for(const event of item.events){const result=desk.append(event);if(!result.replayed)timeline.push(result.event);}
  const history=desk.history({tenant:item.query.tenant});
  return{db,desk,timeline,history};
 }catch(error){db.close();throw error;}
}
function scopedMemories(events,query){return events.filter(event=>event.kind!=='expire'&&event.tenant===query.tenant&&event.entity===query.entity);}
/** Temporal metadata validation is separate from query relevance and retrieval outcome labels. */
function forbiddenByTime(events,query){
 const successors=new Map(events.filter(event=>event.kind==='supersede').map(event=>[event.supersedes,event]));
 const expirations=new Map(events.filter(event=>event.kind==='expire').map(event=>[event.memoryId,event.recordedAt]));
 return scopedMemories(events,query).filter(memory=>{
  const successor=successors.get(memory.memoryId),expiration=expirations.get(memory.memoryId);
  return memory.recordedAt>query.asOf||memory.validFrom>query.asOf||(memory.expiresAt!==null&&memory.expiresAt<=query.asOf)||(expiration!==undefined&&expiration<=query.asOf)||(successor&&successor.recordedAt<=query.asOf&&successor.validFrom<=query.asOf);
 }).map(memory=>memory.memoryId).sort();
}
/** Validate the separately authored corpus without generating or changing its expected outcomes. */
export function validateChronosEvaluationSet(corpus,labels){
 shape(corpus,['schemaVersion','suiteId','scope','cases']);shape(labels,['schemaVersion','suiteId','authorship','cases']);
 if(corpus.schemaVersion!==1||labels.schemaVersion!==1||corpus.suiteId!==SUITE||labels.suiteId!==SUITE)fail('Unknown schema or fixed suite.');
 if(bytes(corpus)>LIMITS.maxCorpusBytes||bytes(labels)>LIMITS.maxLabelsBytes)fail('Evaluation set exceeds byte bounds.');
 text(corpus.scope,4000,'corpus scope');list(corpus.cases,1,LIMITS.maxCases,'cases');list(labels.cases,1,LIMITS.maxCases,'labels');
 shape(labels.authorship,['kind','humanReviewed','note']);if(labels.authorship.kind!=='independent-ai-fixture-author'||labels.authorship.humanReviewed!==false)fail('Independent AI authorship and pending human review must remain explicit.');text(labels.authorship.note,4000,'authorship note');
 distinct(corpus.cases.map(item=>item?.id),'corpus case ID');distinct(labels.cases.map(item=>item?.id),'label case ID');labels.cases.forEach(labelSchema);
 if(corpus.cases.length!==labels.cases.length)fail('Corpus and label counts differ.');const joined=new Map(labels.cases.map(label=>[label.id,label]));
 for(const item of corpus.cases){
  shape(item,['id','title','category','events','query']);id(item.id);text(item.title,200,'case title');text(item.category,100,'category');querySchema(item.query);list(item.events,0,LIMITS.maxEventsPerCase,'timeline events');
  const label=joined.get(item.id);if(!label)fail('Missing or foreign label identity.');
  const {db,desk,history}=makeLedger(item);
  try{
   // The actual public API validates query DTOs as well as event/ledger integrity.
   desk.retrieve({requestId:'validate-'+digest(item.id).slice(0,32),...item.query});
   const memories=new Set(scopedMemories(history.events,item.query).map(memory=>memory.memoryId));
   for(const key of ['goldMemoryIds','forbiddenTemporalMemoryIds'])if(label[key].some(memoryId=>!memories.has(memoryId)))fail('Label memory must exist in the requested tenant and entity.');
   if(JSON.stringify([...label.forbiddenTemporalMemoryIds].sort())!==JSON.stringify(forbiddenByTime(history.events,item.query)))fail('Forbidden temporal labels must enumerate exactly the time-invalid requested memories.');
  }finally{db.close();}
 }
 return{suiteId:SUITE,caseCount:corpus.cases.length,labelAuthorship:copy(labels.authorship)};
}
/** A useful subset can agree with intent without claiming complete retrieval of every gold memory. */
export function scoreChronosEvaluationCase(observed,label){
 shape(observed,['status','selectedMemoryIds']);labelSchema(label);if(!['retrieved','abstained'].includes(observed.status))fail('Invalid observed status.');
 list(observed.selectedMemoryIds,0,LIMITS.maxSelected,'selected memories');observed.selectedMemoryIds.forEach(id);distinct(observed.selectedMemoryIds,'selected memory');
 if((observed.status==='retrieved')!==Boolean(observed.selectedMemoryIds.length))fail('Observed decision and selected memories differ.');
 const selected=observed.selectedMemoryIds,gold=new Set(label.goldMemoryIds),forbidden=new Set(label.forbiddenTemporalMemoryIds),intersection=selected.filter(memoryId=>gold.has(memoryId)).length,wrongRecall=selected.length-intersection,forbiddenCount=selected.filter(memoryId=>forbidden.has(memoryId)).length;
 const decisionCorrect=observed.status===label.expectedStatus,applicableOnlyRecall=label.expectedStatus==='retrieved'&&observed.status==='retrieved'&&wrongRecall===0;
 return{caseCorrect:decisionCorrect&&(observed.status==='abstained'||applicableOnlyRecall),decisionCorrect,applicableOnlyRecall,falseRecallOnAbstention:label.expectedStatus==='abstained'&&observed.status==='retrieved',falseAbstention:label.expectedStatus==='retrieved'&&observed.status==='abstained',wrongRecall,wrongRecallCases:wrongRecall>0,labelForbiddenTemporalRecalls:forbiddenCount,labelForbiddenTemporalCases:forbiddenCount>0,evidence:{intersection,returned:selected.length,gold:gold.size,precision:selected.length?intersection/selected.length:null,recall:gold.size?intersection/gold.size:null}};
}
function temporalBlind(events,query){
 const queryTokens=tokens(query.query),ranked=[],excluded=[];
 for(const memory of scopedMemories(events,query)){
  if(memory.recordedAt>query.asOf){excluded.push({memoryId:memory.memoryId,reason:'not-yet-recorded'});continue;}
  const words=new Set(tokens(memory.text)),score=Math.floor(100*queryTokens.filter(word=>words.has(word)).length/queryTokens.length);
  if(score<query.threshold){excluded.push({memoryId:memory.memoryId,reason:'below-threshold',score});continue;}
  ranked.push({memoryId:memory.memoryId,entity:memory.entity,text:memory.text,provenance:copy(memory.provenance),recordedAt:memory.recordedAt,validFrom:memory.validFrom,expiresAt:memory.expiresAt,score});
 }
 ranked.sort((a,b)=>b.score-a.score||byMemoryId(a,b));
 const top=ranked.filter(memory=>memory.score===ranked[0]?.score),ambiguous=new Set(top.map(memory=>normalizedText(memory.text))).size>1,selected=ambiguous?[]:ranked.slice(0,query.limit);
 for(const memory of ranked)if(!selected.includes(memory))excluded.push({memoryId:memory.memoryId,reason:ambiguous?'ambiguous-top-score':'selection-limit',score:memory.score});excluded.sort(byMemoryId);
 return{status:selected.length?'retrieved':'abstained',selected,selectedMemoryIds:selected.map(memory=>memory.memoryId),excluded,explanation:ambiguous?'Distinct normalized texts share the top lexical score; this temporally blind baseline abstained.':selected.length?'Selected recorded-visible exact text using the same integer lexical score. Future validity, expiry, supersession and expire events were deliberately ignored.':'No recorded-visible memory meets the lexical threshold.',algorithmVersion:'recorded-visible-temporal-blind-lexical-v1'};
}
function aggregate(cases,method){
 const count=key=>cases.filter(item=>item[method].score[key]).length,sum=key=>cases.reduce((n,item)=>n+item[method].score[key],0),expectedRetrieved=cases.filter(item=>item.label.expectedStatus==='retrieved').length;
 const intersection=cases.reduce((n,item)=>n+item[method].score.evidence.intersection,0),returned=cases.reduce((n,item)=>n+item[method].score.evidence.returned,0),gold=cases.reduce((n,item)=>n+item[method].score.evidence.gold,0);
 return{cases:cases.length,caseCorrect:count('caseCorrect'),caseAccuracy:count('caseCorrect')/cases.length,decisionCorrect:count('decisionCorrect'),decisionAccuracy:count('decisionCorrect')/cases.length,expectedRetrieved,expectedAbstained:cases.length-expectedRetrieved,applicableOnlyRecall:count('applicableOnlyRecall'),applicableOnlyRecallRate:expectedRetrieved?count('applicableOnlyRecall')/expectedRetrieved:null,falseRecallOnAbstention:count('falseRecallOnAbstention'),falseAbstention:count('falseAbstention'),wrongRecall:sum('wrongRecall'),wrongRecallCases:count('wrongRecallCases'),labelForbiddenTemporalRecalls:sum('labelForbiddenTemporalRecalls'),labelForbiddenTemporalCases:count('labelForbiddenTemporalCases'),retrieved:cases.filter(item=>item[method].status==='retrieved').length,abstained:cases.filter(item=>item[method].status==='abstained').length,evidence:{intersection,returned,gold,precision:returned?intersection/returned:null,recall:gold?intersection/gold:null}};
}
function disk(){const files=FILES.map(name=>({name,bytes:readFileSync(new URL('./'+name,import.meta.url))}));return{files,implementation:digest(files.map(({name,bytes})=>({name,sha256:digest(bytes)}))),corpus:digest(files.find(file=>file.name.endsWith('corpus.json')).bytes),labels:digest(files.find(file=>file.name.endsWith('labels.json')).bytes)};}
function policyHash(corpus){return digest({shared:POLICY,cases:corpus.cases.map(({id,query})=>({id,query})).sort((a,b)=>a.id.localeCompare(b.id))});}
const LOADED=disk(),CORPUS=JSON.parse(LOADED.files.find(file=>file.name.endsWith('corpus.json')).bytes),LABELS=JSON.parse(LOADED.files.find(file=>file.name.endsWith('labels.json')).bytes);validateChronosEvaluationSet(CORPUS,LABELS);
export function getChronosRankEvaluationCatalog(){
 const current=disk();let policy;try{policy=policyHash(JSON.parse(current.files.find(file=>file.name.endsWith('corpus.json')).bytes));}catch{policy=digest({invalidCurrentCorpus:current.corpus,shared:POLICY});}
 return{suiteId:SUITE,title:'ChronosRank versus recorded-visible temporal-blind lexical recall',scope:SCOPE,caseCount:CORPUS.cases.length,implementationHash:current.implementation,loadedImplementationHash:LOADED.implementation,corpusHash:current.corpus,labelsHash:current.labels,policyHash:policy,labelAuthorship:copy(LABELS.authorship),methods:['chronos','temporal-blind'],policy:{...POLICY},limits:{...LIMITS},stale:current.implementation!==LOADED.implementation};
}
export function evaluateChronosRankSuite(value){
 shape(value,['suiteId']);if(value.suiteId!==SUITE)fail('Unknown fixed suite.');const before=disk();if(before.implementation!==LOADED.implementation)fail('Loaded implementation or fixtures changed; restart before evaluating.');validateChronosEvaluationSet(CORPUS,LABELS);
 const labels=new Map(LABELS.cases.map(label=>[label.id,label])),cases=[];
 for(const item of CORPUS.cases){
  const {db,desk,timeline,history}=makeLedger(item);
  try{
   const receipt=desk.retrieve({requestId:'eval-'+digest({id:item.id,query:item.query}).slice(0,32),...item.query}),audit=desk.verifyAudit({tenant:item.query.tenant});if(!audit.valid)fail('Actual ledger integrity verification failed.');
   const chronos={status:receipt.status,selected:copy(receipt.selected),selectedMemoryIds:receipt.selected.map(memory=>memory.memoryId),excluded:copy(receipt.excluded),explanation:receipt.explanation,algorithmVersion:receipt.algorithmVersion},baseline=temporalBlind(history.events,item.query),label=labels.get(item.id);
   for(const method of [chronos,baseline])method.score=scoreChronosEvaluationCase({status:method.status,selectedMemoryIds:method.selectedMemoryIds},label);
   cases.push({id:item.id,title:item.title,category:item.category,query:copy(item.query),timeline:copy(timeline),label:copy(label),ledger:{verified:true,memoryHead:receipt.ledgerHead,auditHead:audit.head,eventCount:audit.eventCount,entryCount:audit.entryCount},chronos,temporalBlind:baseline});
  }finally{db.close();}
 }
 const after=disk();if(after.implementation!==before.implementation)fail('Implementation or fixture bytes changed during evaluation; discard this run.');
 const report={schemaVersion:1,suiteId:SUITE,scope:SCOPE,labelAuthorship:copy(LABELS.authorship),measuredAt:new Date().toISOString(),hashes:{implementation:before.implementation,corpus:before.corpus,labels:before.labels,policy:policyHash(CORPUS)},policy:{...POLICY},metrics:{chronos:aggregate(cases,'chronos'),temporalBlind:aggregate(cases,'temporalBlind')},cases};const stable=copy(report);delete stable.measuredAt;report.hashes.report=digest(stable);return report;
}
