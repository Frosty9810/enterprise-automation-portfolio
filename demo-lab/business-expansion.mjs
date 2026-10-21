import assert from 'node:assert/strict';
const integer=(v,name)=>{if(!Number.isSafeInteger(v)||v<0)throw Error(name+' must be a non-negative integer');};
const required=v=>{if(typeof v!=='string'||!v.trim())throw Error('Identity required');return v.trim();};
export function reorder(x){
 required(x.sku);for(const k of ['onHand','reserved','target','packSize','stockAgeHours'])integer(x[k],k);
 if(!x.packSize||x.reserved>x.onHand)throw Error('Invalid stock or pack size');
 const available=x.onHand-x.reserved,qty=Math.ceil(Math.max(0,x.target-available)/x.packSize)*x.packSize;
 if(!Number.isSafeInteger(qty))throw Error('Reorder quantity exceeds safe integer range');
 return {sku:x.sku,available,proposedUnits:qty,queue:x.stockAgeHours>24?'refresh_stock':qty?'buyer_review':'no_order',purchaseSent:false};
}
export function crmHandoff(x){
 required(x.accountId);required(x.owner);integer(x.version,'version');integer(x.currentVersion,'currentVersion');
 if(typeof x.email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email))throw Error('Invalid email');
 if(x.consent!==true)return {queue:'consent_review',writeAllowed:false};
 if(x.version<=x.currentVersion)return {queue:'ignore_stale',writeAllowed:false};
 return {queue:'sync_review',writeAllowed:false,canonical:{accountId:x.accountId,email:x.email.trim().toLowerCase(),owner:x.owner,version:x.version},discardedFields:['notes','marketingPermission'],externalActions:0};
}
export function agentGate(x){
 required(x.ticketId);required(x.tool);integer(x.estimatedCents,'estimatedCents');integer(x.budgetCents,'budgetCents');
 const reasons=[];if(!['search_approved_kb','draft_reply'].includes(x.tool))reasons.push('tool_not_allowed');
 if(x.estimatedCents>x.budgetCents)reasons.push('budget_exceeded');
 if(x.grounded!==true)reasons.push('grounding_review');
 return {queue:reasons.length?'human_review':'draft_review',reasons,toolExecuted:false,replySent:false};
}
export function recovery(x){
 if(typeof x.confirmed!=='boolean'||typeof x.uncertain!=='boolean')throw Error('Explicit boolean write certainty required');
 required(x.eventId);integer(x.attempt,'attempt');integer(x.status,'status');integer(x.retryAfterSeconds,'retryAfterSeconds');
 if(x.confirmed===true)return {queue:'already_completed',retryAllowed:false,delaySeconds:0};
 if(x.uncertain===true)return {queue:'reconcile_first',retryAllowed:false,delaySeconds:0};
 if(x.attempt>=3)return {queue:'operator_review',retryAllowed:false,delaySeconds:0};
 const retry=x.status===429||x.status>=500&&x.status<=599;
 return {queue:retry?'retry_plan':'operator_review',retryAllowed:retry,delaySeconds:retry?Math.max(x.retryAfterSeconds,2**x.attempt):0};
}
const stock={sku:'BOLT-10',onHand:18,reserved:8,target:50,packSize:12,stockAgeHours:2};
const contact={accountId:'agency-demo',owner:'operations',email:'Demo@Example.com',version:2,currentVersion:1,consent:true};
const agent={ticketId:'support-001',tool:'draft_reply',estimatedCents:4,budgetCents:10,grounded:true};
const event={eventId:'booking-001',attempt:1,status:429,retryAfterSeconds:30,confirmed:false,uncertain:false};
export const expansionSuites={
 'INV-01':{run:reorder,cases:[['Pack rounding',stock,{proposedUnits:48,queue:'buyer_review'}],['Stale stock',{...stock,stockAgeHours:25},{queue:'refresh_stock'}],['Enough stock',{...stock,onHand:100},{proposedUnits:0,queue:'no_order'}],['Reservations exceed stock',{...stock,reserved:19},'Invalid stock'],['Invalid pack',{...stock,packSize:0},'Invalid stock']]},
 'CRM-01':{run:crmHandoff,cases:[['Canonical email',contact,{canonical:{accountId:'agency-demo',email:'demo@example.com',owner:'operations',version:2}}],['Stale event',{...contact,version:1},{queue:'ignore_stale'}],['No consent',{...contact,consent:false},{queue:'consent_review'}],['Malformed email',{...contact,email:'broken'},'Invalid email'],['Missing owner',{...contact,owner:''},'Identity required']]},
 'AGT-01':{run:agentGate,cases:[['Grounded draft',agent,{queue:'draft_review',toolExecuted:false}],['Unauthorized tool',{...agent,tool:'issue_refund'},{queue:'human_review',reasons:['tool_not_allowed']}],['Over budget',{...agent,estimatedCents:11},{reasons:['budget_exceeded']}],['Ungrounded response',{...agent,grounded:false},{reasons:['grounding_review']}],['Invalid budget',{...agent,budgetCents:-1},'non-negative']]},
 'OPS-01':{run:recovery,cases:[['Respect retry delay',event,{queue:'retry_plan',delaySeconds:30}],['Uncertain write',{...event,uncertain:true},{queue:'reconcile_first'}],['Completed replay',{...event,confirmed:true},{queue:'already_completed'}],['Attempt limit',{...event,attempt:3},{queue:'operator_review'}],['Non-retryable error',{...event,status:400},{retryAllowed:false}]]}
};
export function evaluateExpansion(id){const suite=expansionSuites[id];if(!suite)throw Error('Unknown project');const cases=suite.cases.map(([name,input,expected])=>{if(typeof expected==='string'){assert.throws(()=>suite.run(structuredClone(input)),new RegExp(expected));return {name,passed:true,expectedRejection:expected};}const output=suite.run(structuredClone(input));for(const [key,value]of Object.entries(expected))assert.deepEqual(output[key],value);return {name,passed:true,expected,output};});return {projectId:id,evaluation:{passed:cases.length,total:cases.length,cases},scope:'Local deterministic business rules; external tools and product integrations are not executed.'};}
export const expansionProjects=[
 {id:'INV-01',title:'INV-01 Bolt Supply Wholesale Reorder Desk',industry:'Wholesale operations',palette:['#80541b','#fff0da'],ghlRole:'Wholesale buyer relationship',stages:['Stock review','Buyer review','Order proposed','Closed'],presenter:['Pack-aware replenishment','Subtract reservations and round replenishment to supplier pack sizes while routing stale stock to refresh.','Compare rounded, stale and sufficient-stock cases.','Buyer review time and stockout frequency'],definition:['Wholesale purchasing teams','SKU stock, reservations, target and supplier pack size','Available stock and a proposed reorder quantity','A buyer reviews the proposal; stale stock must be refreshed and no purchase is sent.'],basis:['28 Airtable','34 Database Schemas']},
 {id:'CRM-01',title:'CRM-01 Studio North Agency Account Handoff',industry:'Agency sales operations',palette:['#365fa3','#e9f1ff'],ghlRole:'Agency account owner',stages:['Received','Consent review','Sync review','Closed'],presenter:['Version-aware CRM handoff','Normalize the contact and reject stale versions before proposing a relationship update.','Show stale versions, missing consent and canonical email output.','Stale writes prevented and account handoff turnaround'],definition:['Agency sales operations','An account identity, owner, version and storage consent','A minimized canonical contact or a review queue','An operator reviews the proposed sync; no hosted CRM write is performed.'],basis:['05 CRM Architectures','25 Close CRM','26 HubSpot','27 Salesforce']},
 {id:'AGT-01',title:'AGT-01 DeskPilot Support Agent Permission Gate',industry:'AI support operations',palette:['#65439b','#f1eaff'],ghlRole:'Support account relationship',stages:['Requested','Policy check','Draft review','Closed'],presenter:['Tool and cost boundaries','Check an allowlist, estimated cost budget and explicit grounding signal before a draft can reach review.','Compare permitted drafts, refund attempts and budget failures.','Unauthorized tool attempts and reviewer acceptance'],definition:['Support automation teams','A proposed tool, estimated cost, budget and grounding flag','Review queue and explicit blocking reasons','Drafts require review. The grounding flag is an input, not a real model evaluation; no model or tool is called.'],basis:['19 AI Agents','31 Prompt Library','35 Security','46 AI Documentation']},
 {id:'OPS-01',title:'OPS-01 ClearSlot Booking Handoff Recovery Desk',industry:'Service operations',palette:['#176d72','#e0f4f4'],ghlRole:'Service booking relationship',stages:['Received','Retry plan','Reconciliation','Resolved'],presenter:['Reconciliation before retry','Treat uncertain writes separately from retryable failures and stop at an attempt limit.','Compare rate limits, uncertain writes and completed-event replays.','Unresolved handoff age and duplicate booking incidents'],definition:['Service business operators','An event identity, HTTP status, attempt count and write certainty','A retry delay or reconciliation and operator queue','This build proposes recovery steps; it does not schedule appointments or execute background retries.'],basis:['29 Integrations','36 Monitoring','39 Maintenance','40 Troubleshooting']}
].map(p=>({...p,newBuild:true,source:'demo-lab/business-expansion.mjs',demo:p.definition[3],challenge:p.presenter[1],evaluationCases:5,sourceBasis:p.basis.join(' · ')}));
