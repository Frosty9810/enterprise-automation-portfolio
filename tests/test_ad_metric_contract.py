"""Invalid or changed ad evidence cannot look like a healthy repeated snapshot."""

import importlib.util
import json
import sys
import unittest
from dataclasses import replace
from pathlib import Path

MODULE = (
    Path(__file__).resolve().parents[1]
    / "13 Marketing Agencies/MKT-01 Multi-Channel Ad Operations Control Plane/build/ad_control.py"
)
SPEC = importlib.util.spec_from_file_location("ad_metric_contract", MODULE)
ad = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ad
SPEC.loader.exec_module(ad)
BASE = ad.Snapshot("meta", "campaign-1", 500, 1500, 1000, 0.5, 2.0, 0.95)


class AdMetricContractTests(unittest.TestCase):
    def test_invalid_values_are_held_before_arithmetic_and_remain_json_safe(self):
        for field in (
            "spend",
            "revenue",
            "budget",
            "elapsed_ratio",
            "baseline_roas",
            "attribution_completeness",
        ):
            for value in (float("nan"), float("inf"), float("-inf"), True, "12", None, -1):
                with self.subTest(field=field, value=value):
                    result = ad.analyze(replace(BASE, **{field: value}))
                    self.assertEqual(result["decision"]["action"], "data_quality_review")
                    self.assertIn(field, result["invalid_fields"])
                    self.assertIsNone(result["idempotency_key"])
                    json.dumps(result, allow_nan=False)

    def test_impossible_ratios_and_missing_pacing_denominators_are_held(self):
        for changes in (
            {"elapsed_ratio": 1.1},
            {"elapsed_ratio": 0},
            {"attribution_completeness": 1.1},
            {"budget": 0},
            {"platform": ""},
            {"campaign_id": None},
        ):
            with self.subTest(changes=changes):
                self.assertEqual(
                    ad.analyze(replace(BASE, **changes))["decision"]["action"],
                    "data_quality_review",
                )

    def test_derived_overflow_and_underflow_cannot_escape_as_infinity_or_crash(self):
        for changes in (
            {"spend": 1e308, "revenue": 1e308, "budget": 1e-300},
            {"budget": 1e-300, "elapsed_ratio": 1e-300},
        ):
            with self.subTest(changes=changes):
                result = ad.analyze(replace(BASE, **changes))
                self.assertEqual(result["decision"]["action"], "data_quality_review")
                json.dumps(result, allow_nan=False)

    def test_analysis_identity_covers_every_decision_relevant_field(self):
        first = ad.analyze(BASE)["idempotency_key"]
        for changes in (
            {"budget": 2000},
            {"elapsed_ratio": 0.6},
            {"baseline_roas": 3},
            {"attribution_completeness": 0.5},
            {"platform": "google"},
            {"campaign_id": "campaign-2"},
            {"spend": 501},
            {"revenue": 1501},
        ):
            with self.subTest(changes=changes):
                self.assertNotEqual(ad.analyze(replace(BASE, **changes))["idempotency_key"], first)
        self.assertEqual(ad.analyze(BASE)["idempotency_key"], first)

    def test_equivalent_integer_and_float_metrics_have_the_same_identity(self):
        self.assertEqual(
            ad.analyze(BASE)["idempotency_key"],
            ad.analyze(replace(BASE, spend=500.0, revenue=1500.0))["idempotency_key"],
        )

    def test_large_integral_floats_use_exact_integer_identity_without_display_collisions(self):
        exact = 2**60
        floating = float(exact)
        rounded_display = 1152921504606847000
        self.assertEqual(exact, floating)
        self.assertNotEqual(floating, rounded_display)
        self.assertEqual(
            ad.analyze(replace(BASE, spend=exact))["idempotency_key"],
            ad.analyze(replace(BASE, spend=floating))["idempotency_key"],
        )
        self.assertNotEqual(
            ad.analyze(replace(BASE, spend=floating))["idempotency_key"],
            ad.analyze(replace(BASE, spend=rounded_display))["idempotency_key"],
        )

    def test_positive_ratio_underflow_is_held_but_genuine_zero_is_valid(self):
        for changes in (
            {"spend": 1e308, "revenue": 1e-308, "budget": 1e308, "elapsed_ratio": 1},
            {"spend": 5e-324, "revenue": 0, "budget": 1e308, "elapsed_ratio": 1},
        ):
            with self.subTest(changes=changes):
                result = ad.analyze(replace(BASE, **changes))
                self.assertEqual(result["decision"]["action"], "data_quality_review")
                self.assertEqual(result["decision"]["reasons"], ["unrepresentable_derived_metric"])
                self.assertIsNone(result["idempotency_key"])
                self.assertEqual(result["metrics"], {"roas": None, "pacing": None})
                json.dumps(result, allow_nan=False)
        self.assertEqual(ad.analyze(replace(BASE, spend=0))["metrics"], {"roas": None, "pacing": 0})
        self.assertEqual(ad.analyze(replace(BASE, revenue=0))["metrics"]["roas"], 0)

    def test_reviews_require_authority_and_no_result_permits_budget_writes(self):
        for snapshot in (
            BASE,
            replace(BASE, attribution_completeness=0.5),
            replace(BASE, revenue=100),
            replace(BASE, spend=0),
        ):
            result = ad.analyze(snapshot)
            self.assertFalse(result["decision"]["automatic_budget_change_allowed"])
            self.assertEqual(
                result["decision"]["requires_approval"], result["decision"]["action"] != "monitor"
            )

    def test_original_valid_metrics_and_quality_precedence_are_preserved(self):
        result = ad.analyze(BASE)
        self.assertEqual(result["metrics"], {"roas": 3.0, "pacing": 1.0})
        self.assertEqual(result["decision"]["action"], "monitor")
        held = ad.analyze(replace(BASE, attribution_completeness=0.79, revenue=1))
        self.assertEqual(held["decision"]["action"], "data_quality_review")
        self.assertEqual(held["decision"]["reasons"], ["attribution_incomplete"])


if __name__ == "__main__":
    unittest.main()
