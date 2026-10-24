export const maintenanceScope = 'Synthetic PM-01 local maintenance desk. Fixture labels are not authentication. No contact, real emergency response, provider delivery, or proof of physical completion. Industry flagship remains partial.';
export const scenarioAsOf = '2026-10-24T12:00:00.000Z';
export const maintenanceRegistry = Object.fromEntries(['acme', 'beta'].map(tenant => [tenant, {
  lease: { id: `lease-${tenant}`, tenant, unitId: `unit-${tenant}`, occupant: `${tenant}-tenant`, activeFrom: '2026-01-01T00:00:00.000Z', activeUntil: '2027-01-01T00:00:00.000Z' },
  actors: { operators: [`${tenant}-operator`, `${tenant}-dual-role`], reviewers: [`${tenant}-reviewer`, `${tenant}-dual-role`], tenants: [`${tenant}-tenant`] },
  vendors: ['plumbing', 'electrical'].map(skill => ({ id: `vendor-${tenant}-${skill}`, tenant, skills: [skill], approved: true, windows: [{ start: `2026-10-24T${skill === 'plumbing' ? '13' : '15'}:00:00.000Z`, end: '2026-10-24T18:00:00.000Z' }] }))
}]));
export const maintenanceAccessWindows = [{ start: '2026-10-24T13:00:00.000Z', end: '2026-10-24T16:00:00.000Z' }];
const intake = (name, tenant, description, hazards = [], requiredSkill = 'plumbing') => ({ commandId: `intake-${name}`, tenant, actor: `${tenant}-operator`, sourceIssueId: `issue-${name}`, leaseId: `lease-${tenant}`, description, hazards, requiredSkill, durationMinutes: 60, receivedAt: '2026-10-24T11:30:00.000Z' });
export const maintenanceScenarios = [
  { id: 'routine-plumbing', title: 'Routine dripping tap', input: intake('routine-plumbing', 'acme', 'Kitchen tap drips when closed.') },
  { id: 'emergency-gas', title: 'Known gas text trigger: held for human emergency procedure', input: intake('emergency-gas', 'acme', 'Tenant reports a gas leak near the stove.') },
  { id: 'emergency-flag', title: 'Structured electrical danger: never routine dispatch', input: intake('emergency-flag', 'acme', 'Outlet needs inspection.', ['electrical-danger'], 'electrical') },
  { id: 'routine-electrical', title: 'Routine light switch repair', input: intake('routine-electrical', 'acme', 'Bedroom light switch does not work.', [], 'electrical') },
  { id: 'beta-routine', title: 'Separate tenant maintenance', input: intake('beta-routine', 'beta', 'Bathroom tap drips.') }
];
