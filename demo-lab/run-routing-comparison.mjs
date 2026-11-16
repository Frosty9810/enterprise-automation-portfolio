import { compareRoutingPolicies } from './routing-policy-comparison.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !/^[0-9]{1,10}$/.test(args[0]))) {
  console.error('Usage: node demo-lab/run-routing-comparison.mjs [budget-units]');
  process.exitCode = 1;
} else {
  try {
    const budgetUnits = args[0] === undefined ? undefined : Number(args[0]);
    console.log(JSON.stringify(compareRoutingPolicies({ budgetUnits }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
