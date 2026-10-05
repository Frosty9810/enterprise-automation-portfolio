"""Financial controls against independent malformed and changed invoice cases."""

import dataclasses
import importlib.util
import pathlib
import sys
import unittest

path = (
    pathlib.Path(__file__).resolve().parents[1]
    / "16 Accounting/ACC-01 Accounts Payable Match and Cash Control/build/invoice_matcher.py"
)
spec = importlib.util.spec_from_file_location("invoice_controls", path)
matcher = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = matcher
spec.loader.exec_module(matcher)


class InvoiceControls(unittest.TestCase):
    def setUp(self):
        self.invoice = matcher.Invoice("supplier-1", "invoice-1", "USD", 10, 20, 40, 240)
        self.purchase = matcher.PurchaseEvidence(10, 20, 10, 40)

    def test_matched_invoice_never_releases_payment(self):
        decision = matcher.evaluate(self.invoice, self.purchase)["decision"]
        self.assertEqual(decision["action"], "draft_payable")
        self.assertFalse(decision["payment_release_allowed"])

    def test_changed_amount_and_currency_cannot_evade_identity(self):
        known = {matcher.evaluate(self.invoice, self.purchase)["fingerprint"]}
        changed = dataclasses.replace(self.invoice, total=241, currency="EUR")
        decision = matcher.evaluate(changed, self.purchase, known)["decision"]
        self.assertEqual(decision["action"], "blocked")
        self.assertIn("duplicate_invoice", decision["reasons"])
        self.assertIn("invoice_math_mismatch", decision["reasons"])

    def test_received_goods_cannot_override_purchase_quantity(self):
        purchase = dataclasses.replace(self.purchase, po_quantity=9, received_quantity=12)
        decision = matcher.evaluate(self.invoice, purchase)["decision"]
        self.assertEqual(decision["action"], "exception_review")
        self.assertIn("quantity_exceeds_purchase_order", decision["reasons"])

    def test_nonfinite_negative_and_boolean_numbers_are_rejected(self):
        for value in (float("nan"), float("inf"), -1, True, "240"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                matcher.evaluate(dataclasses.replace(self.invoice, total=value), self.purchase)
        with self.assertRaises(ValueError):
            matcher.evaluate(self.invoice, dataclasses.replace(self.purchase, po_quantity=True))

    def test_cent_boundary_is_decimal_and_not_float_rounding(self):
        invoice = dataclasses.replace(self.invoice, quantity=1, unit_price=0.1, tax=0.2, total=0.31)
        purchase = matcher.PurchaseEvidence(1, 0.1, 1, 0.2)
        self.assertNotIn(
            "invoice_math_mismatch", matcher.evaluate(invoice, purchase)["decision"]["reasons"]
        )
        bad = dataclasses.replace(invoice, total=0.311)
        self.assertIn(
            "invoice_math_mismatch", matcher.evaluate(bad, purchase)["decision"]["reasons"]
        )

    def test_bank_change_is_strict_and_blocks(self):
        with self.assertRaises(ValueError):
            matcher.evaluate(
                dataclasses.replace(self.invoice, bank_details_changed="false"), self.purchase
            )
        decision = matcher.evaluate(
            dataclasses.replace(self.invoice, bank_details_changed=True), self.purchase
        )["decision"]
        self.assertEqual(decision["action"], "blocked")
