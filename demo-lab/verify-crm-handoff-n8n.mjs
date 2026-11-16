import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./n8n.mjs', import.meta.url));
const workflow = fileURLToPath(new URL('./crm-handoff-n8n.json', import.meta.url));
const workflowId = 'PortfolioCrm0016';
const runN8n = promisify(execFile);
const options = { timeout: 120_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true };

async function execute() {
  const { stdout } = await runN8n(process.execPath, [cli, 'execute', '--id=' + workflowId, '--rawOutput'], options);
  // n8n prints startup diagnostics before the execution JSON.
  const output = stdout.match(/^\{\r?\n\s+"data": [\s\S]*^\}/m)?.[0];
  assert.ok(output, 'n8n did not emit the execution JSON.');
  const execution = JSON.parse(output);
  assert.equal(execution.status, 'success');
  assert.equal(execution.finished, true);
  const nodes = execution.data.resultData.runData;
  const load = nodes['Load synthetic CRM events'][0].data.main[0][0].json;
  const cohorts = nodes['Read campaign funnel'][0].data.main[0].map(item => item.json);
  return { load, cohorts };
}

function fixtureCohorts(cohorts) {
  return cohorts.filter(row => ['crm_n8n_search', 'crm_n8n_partner'].includes(row.campaign));
}

try {
  await runN8n(process.execPath, [cli, 'import:workflow', '--input=' + workflow], options);
  const first = await execute();
  assert.deepEqual(first.load, { inserted: 6, replayed: 0 });
  const second = await execute();
  assert.deepEqual(second.load, { inserted: 0, replayed: 6 });

  const cohorts = fixtureCohorts(first.cohorts);
  assert.deepEqual(fixtureCohorts(second.cohorts), cohorts);
  assert.deepEqual(cohorts.map(row => [
    row.source, row.campaign, row.inquiries, row.qualified, row.handed_off,
    row.intake_started, row.inquiry_to_intake_rate, row.average_handoff_ms,
  ]), [
    ['paid_search', 'crm_n8n_search', 2, 1, 1, 1, 0.5, 900_000],
    ['referral', 'crm_n8n_partner', 1, 0, 0, 0, 0, null],
  ]);
  assert.equal(cohorts[1].qualified_to_handoff_rate, null);
  console.log(JSON.stringify({ initialLoad: first.load, replay: second.load, cohorts }, null, 2));
} catch (error) {
  // Avoid printing raw n8n execution output, which can contain runtime tokens.
  console.error(error instanceof assert.AssertionError ? error.message : 'CRM n8n acceptance failed. Check the local lab and n8n CLI.');
  process.exitCode = 1;
}
