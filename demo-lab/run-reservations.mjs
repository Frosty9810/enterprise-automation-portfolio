import { reservationExercise } from './reservation-ledger.mjs';
const result = reservationExercise();
const passed = JSON.stringify(result.steps.map(row => row.newLocalEffects)) === '[1,0,0,1,1]' && result.activeReservations === 1 && result.auditEvents === 4 && result.externalActions === 0;
console.log(JSON.stringify({ passed, ...result }, null, 2));
if (!passed) process.exitCode = 1;
