import { runSalesforceFaultDrill } from './salesforce-fault-drill.mjs';

try {
  console.log(JSON.stringify(runSalesforceFaultDrill(), null, 2));
} catch {
  console.error('Salesforce local fault acceptance failed. Run the focused test for details.');
  process.exitCode = 1;
}
