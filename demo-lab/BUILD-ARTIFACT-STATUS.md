# Bounded build artifact status

Status: **Populated — ten local artifact sets; PostgreSQL and hosted acceptance remain pending.**

The ten projects below now have a `build/` folder containing a runnable `demo.js`, an exact copy of their canonical local `n8n-workflow.json`, a project-specific proposed PostgreSQL `schema.sql` and an operating `README.md`. Each project also has a 44-section SOP and a recording script. These artifacts close the missing-file gap, not the full production integration gap.

| Project | Business scope | Script assertion cases | Video |
|---|---|---:|---|
| [PM-01](project-builds/PM-01/README.md) | Property maintenance triage and access review | 4 | Pending recording |
| [EA-01](project-builds/EA-01/README.md) | Authorized commitments and owner review | 4 | Pending recording |
| [CON-01](project-builds/CON-01/README.md) | Independent current change approvals | 6 | Pending recording |
| [MED-01](project-builds/MED-01/README.md) | Fictional referral document checklist | 6 | Pending recording |
| [LEGAL-01](project-builds/LEGAL-01/README.md) | Entity match and attorney clearance routing | 6 | Pending recording |
| [INS-01](project-builds/INS-01/README.md) | Claims intake evidence and date review | 6 | Pending recording |
| [INV-01](project-builds/INV-01/README.md) | Pack-aware reorder proposal | 5 | Pending recording |
| [CRM-01](project-builds/CRM-01/README.md) | Consent and version-aware account proposal | 5 | Pending recording |
| [AGT-01](project-builds/AGT-01/README.md) | Tool allowlist and cost/grounding gate | 5 | Pending recording |
| [OPS-01](project-builds/OPS-01/README.md) | Retry planning and uncertain-write reconciliation | 5 | Pending recording |

## Verification boundaries

Run `node demo-lab/project-builds/verify.mjs` from the repository root. The checker executes all ten scripts (52 assertion cases), compares all ten workflow exports byte-for-byte with canonical local workflows, checks graph references, checks SQL parentheses/quotes and statement structure, verifies all 440 required SOP sections and checks local Markdown links. The machine-readable result is [verification.json](project-builds/verification.json).

The SQL checks are structural only. Neither `psql` on PATH nor a standard `C:/Program Files/PostgreSQL` installation was found during this task. No PostgreSQL service was installed, no PostgreSQL execution is claimed and these schemas are not wired into the running SQLite lab. Each schema has one domain table and one decision-event table, with a foreign key, unique event key and source hash; SQL execution in a disposable PostgreSQL database remains required before describing persistence as verified.

The copied n8n artifacts retain the local API dependency. This check parses their graphs but does not newly execute n8n; existing runtime evidence remains separate. Hosted GHL acceptance, durable production event handling, provider authentication and recorded walkthroughs remain pending. The AGT-01 runner here covers its five original rule cases; additional engineering evaluations are a separate source artifact and must be reported separately.

## Maintenance

Regenerate copies after canonical workflows change with `node demo-lab/project-builds/generate.mjs`, then rerun verification. The source modules remain authoritative. Use the root [master index](../MASTER-INDEX.md) for repository-wide completion and the [video index](../32%20SOP%20Library/video-index.md) for recordings; do not treat pending links as videos.

---
*Part of the Enterprise Automation Portfolio. See [local lab](README.md).*
