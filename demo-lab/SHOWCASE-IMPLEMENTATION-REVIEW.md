# Interactive engineering showcase review

Reviewed locally on 2026-09-13. This implements the first hands-on improvements from ENGINEER-INSPIRATION-AGENT-REVIEW.md. It does not claim all research recommendations are complete.

## What changed

- ClaimProof: four selectable situations isolate exact approved excerpts, altered quantities, unapproved sources and tenant mismatch.
- Action Ledger: five situations distinguish successful replay, confirmed pre-write failure, uncertain committed write, conflicting payload and missing approval.
- ClaimProof, Action Ledger and ShelfSense: input → check → result cards use the current evaluator output. Action Ledger shows sequential simulator totals. ShelfSense shows the released catalog or an explicit hold.
- All nine engineering projects: expandable design decisions, limitations, production requirements and reproduction commands beside the source link.
- Repair Studio: a short explanation connects the duplicate-event acceptance case (20 units, repeated quantity 3, expected 17) with the candidate's per-call identity map. Recorded evidence remains explicitly separate from live browser evaluation.
- Responsive trace cards stack at narrow widths. The experiment panel follows content height.

## Suggested screen-share sequence

1. Open `/engineering#ENG-02`. Select lost acknowledgement and run. Explain that the simulator wrote 12 units, but the controller holds the repeat because it cannot trust the missing response. Switch to successful replay and show the duplicate being skipped.
2. Open ShelfSense. Run the bundled input: the proposed 24 contradicts `Pack: 12`. Correct the value to 12, approve it, and run again. Inspect the resulting catalog. Explain that supplied structured text and review controls are implemented; OCR is not.
3. Open Repair Studio. Expand the engineering explanation, run the evidence view and inspect candidate source and actual test logs. Run `node demo-lab/verify-repair.mjs` from the Portfolio folder when presenting a fresh test execution, then reload the browser.

## Verification

- `node demo-lab/review-portfolio.mjs`: repair evidence, regression suite (72 tests), and local API benchmark passed.
- `node demo-lab/governance.mjs`: 43 implementation checks, 72 regression checks and 9 presentation checks passed against an unchanged source snapshot. Decision: `approved-local-checks`.
- Actual browser checks: uncertain/reconcile outcome, successful duplicate suppression, scenario changes clearing results and disabling export, ShelfSense hold and reviewed release.
- Visual checks: desktop three-column traces and 390-pixel viewport stacked traces; no horizontal page overflow at the tested narrow width. Temporary viewport override restored.
- Existing n8n evidence was not rerun in this cycle; its separate timestamp remains visible.

## Remaining research directions

ECOM-01's additional record-level treatment, the dedicated evidence-history engineering article, and a collection-wide lifecycle review remain separate work. The new explanations are deterministic rule traces, not hidden model reasoning. No remote model adapters, OCR, hosted GHL acceptance or production deployments were added.

Independent AI closing review approved the local changes with no blocking correctness findings and independently passed the three scenario tests. Two minor clarity findings were fixed: rejected claims now display their cited quote, and the scenario placeholder is disabled so Reset remains the explicit way to restore the bundled input. This review does not establish production readiness.
