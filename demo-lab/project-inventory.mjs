import { projects } from './catalog.mjs';
import { humanProjects } from './human-projects.mjs';
import { workbenchProjects } from './workbench-core.mjs';
import { flagshipDescriptions } from './flagship-fixtures.mjs';

// These six catalogs contain bounded examples, not the complete industry builds.
const industryTracks = new Set(['PM-01', 'CON-01', 'MED-01', 'LEGAL-01', 'INS-01', 'EA-01']);
const research = [
  ['AtlasGraph', 'Compile supplied operational evidence into a versioned graph and inspect retrieval paths.', 'partial-local', 'Local deterministic graph compiler, SQLite evidence versions and graph retrieval. No LLM, dense-vector baseline, live provider or production integration. The full research blueprint remains unfinished.'],
  ['ChronosRank', 'A planned memory layer with temporal retrieval and compact reranking.', 'blueprint-only', 'Design only. Distillation, reranker training, temporal memory and measured retrieval comparisons are not implemented.'],
  ['TrustGate', 'Inspect source-bound arguments, policy holds, reviewed local tools and durable execution receipts.', 'partial-local', 'Local gateway for three fixed synthetic SQLite tools, server-held source labels, review and replay controls. No authenticated agent runtime, external action, LM screener or general prompt-injection benchmark. The full research blueprint remains unfinished.'],
  ['DocksideSLM', 'Planned offline document intelligence on warehouse edge hardware.', 'blueprint-only', 'Design only. Model compression, end-device execution and measured hardware quality or latency are not implemented.'],
  ['VeilRAG', 'A planned reversible privacy proxy for external language models.', 'blueprint-only', 'Design only. The reversible privacy pipeline, retrieval integration and leakage evaluation are not implemented.'],
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
      scope: industryTracks.has(project.id)
        ? 'Partial industry build: this bounded synthetic scenario is executable; the full industry flagship and live provider acceptance remain unfinished.'
        : 'Executable local scenario with synthetic evidence. Wrapper presence does not establish hosted integration or production acceptance.',
      status: industryTracks.has(project.id) ? 'partial-local' : 'local-demo',
      href: `/?project=${encodeURIComponent(project.id)}`,
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
      href: `${id==='TrustGate'?'/trustgate':'/research'}?project=${encodeURIComponent(id)}`,
    })),
  ];
}
