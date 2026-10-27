import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { constructionAsOf, constructionRegistry, constructionScope, constructionDocumentExamples, constructionOrderExamples } from './construction-fixtures.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const textHash=value=>createHash('sha256').update(value).digest('hex');
const sourceHash=()=>hash(['construction-core.mjs','construction-fixtures.mjs'].map(name=>textHash(readFileSync(new URL(name,import.meta.url)))));
const SOURCE=sourceHash(),GENESIS='0'.repeat(64),KINDS=['insurance','license'];
export class ConstructionError extends Error {constructor(message,code='invalid_input'){super(message);this.name='ConstructionError';this.code=code;}}
const fail=(message,code)=>{throw new ConstructionError(message,code);};
function json(value,depth=0){
  if(depth>8)fail('JSON nesting exceeds eight levels.');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='string'){if(/[\u0000-\u001f\u007f]/u.test(value))fail('Control characters are forbidden.');return;}
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(!value||typeof value!=='object'||![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))fail('Only finite plain JSON is accepted.');
  if(Object.keys(value).length>100)fail('JSON collection exceeds 100 entries.');
  for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))fail('Prototype keys are forbidden.');json(item,depth+1);}
}
function schema(value,fields){json(value);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!fields.includes(key)))fail(`Expected exactly: ${fields.join(', ')}.`);if(Buffer.byteLength(JSON.stringify(value))>24000)fail('Payload exceeds 24000 bytes.');}
function text(value,label,max=200){if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} must be a nonempty bounded string.`);return value;}
function id(value){text(value,'Identifier',100);if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))fail('Invalid identifier.');return value;}
function instant(value){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value))fail('Canonical UTC timestamp from 2000 through 2099 required.');const n=Date.parse(value);if(!Number.isFinite(n)||new Date(n).toISOString()!==value)fail('Timestamp must be a real canonical UTC instant.');return n;}
const key=(tenant,identity)=>`${tenant}:${identity}`;

/** Caller owns db; every effect is in this one local SQLite database. */
export function constructionDesk(db,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['clock','registryRevision'].includes(k)))fail('Unknown factory option.');
  if(options.clock!==undefined&&typeof options.clock!=='function')fail('clock must be a trusted function.');if(options.registryRevision!==undefined)id(options.registryRevision);
  const clock=options.clock??(()=>constructionAsOf),now=()=>{const value=clock();instant(value);return value;};
  const registry=copy(constructionRegistry),configHash=hash({registry,revision:options.registryRevision??'fixture-v1'});
  function tenant(value){if(typeof value!=='string'||!Object.hasOwn(registry,value))fail('Unknown configured tenant.');return value;}
  function actor(value,owner,role){id(value);if(!registry[owner].actors[role].includes(value))fail(`Choose a configured ${role} fixture for this tenant.`);}
  function site(owner,siteId,subcontractorId){tenant(owner);id(siteId);id(subcontractorId);const result=registry[owner].site;if(result.id!==siteId||result.subcontractorId!==subcontractorId)fail('Site/subcontractor is not configured for this tenant.');return result;}
  function active(siteValue,asOf){if(instant(asOf)<instant(siteValue.activeFrom)||instant(asOf)>=instant(siteValue.activeUntil))fail('Configured site is not active at the scenario clock.','stale');}
  function provenance(value,asOf){if(!['email','pdf-manifest'].includes(value.channel))fail('Choose email or pdf-manifest provenance.');text(value.reference,'Source reference',300);text(value.content,'Supplied source content',4000);if(instant(value.receivedAt)>instant(asOf))fail('Source receivedAt is after the trusted scenario clock.');}
  function fresh(value){if(sourceHash()!==SOURCE||value.sourceHash!==SOURCE||value.configHash!==configHash)fail('Source/configuration changed; prior authority is stale.','stale');}
  function stale(value){return value.sourceHash!==SOURCE||value.configHash!==configHash||sourceHash()!==SOURCE;}
  const baselineBudgets=()=>new Map(Object.entries(registry).map(([owner,r])=>[key(owner,r.site.id),{id:key(owner,r.site.id),tenant:owner,siteId:r.site.id,currency:r.site.currency,budgetCents:r.site.budgetCents,committedCents:0,remainingCents:r.site.budgetCents}]));
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec('BEGIN IMMEDIATE');
  try{
    const existing=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='construction_events'").get();
    if(existing&&(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='construction_head'").get()||!db.prepare('SELECT * FROM construction_head WHERE singleton=1').get()))fail('Existing construction history lost its durable head.','integrity_failed');
    db.exec(`CREATE TABLE IF NOT EXISTS construction_events(seq INTEGER PRIMARY KEY,tenant TEXT NOT NULL,command_id TEXT NOT NULL,operation TEXT NOT NULL,request_hash TEXT NOT NULL,request TEXT NOT NULL,body TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL,UNIQUE(tenant,command_id));
      CREATE TABLE IF NOT EXISTS construction_head(singleton INTEGER PRIMARY KEY CHECK(singleton=1),event_count INTEGER NOT NULL,hash TEXT NOT NULL);
      INSERT OR IGNORE INTO construction_head VALUES(1,0,'${GENESIS}');
      CREATE TABLE IF NOT EXISTS construction_documents(id TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS construction_orders(id TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS construction_commitments(id TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS construction_budgets(id TEXT PRIMARY KEY,body TEXT NOT NULL);`);
    // Baselines may only be seeded when the schema itself is new, not after deletion.
    if(!existing)for(const budget of baselineBudgets().values())db.prepare('INSERT INTO construction_budgets VALUES(?,?)').run(budget.id,JSON.stringify(budget));
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  function eventHash(row){return hash({seq:Number(row.seq),tenant:row.tenant,commandId:row.command_id,operation:row.operation,requestHash:row.request_hash,request:row.request,body:row.body,previousHash:row.previous_hash});}
  const reversalReasons=['change-cancelled','scope-withdrawn'];
  function reversalProposal(order){const proposal=order.reversal;return{orderId:order.orderId,tenant:order.tenant,siteId:order.siteId,subcontractorId:order.subcontractorId,currency:order.currency,originalEntry:order.commitment,proposal:{version:proposal.version,requester:proposal.requester,reasonCode:proposal.reasonCode,note:proposal.note,originalEntryId:proposal.originalEntryId,originalEntryHash:proposal.originalEntryHash,proposedAt:proposal.proposedAt},sourceHash:proposal.sourceHash,configHash:proposal.configHash};}
  function reversalHash(order){return hash(reversalProposal(order));}
  function reversalApprovalsValid(order,fingerprint){const proposal=order.reversal,manager=proposal?.reviews?.project_manager,finance=proposal?.reviews?.finance,roles=registry[order.tenant]?.actors;return Boolean(roles&&manager?.decision==='approve'&&finance?.decision==='approve'&&manager.expectedHash===fingerprint&&finance.expectedHash===fingerprint&&roles.projectManagers.includes(manager.reviewer)&&roles.finance.includes(finance.reviewer)&&manager.reviewer!==finance.reviewer&&![order.requester,proposal.requester].includes(manager.reviewer)&&![order.requester,proposal.requester].includes(finance.reviewer));}
  function reconcileLedger(effects){
    const entries=effects.commitments,orders=effects.orders,reversed=new Set();
    for(const entry of entries.values()){
      const location=registry[entry.tenant]?.site,order=orders.get(key(entry.tenant,entry.orderId));
      if(!location||!order||entry.siteId!==location.id||entry.subcontractorId!==location.subcontractorId||entry.currency!==location.currency||entry.tenant!==order.tenant||entry.siteId!==order.siteId||entry.subcontractorId!==order.subcontractorId||entry.currency!==order.currency||entry.version!==order.version||!Number.isSafeInteger(entry.amountCents)||entry.amountCents===0||Math.abs(entry.amountCents)>1000000000)fail('Commitment ledger context or exact cents are invalid.','integrity_failed');
      if(entry.amountCents>0){if(entry.kind!==undefined||entry.id!==key(entry.tenant,entry.orderId)||!order.commitment||hash(entry)!==hash(order.commitment)||entry.amountCents!==order.amountCents)fail('Original positive commitment differs from its immutable order.','integrity_failed');continue;}
      const original=entries.get(entry.reversesEntryId),proposal=order.reversal;
      if(entry.kind!=='full-reversal'||entry.id!==key(entry.tenant,'reversal-'+entry.orderId)||!original||original.kind!==undefined||original.amountCents<=0||original.id!==order.commitment?.id||entry.originalEntryHash!==hash(original)||entry.amountCents!==-original.amountCents||reversed.has(original.id)||['tenant','siteId','subcontractorId','orderId','currency','version'].some(field=>entry[field]!==original[field])||!proposal||!proposal.entry||hash(proposal.entry)!==hash(entry)||entry.proposalVersion!==1||entry.scheduleImpactDays!==0||entry.reviewHash!==reversalHash(order)||!reversalApprovalsValid(order,entry.reviewHash)||entry.manager!==proposal.reviews.project_manager.reviewer||entry.finance!==proposal.reviews.finance.reviewer)fail('Full reversal must link exactly one original positive entry and its independent approval.','integrity_failed');
      reversed.add(original.id);
    }
    for(const order of orders.values()){
      if(order.commitment){const original=entries.get(order.commitment.id);if(!original||original.amountCents<=0||hash(original)!==hash(order.commitment))fail('Order points to a missing or changed original commitment.','integrity_failed');}
      if(!Object.hasOwn(order,'reversal'))continue;const proposal=order.reversal;
      if(!proposal||!order.commitment||proposal.version!==1||!registry[order.tenant]?.actors.operators.includes(proposal.requester)||!reversalReasons.includes(proposal.reasonCode)||typeof proposal.note!=='string'||!proposal.note.trim()||proposal.note.length>1000||/[\u0000-\u001f\u007f]/u.test(proposal.note)||proposal.originalEntryId!==order.commitment.id||proposal.originalEntryHash!==hash(order.commitment)||typeof proposal.sourceHash!=='string'||! /^[a-f0-9]{64}$/u.test(proposal.sourceHash)||typeof proposal.configHash!=='string'||! /^[a-f0-9]{64}$/u.test(proposal.configHash)||!proposal.reviews||typeof proposal.reviews!=='object'||Array.isArray(proposal.reviews)||Object.keys(proposal.reviews).some(role=>!['project_manager','finance'].includes(role)))fail('Reversal proposal metadata differs from the original committed order.','integrity_failed');
      try{instant(proposal.proposedAt);}catch{fail('Reversal proposal timestamp is invalid.','integrity_failed');}
      if(proposal.entry===null?reversed.has(order.commitment.id):!proposal.entry||!entries.has(proposal.entry.id)||!reversed.has(order.commitment.id))fail('Reversal proposal and ledger effect differ.','integrity_failed');
    }
    for(const budget of effects.budgets.values()){
      const location=registry[budget.tenant]?.site;if(!location||budget.id!==key(budget.tenant,location.id)||budget.siteId!==location.id||budget.currency!==location.currency||budget.budgetCents!==location.budgetCents)fail('Configured budget identity or allocation changed.','integrity_failed');
      const sum=[...entries.values()].filter(entry=>entry.tenant===budget.tenant&&entry.siteId===budget.siteId).reduce((total,entry)=>total+BigInt(entry.amountCents),0n);
      if(sum<0n||sum>BigInt(location.budgetCents)||!Number.isSafeInteger(budget.committedCents)||!Number.isSafeInteger(budget.remainingCents)||sum!==BigInt(budget.committedCents)||budget.remainingCents!==budget.budgetCents-budget.committedCents)fail('Signed cost ledger does not reconcile within the configured local budget.','integrity_failed');
    }
  }
  function scan(){
    const rows=db.prepare('SELECT * FROM construction_events ORDER BY seq').all(),effects={documents:new Map(),orders:new Map(),commitments:new Map(),budgets:baselineBudgets()};let count=0,previous=GENESIS;
    for(const row of rows){
      count++;if(Number(row.seq)!==count||row.previous_hash!==previous||eventHash(row)!==row.hash)fail('Construction audit chain changed.','integrity_failed');
      let body,request;try{body=JSON.parse(row.body);request=JSON.parse(row.request);}catch{fail('Stored event is not valid JSON.','integrity_failed');}
      if(hash(request)!==row.request_hash||request.tenant!==row.tenant||request.commandId!==row.command_id)fail('Stored command identity changed.','integrity_failed');
      if(!['documents','orders'].includes(body.result?.kind))fail('Stored result identity changed.','integrity_failed');
      for(const name of Object.keys(effects))for(const item of body.effects[name]??[]){
        if(name==='documents'||name==='orders'){const old=effects[name].get(item.id);if(item.revision!==(old?.revision??0)+1)fail('Stored revision lineage changed.','integrity_failed');if(name==='orders'&&old?.commitment){const previous={...old},next={...item};delete previous.revision;delete previous.reversal;delete next.revision;delete next.reversal;if(hash(previous)!==hash(next))fail('A historically committed order or original entry was altered.','integrity_failed');if(old.reversal&&(!item.reversal||hash(reversalProposal(old))!==hash(reversalProposal(item))||old.reversal.entry&&hash(old.reversal)!==hash(item.reversal)))fail('An immutable reversal proposal or posted reversal was altered.','integrity_failed');}}
        if(name==='commitments'&&effects.commitments.has(item.id))fail('Commitment ledger entry was repeated.','integrity_failed');
        if(name==='commitments'&&(item.amountCents>0?row.operation!=='recordCommitment':row.operation!=='recordReversal'))fail('Ledger posting operation does not match its sign.','integrity_failed');
        effects[name].set(item.id,item);
      }
      previous=row.hash;
    }
    const anchor=db.prepare('SELECT * FROM construction_head WHERE singleton=1').get();if(!anchor||Number(anchor.event_count)!==count||anchor.hash!==previous)fail('Durable construction head/count differs from history.','integrity_failed');
    for(const name of Object.keys(effects)){
      const actual=db.prepare(`SELECT id,body FROM construction_${name}`).all();if(actual.length!==effects[name].size||actual.some(row=>!effects[name].has(row.id)||row.body!==JSON.stringify(effects[name].get(row.id))))fail(`Durable ${name} differ from audited effects.`, 'integrity_failed');
    }
    reconcileLedger(effects);
    return {rows,effects,count,hash:previous};
  }
  function transaction(write,task){db.exec(write?'BEGIN IMMEDIATE':'BEGIN');try{const result=task();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  function selected(state,owner,identity,kind){tenant(owner);id(identity);const row=state.effects[kind].get(key(owner,identity));if(!row)fail('Construction record not found in this tenant.','not_found');return copy(row);}
  function documentView(doc){return {...copy(doc),stale:stale(doc),scope:constructionScope};}
  function currentDocuments(state,owner,siteId,subcontractorId){const found=new Map();for(const doc of state.effects.documents.values())if(doc.tenant===owner&&doc.siteId===siteId&&doc.subcontractorId===subcontractorId&&(!found.has(doc.kind)||found.get(doc.kind).version<doc.version))found.set(doc.kind,doc);return found;}
  function readinessValue(state,owner,siteId,subcontractorId,asOf){
    const location=site(owner,siteId,subcontractorId),latest=currentDocuments(state,owner,siteId,subcontractorId),reasons=[];
    if(instant(asOf)<instant(location.activeFrom)||instant(asOf)>=instant(location.activeUntil))reasons.push('Configured site is outside its active fixture period.');
    for(const kind of KINDS){const doc=latest.get(kind);if(!doc){reasons.push(`Missing current ${kind} document.`);continue;}if(stale(doc))reasons.push(`Current ${kind} source/configuration is stale.`);if(doc.review?.decision!=='verify')reasons.push(`Current ${kind} document is ${doc.review?.decision==='revoke'?'revoked':'unverified'}.`);if(instant(doc.validUntil)<=instant(asOf))reasons.push(`Current ${kind} document has expired.`);}
    return {ready:reasons.length===0,reasons,documents:[...latest.values()].map(documentView),asOf,siteId,subcontractorId,scope:'Fixture document checklist only; not issuer verification, legal compliance or site-work authorization.'};
  }
  function reviewHash(order,state){const docs=currentDocuments(state,order.tenant,order.siteId,order.subcontractorId);return hash({orderId:order.orderId,tenant:order.tenant,site:registry[order.tenant].site,subcontractorId:order.subcontractorId,sourceIssueId:order.sourceIssueId,requester:order.requester,version:order.version,scope:order.scope,amountCents:order.amountCents,currency:order.currency,scheduleImpactDays:order.scheduleImpactDays,channel:order.channel,reference:order.reference,sourceContentHash:order.sourceContentHash,receivedAt:order.receivedAt,documents:KINDS.map(kind=>{const doc=docs.get(kind);return doc?{kind,documentId:doc.documentId,version:doc.version,revision:doc.revision,contentHash:doc.contentHash,review:doc.review?{reviewer:doc.review.reviewer,decision:doc.review.decision}:null}:null;}),sourceHash:order.sourceHash,configHash:order.configHash});}
  function approvalsCurrent(order,fingerprint){const manager=order.reviews.project_manager,finance=order.reviews.finance;return manager?.decision==='approve'&&finance?.decision==='approve'&&manager.expectedHash===fingerprint&&finance.expectedHash===fingerprint&&manager.reviewer!==finance.reviewer&&manager.reviewer!==order.requester&&finance.reviewer!==order.requester;}
  function orderView(order,state,asOf=now()){const result=copy(order),fingerprint=reviewHash(order,state);result.reviewHash=fingerprint;result.readiness=readinessValue(state,order.tenant,order.siteId,order.subcontractorId,asOf);result.stale=stale(order);result.reviewsCurrent=Boolean(approvalsCurrent(order,fingerprint));result.status=order.commitment?'committed':!result.stale&&result.readiness.ready&&result.reviewsCurrent?'ready':'review-required';result.reversalHash=order.reversal?reversalHash(order):null;result.reversalReviewsCurrent=Boolean(order.reversal&&!result.stale&&!stale(order.reversal)&&reversalApprovalsValid(order,result.reversalHash));result.reversalStatus=!order.reversal?'not-proposed':order.reversal.entry?'reversed':result.reversalReviewsCurrent?'ready':'pending';result.scopeBoundary=constructionScope;return result;}
  function resultView(state,result,asOf){const row=state.effects[result.kind].get(result.id);if(!row)fail('Stored result is missing.','integrity_failed');return result.kind==='documents'?documentView(row):orderView(row,state,asOf);}
  function mutate(operation,value,fields,handler){
    schema(value,fields);tenant(value.tenant);id(value.commandId);
    return transaction(true,()=>{
      const state=scan(),requestHash=hash(value),prior=state.rows.find(row=>row.tenant===value.tenant&&row.command_id===value.commandId);
      if(prior){if(prior.operation!==operation||prior.request_hash!==requestHash)fail('Command ID already belongs to a different immutable intent.','conflict');return resultView(state,JSON.parse(prior.body).result,now());}
      if(sourceHash()!==SOURCE)fail('Loaded source changed. Restart and re-plan.','stale');
      const asOf=now(),effects={documents:[],orders:[],commitments:[],budgets:[]},result=handler(state,asOf,effects);
      const body=JSON.stringify({result,effects}),request=JSON.stringify(value),seq=state.count+1,row={seq,tenant:value.tenant,command_id:value.commandId,operation,request_hash:requestHash,request,body,previous_hash:state.hash};
      for(const name of Object.keys(effects))for(const item of effects[name]){
        if(name==='commitments')db.prepare('INSERT INTO construction_commitments(id,body) VALUES(?,?)').run(item.id,JSON.stringify(item));
        else db.prepare(`INSERT INTO construction_${name}(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body`).run(item.id,JSON.stringify(item));
      }
      const fingerprint=eventHash(row);db.prepare('INSERT INTO construction_events VALUES(?,?,?,?,?,?,?,?,?)').run(seq,value.tenant,value.commandId,operation,requestHash,request,body,state.hash,fingerprint);db.prepare('UPDATE construction_head SET event_count=?,hash=? WHERE singleton=1').run(seq,fingerprint);
      return resultView(scan(),result,asOf);
    });
  }
  const documentFields=['commandId','tenant','actor','siteId','subcontractorId','kind','sourceId','channel','reference','content','receivedAt','validUntil'];
  const orderFields=['commandId','tenant','actor','siteId','subcontractorId','sourceIssueId','scope','amountCents','scheduleImpactDays','channel','reference','content','receivedAt'];
  function orderFieldsValid(value,asOf){text(value.scope,'Change scope',2000);if(!Number.isSafeInteger(value.amountCents)||value.amountCents<1||value.amountCents>1000000000)fail('Amount must be positive safe USD cents through 1000000000.');if(!Number.isSafeInteger(value.scheduleImpactDays)||value.scheduleImpactDays<0||value.scheduleImpactDays>365)fail('Schedule impact must be zero through 365 whole days.');provenance(value,asOf);}
  const documentResult=doc=>({kind:'documents',id:doc.id}),orderResult=order=>({kind:'orders',id:order.id});
  const api={
    catalog(){return copy({scope:constructionScope,clock:{mode:options.clock?'Injected trusted test clock':'Fixed synthetic scenario clock',asOf:now()},sites:Object.values(registry).map(r=>r.site),actors:Object.fromEntries(['operators','compliance','projectManagers','finance'].map(role=>[role,Object.values(registry).flatMap(r=>r.actors[role])])),documentExamples:constructionDocumentExamples,orderExamples:constructionOrderExamples});},
    submitDocument(value){return mutate('submitDocument',value,documentFields,(state,asOf,effects)=>{
      actor(value.actor,value.tenant,'operators');const location=site(value.tenant,value.siteId,value.subcontractorId);active(location,asOf);if(!KINDS.includes(value.kind))fail('Document kind must be insurance or license.');id(value.sourceId);provenance(value,asOf);instant(value.validUntil);
      if([...state.effects.documents.values()].some(doc=>doc.tenant===value.tenant&&doc.sourceId===value.sourceId))fail('Source ID already has an immutable document; replay the original command.','conflict');
      const prior=currentDocuments(state,value.tenant,value.siteId,value.subcontractorId).get(value.kind),documentId=randomUUID();
      const doc={id:key(value.tenant,documentId),documentId,tenant:value.tenant,siteId:value.siteId,subcontractorId:value.subcontractorId,kind:value.kind,version:(prior?.version??0)+1,revision:1,submittedBy:value.actor,sourceId:value.sourceId,channel:value.channel,reference:value.reference,content:value.content,sourceContentHash:textHash(value.content),receivedAt:value.receivedAt,validUntil:value.validUntil,sourceHash:SOURCE,configHash,review:null,status:'unverified'};doc.contentHash=hash(doc);effects.documents.push(doc);return documentResult(doc);
    });},
    reviewDocument(value){return mutate('reviewDocument',value,['commandId','tenant','documentId','reviewer','expectedHash','expectedRevision','decision','note'],(state,asOf,effects)=>{
      actor(value.reviewer,value.tenant,'compliance');text(value.note,'Compliance note',1000);if(!['verify','revoke'].includes(value.decision))fail('Choose verify or revoke.');const doc=selected(state,value.tenant,value.documentId,'documents');fresh(doc);if(value.expectedRevision!==doc.revision)fail('Document review revision changed.','stale');if(doc.submittedBy===value.reviewer)fail('Compliance review must be independent of source submission.','conflict');if(value.expectedHash!==doc.contentHash)fail('Review must bind the exact document hash.','stale');
      const current=currentDocuments(state,value.tenant,doc.siteId,doc.subcontractorId).get(doc.kind);if(current.documentId!==doc.documentId)fail('Superseded document versions cannot gain current review authority.','stale');
      doc.review={reviewer:value.reviewer,decision:value.decision,note:value.note,asOf,expectedHash:value.expectedHash};doc.status=value.decision==='verify'?'verified':'revoked';doc.revision++;effects.documents.push(doc);return documentResult(doc);
    });},
    createOrder(value){return mutate('createOrder',value,orderFields,(state,asOf,effects)=>{
      actor(value.actor,value.tenant,'operators');const location=site(value.tenant,value.siteId,value.subcontractorId);active(location,asOf);id(value.sourceIssueId);orderFieldsValid(value,asOf);if([...state.effects.orders.values()].some(order=>order.tenant===value.tenant&&order.sourceIssueId===value.sourceIssueId))fail('Source issue already has an immutable order identity.','conflict');
      const orderId=randomUUID(),order={id:key(value.tenant,orderId),orderId,tenant:value.tenant,siteId:value.siteId,subcontractorId:value.subcontractorId,sourceIssueId:value.sourceIssueId,requester:value.actor,version:1,revision:1,scope:value.scope,amountCents:value.amountCents,currency:'USD',scheduleImpactDays:value.scheduleImpactDays,channel:value.channel,reference:value.reference,content:value.content,sourceContentHash:textHash(value.content),receivedAt:value.receivedAt,sourceHash:SOURCE,configHash,reviews:{},commitment:null};effects.orders.push(order);return orderResult(order);
    });},
    reviseOrder(value){return mutate('reviseOrder',value,['commandId','tenant','actor','orderId','expectedRevision','scope','amountCents','scheduleImpactDays','channel','reference','content','receivedAt'],(state,asOf,effects)=>{
      actor(value.actor,value.tenant,'operators');const order=selected(state,value.tenant,value.orderId,'orders');fresh(order);if(order.commitment)fail('Committed local orders are immutable.','conflict');if(value.actor!==order.requester)fail('Only the configured requesting fixture may revise this order.','conflict');if(value.expectedRevision!==order.revision)fail('Order revision changed.','stale');orderFieldsValid(value,asOf);order.version++;order.revision++;for(const field of ['scope','amountCents','scheduleImpactDays','channel','reference','content','receivedAt'])order[field]=value[field];order.sourceContentHash=textHash(value.content);order.reviews={};effects.orders.push(order);return orderResult(order);
    });},
    reviewOrder(value){return mutate('reviewOrder',value,['commandId','tenant','orderId','reviewer','role','expectedHash','decision','note'],(state,asOf,effects)=>{
      if(!['project_manager','finance'].includes(value.role))fail('Choose project_manager or finance review.');actor(value.reviewer,value.tenant,value.role==='project_manager'?'projectManagers':'finance');text(value.note,'Review note',1000);if(!['approve','reject'].includes(value.decision))fail('Choose approve or reject.');const order=selected(state,value.tenant,value.orderId,'orders');fresh(order);if(order.commitment)fail('Committed local orders are immutable.','conflict');if(order.requester===value.reviewer)fail('Order review must be independent of the requester.','conflict');const other=order.reviews[value.role==='finance'?'project_manager':'finance'];if(other?.reviewer===value.reviewer)fail('Manager and finance reviewers must be distinct.','conflict');
      const readiness=readinessValue(state,order.tenant,order.siteId,order.subcontractorId,asOf);if(!readiness.ready)fail(`Readiness hold: ${readiness.reasons.join(' ')}`,'conflict');const fingerprint=reviewHash(order,state);if(value.expectedHash!==fingerprint)fail('Review must bind the current order and document-set hash.','stale');
      order.reviews[value.role]={reviewer:value.reviewer,decision:value.decision,note:value.note,expectedHash:value.expectedHash,asOf};order.revision++;effects.orders.push(order);return orderResult(order);
    });},
    recordCommitment(value){return mutate('recordCommitment',value,['commandId','tenant','orderId','actor','expectedHash'],(state,asOf,effects)=>{
      actor(value.actor,value.tenant,'operators');const order=selected(state,value.tenant,value.orderId,'orders');fresh(order);if(order.commitment)fail('A commitment already exists for this order.','conflict');const fingerprint=reviewHash(order,state);if(value.expectedHash!==fingerprint)fail('Commitment must bind the current order and document-set hash.','stale');const readiness=readinessValue(state,order.tenant,order.siteId,order.subcontractorId,asOf);if(!readiness.ready)fail(`Readiness hold: ${readiness.reasons.join(' ')}`,'conflict');if(!approvalsCurrent(order,fingerprint))fail('Current independent manager and finance approvals are required.','conflict');
      const budget=copy(state.effects.budgets.get(key(order.tenant,order.siteId))),committed=budget.committedCents+order.amountCents;if(!Number.isSafeInteger(committed)||committed>budget.budgetCents)fail('Local change budget would be exceeded.','conflict');
      const entry={id:key(order.tenant,order.orderId),tenant:order.tenant,siteId:order.siteId,subcontractorId:order.subcontractorId,orderId:order.orderId,version:order.version,amountCents:order.amountCents,currency:order.currency,scheduleImpactDays:order.scheduleImpactDays,reviewHash:fingerprint,manager:order.reviews.project_manager.reviewer,finance:order.reviews.finance.reviewer,recordedBy:value.actor,asOf,label:'Local cost commitment only; no payment or site-work authority.'};budget.committedCents=committed;budget.remainingCents=budget.budgetCents-committed;order.commitment=entry;order.revision++;effects.orders.push(order);effects.commitments.push(entry);effects.budgets.push(budget);return orderResult(order);
    });},
    proposeReversal(value){return mutate('proposeReversal',value,['commandId','tenant','orderId','actor','expectedRevision','reasonCode','note'],(state,asOf,effects)=>{
      actor(value.actor,value.tenant,'operators');const order=selected(state,value.tenant,value.orderId,'orders');fresh(order);if(!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision!==order.revision)fail('Order reversal revision changed.','stale');if(!order.commitment)fail('Only an existing positive commitment can be fully reversed.','conflict');if(order.reversal)fail('This order already has its one immutable reversal proposal.','conflict');if(!reversalReasons.includes(value.reasonCode))fail('Choose change-cancelled or scope-withdrawn.');text(value.note,'Reversal proposal note',1000);const original=state.effects.commitments.get(order.commitment.id);if(!original||original.amountCents<=0||hash(original)!==hash(order.commitment))fail('The original positive commitment is not intact.','integrity_failed');
      order.reversal={version:1,requester:value.actor,reasonCode:value.reasonCode,note:value.note,originalEntryId:original.id,originalEntryHash:hash(original),sourceHash:SOURCE,configHash,proposedAt:asOf,reviews:{},entry:null};order.revision++;effects.orders.push(order);return orderResult(order);
    });},
    reviewReversal(value){return mutate('reviewReversal',value,['commandId','tenant','orderId','reviewer','role','expectedRevision','expectedHash','decision','note'],(state,asOf,effects)=>{
      if(!['project_manager','finance'].includes(value.role))fail('Choose project_manager or finance reversal review.');actor(value.reviewer,value.tenant,value.role==='project_manager'?'projectManagers':'finance');text(value.note,'Reversal review note',1000);if(!['approve','reject'].includes(value.decision))fail('Choose approve or reject.');const order=selected(state,value.tenant,value.orderId,'orders');fresh(order);if(!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision!==order.revision)fail('Order reversal revision changed.','stale');if(!order.reversal||order.reversal.entry)fail('An unposted reversal proposal is required.','conflict');fresh(order.reversal);if([order.requester,order.reversal.requester].includes(value.reviewer))fail('Reversal reviewers must be independent of both requesters.','conflict');const other=order.reversal.reviews[value.role==='finance'?'project_manager':'finance'];if(other?.reviewer===value.reviewer)fail('Reversal manager and finance must be distinct.','conflict');const fingerprint=reversalHash(order);if(value.expectedHash!==fingerprint)fail('Reversal review must bind the exact original entry and proposal.','stale');
      order.reversal.reviews[value.role]={reviewer:value.reviewer,decision:value.decision,note:value.note,expectedHash:fingerprint,asOf};order.revision++;effects.orders.push(order);return orderResult(order);
    });},
    recordReversal(value){return mutate('recordReversal',value,['commandId','tenant','orderId','actor','expectedRevision','expectedHash'],(state,asOf,effects)=>{
      actor(value.actor,value.tenant,'operators');const order=selected(state,value.tenant,value.orderId,'orders');fresh(order);if(!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision!==order.revision)fail('Order reversal revision changed.','stale');if(!order.reversal||order.reversal.entry)fail('An unposted reversal proposal is required.','conflict');fresh(order.reversal);const fingerprint=reversalHash(order);if(value.expectedHash!==fingerprint)fail('Reversal posting must bind the exact original entry and proposal.','stale');if(!reversalApprovalsValid(order,fingerprint))fail('Current independent manager and finance reversal approvals are required.','conflict');const original=state.effects.commitments.get(order.reversal.originalEntryId);if(!original||original.amountCents<=0||hash(original)!==order.reversal.originalEntryHash)fail('The original positive commitment changed.','integrity_failed');
      const budget=copy(state.effects.budgets.get(key(order.tenant,order.siteId))),committed=budget.committedCents-original.amountCents;if(!Number.isSafeInteger(committed)||committed<0||committed>budget.budgetCents)fail('Full reversal cannot over-credit the local commitment budget.','integrity_failed');const entry={id:key(order.tenant,'reversal-'+order.orderId),kind:'full-reversal',tenant:order.tenant,siteId:order.siteId,subcontractorId:order.subcontractorId,orderId:order.orderId,version:original.version,reversesEntryId:original.id,originalEntryHash:hash(original),amountCents:-original.amountCents,currency:original.currency,scheduleImpactDays:0,reviewHash:fingerprint,proposalVersion:1,manager:order.reversal.reviews.project_manager.reviewer,finance:order.reversal.reviews.finance.reviewer,recordedBy:value.actor,asOf,label:'Full local cost commitment reversal only; no payment, refund, contract cancellation, schedule change or site-work authority.'};budget.committedCents=committed;budget.remainingCents=budget.budgetCents-committed;order.reversal.entry=entry;order.revision++;effects.orders.push(order);effects.commitments.push(entry);effects.budgets.push(budget);return orderResult(order);
    });},
    documentReceipt(value){schema(value,['tenant','documentId']);return transaction(false,()=>documentView(selected(scan(),value.tenant,value.documentId,'documents')));},
    readiness(value){schema(value,['tenant','siteId','subcontractorId']);return transaction(false,()=>readinessValue(scan(),value.tenant,value.siteId,value.subcontractorId,now()));},
    receipt(value){schema(value,['tenant','orderId']);return transaction(false,()=>{const state=scan();return orderView(selected(state,value.tenant,value.orderId,'orders'),state);});},
    history(value){schema(value,['tenant']);tenant(value.tenant);return transaction(false,()=>{const state=scan(),asOf=now();return {documents:[...state.effects.documents.values()].filter(d=>d.tenant===value.tenant).map(documentView),orders:[...state.effects.orders.values()].filter(o=>o.tenant===value.tenant).map(o=>orderView(o,state,asOf))};});},
    state(value){schema(value,['tenant']);tenant(value.tenant);return transaction(false,()=>{const state=scan(),asOf=now();return {documents:[...state.effects.documents.values()].filter(d=>d.tenant===value.tenant).map(documentView),orders:[...state.effects.orders.values()].filter(o=>o.tenant===value.tenant).map(o=>orderView(o,state,asOf)),commitments:[...state.effects.commitments.values()].filter(o=>o.tenant===value.tenant).map(copy),budgets:[...state.effects.budgets.values()].filter(o=>o.tenant===value.tenant).map(copy)};});},
    audit(value){schema(value,['tenant']);tenant(value.tenant);return transaction(false,()=>{const state=scan();return {verification:{valid:true,eventCount:state.count,headHash:state.hash},events:state.rows.filter(r=>r.tenant===value.tenant).map(row=>({sequence:row.seq,commandId:row.command_id,operation:row.operation,hash:row.hash,previousHash:row.previous_hash,result:JSON.parse(row.body).result}))};});},
    verifyAudit(value){schema(value,['tenant']);tenant(value.tenant);return transaction(false,()=>{try{const state=scan();return {valid:true,eventCount:state.count,headHash:state.hash,tenantEventCount:state.rows.filter(r=>r.tenant===value.tenant).length,scope:'Unkeyed local chain and durable head/count; coherent privileged rewrites are outside this guarantee.'};}catch(error){if(error.code!=='integrity_failed')throw error;return {valid:false,reason:error.message};}});}
  };
  transaction(false,scan);return api;
}
export function openConstruction(path,options={}){const db=new DatabaseSync(path);try{return {...constructionDesk(db,options),close:()=>db.close()};}catch(error){db.close();throw error;}}
