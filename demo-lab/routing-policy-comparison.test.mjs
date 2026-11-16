import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { routingLab } from './flagship-decisions.mjs';
import { flagshipFixtures } from './flagship-fixtures.mjs';
import { compareRoutingPolicies, routingPolicyFrontier } from './routing-policy-comparison.mjs';

function results(report) {
  return report.policies.map(policy => [
    policy.id, policy.correct, policy.verifiedAnswers, policy.verifiedAbstentions,
    policy.unverified, policy.budgetStops, policy.spentScenarioUnits,
  ]);
}

test('F04 compares the original fixture and reports stable results without mutating input', () => {
  const fixture = structuredClone(flagshipFixtures.F04);
  const report = compareRoutingPolicies({ fixture });
  assert.deepEqual(report, compareRoutingPolicies());
  assert.deepEqual(fixture, flagshipFixtures.F04);
  assert.deepEqual(report.caseOrder, fixture.cases.map(row => row.id));
  assert.equal(report.datasetHash, routingLab(fixture).datasetHash);
  assert.equal(report.datasetVersion, fixture.datasetVersion);
  assert.equal(report.budgetUnitsPerPolicy, 20);
  assert.deepEqual(results(report), [
    ['cheap-only', 1, 1, 0, 2, 0, 3],
    ['escalation-only', 3, 2, 1, 0, 0, 15],
    ['cheap-then-escalate', 3, 2, 1, 0, 0, 13],
  ]);
});

test('each policy starts with the same budget and stops before overspending', () => {
  const report = compareRoutingPolicies({ budgetUnits: 7 });
  assert.deepEqual(results(report), [
    ['cheap-only', 1, 1, 0, 2, 0, 3],
    ['escalation-only', 1, 1, 0, 0, 2, 5],
    ['cheap-then-escalate', 2, 2, 0, 0, 1, 7],
  ]);
  for (const policy of report.policies) {
    const charged = policy.trials.flatMap(trial => trial.trace)
      .reduce((sum, attempt) => sum + (attempt.units ?? 0), 0);
    assert.equal(charged, policy.spentScenarioUnits);
    assert.equal(7 - charged, policy.remainingScenarioUnits);
  }
  const cascade = report.policies.find(policy => policy.id === 'cheap-then-escalate');
  assert.deepEqual(cascade.trials[1].trace, [
    { name: 'cheap', status: 'rejected', units: 1 },
    { name: 'escalation', status: 'verified', units: 5 },
  ]);
  assert.deepEqual(cascade.trials[2].trace, [{ name: 'cheap', status: 'budget_stop' }]);
  const zero = compareRoutingPolicies({ budgetUnits: 0 });
  assert.deepEqual(zero.policies.map(policy => [policy.correct, policy.spentScenarioUnits, policy.budgetStops]),
    [[0, 0, 3], [0, 0, 3], [0, 0, 3]]);
  for (const budgetUnits of [-1, 1.5, '7', 1_000_000_001]) {
    assert.throws(() => compareRoutingPolicies({ budgetUnits }), /bounded integer/);
  }
});

test('verified abstention differs from an unresolved case with the same null citation', () => {
  const report = compareRoutingPolicies();
  const [cheap, escalation] = report.policies.map(policy => policy.trials.find(trial => trial.id === 'eval-unknown'));
  assert.equal(cheap.expectedOutcome, 'abstention');
  assert.equal(cheap.selectedCitation, null);
  assert.equal(cheap.outcome, 'no_verified_result');
  assert.equal(cheap.correct, false);
  assert.equal(escalation.selectedCitation, null);
  assert.equal(escalation.outcome, 'verified_abstention');
  assert.equal(escalation.correct, true);
});

test('fixed case order affects constrained allocation and reference labels only affect scoring', () => {
  const fixture = structuredClone(flagshipFixtures.F04);
  fixture.cases.reverse();
  const report = compareRoutingPolicies({ fixture, budgetUnits: 7 });
  assert.deepEqual(report.caseOrder, ['eval-unknown', 'eval-shipping', 'eval-return']);
  assert.ok(report.policies.every(policy => policy.trials[0].id === 'eval-unknown'));
  assert.equal(report.policies[2].correct, 1);
  assert.equal(report.policies[2].trials[0].outcome, 'verified_abstention');
  assert.notEqual(report.datasetHash, compareRoutingPolicies({ budgetUnits: 7 }).datasetHash);

  const original = report.policies[2].trials[0];
  fixture.cases[0].expectedCitation = 'shipping';
  const relabeled = compareRoutingPolicies({ fixture, budgetUnits: 7 }).policies[2].trials[0];
  assert.deepEqual(relabeled.trace, original.trace);
  assert.equal(relabeled.outcome, original.outcome);
  assert.equal(relabeled.correct, false);
});

test('the bundled frontier covers every integer budget and records the first instance of each exact outcome', () => {
  const report = routingPolicyFrontier();
  assert.equal(report.maximumBudgetUnits, 18);
  assert.equal(report.budgetsEvaluated, 19);
  assert.deepEqual(report, routingPolicyFrontier());

  const runs = Array.from({ length: report.budgetsEvaluated }, (_, budgetUnits) =>
    compareRoutingPolicies({ budgetUnits }));
  assert.equal(report.datasetHash, runs[0].datasetHash);
  assert.deepEqual(report.caseOrder, runs[0].caseOrder);

  const thresholdRows = report.policies.map(({ thresholds }) => thresholds.map(row =>
    [row.correct, row.minimumStartingBudgetUnits, row.spentScenarioUnitsAtThreshold]));
  assert.deepEqual(thresholdRows, [
    [[0, 0, 0], [1, 1, 1]],
    [[0, 0, 0], [1, 5, 5], [2, 10, 10], [3, 15, 15]],
    [[0, 0, 0], [1, 1, 1], [2, 7, 7], [3, 13, 13]],
  ]);
  assert.deepEqual(report.policies.map(policy => policy.fullAccuracyAttainable), [false, true, true]);
  assert.deepEqual(report.policies.map(policy => policy.neverCorrectCaseIds), [
    ['eval-shipping', 'eval-unknown'], [], [],
  ]);

  for (const [index, policy] of report.policies.entries()) {
    const observed = runs.map(run => run.policies[index]);
    const correctCounts = new Set(observed.map(result => result.correct));
    assert.deepEqual(new Set(policy.thresholds.map(row => row.correct)), correctCounts);
    for (const threshold of policy.thresholds) {
      const first = observed.findIndex(result => result.correct === threshold.correct);
      assert.equal(threshold.minimumStartingBudgetUnits, first);
      assert.equal(threshold.spentScenarioUnitsAtThreshold, observed[first].spentScenarioUnits);
    }
    assert.deepEqual(policy.neverCorrectCaseIds, report.caseOrder.filter(caseId =>
      observed.every(result => !result.trials.some(trial => trial.id === caseId && trial.correct))));
  }
});

test('CLI emits either the bundled frontier or a single budget trace and rejects combinations', () => {
  const cli = fileURLToPath(new URL('./run-routing-comparison.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', timeout: 5_000, windowsHide: true,
  });

  const frontier = run('--frontier');
  assert.equal(frontier.status, 0);
  assert.deepEqual(JSON.parse(frontier.stdout), routingPolicyFrontier());
  const trace = run('7');
  assert.equal(trace.status, 0);
  assert.deepEqual(JSON.parse(trace.stdout), compareRoutingPolicies({ budgetUnits: 7 }));
  const invalid = run('--frontier', '7');
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /Usage:/);
});
