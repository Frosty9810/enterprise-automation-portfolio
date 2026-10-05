import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { projects, projectById } from './catalog.mjs';
import { maintenance, commitments } from './extra-scenarios.mjs';
import { artifacts, toolProfile } from './showcase.mjs';
import { evaluateIndustryDepth, openDecisionRegister, depthFixtures } from './industry-depth.mjs';
import { evaluateEngineering } from './engineering-evals.mjs';
import {currentGovernance} from './governance-state.mjs';
import {evaluateProduct, productDesk, productExample, policyHash} from './product-governance.mjs';
import { evaluateExpansion, expansionSuites } from './business-expansion.mjs';
import { evaluateRoadmap, suites } from './roadmap-scenarios.mjs';

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
  let busy = false;
  let activity = null;
  let domains = 0;
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1:5680');
    const origin = request.headers.origin;
    if (origin && origin !== 'http://127.0.0.1:5680') return send(response, 403, { error: 'Local origin required' });
    if (request.method === 'GET') {
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
      if (url.pathname === '/api/activity') return send(response, 200, { busy, activity });
      if (url.pathname === '/api/contacts') return send(response, 200, { contacts: db.prepare('SELECT payload FROM contacts ORDER BY email').all().map(row => JSON.parse(row.payload)) });
      if (url.pathname === '/api/runs') {
        const decode=row=>({...row,evidence:JSON.parse(row.evidence)});
        const recent=db.prepare('SELECT * FROM runs ORDER BY created DESC, rowid DESC LIMIT 100').all();
        const latest=db.prepare('SELECT id,project,status,evidence,created FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY project ORDER BY created DESC,rowid DESC) AS position FROM runs) WHERE position=1').all();
        return send(response,200,{runs:recent.map(decode),latestRuns:latest.map(decode),historyLimit:100});
      }
      if (url.pathname === '/health') return send(response, 200, { status: 'ok', mode: 'local-demo' });
      return send(response, 404, { error: 'Not found' });
    }
    if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
    if (request.headers['x-demo-client'] !== 'local-showcase') return send(response, 403, { error: 'Demo client header required' });
    try {
      const body = await readBody(request);
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
