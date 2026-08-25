# Internal Standards

> Status: **Populated**

## Purpose

The style guide and quality bar for every document in this repository. Any contributor (or future session) populating a new section should conform to this standard so the portfolio reads as one coherent body of work rather than a patchwork of styles.

## 1. Tone

- Written for CTOs, CIOs, VPs of Operations, and Enterprise Architects — never a beginner tutorial register.
- No hedging language ("might," "could potentially") in architecture decisions — state the decision and the tradeoff.
- No marketing superlatives ("revolutionary," "game-changing"). Let the specificity of the technical detail carry the credibility.

## 2. Confidentiality & Anonymization

- All client names are fictionalized (e.g., "Meridian Properties," "Atlas SaaS Corp"). Maintain a consistent fictional client roster across documents — do not invent a new company per document.
- Fictionalized clients and their industry/scale should stay internally consistent if referenced across multiple SOPs or case studies.
- No real API keys, tokens, or credentials — ever, even as "obviously fake" examples that resemble real formats too closely. Use clearly placeholder values (`sk-xxxxxxxxxxxxx`, `[REDACTED]`).

## 3. Document Structure

- Every folder contains a `README.md` stating purpose and status (`Pending population` or `Populated`).
- Every SOP follows the 44-section structure in [`41 Templates/sop-master-template.md`](../41%20Templates/sop-master-template.md) — no exceptions, no omitted sections (use an N/A justification instead).
- Headings use sentence case, not Title Case (e.g., "Error handling," not "Error Handling") — exception: the top-level document title and template section names, which follow the numbered template exactly as defined.
- Every document ends with a horizontal rule and a one-line "Part of the Enterprise Automation Portfolio" footer linking back to the relevant parent README.

## 4. Diagrams

- All diagrams are Mermaid, embedded directly in Markdown — not external image files — so they render in any Markdown viewer and stay diffable in version control.
- Flowcharts (`flowchart TD` or `LR`) for process/decision logic.
- Sequence diagrams (`sequenceDiagram`) for cross-system message flow.
- ER diagrams (`erDiagram`) for data models.
- State diagrams (`stateDiagram-v2`) for entities with lifecycle status (leads, tickets, opportunities).

## 5. Code & Payload Examples

- JSON examples must be valid, parseable JSON — validate before committing.
- Python examples: PEP 8, type hints, docstrings.
- JavaScript/Node examples: modern ES syntax, async/await over callback chains.
- Every payload example should be realistic in shape and field-naming for the platform it represents (e.g., a GoHighLevel contact payload should use GHL's actual field names).

## 6. Cross-Referencing

- Link liberally using relative Markdown links, not bare folder names.
- Every SOP's "Related SOPs" section (Section 44) must contain at least one working link.
- When a section references a shared framework (methodology, ROI formula, security model), link to the canonical doc rather than restating it.

## 7. Versioning

- Every SOP has a Version History table (Section 32). Increment the version and add a row on any material change; do not silently edit a "final" SOP.

## 8. Video Walkthroughs

Every SOP, workflow doc, and case study in this portfolio must link a recorded video walkthrough of the live automation. This is a portfolio-differentiating requirement, not an optional nice-to-have — a reviewer (hiring manager, prospective client) should be able to watch the system work, not just read about it.

**Placement:** immediately below the metadata block, before the Table of Contents, as its own bolded field: `**Video Walkthrough:** [▶ Watch the video walkthrough](URL) — *duration*`.

**Recording standard:**
- Screen recording of the live automation firing end-to-end (trigger → processing → destination system update), narrated.
- Target length: 3–8 minutes for a single-workflow SOP; up to 15 minutes for a multi-phase enterprise architecture (see [`portfolio-assets` walkthrough scripts](../41%20Templates/README.md) once authored).
- Hosted on an unlisted YouTube link or Loom, embedded via Markdown link (thumbnails are not supported in plain Markdown, so the link text itself should be descriptive, e.g., `▶ Watch: Lead-to-Close automation firing on a live test lead`).

**Fallback when no video exists yet:** the field must still be present, reading exactly:
`**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._`
Do not delete the line and do not leave it silently blank — the presence of the field (populated or pending) is itself tracked in [`32 SOP Library/video-index.md`](../32%20SOP%20Library/video-index.md).

**Tracking:** every video (recorded or pending) is logged as a row in the master [`video-index.md`](../32%20SOP%20Library/video-index.md) so the state of the entire portfolio's video coverage is visible from one file.

## 9. Real Build Artifacts (supersedes pure-narrative framing)

As of 2026-06-30, every project SOP must be backed by a **real, working build** — not just a narrative document. This is a portfolio-credibility requirement: a reviewer should be able to actually import, run, or execute part of the system, not just read a description of it.

**What "real" means here specifically:** the artifact itself must be structurally valid and functional — a real n8n workflow that imports without error, a real script that runs and produces output, real SQL that executes against a live Postgres instance — even though it is not tied to a specific named real paying client (see Section 2, Confidentiality & Anonymization, on why client identity stays illustrative).

**Required contents of every project's `build/` subfolder:**

| File | Requirement |
|---|---|
| `n8n-workflow.json` | A valid, importable n8n workflow export — real node types (e.g. `n8n-nodes-base.webhook`, `n8n-nodes-base.httpRequest`, `n8n-nodes-base.if`, `n8n-nodes-base.code`, `n8n-nodes-base.postgres`), real `parameters` per node, a valid `connections` graph. Credential fields reference standard n8n credential types and are left for the operator to fill in with their own keys — this is normal for any shareable n8n template. |
| One runnable script (`.py` or `.js`, matching the project's core logic) | Real imports, real function bodies, no pseudo-code. Must include a self-contained test/demo path (sample data, `--dry-run`, or `if __name__ == "__main__"` block) so it can be verified to run without requiring live third-party credentials. |
| `schema.sql` | Real, valid PostgreSQL DDL matching the ER diagram in the SOP — must execute cleanly against a fresh database. |
| `README.md` | Explains what each file is, exact deployment steps, and which environment variables/credentials a real deployment would need. |

**Header field:** every SOP links to its build folder via `**Real Build Artifacts:** [... →](build/README.md)` directly under the Video Walkthrough field.

**Verification obligation:** before a project is marked complete, the JSON must be parsed to confirm validity, the SQL must be checked for balanced/valid statement syntax, and the script must actually be executed at least once (its self-test path) to confirm it runs.

## 10. Build Status Tracking

- The root [`MASTER-INDEX.md`](../MASTER-INDEX.md) is the single source of truth for what's populated vs. pending. Update it whenever a folder's status changes from Pending to Populated.

---
*Part of the Enterprise Automation Portfolio. See root [README.md](../README.md) for navigation.*
