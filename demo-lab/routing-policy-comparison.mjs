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
