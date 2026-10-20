"""Adverse support-QA inputs must never acquire automated answer authority."""

import importlib.util
import sys
import unittest
from pathlib import Path

MODULE = (
    Path(__file__).resolve().parents[1]
    / "17 Customer Support/CS-01 Support Quality and Knowledge Feedback Loop/build/quality_evaluator.py"
)
SPEC = importlib.util.spec_from_file_location("support_qa_guards", MODULE)
qa = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = qa
SPEC.loader.exec_module(qa)
POLICY = "Refunds are available within 30 days of delivery."


def evaluate(answer=POLICY, confidence=0.9, knowledge=POLICY):
    return qa.evaluate(qa.Evaluation("ticket-1", answer, knowledge, confidence))


class SupportQaGuardsTests(unittest.TestCase):
    def test_invalid_confidence_is_held_for_human_review(self):
        for confidence in (float("nan"), float("inf"), float("-inf"), -1, 1.1, True, None, "0.9"):
            with self.subTest(confidence=confidence):
                result = evaluate(confidence=confidence)
                self.assertEqual(result["decision"]["action"], "human_qa")
                self.assertIn("invalid_evaluator_confidence", result["decision"]["reasons"])

    def test_confidence_boundary_is_preserved(self):
        self.assertEqual(evaluate(confidence=0.749999)["decision"]["action"], "human_qa")
        self.assertEqual(evaluate(confidence=0.75)["decision"]["action"], "pass")

    def test_changed_numbers_and_units_are_held_despite_high_word_overlap(self):
        for answer in (
            "Refunds are available within 300 days of delivery.",
            "Refunds are available within 30 months of delivery.",
        ):
            with self.subTest(answer=answer):
                result = evaluate(answer)
                self.assertEqual(result["decision"]["action"], "human_qa")
                self.assertIn("unsupported_numeric_claim", result["decision"]["reasons"])

    def test_changed_negation_requires_review(self):
        result = evaluate("Refunds are not available within 30 days of delivery.")
        self.assertEqual(result["decision"]["action"], "human_qa")
        self.assertIn("negation_requires_review", result["decision"]["reasons"])

    def test_redaction_markers_alone_do_not_count_as_supporting_claims(self):
        result = evaluate("first@example.com", knowledge="second@example.com")
        self.assertEqual(result["grounding_overlap"], 0)
        self.assertEqual(result["decision"]["action"], "human_qa")
        private = evaluate("Email me at first@example.com or call +1 415 555 0101. " + POLICY)
        self.assertNotIn("first@example.com", private["redacted_answer"])
        self.assertNotIn("415 555 0101", private["redacted_answer"])

    def test_missing_or_unrelated_knowledge_cannot_pass(self):
        for knowledge in ("", "Shipping uses tracked international carriers."):
            self.assertEqual(evaluate(knowledge=knowledge)["decision"]["action"], "human_qa")

    def test_lexical_pass_is_not_semantic_verification_or_send_authority(self):
        result = evaluate()
        self.assertEqual(result["decision"]["action"], "pass")
        self.assertEqual(result["grounding_method"], "lexical_screen_only")
        self.assertTrue(result["decision"]["requires_semantic_review"])
        self.assertFalse(result["decision"]["automatic_answer_send_allowed"])
        self.assertFalse(result["decision"]["automatic_penalty_allowed"])


if __name__ == "__main__":
    unittest.main()
