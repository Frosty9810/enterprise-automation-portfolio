import { DatabaseSync } from 'node:sqlite';
import { evaluateCitationCases } from './atlasgraph-citation-cases.mjs';

const db = new DatabaseSync(':memory:');
try {
  const report = evaluateCitationCases(db);
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
} finally {
  db.close();
}
