import { routingLab } from './flagship-decisions.mjs';
import { flagshipFixtures } from './flagship-fixtures.mjs';

const policies = [
  ['cheap-only', 'escalation'],
  ['escalation-only', 'cheap'],
  ['cheap-then-escalate', null],
];

function outcome(trial) {
  if (trial.selected) {
    return trial.selected.status === 'abstain' ? 'verified_abstention' : 'verified_answer';
  }
  return trial.route;
}

export function compareRoutingPolicies({ fixture = flagshipFixtures.F04, budgetUnits = fixture.budgetUnits } = {}) {
  let datasetHash;
  const comparison = policies.map(([id, disabledProposal]) => {
    const cases = disabledProposal === null ? fixture.cases
      : fixture.cases.map(row => ({ ...row, [disabledProposal]: null }));
    const result = routingLab({ ...fixture, cases, budgetUnits });

    // The full proposal set retains the engine's original fixture identity.
    if (disabledProposal === null) datasetHash = result.datasetHash;
    const trials = result.trials.map(trial => ({
      id: trial.id,
      expectedOutcome: trial.expectedCitation === null ? 'abstention' : 'answer',
      expectedCitation: trial.expectedCitation,
      selectedCitation: trial.selected?.citations[0] ?? null,
      route: trial.route,
      outcome: outcome(trial),
      correct: trial.passed,
      trace: trial.trace,
      excludedSources: trial.excludedSources,
    }));
    const count = status => trials.filter(trial => trial.outcome === status).length;
    return {
      id,
      correct: result.passed,
      total: result.total,
      verifiedAnswers: count('verified_answer'),
      verifiedAbstentions: count('verified_abstention'),
      unverified: count('no_verified_result'),
      budgetStops: count('budget_stop'),
      spentScenarioUnits: result.spentScenarioUnits,
      remainingScenarioUnits: budgetUnits - result.spentScenarioUnits,
      trials,
    };
  });
  return {
    datasetVersion: fixture.datasetVersion,
    datasetHash,
    caseOrder: fixture.cases.map(row => row.id),
    budgetUnitsPerPolicy: budgetUnits,
    policies: comparison,
    scope: 'Synthetic proposals and unit charges. Each policy starts with the same independent budget and processes cases in fixture order. No model calls, provider prices or latency measurements.',
  };
}

export function routingPolicyFrontier() {
  const fixture = flagshipFixtures.F04;
  const maximumBudgetUnits = fixture.cases.reduce((sum, row) =>
    sum + (row.cheap?.units ?? 0) + (row.escalation?.units ?? 0), 0);
  // This exhaustive command is for a small, checked-in fixture.
  if (!Number.isSafeInteger(maximumBudgetUnits) || maximumBudgetUnits < 0 || maximumBudgetUnits > 10_000) {
    throw new RangeError('The bundled fixture budget is outside the exhaustive scan range.');
  }

  const initial = compareRoutingPolicies({ budgetUnits: 0 });
  const trackers = initial.policies.map(({ id }) => ({
    id, thresholds: new Map(), correctCases: new Set(),
  }));
  for (let budgetUnits = 0; budgetUnits <= maximumBudgetUnits; budgetUnits++) {
    const { policies: results } = budgetUnits === 0 ? initial : compareRoutingPolicies({ budgetUnits });
    for (const [index, result] of results.entries()) {
      const { thresholds, correctCases } = trackers[index];
      if (!thresholds.has(result.correct)) {
        thresholds.set(result.correct, {
          correct: result.correct,
          minimumStartingBudgetUnits: budgetUnits,
          spentScenarioUnitsAtThreshold: result.spentScenarioUnits,
        });
      }
      for (const trial of result.trials) {
        if (trial.correct) correctCases.add(trial.id);
      }
    }
  }

  return {
    datasetVersion: initial.datasetVersion,
    datasetHash: initial.datasetHash,
    caseOrder: initial.caseOrder,
    maximumBudgetUnits,
    budgetsEvaluated: maximumBudgetUnits + 1,
    policies: trackers.map(({ id, thresholds, correctCases }) => ({
      id,
      thresholds: [...thresholds.values()].sort((a, b) => a.correct - b.correct),
      fullAccuracyAttainable: thresholds.has(initial.caseOrder.length),
      neverCorrectCaseIds: initial.caseOrder.filter(caseId => !correctCases.has(caseId)),
    })),
    scope: 'Exhaustive integer starting budgets for the bundled synthetic fixture in its fixed case order. Spend comes from the first run attaining each exact correct count. No model calls, provider prices or latency measurements.',
  };
}
