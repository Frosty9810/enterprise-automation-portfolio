import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { projects } from './catalog.mjs';

const contract = readFileSync(new URL('../integrations/ghl-n8n/contract.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n').replace('export function', 'function');
const node = (id, name, type, parameters, x) => ({ id, name, type: `n8n-nodes-base.${type}`,
  typeVersion: type === 'httpRequest' ? 4.2 : type === 'code' ? 2 : 1,
  parameters, position: [x, 300] });
const http = (url, jsonBody) => ({ method: 'POST', url, sendBody: true, specifyBody: 'json', jsonBody,
  sendHeaders: true, headerParameters: { parameters: [
    { name: 'X-Demo-Client', value: 'local-showcase' },
    { name: 'Authorization', value: 'Bearer LOCAL_DEMO_ONLY' },
    { name: 'Version', value: 'v3' },
  ] }, options: { timeout: 180000 } });

export function makeWorkflow(project) {
  const fixture = { projectId: project.id, eventId: 'showcase-001', storageConsent: true,
    contact: { firstName: 'Demo', lastName: project.id, email: `${project.id.toLowerCase()}@example.com` } };
  const nodes = [
    node('manual', 'Run local showcase', 'manualTrigger', {}, 0),
    node('business', 'Run original business logic', 'httpRequest', http(`http://127.0.0.1:5680/api/domain/${project.id}`, '{}'), 260),
    node('plan', 'Validate contact handoff', 'code', { jsCode: contract + `\nconst domain = $input.first().json;
if (domain.status !== 'passed') throw new Error('Business demo did not pass');
const plan = planContact(${JSON.stringify(fixture)}, {projectId: '${project.id}', locationId: 'DEMO_LOCATION'});
if (plan.status !== 'ready') throw new Error(plan.reason);
return [{json: {...plan, domain}}];` }, 520),
    node('upsert', 'GHL simulator - Upsert contact', 'httpRequest', http('http://127.0.0.1:5680/contacts/upsert', '={{ JSON.stringify($json.request.body) }}'), 780),
    node('verify', 'Verify result and preserve evidence', 'code', { jsCode: `const response = $input.first().json;
const planned = $('Validate contact handoff').first().json;
if (!response.contact?.id || response.contact.locationId !== planned.request.body.locationId || response.contact.email !== planned.request.body.email) throw new Error('Contact result mismatch');
return [{json: {projectId: '${project.id}', status: 'passed', engine: 'n8n', ghlMode: 'local simulator', contactId: response.contact.id, created: response.new, businessEvidence: planned.domain, communicationSent: false}}];` }, 1040),
  ];
  return { id: `local-${project.id}`, name: `${project.id} | Original logic to local GHL demo`, active: false,
    nodes, connections: Object.fromEntries(nodes.slice(0, -1).map((n, i) => [n.name, { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] }])),
    settings: { executionOrder: 'v1' }, pinData: {} };
}

mkdirSync(new URL('./workflows/', import.meta.url), { recursive: true });
mkdirSync(new URL('./blueprints/', import.meta.url), { recursive: true });
let stale = 0;
for (const project of projects) {
  const blueprintPath=new URL(`./blueprints/${project.id}.json`,import.meta.url);
  const blueprint=JSON.stringify({projectId:project.id,format:'manual setup specification, not a native GHL snapshot',location:'DEMO_LOCATION',relationshipRole:project.ghlRole,proposedStages:project.stages,contactFields:['email','firstName','lastName','source'],automatedCommunications:false,acceptance:'Local simulator; hosted acceptance pending'},null,2)+'\n';
  if(process.argv.includes('--check')) {
    if(!existsSync(blueprintPath)||readFileSync(blueprintPath,'utf8').replaceAll('\r\n','\n')!==blueprint){console.error(`Stale blueprint ${project.id}`);stale++;}
  } else writeFileSync(blueprintPath,blueprint);
  const path = new URL(`./workflows/${project.id}.json`, import.meta.url);
  const content = JSON.stringify(makeWorkflow(project), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (!existsSync(path) || readFileSync(path, 'utf8').replaceAll('\r\n','\n') !== content) { console.error(`Stale ${project.id}`); stale++; }
  } else writeFileSync(path, content);
}
console.log(`${process.argv.includes('--check') ? 'Checked' : 'Generated'} ${projects.length} local integration workflows.`);
if (stale) process.exitCode = 1;
