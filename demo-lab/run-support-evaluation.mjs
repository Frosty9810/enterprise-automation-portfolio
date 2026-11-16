import { compareSupportPolicies, evaluateSupportSuite } from './support-evaluation.mjs';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(JSON.stringify(evaluateSupportSuite(), null, 2));
} else if (args.length === 1 && args[0] === '--compare') {
  console.log(JSON.stringify(compareSupportPolicies(), null, 2));
} else {
  console.error('Usage: node demo-lab/run-support-evaluation.mjs [--compare]');
  process.exitCode = 1;
}
