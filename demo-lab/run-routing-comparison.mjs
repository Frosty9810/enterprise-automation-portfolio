import { compareRoutingPolicies, routingPolicyFrontier } from './routing-policy-comparison.mjs';

const args = process.argv.slice(2);
const frontier = args.length === 1 && args[0] === '--frontier';
if (!frontier && (args.length > 1 || (args.length === 1 && !/^[0-9]{1,10}$/.test(args[0])))) {
  console.error('Usage: node demo-lab/run-routing-comparison.mjs [budget-units | --frontier]');
  process.exitCode = 1;
} else {
  try {
    const result = frontier ? routingPolicyFrontier()
      : compareRoutingPolicies({ budgetUnits: args.length ? Number(args[0]) : undefined });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
