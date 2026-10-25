# LEGAL-01 Matter Intake, Conflict Check and Supplied-Date Desk

Status: **Partial local implementation; the full legal-industry blueprint remains unfinished.**

The executable SQLite desk pins supplied fictional parties, exposes normalized exact/ambiguous relationships, preserves conflict holds and requires independent exact-fingerprint review before recording a local matter. A second reviewed step records a supplied fictional future date as a local calendar row. Neither action is professional conflicts clearance, permission to represent a real client, or legal advice. Supplied dates are source fixtures, not calculated jurisdiction/statutory deadlines.

From the repository root, run `node demo-lab/run-legal.mjs` or start `node demo-lab/server.mjs` and open `http://127.0.0.1:5680/industry/legal?project=LEGAL-01`. The unified portfolio inventory links this existing project to the desk. The fixed clock is `2026-10-25T12:00:00.000Z`; no live deadline monitor runs.

- [Executable desk, API contract, tests and limitations](../../LEGAL.md)
- [44-section operating procedure](SOP.md)
- [Build runbook and legacy compatibility artifacts](build/README.md)
- [Existing recording script](walkthrough-script.md): video recording remains pending; the older script does not prove execution of the new desk.

There are no actual client files, credentials, professional approvals, external notifications or provider integrations in this delivery. Authenticated intake/review, complete entity resolution, qualified jurisdiction rules, live matter/calendar adapters, acceptance evidence and a recorded walkthrough remain open. The older bounded rules/n8n example is retained separately and does not establish the new desk's integration acceptance.

*Part of the Enterprise Automation Portfolio. See the [project build index](../README.md).*
