from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1] / "15 E-Commerce"


def load_module(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
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


if __name__ == "__main__":
    unittest.main()
