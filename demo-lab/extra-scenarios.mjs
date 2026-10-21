/** New bounded portfolio demos: deterministic rules before any model/tool call. */
export function maintenance(input) {
  if (!input || typeof input.description !== 'string' || !input.description.trim()) throw new Error('Description required');
  const emergency = /\b(gas leak|fire|sparks|flooding|smoke)\b/i.test(input.description);
  const access = input.accessApproved === true;
  return { projectId: 'PM-01', priority: emergency ? 'emergency' : 'routine',
    queue: emergency ? 'human_emergency_operator' : access ? 'vendor_review' : 'access_confirmation',
    slaMinutes: emergency ? 5 : 1440, dispatchAllowed: false,
    reasons: [emergency ? 'deterministic_emergency_rule' : 'routine_issue',
      access ? 'access_confirmed' : 'access_not_confirmed'],
    proposal: emergency ? 'Escalate immediately to the emergency operator.' : 'Prepare a maintenance work order for review.' };
}

export function commitments(input) {
  if (!input || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new Error('1–100 commitment items required');
  const seen = new Map();
  const items = [];
  for (const item of input.items) {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.owner !== 'string' || !item.owner || typeof item.text !== 'string' || !item.text.trim()) throw new Error('Invalid commitment');
    const fingerprint = JSON.stringify([item.owner, item.text, item.authorized, item.confirmed]);
    if (seen.has(item.id)) {
      if (seen.get(item.id) !== fingerprint) throw new Error('Conflicting commitment identity requires review');
      continue;
    }
    seen.set(item.id, fingerprint);
    if (item.authorized !== true) continue;
    items.push({ id: item.id, owner: item.owner, text: item.text,
      status: item.confirmed === true ? 'confirmed' : 'needs_owner_review', messageSent: false });
  }
  return { projectId: 'EA-01', items, inputCount: input.items.length,
    retainedCount: items.length, externalActions: 0 };
}

export const extraProjects = [
  { id: 'PM-01', title: 'PM-01 Maintenance triage and access review', source: 'demo-lab/extra-scenarios.mjs',
    demo: 'A gas-leak fixture triggers deterministic emergency escalation; routine work requires access review.',
    ghlRole: 'Property operations contact', stages: ['Intake', 'Triage', 'Access review', 'Resolved'],
    fixture: { description: 'Reported gas leak near the boiler', accessApproved: false } },
  { id: 'EA-01', title: 'EA-01 Commitments and owner review', source: 'demo-lab/extra-scenarios.mjs',
    demo: 'Duplicate commitments collapse, unauthorized items are excluded, and unconfirmed work waits for its owner.',
    ghlRole: 'Executive relationship contact', stages: ['Captured', 'Owner review', 'Confirmed', 'Closed'],
    fixture: { items: [
      { id: 'c1', owner: 'Demo owner', text: 'Review the supplier proposal', authorized: true, confirmed: false },
      { id: 'c1', owner: 'Demo owner', text: 'Review the supplier proposal', authorized: true, confirmed: false },
      { id: 'c2', owner: 'Other owner', text: 'Unshared commitment', authorized: false, confirmed: false },
    ] } },
];
