# Routing lab source eligibility

F04 evaluates supplied synthetic proposals. Retrieval and verification use the
same eligible source set in both the cheap and escalation stages:

- The document belongs to the case's supplied tenant.
- `approved` is the boolean `true`.
- `instructionLike` is absent or the boolean `false`.

An explicit `instructionLike` value must be boolean. Documents marked `true`
cannot support an answer, affect relevance ranking, or become eligible because
an expected fixture label cites them. Each trial reports excluded document IDs
and a reason; tenant mismatch takes precedence over approval and instruction
flags. The UI displays those exclusions alongside the route and fixture result.

Rejected proposals still consume their supplied scenario units. If the remaining
budget cannot cover escalation, the route stops with no selected answer. If
neither proposal verifies, no answer is selected. Expected labels grade the
result after routing; they never authorize a source.

The marker is caller supplied. An absent marker preserves compatibility with
older fixtures and does not prove a document is safe. This guard is not an
automatic instruction detector, authenticated tenant boundary, model evaluation,
or general semantic grounding guarantee. There is no paid inference or external
action. Export still requires acknowledgement of local analysis.

Run the implementation and DOM regressions from the repository root:

```sh
node --test demo-lab/flagship-decisions.test.mjs demo-lab/flagships-ui.test.mjs
```

The cases cover both proposal stages, a higher-ranked flagged source, tenant and
approval exclusions, malformed and absent markers, label independence, unchanged
input, budget exhaustion and the original fixture's routes and cost accounting.
