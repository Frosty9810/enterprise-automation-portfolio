import { isDeepStrictEqual } from 'node:util';
import { openCrmHandoffFunnel } from './crm-handoff-funnel.mjs';

const counts = ['inquiries', 'qualified', 'handed_off', 'intake_started'];
const measurements = [
  'inquiry_to_qualified_rate',
  'qualified_to_handoff_rate',
  'handoff_to_intake_rate',
  'inquiry_to_intake_rate',
  'average_handoff_ms',
];

function indexCohorts(cohorts) {
  // The separator cannot occur in a source or campaign slug.
  return new Map(cohorts.map(row => [row.source + '\0' + row.campaign, row]));
}

function compareCohorts(initial, restated) {
  const beforeByKey = indexCohorts(initial);
  const afterByKey = indexCohorts(restated);
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort();

  return keys.map(key => {
    const before = beforeByKey.get(key) ?? null;
    const after = afterByKey.get(key) ?? null;
    const { source, campaign } = after ?? before;
    const delta = {};
    for (const metric of counts) {
      delta[metric] = (after?.[metric] ?? 0) - (before?.[metric] ?? 0);
    }
    for (const metric of measurements) {
      const previous = before?.[metric];
      const current = after?.[metric];
      delta[metric] = previous == null || current == null ? null : current - previous;
    }
    return { source, campaign, before, after, delta };
  });
}

export function reconcileCrmBackfill({ asOf, initialEvents, backfillEvents }) {
  const funnel = openCrmHandoffFunnel();
  try {
    const initial = { load: funnel.ingest(initialEvents), cohorts: funnel.report(asOf) };
    const backfill = { load: funnel.ingest(backfillEvents), cohorts: funnel.report(asOf) };
    const replay = funnel.ingest(backfillEvents);
    return {
      asOf,
      initial,
      backfill,
      changes: compareCohorts(initial.cohorts, backfill.cohorts),
      replay: { load: replay, unchanged: isDeepStrictEqual(funnel.report(asOf), backfill.cohorts) },
    };
  } finally {
    funnel.close();
  }
}
