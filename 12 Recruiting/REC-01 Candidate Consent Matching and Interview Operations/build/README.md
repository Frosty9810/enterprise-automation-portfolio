# REC-01 build

- `candidate_matcher.py` gates processing on consent and returns explainable skill evidence without protected attributes.
- `n8n-workflow.json` validates consent, calls matching logic, stores evidence, and creates recruiter review.
- `schema.sql` stores consent versions, redacted features, match decisions, and interview transitions.

Run `python candidate_matcher.py`. The fixture is synthetic and no personal data is included.
