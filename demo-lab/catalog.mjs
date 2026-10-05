import { readFileSync } from 'node:fs';
import { expansionProjects } from './business-expansion.mjs';
import { extraProjects } from './extra-scenarios.mjs';
import { roadmapProjects } from './roadmap-scenarios.mjs';

export const projects = [
  ...JSON.parse(readFileSync(new URL('../showcase/catalog.json', import.meta.url), 'utf8')),
  ...extraProjects,
  ...roadmapProjects,
  ...expansionProjects,
];
export const projectById = new Map(projects.map(project => [project.id, project]));
