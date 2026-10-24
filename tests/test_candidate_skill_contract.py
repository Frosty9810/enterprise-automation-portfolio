"""Skills coverage must be consent-gated and invariant to duplicate criteria."""

import unittest
from datetime import UTC, date, datetime

from test_ecommerce_suite import PORTFOLIO_ROOT, load_module

matcher = load_module(
    "candidate_skill_contract",
    "12 Recruiting/REC-01 Candidate Consent Matching and Interview Operations/build/candidate_matcher.py",
    PORTFOLIO_ROOT,
)
TODAY = date(2026, 10, 21)


def candidate(skills=("Python",), consent=TODAY):
    return matcher.Candidate("candidate-1", skills, consent)


class CandidateSkillContractTests(unittest.TestCase):
    def test_duplicate_criteria_cannot_inflate_score(self):
        clean = matcher.match(candidate(), matcher.Job("job-1", ("Python", "SQL"), ()), TODAY)
        repeated = matcher.match(
            candidate(), matcher.Job("job-1", ("Python", "Python", "PYTHON", "SQL"), ()), TODAY
        )
        self.assertEqual(clean["score"], 50)
        self.assertEqual(repeated["score"], clean["score"])
        self.assertEqual(repeated["evidence"]["matched_required"], ["Python"])
        self.assertEqual(repeated["evidence"]["missing_required"], ["SQL"])

    def test_whitespace_and_case_are_normalized_with_first_label_preserved(self):
        result = matcher.match(
            candidate(("  python\t", "SQL", "sql")),
            matcher.Job("job-1", (" PYTHON  ", " SQL "), ()),
            TODAY,
        )
        self.assertEqual(result["score"], 100)
        self.assertEqual(result["evidence"]["matched_required"], ["PYTHON", "SQL"])

    def test_required_criteria_cannot_be_counted_again_as_preferred(self):
        result = matcher.match(
            candidate(), matcher.Job("job-1", ("Python", "SQL"), ("python", "n8n", "N8N")), TODAY
        )
        self.assertEqual(result["score"], 40)
        self.assertEqual(result["evidence"]["matched_preferred"], [])

    def test_distinct_skill_names_are_not_fuzzy_matched(self):
        result = matcher.match(candidate(("C",)), matcher.Job("job-1", ("C++",), ("C#",)), TODAY)
        self.assertEqual(result["score"], 0)
        self.assertEqual(result["evidence"]["missing_required"], ["C++"])

    def test_no_criteria_means_no_score_rather_than_zero_coverage(self):
        result = matcher.match(candidate(), matcher.Job("job-1", ("  ",), ()), TODAY)
        self.assertIsNone(result["score"])
        self.assertIn("no_evaluable_skill_criteria", result["reasons"])

    def test_malformed_skills_are_rejected_instead_of_coerced(self):
        for skills in ("Python", {"Python": True}, ("Python", True), ("Python", None)):
            with self.subTest(skills=skills), self.assertRaises(ValueError):
                matcher.match(candidate(skills), matcher.Job("job-1", ("Python",), ()), TODAY)

    def test_consent_blocks_before_skill_access_and_expiry_is_inclusive(self):
        for consent in (None, date(2026, 10, 20), "2026-12-01", datetime(2026, 12, 1, tzinfo=UTC)):
            with self.subTest(consent=consent):
                result = matcher.match(
                    candidate(object(), consent), matcher.Job("job-1", ("Python",), ()), TODAY
                )
                self.assertEqual(result["status"], "blocked")
                self.assertNotIn("score", result)
                self.assertFalse(result["automatic_rejection_allowed"])
        self.assertEqual(
            matcher.match(candidate(), matcher.Job("job-1", ("Python",), ()), TODAY)["status"],
            "recruiter_review",
        )

    def test_all_results_are_advisory_and_invalid_evaluation_dates_are_rejected(self):
        for person in (candidate(), candidate(consent=None)):
            result = matcher.match(person, matcher.Job("job-1", ("Python",), ()), TODAY)
            self.assertFalse(result["automatic_rejection_allowed"])
            self.assertFalse(result["automatic_selection_allowed"])
        for today in (False, "2026-10-21", datetime(2026, 10, 21, tzinfo=UTC)):
            with self.subTest(today=today), self.assertRaises(ValueError):
                matcher.match(candidate(), matcher.Job("job-1", ("Python",), ()), today)


if __name__ == "__main__":
    unittest.main()
