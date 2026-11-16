import assert from 'node:assert/strict';
import test from 'node:test';
import { routingLab } from './flagship-decisions.mjs';
import { flagshipFixtures } from './flagship-fixtures.mjs';
import { compareRoutingPolicies } from './routing-policy-comparison.mjs';

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
