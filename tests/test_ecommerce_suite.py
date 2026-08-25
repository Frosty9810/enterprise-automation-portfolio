from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1] / "15 E-Commerce"
PORTFOLIO_ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str, root: Path = ROOT):
    spec = importlib.util.spec_from_file_location(name, root / relative_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {relative_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


localization = load_module(
    "localization_engine",
    "ECOM-01 Multi-Market Product Content Governance/build/localization_engine.py",
)
reviews = load_module(
    "review_router",
    "ECOM-02 Review Intelligence and Response Queue/build/review_router.py",
)
inventory = load_module(
    "reconciliation_engine",
    "ECOM-03 Catalog Inventory Reconciliation/build/reconciliation_engine.py",
)
support = load_module(
    "support_router",
    "ECOM-04 Support Routing and SLA Control/build/support_router.py",
)
ad_control = load_module("ad_control", "13 Marketing Agencies/MKT-01 Multi-Channel Ad Operations Control Plane/build/ad_control.py", PORTFOLIO_ROOT)
candidate_matcher = load_module("candidate_matcher", "12 Recruiting/REC-01 Candidate Consent Matching and Interview Operations/build/candidate_matcher.py", PORTFOLIO_ROOT)
invoice_matcher = load_module("invoice_matcher", "16 Accounting/ACC-01 Accounts Payable Match and Cash Control/build/invoice_matcher.py", PORTFOLIO_ROOT)
quality_evaluator = load_module("quality_evaluator", "17 Customer Support/CS-01 Support Quality and Knowledge Feedback Loop/build/quality_evaluator.py", PORTFOLIO_ROOT)


class EcommerceSuiteTests(unittest.TestCase):
    def test_localization_preserves_protected_facts(self):
        source = localization.Product(
            "p1", 1, "SKU-1", "en-US", "Frame", "21 x 29 cm; 24 months.",
            "oak", "21 x 29", 24,
        )
        safe = localization.Candidate(
            "es-ES", "Marco", "21 x 29 cm; 24 meses.", "oak", "21 x 29", 24,
        )
        changed = localization.Candidate(
            "es-ES", "Marco", "20 x 30 cm; 12 meses.", "veneer", "20 x 30", 12,
        )
        self.assertEqual(localization.evaluate(source, safe)["decision"]["action"], "auto_publish")
        self.assertEqual(localization.evaluate(source, changed)["decision"]["action"], "blocked")

    def test_review_safety_language_disables_auto_publish(self):
        decision = reviews.route(
            reviews.Review("r1", "SKU-2", 1, "The battery became hot and smoked.", True)
        )["decision"]
        self.assertEqual(decision["queue"], "safety_escalation")
        self.assertFalse(decision["auto_publish_allowed"])

    def test_reconciliation_corrects_only_safe_fresh_data(self):
        safe = inventory.InventoryRecord("SKU-3", "EU", 5, 12, 3, 2, "w1", "e1", 2)
        stale = inventory.InventoryRecord("SKU-3", "EU", 5, 12, 3, 2, "w1", "e1", 60)
        self.assertEqual(inventory.reconcile(safe)["decision"]["action"], "safe_correction")
        self.assertEqual(inventory.reconcile(stale)["decision"]["action"], "quarantine")

    def test_support_redacts_before_routing(self):
        ticket = support.Ticket(
            "evt-1", "US", "Cancel it; email jane@example.com or +1 415 555 0101", 60
        )
        result = support.route(ticket)
        self.assertNotIn("jane@example.com", result["model_safe_text"])
        self.assertNotIn("415 555 0101", result["model_safe_text"])
        self.assertEqual(result["decision"]["queue"], "order_changes")


class BusinessOperationsTests(unittest.TestCase):
    def test_ad_recommendation_requires_approval(self):
        snapshot = ad_control.Snapshot("meta", "c1", 100, 50, 1000, .5, 2.0, .95)
        decision = ad_control.analyze(snapshot)["decision"]
        self.assertEqual(decision["action"], "optimization_review")
        self.assertTrue(decision["requires_approval"])

    def test_candidate_matching_is_consent_gated(self):
        from datetime import date
        job = candidate_matcher.Job("j1", ("Python",), ("SQL",))
        candidate = candidate_matcher.Candidate("c1", ("Python",), None)
        self.assertEqual(candidate_matcher.match(candidate, job, date(2026, 8, 25))["status"], "blocked")

    def test_ap_duplicate_and_bank_change_are_blocked(self):
        invoice = invoice_matcher.Invoice("v1", "42", "EUR", 1, 100, 20, 120, True)
        evidence = invoice_matcher.PurchaseEvidence(1, 100, 1, 20)
        self.assertEqual(invoice_matcher.evaluate(invoice, evidence)["decision"]["action"], "blocked")

    def test_support_qa_redacts_and_escalates_low_grounding(self):
        item = quality_evaluator.Evaluation("t1", "Contact jane@example.com. We guarantee a free car.", "Refunds are available within 30 days.", .9)
        result = quality_evaluator.evaluate(item)
        self.assertNotIn("jane@example.com", result["redacted_answer"])
        self.assertEqual(result["decision"]["action"], "human_qa")


if __name__ == "__main__":
    unittest.main()
