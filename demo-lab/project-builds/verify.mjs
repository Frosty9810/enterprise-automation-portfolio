import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const rows = [];
for (const id of readdirSync(root).filter(name => /^(PM|EA|CON|MED|LEGAL|INS|INV|CRM|AGT|OPS)-01$/.test(name))) {
  const dir = new URL(`${id}/`, root);
  const run = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('build/demo.js', dir))], { encoding: 'utf8' }));
  assert.equal(run.projectId, id);
  assert.equal(run.evaluation.passed, run.evaluation.total);
  const original = readFileSync(new URL(`../workflows/${id}.json`, root), 'utf8');
  const copy = readFileSync(new URL('build/n8n-workflow.json', dir), 'utf8');
  assert.equal(copy, original);
  const workflow = JSON.parse(copy);
  const names = new Set(workflow.nodes.map(n => n.name));
  for (const [name, channels] of Object.entries(workflow.connections)) {
    assert.ok(names.has(name));
    for (const outputs of Object.values(channels)) for (const targets of outputs) for (const target of targets) assert.ok(names.has(target.node));
  }
  const sql = readFileSync(new URL('build/schema.sql', dir), 'utf8');
  // This is deliberately a structural guard, not a PostgreSQL grammar/parser or engine test.
  let depth = 0;
  let quoted = false;
  const uncommented = sql.replace(/--[^\n]*/g, '');
  for (let i = 0; i < uncommented.length; i++) {
    const c = uncommented[i];
    if (c === "'") {
      if (quoted && uncommented[i + 1] === "'") i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      assert.ok(depth >= 0);
    }
  }
  assert.equal(depth, 0); assert.equal(quoted, false);
  assert.equal((uncommented.match(/;/g) || []).length, 6);
  assert.equal((sql.match(/CREATE TABLE/g) || []).length, 2);
  const sop = readFileSync(new URL('SOP.md', dir), 'utf8');
  assert.equal((sop.match(/^## \d+\./gm) || []).length, 44);
  assert.ok(sop.includes('**Video Walkthrough:** _Pending recording — see script in this SOP\'s project folder._'));
  for (const file of ['SOP.md', 'README.md', 'walkthrough-script.md', 'build/README.md']) {
    const fileUrl = new URL(file, dir);
    const markdown = readFileSync(fileUrl, 'utf8');
    for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      if (!/^(https?:|#)/.test(match[1])) assert.ok(existsSync(new URL(match[1], fileUrl)), `${id}/${file}: missing ${match[1]}`);
    }
  }
  rows.push({ id, cases: run.evaluation.total, script: 'passed', workflowNodes: workflow.nodes.length, workflowCopy: 'exact', sql: 'structural checks passed; not executed by PostgreSQL', sopSections: 44, video: 'pending recording' });
}
assert.equal(rows.length, 10);
const report = { checkedAt: new Date().toISOString(), projects: rows.length, businessCases: rows.reduce((sum, row) => sum + row.cases, 0), postgresExecuted: false, rows };
writeFileSync(new URL('verification.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
