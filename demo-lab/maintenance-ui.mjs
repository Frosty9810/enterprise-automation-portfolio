const commands = new Map();
let sequence = 0;
const command = (kind, body, revision) => {
  const key = JSON.stringify([kind, body, revision]);
  if (!commands.has(key)) commands.set(key, `pm-ui-${Date.now()}-${++sequence}`);
  return { ...body, commandId: commands.get(key) };
};

export async function mountMaintenance(document, api, download = value => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'maintenance-receipt.json'; a.click(); URL.revokeObjectURL(url);
}) {
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => {
    const e = document.createElement(tag); e.textContent = String(text ?? '');
    if (className) e.className = className;
    return e;
  };
  let catalog, current = null, busy = false, generation = 0, intent = 0;
  const actionIds = ['pmAccess','pmRevoke','pmPropose','pmApprove','pmReject','pmDispatch','pmReconcile','pmCancel','pmComplete','pmExport'];
  const active = () => current && !current.stale;
  const status = () => current?.status;
  const note = () => $('pmNote').value.trim();
  function controls() {
    $('pmIntake').disabled = !catalog || busy;
    for (const id of ['pmWindows','pmOccupant','pmReviewer','pmNote','pmProfile','pmAck']) $(id).disabled = busy;
    $('pmRestore').disabled = !catalog;
    $('pmRefresh').disabled = !catalog || busy;
    $('pmVerify').disabled = !catalog || busy;
    actionIds.forEach(id => $(id).disabled = true);
    if (busy || !active()) return;
    const terminal = ['cancelled','reported-complete'].includes(status());
    const closed = terminal || status() === 'access-revoked';
    const editable = !closed && !['emergency-hold','uncertain','delivered'].includes(status());
    $('pmAccess').disabled = !editable;
    $('pmRevoke').disabled = closed || !current.access?.windows?.length || current.access.revoked;
    $('pmPropose').disabled = !editable || !current.access?.windows?.length || current.access.revoked;
    const reviewable = status() === 'awaiting-review' && !!current.proposal;
    $('pmApprove').disabled = !reviewable || !$('pmAck').checked || !note();
    $('pmReject').disabled = !reviewable || !$('pmAck').checked || !note();
    $('pmDispatch').disabled = !['ready','queued'].includes(status());
    $('pmReconcile').disabled = current.delivery?.state !== 'uncertain';
    $('pmCancel').disabled = terminal || current.delivery?.state === 'uncertain' || !note();
    $('pmComplete').disabled = status() !== 'delivered' || !note();
    $('pmExport').disabled = false;
  }
  const notice = text => { $('pmNotice').textContent = text; };
  function invalidate() {
    generation++; current = null; $('pmAck').checked = false;
    $('pmReceipt').replaceChildren(node('p','Input changed. Save or recover the intended case before taking further action.'));
    controls();
  }
  function renderReceipt(receipt) {
    current = receipt; $('pmAck').checked = false;
    for (const [id,group] of [['pmOccupant','tenants'],['pmReviewer','reviewers']]) {
      const value = catalog.actors[group].find(actor=>actor.startsWith(`${receipt.tenant}-`));
      if (value) $(id).value=value;
    }
    const box = $('pmReceipt'), facts = node('dl','', 'facts');
    box.replaceChildren(node('h3', `${receipt.caseId} | ${receipt.status}`));
    if (receipt.stale) box.append(node('p','Historical receipt: source or configuration changed. Actions are disabled. Restart the lab with current sources and re-plan a new reviewed case; this saved revision is read-only.','hold'));
    if (receipt.priority === 'emergency') box.append(node('p','Human operator hold. Routine planning and dispatch are blocked.', 'hold'));
    const values = [
      ['Revision',receipt.revision],['Supplied issue',receipt.description],['Source / lease',`${receipt.sourceIssueId} / ${receipt.leaseId}`],
      ['Priority / reasons',`${receipt.priority} | ${(receipt.triageReasons ?? []).join('; ') || 'No emergency trigger recorded'}`],
      ['Access',receipt.access?.revoked ? 'Revoked' : JSON.stringify(receipt.access?.windows ?? [])],
      ['Vendor / window',receipt.proposal ? `${receipt.proposal.vendorId} | ${receipt.proposal.start} -> ${receipt.proposal.end}` : 'No eligible saved proposal'],
      ['Exact proposal hash',receipt.proposal?.hash ?? 'No proposal'],
      ['Independent review',receipt.review ? `${receipt.review.reviewer} | ${receipt.review.decision}` : 'No review recorded'],
      ['Local delivery',JSON.stringify(receipt.delivery ?? {})],
      ['Follow-up required',!receipt.requiresFollowUp ? 'No follow-up flag recorded' : receipt.priority === 'emergency' ? 'Human emergency procedure required; no routine receiver handoff or emergency notification is claimed.' : receipt.status === 'cancelled' ? 'Local cancellation recorded after a receiver handoff; human operator follow-up required.' : 'Access revoked after receiver handoff; human operator follow-up required. Capacity stays reserved until reconciled, explicit local cancellation.'],
      ['SLA snapshot',receipt.sla ? `As of ${receipt.sla.asOf} | age ${receipt.sla.ageMinutes} min / target ${receipt.sla.targetMinutes} min | ${receipt.sla.breached ? 'threshold breached' : 'within threshold'} (synthetic clock)` : 'No SLA snapshot']
    ];
    for (const [key,value] of values) facts.append(node('dt',key),node('dd',value));
    box.append(facts);
    if (receipt.blockedReasons?.length) box.append(node('p',receipt.blockedReasons.join('; '),'hold'));
    if (receipt.status === 'planning-review') box.append(node('p','Planning requires operator review: inspect access, vendor skill, availability and booking conflicts.','hold'));
    if (receipt.status === 'reported-complete') box.append(node('p','Operator-reported completion only; no physical visit has been verified.'));
    controls();
  }
  function renderHistory(result) {
    const box = $('pmHistory'); box.replaceChildren(node('h3',`Saved cases | ${result.cases.length}`));
    for (const item of result.cases) {
      const button = node('button',`${item.caseId} | ${item.status}`,'secondary');
      button.type = 'button'; button.disabled = busy;
      button.addEventListener('click', () => {
        if (busy) return;
        generation++; current = null; controls();
        run(async () => api('receipt',{tenant:item.tenant,caseId:item.caseId}), value => {
          $('pmInput').value = ''; $('pmSource').replaceChildren(node('p','Recovered saved case. Intake editor is cleared; restore a scenario for a new request.'));
          renderReceipt(value);
        });
      });
      box.append(button);
    }
  }
  async function evidence(tenant, token) {
    const [history,state,audit] = await Promise.all([api('history',{tenant}),api('state',{tenant}),api('audit',{tenant})]);
    if (token !== generation) return;
    renderHistory(history);
    $('pmEffects').replaceChildren(node('h3','Actual persisted local effects'),node('p',`Bookings: ${state.bookings.length} | Receiver records: ${state.receiverRecords.length} | Outbox entries: ${state.outbox.length}`),node('pre',JSON.stringify(state,null,2)));
    $('pmAudit').replaceChildren(node('h3','Local audit evidence'),node('pre',JSON.stringify(audit,null,2)));
  }
  async function run(work, display, tenant) {
    if (busy) return;
    const token = generation;
    busy = true; controls(); notice('Working with the saved local state...');
    try {
      const value = await work();
      if (token !== generation) return;
      if (display) display(value);
      if (tenant) await evidence(tenant,token);
      if (token === generation) notice('Local operation finished. Inspect the saved decision and actual effects below.');
    } catch (error) {
      if (token === generation) {
        // A transport failure may follow a committed mutation. Do not retain actionable authority.
        current = null; $('pmAck').checked = false;
        $('pmReceipt').replaceChildren(node('p','The response did not establish current authority. Refresh saved cases, then recover the case before acting.'));
        notice(`Operation could not establish current state: ${error.message}. Refresh saved cases to recover a committed operation; unchanged intake can also retry its original command.`);
      }
    } finally {
      busy = false; controls();
      $('pmHistory').querySelectorAll('button').forEach(button => button.disabled = false);
    }
  }
  function selectedInput() { return JSON.parse($('pmInput').value); }
  function restore() {
    invalidate(); intent++;
    const example = catalog.scenarios.find(item => item.id === $('pmScenario').value);
    $('pmInput').value = JSON.stringify({...example.input,commandId:`pm-intake-${Date.now()}-${++sequence}-${intent}`,sourceIssueId:`${example.input.sourceIssueId}-ui-${Date.now()}-${sequence}`},null,2);
    $('pmSource').replaceChildren(node('h3',`Illustrative scenario preview: ${example.title}`),node('p',example.input.description),node('p','The JSON editor contains the actual intake intent, including its new source ID. Manual edits do not update this illustrative preview; inspect the saved receipt for accepted source fields.'));
    notice('Example restored as a new intake intent. Review the supplied fields before saving.');
  }
  $('pmScenario').addEventListener('change',restore);
  $('pmRestore').addEventListener('click',restore);
  $('pmInput').addEventListener('input',invalidate);
  for (const id of ['pmWindows','pmOccupant','pmReviewer','pmNote','pmProfile']) {
    $(id).addEventListener('input', () => { $('pmAck').checked=false; controls(); });
    $(id).addEventListener('change', () => { $('pmAck').checked=false; controls(); });
  }
  $('pmAck').addEventListener('change',controls);
  $('pmIntake').addEventListener('click', () => {
    if (busy) return;
    generation++; current=null; controls();
    let input;
    try { input=selectedInput(); } catch { notice('Intake must be valid JSON.'); controls(); return; }
    run(() => api('intake',input),renderReceipt,input.tenant);
  });
  function mutate(kind, extra = () => ({})) {
    if (busy || !active()) return;
    const snapshot = current;
    let body;
    try { body=command(kind,{tenant:snapshot.tenant,caseId:snapshot.caseId,...extra(snapshot)},snapshot.revision); }
    catch (error) { notice(error.message); return; }
    run(() => api(kind,body),renderReceipt,snapshot.tenant);
  }
  const operator = receipt => catalog.actors.operators.find(value=>value.startsWith(`${receipt.tenant}-`));
  $('pmAccess').addEventListener('click',()=>mutate('grant-access',()=>({actor:$('pmOccupant').value,windows:JSON.parse($('pmWindows').value)})));
  $('pmRevoke').addEventListener('click',()=>mutate('revoke-access',()=>({actor:$('pmOccupant').value,note:note() || 'Resident fixture revoked permission.'})));
  $('pmPropose').addEventListener('click',()=>mutate('propose',r=>({actor:operator(r)})));
  for (const [id,decision] of [['pmApprove','approve'],['pmReject','reject']]) $(id).addEventListener('click',()=>mutate('review',r=>({reviewer:$('pmReviewer').value,expectedHash:r.proposal.hash,decision,note:note()})));
  $('pmDispatch').addEventListener('click',()=>mutate('dispatch',r=>({actor:operator(r),receiverProfileId:$('pmProfile').value})));
  $('pmReconcile').addEventListener('click',()=>mutate('reconcile',r=>({actor:operator(r)})));
  for (const [id,kind] of [['pmCancel','cancel'],['pmComplete','complete']]) $(id).addEventListener('click',()=>mutate(kind,r=>({actor:operator(r),expectedRevision:r.revision,note:note()})));
  $('pmRefresh').addEventListener('click',()=>{
    let tenant=current?.tenant;
    try { tenant ??= selectedInput().tenant; } catch { /* selected tenant below */ }
    tenant ??= catalog.scenarios.find(item=>item.id===$('pmScenario').value).input.tenant;
    const saved=current;
    run(async()=>{if(saved)return api('receipt',{tenant,caseId:saved.caseId});return null;},value=>{if(value)renderReceipt(value);},tenant);
  });
  $('pmVerify').addEventListener('click',()=>{
    const tenant=current?.tenant ?? catalog.scenarios.find(item=>item.id===$('pmScenario').value).input.tenant;
    run(()=>api('verify-audit',{tenant}),value=>{$('pmVerification').textContent=value.valid ? `Stored local audit chain valid | ${value.eventCount} events. This is not an external signature.` : 'Stored local audit verification failed.';});
  });
  $('pmExport').addEventListener('click',()=>{
    if (!active() || busy) return;
    const saved=current;
    run(async()=>{
      const verification=await api('verify-audit',{tenant:saved.tenant});
      // receipt scans the audit and reads the case in one SQLite snapshot. Read it last.
      const fresh=await api('receipt',{tenant:saved.tenant,caseId:saved.caseId});
      if (!verification.valid || fresh.stale || fresh.revision!==saved.revision || fresh.proposal?.hash!==saved.proposal?.hash || fresh.status!==saved.status) throw Error('Saved evidence changed; recover the fresh revision before exporting');
      return fresh;
    },value=>{renderReceipt(value);download(value);});
  });
  try {
    catalog=await api('catalog');
    for(const item of catalog.scenarios){const option=node('option',item.title);option.value=item.id;$('pmScenario').append(option);}
    for(const [id,values] of [['pmOccupant',catalog.actors.tenants],['pmReviewer',catalog.actors.reviewers]]) for(const value of values){const option=node('option',value);option.value=value;$(id).append(option);}
    $('pmScenario').disabled=false; $('pmInput').disabled=false;
    $('pmClock').textContent=`SLA clock: ${catalog.clock.mode} | as of ${catalog.clock.asOf}. This is a fixed synthetic snapshot, not live SLA monitoring.`;
    restore(); controls();
  } catch(error) { notice(`Maintenance catalog unavailable: ${error.message}`); }
  return { getCurrent:()=>current };
}

if (typeof document !== 'undefined' && document.getElementById('pmIntake')) {
  mountMaintenance(document,async(kind,body)=>{
    const response=await fetch(`/api/maintenance/${kind}`,kind==='catalog'?undefined:{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)});
    const value=await response.json();
    if(!response.ok)throw Error(value.error ?? value.message ?? `HTTP ${response.status}`);
    return value;
  });
}
