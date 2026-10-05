export function mountProductStudio(d, api, download) {
  const $ = id => d.getElementById(id);
  let fixture, result = null, busy = false, generation = 0;
  const fields = ['title','description','locale','material','dimensions','warranty'];
  const controls = () => { $('evaluate').disabled=busy; $('approve').disabled=busy || !result || result.decision.decision.action==='blocked' || !$('ack').checked || !!result.review; $('export').disabled=busy || !result?.review; };
  const invalidate = () => { generation++; result=null; $('ack').checked=false; $('receipt').replaceChildren(); $('reasons').replaceChildren(); $('comparison').replaceChildren(); $('decisionTitle').textContent='Draft changed'; $('decisionCopy').textContent='Evaluate the current draft. A previous review cannot authorize changed content.'; controls(); };
  const render = () => {
    const action=result.decision.decision.action;
    $('decisionTitle').textContent=action==='blocked'?'Facts changed. Draft blocked.':result.review?'Exact draft reviewed.':'Policy passed. Review next.';
    $('decisionCopy').textContent=result.replayed?'This exact evaluation already exists. Its original receipt is retained.':action==='blocked'?'Correct the candidate and evaluate again. A blocked draft cannot be approved.':action==='human_review'?'This locale requires explicit human review. Inspect the translation before recording it.':'The checked fields passed. Inspect the translation and record an explicit review before exporting.';
    $('reasons').replaceChildren(...result.decision.decision.reasons.map(reason=>{const li=d.createElement('li');li.textContent=reason.replaceAll('_',' ');return li;}));
    const table=d.createElement('table'); table.className='comparison';
    const head=d.createElement('tr');for(const label of ['Protected fact','Source','Candidate']){const th=d.createElement('th');th.textContent=label;head.append(th);}table.append(head);
    for(const key of ['material','dimensions_cm','warranty_months']){const row=d.createElement('tr');if(result.input.source[key]!==result.input.candidate[key])row.className='changed';for(const value of [key.replaceAll('_',' '),result.input.source[key],result.input.candidate[key]]){const td=d.createElement('td');td.textContent=String(value);row.append(td);}table.append(row);} $('comparison').replaceChildren(table);
    $('receipt').replaceChildren();for(const [label,value] of [['Receipt',result.receiptId],['Source revision',result.sourceRevision],['Policy SHA-256',result.policyHash],['Review',result.review?.reviewer ?? 'Pending']]){const dt=d.createElement('dt'),dd=d.createElement('dd');dt.textContent=label;dd.textContent=String(value);$('receipt').append(dt,dd);} controls();
  };
  const audit = async () => { const response=await api('/api/product/audit');$('audit').replaceChildren(...response.events.slice(-12).reverse().map(event=>{const li=d.createElement('li');li.textContent=`${event.sequence.toString().padStart(3,'0')} · ${event.kind} · ${event.receiptId.slice(0,12)}${event.detail.reviewer?' · '+event.detail.reviewer:''}`;return li;})); };
  const operate = async fn => { if(busy)return;busy=true;$('error').textContent='';controls();try{await fn();await audit();}catch(error){$('error').textContent=error.message;}finally{busy=false;controls();} };
  function scenario(name) {
    const candidate=structuredClone(fixture.candidate);
    if(name==='invented')candidate.description+=' Oferta para 999 clientes.';
    if(name==='warranty')candidate.warranty_months=12;
    if(name==='claim')candidate.description+=' guaranteed results.';
    $('source').value=JSON.stringify(fixture.source,null,2);
    for(const [id,key]of [['title','title'],['description','description'],['locale','locale'],['material','material'],['dimensions','dimensions_cm'],['warranty','warranty_months']])$(id).value=candidate[key];
    d.querySelectorAll('[data-scenario]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scenario===name)));invalidate();
  }
  fields.concat('source').forEach(id=>$(id).addEventListener('input',invalidate));
  $('ack').addEventListener('change',controls);
  d.querySelectorAll('[data-scenario]').forEach(button=>button.addEventListener('click',()=>scenario(button.dataset.scenario)));
  $('candidateForm').addEventListener('submit',event=>{event.preventDefault();void operate(async()=>{
    invalidate(); $('decisionTitle').textContent='Checking the current draft…'; const requestGeneration=generation;
    const source=JSON.parse($('source').value);
    const candidate={title:$('title').value,description:$('description').value,locale:$('locale').value,material:$('material').value,dimensions_cm:$('dimensions').value,warranty_months:Number($('warranty').value)};
    const response=await api('/api/product/evaluate',{source,candidate});
    if(requestGeneration!==generation)throw new Error('Draft changed during evaluation. Evaluate it again.');
    result=response;render();
  });});
  $('approve').addEventListener('click',()=>{void operate(async()=>{const requestGeneration=generation;const receiptId=result?.receiptId;if(!receiptId||!$('ack').checked)throw new Error('Inspect and acknowledge the current draft');const response=await api('/api/product/review',{receiptId,reviewer:$('reviewer').value});if(requestGeneration!==generation)throw new Error('Draft changed during review. Review the new draft.');result=response;render();});});
  $('export').addEventListener('click',()=>{void operate(async()=>{const requestGeneration=generation;const response=await api('/api/product/export',{receiptId:result?.receiptId});if(requestGeneration!==generation)throw new Error('Draft changed during export. Evaluate it again.');download(response);});});
  $('refresh').addEventListener('click',()=>{void operate(audit);});
  return {async init(){fixture=await api('/api/product/example');scenario('safe');$('decisionTitle').textContent='Waiting for a draft';$('decisionCopy').textContent='Choose an example or edit the candidate, then evaluate it.';await audit();}};
}

if(typeof document!=='undefined') {
  const api=async(path,body)=>{const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Client':'local-showcase'},body:JSON.stringify(body)}:{});const value=await response.json();if(!response.ok)throw new Error(value.error||'Request failed');return value;};
  const download=value=>{const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ECOM-01-reviewed-handoff.json';a.click();URL.revokeObjectURL(url);};
  mountProductStudio(document,api,download).init().catch(error=>{document.getElementById('error').textContent=error.message;});
}
