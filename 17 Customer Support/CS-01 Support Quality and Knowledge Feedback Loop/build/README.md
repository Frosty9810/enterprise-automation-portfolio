# CS-01 build

- `quality_evaluator.py` redacts identifiers and checks lexical evidence grounding plus evaluator confidence.
- `n8n-workflow.json` samples closed tickets, retrieves approved knowledge, evaluates, and creates QA/content tasks.
- `schema.sql` stores redacted samples, immutable evaluations, knowledge gaps, and review outcomes.

Run `python quality_evaluator.py`. The deterministic overlap check is a transparent reference baseline; production semantic evaluation must retain the same evidence and confidence gates.
