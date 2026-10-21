"""Malformed inventory cannot become a correction proposal or alias another key."""

import json
import unittest
from dataclasses import asdict, replace

from test_ecommerce_suite import PORTFOLIO_ROOT, load_module

inventory = load_module(
    "inventory_input_contract",
    "15 E-Commerce/ECOM-03 Catalog Inventory Reconciliation/build/reconciliation_engine.py",
    PORTFOLIO_ROOT,
)
BASE = inventory.InventoryRecord("SKU-1", "EU", 5, 12, 3, 2, "w1", "e1", 2)


class InventoryInputContractTests(unittest.TestCase):
    def test_quantities_are_nonnegative_postgres_integers_before_derivation(self):
        for field in ("shopify_available", "warehouse_on_hand", "erp_reserved", "safety_buffer"):
            for value in (True, -1, 1.5, float("nan"), float("inf"), "12", None, 2**31):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    inventory.reconcile(replace(BASE, **{field: value}))

    def test_age_requires_nonnegative_integer_minutes(self):
        for age in (-1, True, 0.5, float("nan"), float("inf"), "2", None):
            with self.subTest(age=age), self.assertRaises(ValueError):
                inventory.reconcile(replace(BASE, age_minutes=age))

    def test_mapping_requires_an_actual_boolean(self):
        for mapped in ("false", "true", 1, 0, None):
            with self.subTest(mapped=mapped), self.assertRaises(ValueError):
                inventory.reconcile(replace(BASE, mapped=mapped))
        self.assertEqual(
            inventory.reconcile(replace(BASE, mapped=False))["decision"]["reasons"],
            ["missing_sku_mapping"],
        )

    def test_source_identity_and_versions_must_be_nonblank_strings(self):
        for field in ("sku", "location", "warehouse_version", "erp_version"):
            for value in ("", " \t", None, True, 1):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    inventory.reconcile(replace(BASE, **{field: value}))

    def test_delimiters_in_identifiers_cannot_alias_correction_keys(self):
        first = inventory.reconcile(replace(BASE, sku="A:B", location="C"))
        second = inventory.reconcile(replace(BASE, sku="A", location="B:C"))
        self.assertNotEqual(first["correction_key"], second["correction_key"])

    def test_safety_boundaries_and_negative_sellable_stay_quarantined(self):
        cases = (
            ({"age_minutes": 30}, "safe_correction"),
            ({"age_minutes": 31}, "quarantine"),
            ({"shopify_available": 107}, "safe_correction"),
            ({"shopify_available": 108}, "quarantine"),
            ({"shopify_available": 7}, "aligned"),
            ({"warehouse_on_hand": 0}, "quarantine"),
        )
        for changes, action in cases:
            with self.subTest(changes=changes):
                result = inventory.reconcile(replace(BASE, **changes))
                self.assertEqual(result["decision"]["action"], action)
                self.assertFalse(result["automatic_write_allowed"])
                json.dumps(result, allow_nan=False)

    def test_action_identity_is_stable_versioned_and_preserves_input(self):
        before = asdict(BASE)
        result = inventory.reconcile(BASE)
        key = result["correction_key"]
        self.assertTrue(key.startswith("inventory-v2-"))
        self.assertEqual(key, inventory.reconcile(BASE)["correction_key"])
        # Same authoritative target, even when Shopify observation changes.
        self.assertEqual(
            key, inventory.reconcile(replace(BASE, shopify_available=6))["correction_key"]
        )
        self.assertNotEqual(
            key, inventory.reconcile(replace(BASE, warehouse_version="w2"))["correction_key"]
        )
        self.assertEqual(asdict(BASE), before)

    def test_unrepresentable_derived_quantity_cannot_reach_sql(self):
        with self.assertRaises(ValueError):
            inventory.reconcile(
                replace(BASE, warehouse_on_hand=0, erp_reserved=2**31 - 1, safety_buffer=2**31 - 1)
            )
        maximum = replace(
            BASE,
            shopify_available=2**31 - 1,
            warehouse_on_hand=2**31 - 1,
            erp_reserved=0,
            safety_buffer=0,
        )
        self.assertEqual(inventory.reconcile(maximum)["decision"]["action"], "aligned")


if __name__ == "__main__":
    unittest.main()
