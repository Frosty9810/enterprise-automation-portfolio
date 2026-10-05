import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { flagshipSuite } from './flagship-suite.mjs';
import { crossCheckFlagships } from './flagship-acceptance.mjs';
const db = new DatabaseSync(':memory:');
try {
    const report = await crossCheckFlagships(flagshipSuite(db));
    writeFileSync(new URL('../reports/twelve-project-acceptance.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
    console.log(`Twelve-project cross-check: ${report.passedProjects}/12 projects, ${report.passedChecks}/${report.totalChecks} checks; external actions 0.`);
    for (const r of report.results)
        if (!r.passed)
            console.log(JSON.stringify(r));
    if (!report.passed)
        process.exitCode = 1;
}
finally {
    db.close();
}
