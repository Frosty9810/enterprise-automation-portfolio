import { isDeepStrictEqual } from 'node:util';
import { TrustGateError } from './trustgate-core.mjs';

const tenant = 'acme';
const commandPrefix = 'gtm-demo.';
export const isGtmCommand = commandId => typeof commandId === 'string' && commandId.startsWith(commandPrefix);
const runIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,35}$/u;
const scope = 'Synthetic buying signals and a local review task. The fixture planner is deterministic. Reviewer labels are local selectors.';

const scenarios = [
  {
    id: 'supplier-signal',
    fixtureId: 'reviewed-task',
    title: 'Supplier delivery update',
    description: 'A supplier update may warrant local account follow-up. The target comes from approved intent and the update can only inform an internal draft.',
  },
  {
    id: 'marked-instruction',
    fixtureId: 'blocked-injection',
    title: 'Supplier message marked as an instruction',
    description: 'An instruction-marked source tries to bypass review. TrustGate blocks the proposal before a reviewer can approve it.',
  },
];

function requireFields(input, fields) {
  if (!input || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Reflect.ownKeys(input).length !== fields.length ||
    fields.some(field => !Object.hasOwn(Object.getOwnPropertyDescriptor(input, field) ?? {}, 'value'))) {
    throw new TrustGateError('Expected exactly: ' + fields.join(', ') + '.');
  }
}

export function createGtmAgent(gateway) {
  const catalog = gateway.catalog();
  const cases = new Map(scenarios.map(({ fixtureId, ...scenario }) => {
    const { proposal } = catalog.scenarios.find(fixture => fixture.id === fixtureId);
    const binding = proposal.bindings.summary;
    const source = catalog.sources.find(item => item.id === binding.sourceId && item.tenant === tenant);
    return [scenario.id, {
      scenario: { ...scenario, sourceId: source.id, signal: source.values[binding.key] },
      proposal,
    }];
  }));

  function lookup(receiptId) {
    const receipt = gateway.receipt({ tenant, receiptId });
    const [prefix, scenarioId, runId, extra] = receipt.commandId.split('.');
    const entry = cases.get(scenarioId);
    if (prefix + '.' !== commandPrefix || extra !== undefined || !runIdPattern.test(runId ?? '') ||
      !entry || receipt.actor !== entry.proposal.actor || receipt.tool !== entry.proposal.tool ||
      !isDeepStrictEqual(receipt.bindings, entry.proposal.bindings)) {
      throw new TrustGateError('GTM receipt not found.', 'not_found');
    }
    return { entry, receipt };
  }

  function result(entry, receipt) {
    const verification = gateway.verifyAudit({ tenant });
    const events = gateway.audit({ tenant }).events
      .filter(event => event.receiptId === receipt.id)
      .map(({ seq, type, at, hash, previousHash }) => ({ seq, type, at, hash, previousHash }));
    return {
      scenario: { ...entry.scenario },
      receipt,
      audit: {
        valid: verification.valid,
        eventCount: events.length,
        effectCount: Number(Boolean(receipt.effect)),
        events,
      },
    };
  }

  return {
    catalog() {
      return { scenarios: [...cases.values()].map(entry => ({ ...entry.scenario })), scope };
    },
    plan(input) {
      requireFields(input, ['scenarioId', 'runId']);
      const entry = cases.get(input.scenarioId);
      if (!entry || typeof input.runId !== 'string' || !runIdPattern.test(input.runId)) {
        throw new TrustGateError('Choose a known scenario and a 1–36 character run ID.');
      }
      const commandId = commandPrefix + entry.scenario.id + '.' + input.runId;
      return result(entry, gateway.prepare({ ...entry.proposal, commandId }));
    },
    review(input) {
      requireFields(input, ['receiptId', 'expectedHash', 'decision']);
      const { entry } = lookup(input.receiptId);
      return result(entry, gateway.review({
        tenant,
        receiptId: input.receiptId,
        reviewer: 'acme-reviewer',
        expectedHash: input.expectedHash,
        decision: input.decision,
        note: 'Explicit local reviewer decision from the GTM demo.',
      }));
    },
    execute(input) {
      requireFields(input, ['receiptId']);
      const { entry } = lookup(input.receiptId);
      return result(entry, gateway.execute({ tenant, receiptId: input.receiptId }));
    },
    inspect(input) {
      requireFields(input, ['receiptId']);
      const { entry, receipt } = lookup(input.receiptId);
      return result(entry, receipt);
    },
  };
}
