import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectById } from './catalog.mjs';
import { evaluateEngineering } from './engineering-evals.mjs';
import { evaluateHandoff } from './acceptance.mjs';
import { evaluateRegression } from './regression-cases.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export function workflowGraph(workflow) {
    return {nodes: workflow.nodes.map((n,index)=>({id:n.id,name:n.name,type:n.type,
        position:Array.isArray(n.position)&&n.position.length===2&&n.position.every(Number.isFinite)?n.position:[index%5*280,Math.floor(index/5)*180]})),
        edges:Object.entries(workflow.connections).flatMap(([from,connection])=>Object.entries(connection).flatMap(([channel,outputs])=>outputs.flatMap((targets,branch)=>targets.map(e=>({from,to:e.node,channel,branch})))))};
}
// Only these source-derived files can be downloaded; request paths never become filesystem paths.
export function artifacts(id) {
    const p = projectById.get(id);
    if (!p)
        return [];
    const result = [{ key: 'demo-workflow', label: 'Runnable n8n demo', path: join(root, 'demo-lab/workflows', id + '.json') },
        { key: 'contract', label: 'Shared contact validation', path: join(root, 'integrations/ghl-n8n/contract.mjs') }];
    if (p.newBuild)
        result.push({ key: 'source', label: 'Scenario logic and evaluation fixtures', path: join(root, p.source) });
    else if (id === 'IMP-01')
        result.push({ key: 'source', label: 'TypeScript agent source', path: join(root, p.source, 'site/app/lib/agent-system.ts') });
    else if (['PM-01', 'EA-01'].includes(id))
        result.push({ key: 'source', label: 'JavaScript scenario source', path: join(root, 'demo-lab/extra-scenarios.mjs') });
    else {
        const build = join(root, p.source, 'build');
        const python = readdirSync(build).find(name => name.endsWith('.py'));
        if (python)
            result.push({ key: 'source', label: 'Python business logic', path: join(build, python) });
        for (const [key, label, file] of [['original-workflow', 'Original workflow export', 'n8n-workflow.json'], ['schema', 'PostgreSQL schema', 'schema.sql'], ['build-guide', 'Original build guide', 'README.md']])
            result.push({ key, label, path: join(build, file) });
    }
    result.push({ key: 'ghl-blueprint', label: 'GHL setup blueprint', path: join(root, 'showcase', id, 'ghl-build.json') });
    if (!existsSync(result.at(-1).path))
        result.at(-1).path = join(root, 'demo-lab/blueprints', id + '.json');
    if (['PM-01','EA-01'].includes(id)) result.push({key:'industry-depth',label:'Scheduling and durable register source',path:join(root,'demo-lab/industry-depth.mjs')});
    if (id === 'AGT-01') result.push({key:'engineering-evals',label:'Offline retrieval evaluation source',path:join(root,'demo-lab/engineering-evals.mjs')});
    result.push({key:'research',label:'AI engineering research and implementation ideas',path:join(root,'demo-lab/AI-ENGINEERING-RESEARCH.md')});
    const sop = join(root,'demo-lab/project-builds',id,'SOP.md');
    if(existsSync(sop))result.push({key:'sop',label:'Local project operating procedure',path:sop});
    const build = join(root,'demo-lab/project-builds',id,'build');
    for (const [key,label,file] of [['schema','Local build PostgreSQL schema','schema.sql'],['build-guide','Local build guide','README.md']]) {
      if (!result.some(a=>a.key===key) && existsSync(join(build,file))) result.push({key,label,path:join(build,file)});
    }
    return result.filter(a => existsSync(a.path));
}
export function toolProfile(id) {
    const files = artifacts(id);
    const original = files.find(a => a.key === 'original-workflow');
    const originalWorkflow = original ? JSON.parse(readFileSync(original.path, 'utf8')) : null;
    const nodes = originalWorkflow?.nodes ?? [];
    const workflow = JSON.parse(readFileSync(files.find(a => a.key === 'demo-workflow').path, 'utf8'));
    return { engineering: id === 'AGT-01' ? evaluateEngineering() : null, regression: evaluateRegression(id), architecture:workflowGraph(workflow), originalArchitecture:originalWorkflow?workflowGraph(originalWorkflow):null, acceptance: evaluateHandoff(id), artifacts: files.map(({ key, label, path }) => ({ key, label, file: path.slice(root.length + 1).replaceAll('\\', '/'), url: `/api/artifacts/${id}/${key}` })),
        originalNodes: nodes.map(n => ({ name: n.name, type: n.type })),
        tools: [
            { name: id === 'IMP-01' ? 'TypeScript' : projectById.get(id).newBuild || ['PM-01', 'EA-01'].includes(id) ? 'JavaScript' : 'Python', role: 'Business decisions', why: 'Keep the domain rules in inspectable source code that can run independently of the workflow editor.', status: 'Executed locally', artifact: 'source' },
            { name: 'n8n', role: 'Workflow orchestration', why: 'Connect the source program, contact validation and HTTP handoff in an ordered five-node execution with recorded results.', status: 'Executed locally', artifact: 'demo-workflow' },
            { name: 'GoHighLevel', role: 'Relationship management', why: 'Define the contact owner and proposed pipeline stages. The demo checks the contact contract against a local API simulator.', status: 'Simulated API · proposed CRM setup', artifact: files.some(a => a.key === 'ghl-blueprint') ? 'ghl-blueprint' : null },
            { name: 'SQLite', role: 'Local evidence store', why: 'Persist run evidence and contact identity across restarts; a unique location/email constraint prevents duplicate local contacts.', status: 'Executed locally' },
            ...(files.some(a => a.key === 'schema') ? [{ name: 'PostgreSQL', role: 'Operational data design', why: 'A relational schema is included as a separate artifact. Schema verification is recorded separately from the n8n wrapper execution.', status: 'Source artifact · not run in this demo', artifact: 'schema' }] : []),
            { name: 'Codex', role: 'Engineering and verification', why: 'Used for this portfolio refresh: inspecting source, building the local adapters and dashboard, and running quality and integration checks.', status: 'Build-time assistance' },
            { name: 'Claude / Claude Code', role: 'Authorship and runtime context', why: 'Historical Claude Code authorship is not established by these files. Some original builds include optional Claude API integrations; the local wrapper does not establish that those model calls ran.', status: 'Historical attribution unverified' },
        ] };
}
