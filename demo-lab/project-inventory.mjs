import { projects } from './catalog.mjs';
import { humanProjects } from './human-projects.mjs';
import { workbenchProjects } from './workbench-core.mjs';
import { flagshipDescriptions } from './flagship-fixtures.mjs';

// These six catalogs contain bounded examples, not the complete industry builds.
const industryTracks = new Set(['PM-01', 'CON-01', 'MED-01', 'LEGAL-01', 'INS-01', 'EA-01']);
const research = [
  ['AtlasGraph', 'Compile supplied operational evidence into a versioned graph and inspect retrieval paths.', 'partial-local', 'Local deterministic graph compiler, SQLite evidence versions and graph retrieval. No LLM, dense-vector baseline, live provider or production integration. The full research blueprint remains unfinished.'],
  ['ChronosRank', 'Inspect temporal memory retrieval, supersession, source receipts and feedback.', 'partial-local', 'Local SQLite memory events with as-of filtering, deterministic token scores and threshold abstention. No trained reranker, calibrated probability, vector store, authentication or measured research comparison. The full research blueprint remains unfinished.'],
  ['TrustGate', 'Inspect source-bound arguments, policy holds, reviewed local tools and durable execution receipts.', 'partial-local', 'Local gateway for three fixed synthetic SQLite tools, server-held source labels, review and replay controls. No authenticated agent runtime, external action, LM screener or general prompt-injection benchmark. The full research blueprint remains unfinished.'],
  ['DocksideSLM', 'Validate supplied warehouse document fields, review a durable queue and reconcile local delivery.', 'partial-local', 'Local structured-extraction validation, SQLite review queue and idempotent synthetic ERP receiver. No OCR, SLM inference, real ERP integration, edge-hardware or compression benchmark. The full research blueprint remains unfinished.'],
  ['VeilRAG', 'Inspect declared-literal aliases, encrypted local mappings and checked fixture generation.', 'partial-local', 'Local exact declared-literal matching, AES-GCM mappings and a sanitized child fixture with explicit restoration. No automatic entity detector, authenticated users, external provider, general privacy guarantee or research benchmark. The full research blueprint remains unfinished.'],
];

/** All public lab catalog views, derived from the same catalogs as their destinations.
 * Entries may reuse an engine. Presence is not provider acceptance or production delivery.
 * Return fresh plain records so callers cannot mutate the source catalogs.
 */
export function portfolioInventory() {
  return [
    ...projects.map(project => ({
      collection: 'automation', id: project.id, title: project.title,
      summary: project.demo || 'Inspect the supplied local business scenario and its decision.',
      scope: project.id === 'PM-01'
        ? 'Partial industry build: durable synthetic maintenance intake, deterministic emergency holds, access consent, reviewed vendor proposals and local dispatch recovery. Fixed fixture clock, unauthenticated actor labels; real property/provider acceptance remains unfinished.'
        : industryTracks.has(project.id)
        ? 'Partial industry build: this bounded synthetic scenario is executable; the full industry flagship and live provider acceptance remain unfinished.'
        : 'Executable local scenario with synthetic evidence. Wrapper presence does not establish hosted integration or production acceptance.',
      status: industryTracks.has(project.id) ? 'partial-local' : 'local-demo',
      href: `${project.id === 'PM-01' ? '/maintenance' : '/'}?project=${encodeURIComponent(project.id)}`,
    })),
    ...humanProjects.map(project => ({
      collection: 'life-data', id: project.id, title: project.title,
      summary: project.tagline, scope: project.scope, status: 'local-prototype',
      href: `/?human=${encodeURIComponent(project.id)}`,
    })),
    ...workbenchProjects.map(project => ({
      collection: 'engineering', id: project.id, title: project.name,
      summary: project.headline, scope: project.limit, status: 'local-demo',
      href: `/engineering?project=${encodeURIComponent(project.id)}`,
    })),
    ...flagshipDescriptions.map(([id, title, problem]) => ({
      collection: 'business-systems', id, title, summary: problem,
      scope: 'Executable local decision view with synthetic data. Some views extend or reuse automation engines. No live provider acceptance or operational authority.',
      status: 'local-demo', href: `/flagships?project=${encodeURIComponent(id)}`,
    })),
    ...research.map(([id, summary, status, scope]) => ({
      collection: 'research', id, title: id, summary, status, scope,
      href: `${id==='TrustGate'?'/trustgate':id==='ChronosRank'?'/chronosrank':id==='DocksideSLM'?'/dockside':id==='VeilRAG'?'/veilrag':'/research'}?project=${encodeURIComponent(id)}`,
    })),
  ].map(record => record.collection === 'automation' && record.id === 'MED-01' ? {
    ...record, href: '/referral?project=MED-01',
    summary: 'Inspect fictional referral checklists, consent holds, independent packet review and a durable local administrative queue.',
    scope: 'Partial synthetic administrative build with closed fixture selections and a fixed clock. No clinical decisions, real payer policy, insurance authorization, authenticated users or live provider acceptance.',
  } : record);
}
