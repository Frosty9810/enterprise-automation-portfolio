export const veilRagScope = 'Partial local declared-literal transport boundary: exact replacement with conservative NFKC/lowercase variant rejection, not automatic entity detection, external models, authentication, or a general privacy guarantee.';
export function veilRagScenarios() {
  const input = {
    tenant: 'acme', commandId: 'synthetic-alias-demo', profile: 'echo',
    entities: [{ id: 'person', value: 'Ada Example' }, { id: 'company', value: 'Northstar Example Ltd' }, { id: 'account', value: 'ACCT-SYN-0042' }],
    frames: {
      query: 'Summarize the delivery for Ada Example at Northstar Example Ltd.',
      context: ['Northstar Example Ltd uses account ACCT-SYN-0042. Ada Example requested a Friday delivery.'],
      history: [{ role: 'user', text: 'Keep Ada Example and account ACCT-SYN-0042 together.' }],
      tools: [{ name: 'lookup_delivery', args: { account: 'ACCT-SYN-0042', contact: 'Ada Example', tags: ['Northstar Example Ltd'] } }],
    },
  };
  const transportVariant=structuredClone(input);
  transportVariant.commandId='synthetic-case-variant-demo';
  transportVariant.frames.query='Summarize the delivery for ada example at Northstar Example Ltd.';
  return [
    { id: 'declared-literals', title: 'Alias every declared surface', input },
    { id: 'reject-variant-transport', title: 'Reject a case variant before saving transport', input: transportVariant },
    { id: 'block-variant-leak', title: 'Block a child output with a declared-literal variant', input: { ...structuredClone(input), commandId: 'synthetic-variant-output-demo', profile: 'variant-leak' } },
    { id: 'block-literal-leak', title: 'Block a fixture that emits a declared literal', input: { ...structuredClone(input), commandId: 'synthetic-leak-demo', profile: 'leak' } },
    { id: 'block-foreign-alias', title: 'Block an unknown alias from the fixture', input: { ...structuredClone(input), commandId: 'synthetic-foreign-demo', profile: 'foreign-alias' } },
  ];
}
