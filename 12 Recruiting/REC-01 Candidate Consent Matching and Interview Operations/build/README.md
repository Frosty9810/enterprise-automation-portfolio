# REC-01 build

- `candidate_matcher.py` gates processing on consent and returns explainable skill evidence without protected attributes.
- `n8n-workflow.json` validates consent, calls matching logic, stores evidence, and creates recruiter review.
- `schema.sql` stores consent versions, redacted features, match decisions, and interview transitions.

Run `python candidate_matcher.py`. The fixture is synthetic and no personal data is included.

## Declared-skill coverage contract

Consent is checked before reading skills. Expiry is an inclusive calendar date; a missing, expired or malformed consent date blocks scoring. The supplied evaluation date must be a date rather than a datetime or coercible string; the default is the current UTC date. This reference has no consent revocation/scope ledger and does not establish legal consent or permission for a real candidate.

The matcher accepts lists/tuples of string labels, collapses whitespace and casefolds exact names. Blank labels are ignored, duplicates count once and a required label cannot also contribute preferred weight. Evidence preserves the first normalized display label in authored order. It does not infer synonyms, qualifications or fuzzy equivalence; C, C++ and C# remain distinct.

`score_method: normalized_exact_skill_overlap_v2` measures only coverage of the supplied unique tags, with required weight 2 and preferred weight 1. An empty criterion set returns a null score with `no_evaluable_skill_criteria`; it does not imply zero ability. Malformed label collections raise ValueError rather than being silently coerced. Consumers must accept the nullable score and revised duplicate-weighting behavior.

Every result denies automatic selection and rejection. All unblocked results require recruiter review; no protected attributes, real candidate records or employment decisions are involved. Run `python -m unittest discover -s tests -p test_candidate_skill_contract.py -v` from the repository root. The n8n export and any real consent/matching adapters require separate acceptance.
