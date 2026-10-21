import { planContact } from '../integrations/ghl-n8n/contract.mjs';

export function evaluateHandoff(id) {
  const event={projectId:id,eventId:'evaluation-001',storageConsent:true,contact:{email:' DEMO@example.com ',phone:'not-for-crm',notes:'not-for-crm'}};
  const config={projectId:id,locationId:'DEMO_LOCATION'};
  const cases=[
    ['Valid minimal handoff',event,r=>r.status==='ready'&&r.request.body.email==='demo@example.com'],
    ['Cross-location rejection',{...event,locationId:'OTHER'},r=>r.reason==='tenant_mismatch'],
    ['Cross-project rejection',{...event,projectId:'OTHER-99'},r=>r.reason==='project_mismatch'],
    ['Strict consent',{...event,storageConsent:'true'},r=>r.reason==='storage_consent_required'],
    ['Sensitive record rejection',{...event,sensitive:true},r=>r.reason==='sensitive_record'],
    ['Invalid email rejection',{...event,contact:{email:'invalid'}},r=>r.reason==='invalid_email'],
    ['Minimal fields and no communication',event,r=>r.status==='ready'&&!('phone' in r.request.body)&&!('notes' in r.request.body)&&r.communicationAllowed===false],
  ].map(([name,input,check])=>({name,passed:check(planContact(input,config))}));
  return { scope:'Shared contact-planner cases executed on this request; not whole-business or hosted GHL acceptance.',passed:cases.filter(c=>c.passed).length,total:cases.length,cases };
}
