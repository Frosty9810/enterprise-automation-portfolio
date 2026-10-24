import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function text(value, label) { if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`${label} required`); return value.trim(); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('Valid ISO date required');
  return value;
}
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object required'); }
function strings(value) { if (!Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string')) throw new Error('String list required'); return value; }

export function construction(input) {
  object(input);text(input.requestId,'Request ID');text(input.requester,'Requester');
  date(input.asOf);date(input.certificateExpiry);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0 || !Number.isSafeInteger(input.version) || input.version < 1) throw new Error('Valid amount and version required');
  if (!Array.isArray(input.approvals) || input.approvals.length > 20) throw new Error('Approval list required');
  let previous = 'GENESIS';
  const ledger = input.approvals.map((a, index) => {
    object(a);text(a.actor,'Approver');text(a.role,'Role');
    if (!Number.isSafeInteger(a.version) || !Number.isSafeInteger(a.amountCents)) throw new Error('Invalid approval');
    const event = { index, requestId:input.requestId, actor:a.actor, role:a.role, version:a.version, amountCents:a.amountCents, previous };
    previous = hash(event);return { ...event, hash:previous };
  });
  const valid = ledger.filter(a => a.actor !== input.requester && a.version === input.version && a.amountCents === input.amountCents);
  const manager = valid.find(a=>a.role==='project_manager');
  const finance = valid.find(a=>a.role==='finance' && a.actor!==manager?.actor);
  const reasons = [];
  if (input.certificateExpiry < input.asOf) reasons.push('expired_certificate');
  if (!manager || !finance) reasons.push('independent_current_approvals_required');
  return { queue: reasons.length ? 'exception_review' : 'release_review', reasons, ledger, ledgerHead:previous, releaseAllowed:false };
}

export function referral(input) {
  object(input);text(input.referralId,'Referral ID');
  strings(input.documents);
  if (input.storageConsent !== true) return { queue:'consent_review', missing:[], ready:false, externalActions:0 };
  const checklists = { DEMO_PAYER_A:['referral_form','order'], DEMO_PAYER_B:['referral_form','order','supporting_document'] };
  if (!Object.hasOwn(checklists,input.payer)) return { queue:'payer_review', missing:[], ready:false, externalActions:0 };
  const missing = checklists[input.payer].filter(name=>!input.documents.includes(name));
  return { queue: missing.length ? 'document_follow_up' : 'authorization_staff_review', missing, ready:missing.length===0, externalActions:0 };
}

const normalize = name => text(name,'Entity').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function legalIntake(input) {
  object(input);text(input.matterId,'Matter ID');strings(input.parties);strings(input.adverseEntities);
  if (!input.parties.length) throw new Error('At least one party required');
  const matches=[];
  for (const party of input.parties) {
    const name=normalize(party);
    if (!name) throw new Error('Entity must contain letters or numbers');
    for (const adverse of input.adverseEntities) {
      const known=normalize(adverse);
      if (!known) throw new Error('Entity must contain letters or numbers');
      if (name===known) matches.push({party,kind:'exact'});
      else if(name.split(' ').some(word=>word.length>3 && known.split(' ').includes(word))) matches.push({party,kind:'ambiguous'});
    }
  }
  return { queue:matches.some(m=>m.kind==='exact')?'conflict_review':matches.length?'identity_review':'attorney_clearance', matches, matterCreationAllowed:false };
}

export function insuranceIntake(input) {
  object(input);text(input.claimId,'Claim ID');text(input.eventId,'Event ID');
  date(input.lossDate);date(input.policyStart);date(input.policyEnd);strings(input.documents);
  if(input.policyEnd<input.policyStart)throw new Error('Invalid policy window');
  const missing=['incident_report','policy_reference'].filter(d=>!input.documents.includes(d));
  const outsideWindow=input.lossDate<input.policyStart||input.lossDate>input.policyEnd;
  const reasons=[...(outsideWindow?['policy_date_review']:[]),...(missing.length?['missing_evidence']:[]),...(input.duplicateSignal===true?['duplicate_signal_review']:[])];
  return { queue:reasons.length?'adjuster_exception_review':'adjuster_intake', reasons, missing, coverageDecision:'not_made', externalActions:0 };
}

const approval={requestId:'change-001',requester:'requester-a',asOf:'2026-09-08',certificateExpiry:'2026-10-01',version:2,amountCents:125000,
  approvals:[{actor:'manager-a',role:'project_manager',version:2,amountCents:125000},{actor:'finance-b',role:'finance',version:2,amountCents:125000}]};
const claim={claimId:'claim-001',eventId:'event-001',lossDate:'2026-09-01',policyStart:'2026-01-01',policyEnd:'2026-12-31',documents:['incident_report','policy_reference']};
export const suites={
  'CON-01':{run:construction,cases:[
    {name:'Current independent approvals',input:approval,expected:{queue:'release_review',releaseAllowed:false}},
    {name:'Expired certificate blocks readiness',input:{...approval,certificateExpiry:'2026-09-07'},expected:{queue:'exception_review'}},
    {name:'Changed amount invalidates approvals',input:{...approval,amountCents:130000},expected:{queue:'exception_review'}},
    {name:'Requester cannot approve own change',input:{...approval,requester:'manager-a'},expected:{queue:'exception_review'}},
    {name:'Stale approval version',input:{...approval,version:3},expected:{queue:'exception_review'}},
    {name:'Invalid amount is rejected',input:{...approval,amountCents:-1},error:'Valid amount'},
  ]},
  'MED-01':{run:referral,cases:[
    {name:'Complete fictional payer checklist',input:{referralId:'ref-001',storageConsent:true,payer:'DEMO_PAYER_A',documents:['referral_form','order']},expected:{queue:'authorization_staff_review',ready:true}},
    {name:'Missing order',input:{referralId:'ref-002',storageConsent:true,payer:'DEMO_PAYER_A',documents:['referral_form']},expected:{queue:'document_follow_up',missing:['order']}},
    {name:'Unknown payer',input:{referralId:'ref-003',storageConsent:true,payer:'UNKNOWN',documents:[]},expected:{queue:'payer_review'}},
    {name:'Consent must be a boolean',input:{referralId:'ref-004',storageConsent:'true',payer:'DEMO_PAYER_A',documents:[]},expected:{queue:'consent_review',ready:false}},
    {name:'Second payer requires supporting document',input:{referralId:'ref-005',storageConsent:true,payer:'DEMO_PAYER_B',documents:['referral_form','order']},expected:{missing:['supporting_document']}},
    {name:'Malformed documents rejected',input:{referralId:'ref-006',documents:'order'},error:'String list'},
  ]},
  'LEGAL-01':{run:legalIntake,cases:[
    {name:'Exact normalized conflict',input:{matterId:'matter-001',parties:['NORTHSTAR, LTD'],adverseEntities:['Northstar Ltd']},expected:{queue:'conflict_review',matterCreationAllowed:false}},
    {name:'Ambiguous shared entity token',input:{matterId:'matter-002',parties:['Northstar Holdings'],adverseEntities:['Northstar Ltd']},expected:{queue:'identity_review'}},
    {name:'No match still requires attorney clearance',input:{matterId:'matter-003',parties:['Cedar Studio'],adverseEntities:['Northstar Ltd']},expected:{queue:'attorney_clearance',matterCreationAllowed:false}},
    {name:'Empty party list rejected',input:{matterId:'matter-004',parties:[],adverseEntities:[]},error:'At least one'},
    {name:'Unicode names retain identity',input:{matterId:'matter-005',parties:['Árbol SA'],adverseEntities:['ÁRBOL SA']},expected:{queue:'conflict_review'}},
    {name:'Punctuation is not an entity',input:{matterId:'matter-006',parties:['---'],adverseEntities:[]},error:'Entity must'},
  ]},
  'INS-01':{run:insuranceIntake,cases:[
    {name:'Complete intake for adjuster',input:claim,expected:{queue:'adjuster_intake',coverageDecision:'not_made'}},
    {name:'Outside policy dates',input:{...claim,lossDate:'2025-12-31'},expected:{queue:'adjuster_exception_review',coverageDecision:'not_made'}},
    {name:'Missing incident report',input:{...claim,documents:['policy_reference']},expected:{missing:['incident_report']}},
    {name:'Duplicate signal is a review flag',input:{...claim,duplicateSignal:true},expected:{reasons:['duplicate_signal_review'],coverageDecision:'not_made'}},
    {name:'Invalid calendar date rejected',input:{...claim,lossDate:'2026-02-30'},error:'Valid ISO'},
    {name:'Reversed policy dates rejected',input:{...claim,policyEnd:'2025-01-01'},error:'Invalid policy'},
  ]},
};

export function evaluateRoadmap(id) {
  const suite=suites[id];if(!suite)throw new Error('Unknown scenario suite');
  const cases=suite.cases.map(c=>{
    if(c.error){assert.throws(()=>suite.run(structuredClone(c.input)),new RegExp(c.error));return {name:c.name,passed:true,expectedRejection:c.error};}
    const output=suite.run(structuredClone(c.input));
    for(const [key,value] of Object.entries(c.expected))assert.deepEqual(output[key],value,`${id}: ${c.name}: ${key}`);
    return {name:c.name,passed:true,expected:c.expected,output};
  });
  return { projectId:id,evaluation:{passed:cases.length,total:cases.length,cases},scope:'Synthetic administrative decision cases; no external actions or professional determinations.' };
}

export const roadmapProjects=[
  {id:'CON-01',title:'CON-01 Subcontractor Readiness and Change Approval Review',industry:'Construction',palette:['#9b4a13','#ffecdc'],ghlRole:'Contractor relationship owner',stages:['Received','Evidence review','Approval review','Closed'],demo:'Expired certificates and stale or self-approved change orders route to review. A hash-linked approval record accompanies the result.',presenter:['Version-bound approvals','Bind approvals to the exact amount and version, with independent reviewers.','Compare valid, stale and self-approved cases and inspect the ledger.','Approval exceptions and change-review turnaround']},
  {id:'MED-01',title:'MED-01 Referral Completeness and Authorization Staff Queue',industry:'Medical administration',palette:['#0b7284','#dff5f8'],ghlRole:'Clinic administration contact',stages:['Received','Completeness','Staff review','Closed'],demo:'Fictional payer checklists route missing documents, unknown payers and missing consent to administrative review.',presenter:['Administrative completeness','Use explicit fictional checklists and fail closed on unknown payer configuration.','Compare complete, missing-document and consent cases.','Incomplete referral rate and staff queue turnaround']},
  {id:'LEGAL-01',title:'LEGAL-01 Matter Conflict and Entity Review Gate',industry:'Legal operations',palette:['#653aab','#eee5fd'],ghlRole:'Firm operations contact',stages:['Intake','Entity review','Attorney clearance','Closed'],demo:'Exact and ambiguous entity matches stop automatic matter creation; every route ends with professional review.',presenter:['Conservative entity matching','Route exact and ambiguous matches differently while always retaining attorney clearance.','Compare exact, ambiguous and unmatched cases; inspect matterCreationAllowed.','Reviewer-confirmed match recall and review workload']},
  {id:'INS-01',title:'INS-01 Loss Intake and Evidence Review Queue',industry:'Insurance operations',palette:['#23613f','#e3f3e7'],ghlRole:'Agency relationship contact',stages:['Received','Evidence check','Adjuster review','Closed'],demo:'Loss-date, missing-evidence and duplicate signals route to adjuster review without approving or denying coverage.',presenter:['Evidence before determination','Treat policy-date and duplicate signals as review flags, never as coverage decisions.','Show complete and exception cases with coverageDecision=not_made.','Intake completeness and adjuster triage turnaround']},
].map(p=>({...p,source:'demo-lab/roadmap-scenarios.mjs',newBuild:true,challenge:p.demo,sourceBasis:'COMPLETION-ROADMAP.md · industry flagship backlog',evaluationCases:suites[p.id].cases.length}));
