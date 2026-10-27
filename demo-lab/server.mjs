import { createServer } from 'node:http';
import { referralDesk } from './referral-core.mjs';
import { maintenanceDesk } from './maintenance-core.mjs';
import { constructionDesk } from './construction-core.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { projects, projectById } from './catalog.mjs';
import { projectPassports } from './project-passports.mjs';
import { reliabilityDesk } from './reliability.mjs';
import { salesforceDesk, salesforceScenarios, salesforceScope } from './salesforce-core.mjs';
import { flagshipSuite, sourceArtifact } from './flagship-suite.mjs';
import { crossCheckFlagships } from './flagship-acceptance.mjs';
import { maintenance, commitments } from './extra-scenarios.mjs';
import { artifacts, toolProfile } from './showcase.mjs';
import { evaluateIndustryDepth, openDecisionRegister, depthFixtures } from './industry-depth.mjs';
import { evaluateEngineering } from './engineering-evals.mjs';
import {getAtlasGraphEvaluationCatalog,evaluateAtlasGraphSuite} from './atlasgraph-evaluation.mjs';
import {currentGovernance} from './governance-state.mjs';
import {evaluateProduct, productDesk, productExample, policyHash} from './product-governance.mjs';
import { evaluateExpansion, expansionSuites } from './business-expansion.mjs';
import { evaluateRoadmap, suites } from './roadmap-scenarios.mjs';
import { portfolioInventory } from './project-inventory.mjs';
import { atlasGraph } from './atlasgraph-core.mjs';
import { atlasMarkdown } from './atlasgraph-markdown.mjs';
import { trustGate } from './trustgate-core.mjs';
import { getTrustGateChallengeCatalog, runTrustGateChallenge } from './trustgate-challenge.mjs';
import { chronosRank } from './chronosrank-core.mjs';
import {getChronosRankEvaluationCatalog,evaluateChronosRankSuite} from './chronosrank-evaluation.mjs';
import { dockside } from './dockside-core.mjs';
import {parseDocksideText,getDocksideTextCatalog} from './dockside-text.mjs';
import { veilRag } from './veilrag-core.mjs';
import { createIndustryDeskHost } from './industry-desks.mjs';

const exec = promisify(execFile);
const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '..');
export const runtime = join(directory, '.runtime');
mkdirSync(runtime, { recursive: true });
const digest = value => createHash('sha256').update(value).digest('hex');
const cleanEnv = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'].includes(key.toUpperCase()))),
  PYTHONIOENCODING: 'utf-8', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' });

export async function runDomain(id, {registerPath = join(runtime, 'decision-register.sqlite')} = {}) {
  const project = projectById.get(id);
  if (!project) throw new Error('Unknown project');
  let output;
  let source;
  if (Object.hasOwn(expansionSuites, id)) {
    const result = evaluateExpansion(id);
    if (id === 'AGT-01') result.engineeringEvaluation = evaluateEngineering();
    output = JSON.stringify(result, null, 2);
    source = join(directory, 'business-expansion.mjs');
  } else if (Object.hasOwn(suites, id)) {
    output = JSON.stringify(evaluateRoadmap(id), null, 2);
    source = join(directory, 'roadmap-scenarios.mjs');
  } else if (id === 'PM-01' || id === 'EA-01') {
    const result = id === 'PM-01' ? maintenance(project.fixture) : commitments(project.fixture);
    const depth = evaluateIndustryDepth(id);
    if (depth.evaluation.passed !== depth.evaluation.total) throw new Error('Industry depth evaluation failed');
    if (id === 'EA-01') {
      const register = openDecisionRegister(registerPath);
      try { depth.durableRegister = {ingestion: register.ingest(structuredClone(depthFixtures.register)), entries: register.entries(), events: register.events()}; } finally { register.close(); }
    }
    output = JSON.stringify({...result, industryDepth:depth}, null, 2);
    source = join(directory, 'extra-scenarios.mjs');
  } else if (id === 'IMP-01') {
    source = join(root, project.source, 'site/app/lib/agent-system.ts');
    const module = await import(new URL('../' + project.source + '/site/app/lib/agent-system.ts', import.meta.url));
    output = JSON.stringify(module.executeAgent('operations-016', 'Review synthetic shipment SHP-2048 and prepare its evidence handoff.'), null, 2);
  } else {
    const build = join(root, project.source, 'build');
    source = join(build, readdirSync(build).find(file => file.endsWith('.py')));
    const python = process.platform === 'win32' ? join(root, '.venv/Scripts/python.exe') : join(root, '.venv/bin/python');
    const result = await exec(python, [source], { cwd: build, env: cleanEnv(), timeout: 180000, maxBuffer: 1024 * 1024, windowsHide: true });
    output = result.stdout;
  }
  return { projectId: id, status: 'passed', fixture: 'bundled synthetic demonstration',
    source: source.slice(root.length + 1).replaceAll('\\', '/'), sourceHash: digest(readFileSync(source)),
    componentHashes: id === 'AGT-01' ? {engineeringEvaluation: digest(readFileSync(join(directory, 'engineering-evals.mjs')))} : ['PM-01','EA-01'].includes(id) ? {industryDepth: digest(readFileSync(join(directory,'industry-depth.mjs')))} : {},
    outputHash: digest(output), output, measuredAt: new Date().toISOString() };
}

export function openStore(path = join(runtime, 'ghl-simulator.sqlite')) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY, location TEXT NOT NULL, email TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(location,email));
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, project TEXT NOT NULL, status TEXT NOT NULL, evidence TEXT NOT NULL, created TEXT NOT NULL);`);
  return db;
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

export function n8nEnvironment() {
  return { ...cleanEnv(), N8N_USER_FOLDER: join(runtime, 'n8n'), N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_VERSION_NOTIFICATIONS_ENABLED: 'false', N8N_TEMPLATES_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false', N8N_LISTEN_ADDRESS: '127.0.0.1', N8N_PORT: '5678',
    N8N_RUNNERS_BROKER_LISTEN_ADDRESS: '127.0.0.1' };
}

export async function runN8n(id, progress = () => {}) {
  if (!projectById.has(id)) throw new Error('Unknown project');
  const binary = join(directory, 'node_modules/n8n/bin/n8n');
  if (!existsSync(binary)) throw new Error('n8n is not installed; follow demo-lab/README.md');
  progress('importing', 'Importing the project workflow into the local n8n engine.');
  await exec(process.execPath, [binary, 'import:workflow', `--input=${join(directory, 'workflows', id + '.json')}`],
    { cwd: directory, env: n8nEnvironment(), timeout: 180000, maxBuffer: 5 * 1024 * 1024, windowsHide: true });
  progress('executing', 'n8n is running the business demo, validating the handoff and calling the local CRM simulator.');
  const { stdout, stderr } = await exec(process.execPath, [binary, 'execute', `--id=local-${id}`, '--rawOutput'],
    { cwd: directory, env: n8nEnvironment(), timeout: 180000, maxBuffer: 5 * 1024 * 1024, windowsHide: true });
  // CLI rawOutput is a JSON document. Some versions prepend startup log lines.
  const start = stdout.indexOf('{');
  let execution;
  try { execution = JSON.parse(stdout.slice(start)); } catch { throw new Error(`n8n output is not a JSON execution: ${(stdout + stderr).slice(-1200)}`); }
  const runData = execution.data?.resultData?.runData ?? execution.resultData?.runData;
  const final = runData?.['Verify result and preserve evidence']?.[0]?.data?.main?.[0]?.[0]?.json;
  if (final?.status !== 'passed') throw new Error(`n8n did not produce a verified result: ${JSON.stringify(execution).slice(-1200)}`);
  progress('verified', 'The final n8n node confirmed the contact email, location and identifier.');
  const nodeEvidence = Object.entries(runData).map(([name, runs]) => ({ name,
    attempts: runs.length, durationMs: runs.reduce((sum, run) => sum + (run.executionTime ?? 0), 0),
    startedAt: runs[0]?.startTime ? new Date(runs[0].startTime).toISOString() : null,
    status: runs.some(run => run.error) ? 'failed' : 'passed' }));
  return { ...final, nodeEvidence, executionId: execution.id ?? null, executionMode: 'n8n CLI execute',
    startedAt: execution.startedAt, stoppedAt: execution.stoppedAt,
    engineDurationMs: Date.parse(execution.stoppedAt) - Date.parse(execution.startedAt),
    workflowHash: digest(readFileSync(join(directory, 'workflows', id + '.json'))) };
}

export function createLabServer(db = openStore(), executeWorkflow = runN8n) {
  const desk = productDesk(db);
  const referrals = referralDesk(db);
  const property = maintenanceDesk(db);
  const construction = constructionDesk(db);
  const reliability = reliabilityDesk(db);
  const salesforce = salesforceDesk(db);
  const flagships = flagshipSuite(db);
  const research = atlasGraph(db);
  const markdown = atlasMarkdown(db);
  const gateway = trustGate(db);
  const memory = chronosRank(db);
  const dock = dockside(db);
  const privacy = veilRag(db);
  const industryHost = createIndustryDeskHost(db);
  let busy = false;
  let activity = null;
  let domains = 0;
  return createServer(async (request, response) => {
    // Loopback binding alone does not validate a browser's requested authority.
    const authority = `127.0.0.1:${request.socket.localPort}`;
    const localOrigin = `http://${authority}`;
    if (request.headers.host !== authority) return send(response, 403, { error: 'Local host required' });
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) return send(response, 400, { error: 'Invalid request target' });
    let url;
    try { url = new URL(request.url, localOrigin); }
    catch { return send(response, 400, { error: 'Invalid request target' }); }
    if (url.origin !== localOrigin) return send(response, 400, { error: 'Invalid request target' });
    const origin = request.headers.origin;
    if ((origin && origin !== localOrigin) || request.headers['sec-fetch-site'] === 'cross-site') return send(response, 403, { error: 'Local origin required' });
    if (request.method === 'GET') {
      if (url.pathname === '/api/construction/catalog') return send(response,200,construction.catalog());
      if (url.pathname === '/construction') {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'construction.html')));
      }
      if (['/construction.css','/construction-ui.mjs'].includes(url.pathname)) {
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/maintenance/catalog') return send(response,200,property.catalog());
      if (url.pathname === '/maintenance') {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'maintenance.html')));
      }
      if (['/maintenance.css','/maintenance-ui.mjs'].includes(url.pathname)) {
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/referral/catalog') return send(response,200,referrals.catalog());
      if (url.pathname === '/referral') {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'referral.html')));
      }
      if (['/referral.css','/referral-ui.mjs'].includes(url.pathname)) {
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/project-inventory') return send(response,200,portfolioInventory());
      if (url.pathname === '/api/trustgate/catalog') return send(response,200,gateway.catalog());
      if (url.pathname === '/api/chronosrank/catalog') return send(response,200,memory.catalog());
      if (url.pathname === '/api/dockside/catalog') return send(response,200,dock.catalog());
      if (url.pathname === '/api/dockside/text-catalog') return send(response,200,getDocksideTextCatalog());
      if (url.pathname === '/api/veilrag/catalog') return send(response,200,privacy.catalog());
      if (url.pathname === '/api/research-markdown/catalog') {
        try { return send(response,200,markdown.catalog()); } catch(error) { return send(response,400,{error:error.message}); }
      }
      if (url.pathname === '/research-markdown') {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'atlasgraph-markdown.html')));
      }
      if (['/atlasgraph-markdown.css','/atlasgraph-markdown-ui.mjs'].includes(url.pathname)) {
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/research/catalog') return send(response,200,{projects:portfolioInventory().filter(p=>p.collection==='research')});
      if (url.pathname === '/api/research/example') return send(response,200,JSON.parse(readFileSync(join(directory,'atlasgraph-example.json'),'utf8')));
      if (url.pathname === '/api/research/blueprint') {
        const names = new Map([['AtlasGraph','01-atlasgraph.md'],['ChronosRank','02-chronosrank.md'],['TrustGate','03-trustgate.md'],['DocksideSLM','04-docksideslm.md'],['VeilRAG','05-veilrag.md']]);
        const name = names.get(url.searchParams.get('project'));
        if(!name)return send(response,404,{error:'Unknown research project'});
        response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
        return response.end(readFileSync(join(root,'47 Automation Blueprints','2026 Research-to-Production',name)));
      }
      if (['/projects','/research','/trustgate','/chronosrank','/dockside','/veilrag'].includes(url.pathname)) {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,url.pathname.slice(1)+'.html')));
      }
      if (['/projects.css','/projects-ui.mjs','/research.css','/research-ui.mjs','/trustgate.css','/trustgate-ui.mjs','/chronosrank.css','/chronosrank-ui.mjs','/dockside.css','/dockside-ui.mjs','/veilrag.css','/veilrag-ui.mjs'].includes(url.pathname)) {
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/flagships/catalog') return send(response,200,{projects:flagships.catalog(),history:flagships.history()});
      if (url.pathname.startsWith('/api/flagships/example/')) {
        try { return send(response,200,flagships.example(url.pathname.split('/').pop())); }
        catch(error) { return send(response,400,{error:error.message}); }
      }
      if (url.pathname.startsWith('/api/flagships/source/')) {
        try {
          const parts=url.pathname.split('/'); if(parts.length!==6)throw Error('Invalid artifact');
          const file=sourceArtifact(parts[4],Number(parts[5]));
          const bytes=readFileSync(file.path), sha256=digest(bytes), expected=url.searchParams.get('sha256');
          if(expected!==null&&!/^[a-f0-9]{64}$/.test(expected)) return send(response,400,{error:'Invalid source fingerprint'});
          if(expected!==null&&expected!==sha256) return send(response,409,{error:'Source changed; refresh the catalog after restarting the lab'});
          response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','X-Source-SHA256':sha256});
          return response.end(bytes);
        }
        catch(error) { return send(response,404,{error:error.message}); }
      }
      if (url.pathname === '/flagships') {
        response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});return response.end(readFileSync(join(directory,'flagships.html')));
      }
      if (['/flagships.css','/flagships-ui.mjs'].includes(url.pathname)) {
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/salesforce/config') return send(response,200,{scenarios:salesforceScenarios,scope:salesforceScope});
      if (url.pathname === '/api/salesforce/state') {
        try { return send(response,200,salesforce.state(url.searchParams.get('run'))); }
        catch(error) { return send(response,400,{error:error.message}); }
      }
      if (url.pathname === '/salesforce') {
        response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'salesforce.html')));
      }
      if (['/salesforce.css','/salesforce-ui.mjs','/salesforce-core.mjs'].includes(url.pathname)) {
        response.writeHead(200, {'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/workshop/projects') return send(response,200,{projects:projectPassports()});
      if (url.pathname === '/workshop') {
        response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'workshop.html')));
      }
      if (['/workshop.css','/workshop.mjs'].includes(url.pathname)) {
        response.writeHead(200, {'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/governance') return send(response,200,currentGovernance());
      if (url.pathname === '/build-review.json') {
        try { return send(response,200,JSON.parse(readFileSync(join(directory,'build-review.json'),'utf8'))); }
        catch { return send(response,404,{error:'No recorded review available'}); }
      }
      if (['/product-studio.css','/product-studio.mjs','/studio.css','/studio.js','/human-studio.mjs','/human-projects.mjs','/workbench-core.mjs','/workbench-extended.mjs','/repair-evidence.mjs','/workbench-ui.mjs','/workbench-story.mjs','/review-summary.mjs','/workbench.css'].includes(url.pathname)) {
        response.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
        return response.end(readFileSync(join(directory, url.pathname.slice(1))));
      }
      if (url.pathname === '/engineering') {
        response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' });
        return response.end(readFileSync(join(directory,'workbench.html')));
      }
      if (url.pathname === '/product-governance') {
        response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'product-studio.html')));
      }
      if (url.pathname === '/api/product/example') return send(response,200,productExample);
      if (url.pathname === '/api/product/audit') return send(response,200,{events:desk.audit(),scope:'Local synthetic review history; actor labels are not authenticated.'});
      if (url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'" });
        return response.end(readFileSync(join(directory, 'index.html')));
      }
      if (url.pathname === '/api/projects') return send(response, 200, { projects, engine: 'n8n 2.38.1', ghl: 'local simulator', busy });
      if (url.pathname.startsWith('/api/showcase/')) {
        const id = url.pathname.split('/').pop();
        return projectById.has(id) ? send(response, 200, toolProfile(id)) : send(response, 404, { error: 'Unknown project' });
      }
      if (url.pathname.startsWith('/api/artifacts/')) {
        const segments = url.pathname.split('/');
        const file = segments.length === 5 && artifacts(segments[3]).find(a => a.key === segments[4]);
        if (!file) return send(response, 404, { error: 'Unknown artifact' });
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': `attachment; filename="${segments[3]}-${file.key}.${file.path.split('.').pop()}"`, 'Cache-Control': 'no-store' });
        return response.end(readFileSync(file.path));
      }
      if(url.pathname==='/api/tool-challenge/catalog'){
        try{return send(response,200,getTrustGateChallengeCatalog());}catch(error){return send(response,400,{error:error.message});}
      }
      if(url.pathname==='/tool-challenge'){
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'trustgate-challenge.html')));
      }
      if(['/trustgate-challenge.css','/trustgate-challenge-ui.mjs'].includes(url.pathname)){
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/activity') return send(response, 200, { busy, activity });
      if(url.pathname==='/api/research-evaluation/catalog'){
        try{return send(response,200,getAtlasGraphEvaluationCatalog());}catch(error){return send(response,400,{error:error.message});}
      }
      if(url.pathname==='/research-evaluation'){
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'atlasgraph-evaluation.html')));
      }
      if(['/atlasgraph-evaluation.css','/atlasgraph-evaluation-ui.mjs'].includes(url.pathname)){
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if(url.pathname==='/api/memory-evaluation/catalog'){
        try{return send(response,200,getChronosRankEvaluationCatalog());}catch(error){return send(response,400,{error:error.message});}
      }
      if(url.pathname==='/memory-evaluation'){
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
        return response.end(readFileSync(join(directory,'chronosrank-evaluation.html')));
      }
      if(['/chronosrank-evaluation.css','/chronosrank-evaluation-ui.mjs'].includes(url.pathname)){
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return response.end(readFileSync(join(directory,url.pathname.slice(1))));
      }
      if (url.pathname === '/api/contacts') return send(response, 200, { contacts: db.prepare('SELECT payload FROM contacts ORDER BY email').all().map(row => JSON.parse(row.payload)) });
      if (url.pathname === '/api/runs') {
        const decode=row=>({...row,evidence:JSON.parse(row.evidence)});
        const recent=db.prepare('SELECT * FROM runs ORDER BY created DESC, rowid DESC LIMIT 100').all();
        const latest=db.prepare('SELECT id,project,status,evidence,created FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY project ORDER BY created DESC,rowid DESC) AS position FROM runs) WHERE position=1').all();
        return send(response,200,{runs:recent.map(decode),latestRuns:latest.map(decode),historyLimit:100});
      }
      if(url.pathname.startsWith('/api/industry/')){
        const match=/^\/api\/industry\/([a-z-]+)\/catalog$/.exec(url.pathname);
        if(!match||!industryHost.has(match[1]))return send(response,404,{error:'Unknown industry desk'});
        try{return send(response,200,await industryHost.catalog(match[1]));}catch(error){return send(response,400,{error:error.message});}
      }
      const industryAsset=industryHost.asset(url.pathname);
      if(industryAsset){
        const headers={'Content-Type':industryAsset.type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
        if(industryAsset.page)headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
        response.writeHead(200,headers);return response.end(readFileSync(industryAsset.url));
      }
      if (url.pathname === '/health') return send(response, 200, { status: 'ok', mode: 'local-demo' });
      return send(response, 404, { error: 'Not found' });
    }
    if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
    if (request.headers['x-demo-client'] !== 'local-showcase') return send(response, 403, { error: 'Demo client header required' });
    try {
      const body = await readBody(request);
      if (url.pathname.startsWith('/api/construction/')) {
        const actions = new Map([
          ['submit-document',x=>construction.submitDocument(x)],['review-document',x=>construction.reviewDocument(x)],
          ['document-receipt',x=>construction.documentReceipt(x)],['readiness',x=>construction.readiness(x)],
          ['create-order',x=>construction.createOrder(x)],['revise-order',x=>construction.reviseOrder(x)],
          ['review-order',x=>construction.reviewOrder(x)],['record-commitment',x=>construction.recordCommitment(x)],
          ['receipt',x=>construction.receipt(x)],['history',x=>construction.history(x)],['state',x=>construction.state(x)],
          ['audit',x=>construction.audit(x)],['verify-audit',x=>construction.verifyAudit(x)],
        ]);
        const action = actions.get(url.pathname.slice('/api/construction/'.length));
        if(!action)return send(response,404,{error:'Unknown construction operation'});
        return send(response,200,await action(body));
      }
      if (url.pathname.startsWith('/api/maintenance/')) {
        const actions = new Map([
          ['intake',x=>property.intake(x)],['grant-access',x=>property.grantAccess(x)],['revoke-access',x=>property.revokeAccess(x)],
          ['propose',x=>property.propose(x)],['review',x=>property.review(x)],['dispatch',x=>property.dispatch(x)],
          ['reconcile',x=>property.reconcile(x)],['cancel',x=>property.cancel(x)],['complete',x=>property.complete(x)],
          ['receipt',x=>property.receipt(x)],['history',x=>property.history(x)],['state',x=>property.state(x)],
          ['audit',x=>property.audit(x)],['verify-audit',x=>property.verifyAudit(x)],
        ]);
        const action = actions.get(url.pathname.slice('/api/maintenance/'.length));
        if(!action)return send(response,404,{error:'Unknown maintenance operation'});
        return send(response,200,await action(body));
      }
      if (url.pathname.startsWith('/api/referral/')) {
        const actions = new Map([
          ['intake',x=>referrals.intake(x)],['set-packet',x=>referrals.setPacket(x)],['set-consent',x=>referrals.setConsent(x)],
          ['review',x=>referrals.review(x)],['enqueue',x=>referrals.enqueue(x)],['assign',x=>referrals.assign(x)],
          ['receipt',x=>referrals.receipt(x)],['state',x=>referrals.state(x)],['audit',x=>referrals.audit(x)],['verify-audit',x=>referrals.verifyAudit(x)],
        ]);
        const action=actions.get(url.pathname.slice('/api/referral/'.length));
        if(!action)return send(response,404,{error:'Unknown referral operation'});
        return send(response,200,await action(body));
      }
      if(url.pathname.startsWith('/api/tool-challenge/')){
        if(url.pathname!=='/api/tool-challenge/run')return send(response,404,{error:'Unknown tool challenge operation'});
        return send(response,200,await runTrustGateChallenge(body));
      }
      if (url.pathname.startsWith('/api/trustgate/')) {
        const actions = new Map([
          ['prepare',x=>gateway.prepare(x)],['review',x=>gateway.review(x)],['execute',x=>gateway.execute(x)],
          ['receipt',x=>gateway.receipt(x)],['history',x=>gateway.history(x)],['state',x=>gateway.state(x)],
          ['audit',x=>gateway.audit(x)],['verify-audit',x=>gateway.verifyAudit(x)],
        ]);
        const action = actions.get(url.pathname.slice('/api/trustgate/'.length));
        if(!action)return send(response,404,{error:'Unknown TrustGate operation'});
        return send(response,200,action(body));
      }
      if (url.pathname.startsWith('/api/chronosrank/')) {
        const actions = new Map([
          ['append',x=>memory.append(x)],['retrieve',x=>memory.retrieve(x)],['receipt',x=>memory.receipt(x)],
          ['feedback',x=>memory.feedback(x)],['history',x=>memory.history(x)],['audit',x=>memory.audit(x)],['verify-audit',x=>memory.verifyAudit(x)],
        ]);
        const action = actions.get(url.pathname.slice('/api/chronosrank/'.length));
        if(!action)return send(response,404,{error:'Unknown memory operation'});
        return send(response,200,action(body));
      }
      if (url.pathname.startsWith('/api/dockside/')) {
        const exact=(value,keys)=>{
          if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error('Supply exactly: '+keys.join(', '));
        };
        if(url.pathname==='/api/dockside/text-preview'){
          exact(body,['text']);
          return send(response,200,parseDocksideText(body.text));
        }
        if(url.pathname==='/api/dockside/text-submit'){
          exact(body,['commandId','tenant','actor','document','expectedParserHash']);
          exact(body.document,['id','version','text']);
          const preview=parseDocksideText(body.document.text);
          if(body.expectedParserHash!==preview.parserHash)throw Error('Parser identity changed. Preview the text again before saving.');
          const receipt=dock.submit({commandId:body.commandId,tenant:body.tenant,actor:body.actor,document:body.document,extraction:preview.extraction});
          return send(response,200,{receipt,preview});
        }
        const actions = new Map([
          ['submit',x=>dock.submit(x)],['review',x=>dock.review(x)],['sync',x=>dock.sync(x)],['reconcile',x=>dock.reconcile(x)],
          ['receipt',x=>dock.receipt(x)],['history',x=>dock.history(x)],['state',x=>dock.state(x)],['audit',x=>dock.audit(x)],['verify-audit',x=>dock.verifyAudit(x)],
        ]);
        const action = actions.get(url.pathname.slice('/api/dockside/'.length));
        if(!action)return send(response,404,{error:'Unknown document operation'});
        return send(response,200,await action(body));
      }
      if (url.pathname.startsWith('/api/veilrag/')) {
        const actions = new Map([
          ['protect',x=>privacy.protect(x)],['generate',x=>privacy.generate(x)],['restore',x=>privacy.restore(x)],
          ['receipt',x=>privacy.receipt(x)],['history',x=>privacy.history(x)],['audit',x=>privacy.audit(x)],
          ['verify-audit',x=>privacy.verifyAudit(x)],['purge',x=>privacy.purge(x)],
        ]);
        const action = actions.get(url.pathname.slice('/api/veilrag/'.length));
        if(!action)return send(response,404,{error:'Unknown alias operation'});
        return send(response,200,await action(body));
      }
      if (url.pathname.startsWith('/api/research-markdown/')) {
        const operation=url.pathname.slice('/api/research-markdown/'.length);
        if (!['preview','compile'].includes(operation)) return send(response,404,{error:'Unknown Markdown import operation'});
        return send(response,200,markdown[operation](body));
      }
      if(url.pathname.startsWith('/api/industry/')){
        const match=/^\/api\/industry\/([a-z-]+)\/([a-z-]+)$/.exec(url.pathname);
        if(!match||!industryHost.hasOperation(match[1],match[2]))return send(response,404,{error:'Unknown industry operation'});
        return send(response,200,await industryHost.invoke(match[1],match[2],body));
      }
      const researchActions = new Map([
        ['compile',x=>research.compile(x)],['search',x=>research.search(x)],['read',x=>research.read(x)],['follow',x=>research.follow(x)],
        ['answer',x=>research.answer(x)],['history',x=>research.history(x)],['errors',x=>research.errors(x)],['receipt',x=>research.receipt(x)],
        ['record-error',x=>research.recordError(x)],['review-error',x=>research.reviewError(x)],
      ]);
      if (url.pathname.startsWith('/api/research/')) {
        const action = researchActions.get(url.pathname.slice('/api/research/'.length));
        if(!action)return send(response,404,{error:'Unknown research operation'});
        return send(response,200,action(body));
      }
      if(url.pathname.startsWith('/api/research-evaluation/')){
        if(url.pathname!=='/api/research-evaluation/run')return send(response,404,{error:'Unknown evaluation operation'});
        return send(response,200,await evaluateAtlasGraphSuite(body));
      }
      if(url.pathname.startsWith('/api/memory-evaluation/')){
        if(url.pathname!=='/api/memory-evaluation/run')return send(response,404,{error:'Unknown memory evaluation operation'});
        return send(response,200,await evaluateChronosRankSuite(body));
      }
      if (url.pathname === '/api/flagships/evaluate' || url.pathname === '/api/flagships/run-all') {
        if(domains>=2)return send(response,429,{error:'Local evaluator busy'});domains++;
        try { return send(response,200,url.pathname.endsWith('run-all')?await crossCheckFlagships(flagships):await flagships.evaluate(body.toolId,body.input)); }
        finally { domains--; }
      }
      if (url.pathname === '/api/flagships/review') return send(response,200,flagships.review(body.receiptId,body.actor));
      if (url.pathname === '/api/flagships/export') return send(response,200,flagships.export(body.receiptId));
      if (url.pathname === '/api/salesforce/start') return send(response,200,salesforce.start(body.scenario));
      if (url.pathname === '/api/salesforce/full-run') return send(response,200,salesforce.fullRun());
      if (url.pathname === '/api/salesforce/evaluate') return send(response,200,salesforce.submit(body.runId,body.event??salesforce.event(body.runId,body.recordId)));
      if (url.pathname === '/api/salesforce/review') return send(response,200,salesforce.review(body.receiptId,body.profile));
      if (url.pathname === '/api/salesforce/execute') return send(response,200,salesforce.execute(body.receiptId,body.outcome));
      if (url.pathname === '/api/salesforce/reconcile') return send(response,200,salesforce.reconcile(body.receiptId));
      if (url.pathname === '/api/salesforce/change') return send(response,200,salesforce.simulateChange(body.runId,body.recordId));
      if (url.pathname === '/api/salesforce/export') return send(response,200,salesforce.export(body.receiptId));
      if (url.pathname === '/api/workshop/submit') return send(response,200,reliability.submit(body.projectId,body.event));
      if (url.pathname === '/api/workshop/review') return send(response,200,reliability.review(body.receiptId,body.reviewer));
      if (url.pathname === '/api/workshop/execute') return send(response,200,reliability.execute(body.receiptId,body.outcome));
      if (url.pathname === '/api/workshop/reconcile') return send(response,200,reliability.reconcile(body.receiptId));
      if (url.pathname === '/api/workshop/export') return send(response,200,reliability.export(body.receiptId));
      if (url.pathname === '/api/product/evaluate') {
        if (domains >= 2) return send(response,429,{error:'Demo worker busy'});
        domains++;
        try {
          const version = policyHash();
          const decision = await evaluateProduct(body);
          if (policyHash() !== version) throw new Error('Policy changed during evaluation; retry');
          return send(response,200,desk.save(body,decision,version));
        } finally { domains--; }
      }
      if (url.pathname === '/api/product/review') return send(response,200,desk.review(body.receiptId,body.reviewer,policyHash()));
      if (url.pathname === '/api/product/export') return send(response,200,desk.export(body.receiptId,policyHash()));
      if (url.pathname === '/contacts/upsert') {
        if (request.headers.authorization !== 'Bearer LOCAL_DEMO_ONLY') return send(response, 401, { error: 'Demo credential required' });
        if (request.headers.version !== 'v3') return send(response, 400, { error: 'Version v3 required' });
        const fault = request.headers['x-demo-fault'];
        if (fault === 'rate-limit') return send(response, 429, { error: 'Simulated rate limit' }, { 'Retry-After': '1' });
        if (!body || typeof body !== 'object' || Array.isArray(body) || body.locationId !== 'DEMO_LOCATION') return send(response, 422, { error: 'Invalid demo location' });
        if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return send(response, 422, { error: 'Invalid email' });
        if (Object.keys(body).some(key => !['locationId', 'email', 'firstName', 'lastName', 'source'].includes(key))) return send(response, 422, { error: 'Unsupported demo field' });
        if (['firstName', 'lastName', 'source'].some(key => body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > 200))) return send(response, 422, { error: 'Invalid contact text field' });
        const email = body.email.trim().toLowerCase();
        const existing = db.prepare('SELECT id,payload FROM contacts WHERE location=? AND email=?').get(body.locationId, email);
        const contact = { ...(existing ? JSON.parse(existing.payload) : {}), ...body, email, id: existing?.id ?? randomUUID() };
        db.prepare('INSERT INTO contacts VALUES(?,?,?,?) ON CONFLICT(location,email) DO UPDATE SET payload=excluded.payload').run(contact.id, body.locationId, email, JSON.stringify(contact));
        if (fault === 'timeout-after-write') await new Promise(resolve => setTimeout(resolve, 1500));
        return send(response, 200, { new: !existing, contact, traceId: randomUUID() });
      }
      if (url.pathname.startsWith('/api/domain/')) {
        const id = url.pathname.split('/').pop();
        if (!projectById.has(id)) return send(response, 404, { error: 'Unknown project' });
        if (domains >= 2) return send(response, 429, { error: 'Demo worker busy' });
        domains++;
        try { return send(response, 200, await runDomain(id)); } finally { domains--; }
      }
      if (url.pathname.startsWith('/api/run/')) {
        const id = url.pathname.split('/').pop();
        if (!projectById.has(id)) return send(response, 404, { error: 'Unknown project' });
        if (busy) return send(response, 409, { error: 'Another workflow is running' });
        busy = true;
        const runId = randomUUID();
        activity = { runId, projectId: id, status: 'running', startedAt: new Date().toISOString(), events: [] };
        const progress = (stage, message) => activity.events.push({ stage, message, at: new Date().toISOString() });
        try {
          const result = await executeWorkflow(id, progress);
          progress('saving', 'Writing execution evidence to the local run history.');
          const evidence = { ...result, timeline: activity.events, wallDurationMs: Date.now() - Date.parse(activity.startedAt) };
          db.prepare('INSERT INTO runs VALUES(?,?,?,?,?)').run(runId, id, 'passed', JSON.stringify(evidence), new Date().toISOString());
          activity.status = 'passed';
          return send(response, 200, { runId, ...evidence });
        } catch (error) {
          progress('failed', error.message);
          activity.status = 'failed';
          const evidence = { error: error.message, timeline: activity.events };
          db.prepare('INSERT INTO runs VALUES(?,?,?,?,?)').run(runId, id, 'failed', JSON.stringify(evidence), new Date().toISOString());
          return send(response, 500, evidence);
        } finally { busy = false; }
      }
      return send(response, 404, { error: 'Not found' });
    } catch (error) { return send(response, 400, { error: error.message }); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createLabServer().listen(5680, '127.0.0.1', () => console.log('Portfolio demo lab: http://127.0.0.1:5680'));
}
