# CS-01 build

- `quality_evaluator.py` redacts identifiers and checks lexical evidence grounding plus evaluator confidence.
- `n8n-workflow.json` samples closed tickets, retrieves approved knowledge, evaluates, and creates QA/content tasks.
- `schema.sql` stores redacted samples, immutable evaluations, knowledge gaps, and review outcomes.

Run `python quality_evaluator.py`. The deterministic overlap check is a transparent reference baseline; production semantic evaluation must retain the same evidence and confidence gates.

## Screening contract

The `pass` action means **only that the lexical screen found no configured issue**. Every result labels `grounding_method: lexical_screen_only`, requires semantic review and denies automatic answer sending or penalties. Word overlap does not establish factual correctness, source freshness, complete citation support or authorization.

Confidence must be a finite integer/float in [0, 1], excluding booleans. Missing, malformed, out-of-range or nonfinite confidence produces `human_qa`; the existing 0.75 boundary applies only to valid confidence. Unsupported numeric/time-unit claims and differing common English negation markers also require review. These are conservative screens, not a semantic evaluator; equivalent wording can be held and contradictions can still evade the lexical checks.

Email, payment-number and phone-like sequences are redacted before screening. Redaction placeholders do not count as supporting words. This is limited pattern redaction, not a complete personal-data detector. Reasons contain policy labels rather than copied private text.

From the repository root, run `python -m unittest discover -s tests -p test_support_qa_guards.py -v`. The n8n export, database schema, live evaluator endpoint and provider acceptance remain separate integration work.
