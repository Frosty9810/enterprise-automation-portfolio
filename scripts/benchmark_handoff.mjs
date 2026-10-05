/** Local CPU baseline only: no claim about n8n or remote API latency. */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { planContact } from '../integrations/ghl-n8n/contract.mjs';

const config = { projectId: 'RE-01', locationId: 'DEMO_LOCATION' };
const event = { projectId: 'RE-01', eventId: 'bench-1', storageConsent: true,
  contact: { email: 'demo@example.com', firstName: 'Demo' } };
for (let i = 0; i < 10000; i++) planContact(event, config);
const samples = [];
const batchSize = 1000;
for (let batch = 0; batch < 100; batch++) {
  const start = performance.now();
  for (let i = 0; i < batchSize; i++) {
    if (planContact(event, config).status !== 'ready') throw new Error('Incorrect result');
  }
  samples.push((performance.now() - start) / batchSize);
}
samples.sort((a, b) => a - b);
const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
const report = {
  measuredAt: new Date().toISOString(), scope: 'local pure planner; batch-averaged latency',
  runtime: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model,
  warmup: 10000, iterations: batchSize * samples.length, batchSize,
  medianMs: samples[49], p95BatchAverageMs: p95,
  throughputPerSecond: 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length),
  budgetMs: 1, passed: p95 < 1,
  limitations: 'Synthetic valid contact only. Excludes network, persistence, n8n, concurrency and provider cost. Budget is a smoke regression ceiling, not a production SLO.',
};
mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
writeFileSync(new URL('../reports/handoff-benchmark.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
