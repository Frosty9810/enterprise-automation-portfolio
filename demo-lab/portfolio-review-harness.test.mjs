import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assessReviewDirectory, assessReviewReports, createReviewPlan, reportTemplate,
  reviewRoles, reviewSourceSnapshot, writeReviewPlan,
} from './portfolio-review-harness.mjs';

const inventory = [
  {collection:'automation', id:'AUTO-01', title:'Local automation', href:'/?project=AUTO-01'},
  {collection:'research', id:'AtlasGraph', title:'AtlasGraph', href:'/research?project=AtlasGraph'},
];
function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'portfolio-review-'));
  const root = join(temporary, 'repo');
  mkdirSync(root);
  mkdirSync(join(root, 'demo-lab'));
  writeFileSync(join(root, 'demo-lab', 'catalog.mjs'), 'export const fixture = true;\n');
  writeFileSync(join(root, 'README.md'), '# Synthetic review fixture\n');
  writeFileSync(join(root, 'atlasgraph.sql'), 'CREATE TABLE evidence(id TEXT);\n');
  t.after(() => rmSync(temporary, {recursive:true, force:true}));
  const options = {root, inventory, runId:'review-test-run'};
  const plan = createReviewPlan(options);
  return {temporary, root, options, plan};
}
function completedReports(plan) {
  return plan.shards.flatMap(shard => reviewRoles.map(role => {
    const report = reportTemplate(plan, shard, role);
    report.reviewerId = role + '-reviewer';
    report.implementerIds = ['fixture-implementer'];
    for (const project of report.projects) {
      for (const check of Object.values(project.checks)) {
        check.status = 'pass';
        check.note = 'Synthetic test declaration only. This helper is never used by the CLI.';
        check.evidence = [{path:'README.md', line:1}];
      }
      project.nextIdea = 'Inspect a new adverse fixture before changing implementation.';
    }
    return report;
  }));
}
function finding(report, severity = 'high', status = 'open') {
  return {
    projectKey:report.projects[0].key, severity, status, path:'README.md', line:1,
    message:'Synthetic detected failure.', resolution:status === 'resolved' ? 'Verified by test setup.' : '',
  };
}

test('real plan derives all 73 entries and five actual inventory collections', () => {
  const plan = createReviewPlan();
  assert.equal(plan.projectCount, 73);
  assert.deepEqual(plan.shards.map(shard => [shard.id, shard.projects.length]), [
    ['automation',27], ['business-systems',12], ['engineering',9], ['life-data',20], ['research',5],
  ]);
  assert.equal(new Set(plan.shards.flatMap(shard => shard.projects.map(project => project.key))).size, 73);
  const sourcePaths = new Set(plan.files.map(file => file.path));
  for (const shard of plan.shards) {
    for (const project of shard.projects) {
      assert.ok(project.evidenceCandidates.length > 0);
      assert.ok(project.evidenceCandidates.every(file => sourcePaths.has(file.path)));
    }
  }
  const evidence = collection => new Set(plan.shards.find(shard => shard.id === collection).projects[0].evidenceCandidates.map(file => file.path));
  assert.ok(evidence('life-data').has('demo-lab/human-studio.mjs'));
  assert.ok(evidence('life-data').has('demo-lab/human-projects.test.mjs'));
  assert.ok(evidence('engineering').has('demo-lab/workbench.test.mjs'));
  assert.ok(evidence('engineering').has('demo-lab/workbench-story.test.mjs'));
  assert.deepEqual(createReviewPlan({runId:plan.runId}), plan);
});

test('packets are source-bound and templates cannot count as completed reviews', t => {
  const {temporary, options, plan} = fixture(t);
  const out = join(temporary, 'packets');
  assert.deepEqual(writeReviewPlan(out, options), plan);
  const packet = JSON.parse(readFileSync(join(out, 'automation.packet.json'), 'utf8'));
  assert.equal(packet.sourceHash, plan.sourceHash);
  assert.equal(packet.shard.projects.length, 1);
  const template = JSON.parse(readFileSync(join(out, 'automation.reliability.template.json'), 'utf8'));
  assert.equal(template.reviewerId, '');
  assert.equal(template.projects[0].checks.purpose.status, 'unreviewed');
  assert.equal(assessReviewReports(plan, [template], options).decision, 'incomplete-evidence');
  assert.throws(() => writeReviewPlan(out, options), /absent or empty/);
});

test('assessor requires complete independent role and project coverage', t => {
  const {plan, options} = fixture(t);
  const reports = completedReports(plan);
  assert.equal(assessReviewReports(plan, reports, options).decision, 'reviewed-local-scope');
  for (const mutate of [
    rows => rows.pop(),
    rows => rows.push(structuredClone(rows[0])),
    rows => { rows[0].projects.pop(); },
    rows => { rows[0].projects.push(structuredClone(rows[0].projects[0])); },
    rows => { rows[0].reviewerId = 'fixture-implementer'; },
    rows => { rows[1].reviewerId = rows[0].reviewerId; },
    rows => { rows[0].sourceHash = 'wrong'; },
    rows => { rows[0].runId = 'wrong'; },
    rows => { rows[0].planHash = 'wrong'; },
    rows => { rows[0].projects[0].nextIdea = ''; },
    rows => { delete rows[0].projects[0].checks.authority; },
  ]) {
    const changed = structuredClone(reports);
    mutate(changed);
    assert.equal(assessReviewReports(plan, changed, options).decision, 'incomplete-evidence');
  }
});

test('unlocated, escaped, unexecuted and blocked evidence does not pass', t => {
  const {plan, options} = fixture(t);
  for (const evidence of [[], [{path:'../escape.md',line:1}], [{path:'/absolute',line:1}],
    [{path:'README.md',line:999}], [{path:'unknown.md',line:1}], [{path:'README.md',line:0}]]) {
    const reports = completedReports(plan);
    reports[0].projects[0].checks.tests.evidence = evidence;
    assert.equal(assessReviewReports(plan, reports, options).decision, 'incomplete-evidence');
  }
  const reports = completedReports(plan);
  reports[0].projects[0].checks.tests.status = 'unreviewed';
  assert.equal(assessReviewReports(plan, reports, options).decision, 'incomplete-evidence');
  reports[0].projects[0].checks.tests.status = 'blocked';
  assert.equal(assessReviewReports(plan, reports, options).decision, 'incomplete-evidence');
  reports[0].projects[0].checks.ui = {status:'not-applicable',note:'This fixture is CLI-only; no visual claim.',evidence:[]};
  reports[0].projects[0].checks.tests.status = 'pass';
  assert.equal(assessReviewReports(plan, reports, options).decision, 'reviewed-local-scope');
  for (const check of Object.values(reports[0].projects[0].checks)) {
    check.status = 'not-applicable';
    check.note = 'No inspection was performed.';
    check.evidence = [];
  }
  assert.equal(assessReviewReports(plan, reports, options).decision, 'incomplete-evidence');
});

test('serious unresolved findings and failed checks require work; malformed findings reject', t => {
  const {plan, options} = fixture(t);
  const reports = completedReports(plan);
  reports[0].findings = [finding(reports[0])];
  assert.equal(assessReviewReports(plan, reports, options).decision, 'needs-work');
  reports[0].findings[0].status = 'deferred';
  reports[0].findings[0].resolution = 'Waiting for authorized provider acceptance.';
  assert.equal(assessReviewReports(plan, reports, options).decision, 'needs-work');
  reports[0].findings = [finding(reports[0], 'high', 'resolved')];
  assert.equal(assessReviewReports(plan, reports, options).decision, 'reviewed-local-scope');
  reports[0].projects[0].checks.replay.status = 'fail';
  assert.equal(assessReviewReports(plan, reports, options).decision, 'needs-work');
  reports[0].findings = [null];
  assert.equal(assessReviewReports(plan, reports, options).decision, 'incomplete-evidence');
});

test('source or inventory changes and recomputed plan tampering invalidate review', t => {
  const {root, plan, options} = fixture(t);
  const reports = completedReports(plan);
  const tampered = structuredClone(plan);
  tampered.shards[0].projects = [];
  tampered.projectCount--;
  const {planHash, ...body} = tampered;
  tampered.planHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  assert.equal(assessReviewReports(tampered, reports, options).decision, 'incomplete-evidence');
  assert.equal(assessReviewReports(plan, reports, {...options,inventory:inventory.slice(1)}).decision, 'incomplete-evidence');
  writeFileSync(join(root,'README.md'), '# Changed source\n');
  assert.equal(assessReviewReports(plan, reports, options).decision, 'incomplete-evidence');
});

test('snapshot excludes generated/runtime/dependency files and rejects source links', t => {
  const {temporary, root, plan} = fixture(t);
  for (const name of ['node_modules','.runtime','reports','dist']) {
    mkdirSync(join(root,name));
    writeFileSync(join(root,name,'ignored.json'), '{}');
  }
  assert.equal(reviewSourceSnapshot(root).sourceHash, plan.sourceHash);
  assert.throws(() => writeReviewPlan(join(root,'review-output'), {root,inventory}), /outside the repository/);
  const external = join(temporary,'outside');
  mkdirSync(external);
  writeFileSync(join(external,'escape.md'),'external');
  symlinkSync(external, join(root,'linked-source'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => reviewSourceSnapshot(root), /Symbolic links/);
  assert.throws(() => writeReviewPlan(join(root,'linked-source','output'), {root,inventory}), /Symbolic links/);
});

test('reports directory rejects nested entries and accepts only complete report files', t => {
  const {temporary, options} = fixture(t);
  const out = join(temporary,'packets');
  const plan = writeReviewPlan(out, options);
  const reports = join(temporary,'reports');
  mkdirSync(reports);
  assert.equal(assessReviewDirectory(join(out,'plan.json'), reports, options).decision, 'incomplete-evidence');
  completedReports(plan).forEach((report,index) => writeFileSync(join(reports,index+'.json'),JSON.stringify(report)));
  assert.equal(assessReviewDirectory(join(out,'plan.json'), reports, options).decision, 'reviewed-local-scope');
  mkdirSync(join(reports,'nested'));
  assert.throws(() => assessReviewDirectory(join(out,'plan.json'), reports, options), /only JSON/);
});


test('EML fixtures and binary assets are content-bound and any change invalidates existing review', t => {
  const {root, options} = fixture(t);
  const mail = join(root, 'construction-email-change.eml');
  const asset = join(root, 'diagram.bin');
  writeFileSync(mail, 'Subject: Synthetic change request\n\nVersion one.\n');
  const bytes = Buffer.from([0, 255, 128, 10, 13]);
  writeFileSync(asset, bytes);
  const plan = createReviewPlan(options), reports = completedReports(plan);
  assert.ok(plan.files.some(file => file.path === 'construction-email-change.eml'));
  assert.deepEqual(plan.files.find(file => file.path === 'diagram.bin'), {
    path:'diagram.bin', sha256:createHash('sha256').update(bytes).digest('hex'),
  });
  assert.equal(assessReviewReports(plan, reports, options).decision, 'reviewed-local-scope');
  writeFileSync(mail, 'Subject: Synthetic change request\n\nVersion two.\n');
  assert.equal(assessReviewReports(plan, reports, options).decision, 'incomplete-evidence');
  const updated = createReviewPlan(options), updatedReports = completedReports(updated);
  writeFileSync(asset, Buffer.from([0, 255, 129, 10, 13]));
  assert.equal(assessReviewReports(updated, updatedReports, options).decision, 'incomplete-evidence');
});

test('environment secrets, key containers and generated caches stay outside the source snapshot', t => {
  const {root, plan} = fixture(t);
  for (const name of ['.env', '.env.production', '.ENV.local', 'id_rsa', 'client.P12', 'private.key']) {
    writeFileSync(join(root, name), 'SYNTHETIC_SECRET_PLACEHOLDER');
  }
  for (const name of ['.ruff_cache', '.pytest_cache', '.mypy_cache', '.cache']) {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, 'cache.dat'), 'generated');
  }
  assert.deepEqual(reviewSourceSnapshot(root).files, plan.files);
});

test('normalized reviewer identities remain separate from either role and every declared implementer', t => {
  const {plan, options} = fixture(t);
  for (const mutate of [
    rows => { rows[0].reviewerId = ' fixture-implementer '; },
    rows => { rows[0].implementerIds = [' reliability-reviewer ']; },
    rows => { rows[1].reviewerId = ' reliability-reviewer '; },
    rows => { rows[0].implementerIds = ['other-implementer']; rows[1].implementerIds = ['reliability-reviewer']; },
    rows => { rows[0].implementerIds = ['other-implementer']; rows[2].implementerIds = [' reliability-reviewer ']; },
  ]) {
    const reports = completedReports(plan);
    mutate(reports);
    assert.equal(assessReviewReports(plan, reports, options).decision, 'incomplete-evidence');
  }
  const reports = completedReports(plan);
  for (const report of reports) {
    report.reviewerId = ' ' + report.reviewerId + ' ';
    report.implementerIds = [' fixture-implementer '];
  }
  assert.equal(assessReviewReports(plan, reports, options).decision, 'reviewed-local-scope');
});

test('source changed while report evidence is inspected cannot receive a green assessment', t => {
  const {root, plan, options} = fixture(t);
  const reports = completedReports(plan), reviewerId = reports[0].reviewerId;
  let changed = false;
  Object.defineProperty(reports[0], 'reviewerId', {get() {
    if (!changed) {
      changed = true;
      writeFileSync(join(root, 'README.md'), '# Changed during assessment\n');
    }
    return reviewerId;
  }});
  const result = assessReviewReports(plan, reports, options);
  assert.equal(changed, true);
  assert.equal(result.decision, 'incomplete-evidence');
  assert.ok(result.reasons.some(reason => reason.includes('changed during report assessment')));
});
