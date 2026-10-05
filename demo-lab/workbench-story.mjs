// Presentation helpers describe observable inputs and returned decisions only.
export const scenarios = {
 'ENG-01': [['approved','Approved excerpt'],['changed','Changed product quantity'],['unapproved','Unapproved source'],['tenant','Another team’s source']],
 'ENG-02': [['success','Successful write, then replay'],['timeout-before','Timeout before the write'],['timeout-after','Lost acknowledgement after the write'],['conflict','Same key, different amount'],['unapproved','Approval missing']]
};
export function scenarioInput(id, key, fixture) {
 if (!scenarios[id]?.some(([value])=>value===key)) throw Error('Unknown scenario');
 const x=structuredClone(fixture);
 if(id==='ENG-01') {
  x.claims=[x.claims[0]];
  if(key==='changed')x.claims[0].text='Each box contains 24 cookies.';
  if(key==='unapproved')x.sources[0].approved=false;
  if(key==='tenant')x.sources[0].tenant='other-team';
 } else {
  x.actions=x.actions.slice(0,2);
  x.actions[0].outcome=['timeout-before','timeout-after'].includes(key)?key:'success';
  if(key==='conflict')x.actions[1].amount=24;
  if(key==='unapproved')x.actions.forEach(a=>a.approved=false);
 }
 return x;
}
export const engineeringNotes={
 'ENG-03': {fn:'compareEvaluations',choice:'Compare each candidate answer with the same case and exact expected label. Aggregate accuracy alone hides a fix that is offset by a new regression.',failure:'Entered latency is fixture data. Exact matching does not grade the quality of free-form explanations.',next:'Before deployment: capture real outputs and timings, version the evaluation set, and use task-specific human rubrics for open-ended answers.'},
 'ENG-04': {fn:'reviewBench',choice:'Keep unreviewed answers visible and exclude them from the reviewed acceptance denominator. Use a frozen snapshot to reveal later edits.',failure:'A supplied label is a reviewer judgment, not objective correctness. The snapshot detects changes but does not authenticate the reviewer.',next:'Before deployment: record reviewer identity, rubric changes, disagreement and a durable audit history.'},
 'ENG-06': {fn:'compareRuns',choice:'Retain errors and missing trials in the expected case count. Compare shared trial sets instead of presenting only successful responses.',failure:'Imported provider names, outputs and durations are unverified data. This notebook does not call or rank live models.',next:'Before deployment: add provider adapters, retain request provenance and measure repeated trials with uncertainty and actual cost.'},
 'ENG-07': {fn:'recommend',choice:'Start with an inspectable keyword baseline and deterministic tie-breaking. A learned ranker may find synonyms but adds data and evaluation requirements.',failure:'Literal matching misses meaning. Recall depends on the relevance labels supplied for this invented catalog.',next:'Before deployment: evaluate with real consented preferences, validate activity data, and compare any embedding model with this baseline.'},
 'ENG-08': {fn:'trainTiny',choice:'Use one logistic neuron so every update can be inspected. Training loss and held-out loss are computed independently, and a numerical gradient checks the update calculation.',failure:'This tiny binary-classification fixture cannot establish generalization to a new population. It is not LLM training.',next:'For a larger learning experiment: collect representative data, define splits before training and compare several seeds and baselines.'},
 'ENG-01': {fn:'verifyClaims',choice:'Use exact excerpts as a narrow, auditable baseline. A semantic model could accept useful paraphrases, but would need a separate evaluation for unsupported claims.',failure:'Even an approved source may be factually wrong. Tenant and approval fields here are supplied inputs, not authenticated access controls.',next:'Before deployment: enforce identity and source permissions on the server, version documents, and evaluate paraphrases against human judgments.'},
 'ENG-02': {fn:'replayActions',choice:'Hold a retry when the first write may have committed. Blind retries are simpler, but can reserve the same units twice.',failure:'The ledger resets on each run. This demonstrates a decision rule, not a guarantee across processes or crashes.',next:'Before deployment: store request identities durably, handle concurrent writes transactionally, and reconcile uncertain requests with the destination system.'},
 'ENG-05': {fn:'shelfSense',choice:'Check exact labeled text and require explicit review before releasing a draft. Automatic document extraction would cover more formats but introduces another error source.',failure:'A correct number with a missing approval is still held. Contradictory source pages also prevent release.',next:'Before deployment: add a tested parser or OCR adapter, authenticated review history, and a versioned destination catalog.'},
 'ENG-09': {fn:'receive (candidate.mjs)',choice:'Remember event IDs and reject conflicting payloads. A simple stock subtraction cannot distinguish a retry from a new delivery event.',failure:'Five recorded checks cover this fixed example. They do not establish production concurrency, database durability or complete repository correctness.',next:'Before deployment: persist event identity with the inventory update and test concurrent delivery, crashes and reconciliation.'}
};
export function traceRows(id,input,result){
 if(id==='ENG-01')return result.decisions.map(r=>{const c=input.claims.find(c=>c.id===r.id),s=input.sources.find(s=>s.id===c.source);return {id:r.id,input:`Claim: ${c.text} Cited quote: ${c.quote}`,rule:s?`Source ${s.id}; tenant ${s.tenant}; approved ${s.approved}. Require the exact quote and unchanged claim.`:'Require an existing, approved source for this tenant.',status:r.status,output:r.reasons.length?r.reasons.join('; '):r.quote};});
 if(id==='ENG-02')return result.decisions.map(r=>{const a=input.actions.find(a=>a.id===r.id);return {id:r.id,input:`${a.amount} units · key ${a.key} · ${a.outcome} · approved ${a.approved}`,rule:'Check tool, approval and prior request identity before changing state.',status:r.status,output:`${r.reason}. Running simulator total: ${r.simulatorTotal} units.`};});
 if(id==='ENG-05')return result.decisions.map(r=>({id:r.id,input:r.value===undefined?'Required field absent':`${r.value} · page ${r.page} · quote: ${r.quote}`,rule:'Require a matching labeled value, consistent pages and explicit approval.',status:r.status,output:r.reason}));
 return [];
}
