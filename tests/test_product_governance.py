"""Independent counterexamples for the product-content policy."""

import dataclasses
import unittest

from test_ecommerce_suite import localization


class ProductGovernanceTests(unittest.TestCase):
    def setUp(self):
        self.source = localization.Product(
            "product-1",
            7,
            "FRAME-1",
            "en-US",
            "Oak frame",
            "21 x 29 cm; 24 months.",
            "oak",
            "21 x 29",
            24,
        )
        self.candidate = localization.Candidate(
            "es-ES",
            "Marco",
            "21 x 29 cm; 24 meses.",
            "oak",
            "21 x 29",
            24,
        )

    def test_extra_numbers_do_not_pass_by_preserving_the_old_numbers(self):
        candidate = dataclasses.replace(
            self.candidate, description="21 x 29 cm; 24 meses. 999 clientes."
        )
        decision = localization.evaluate(self.source, candidate)["decision"]
        self.assertEqual(decision["action"], "blocked")
        self.assertIn("numeric_fact_introduced", decision["reasons"])

    def test_invalid_identity_revision_or_boolean_warranty_rejected(self):
        for source in (
            dataclasses.replace(self.source, revision=True),
            dataclasses.replace(self.source, revision=0),
            dataclasses.replace(self.source, product_id=" "),
        ):
            with self.assertRaises(ValueError):
                localization.evaluate(source, self.candidate)
        for candidate in (
            dataclasses.replace(self.candidate, warranty_months=True),
            dataclasses.replace(self.candidate, title=""),
            dataclasses.replace(self.candidate, locale="es"),
        ):
            with self.assertRaises(ValueError):
                localization.evaluate(self.source, candidate)

    def test_invented_numbers_in_titles_are_also_blocked(self):
        result = localization.evaluate(
            self.source, dataclasses.replace(self.candidate, title="999 ofertas")
        )
        self.assertIn("numeric_fact_introduced", result["decision"]["reasons"])

    def test_unknown_valid_locale_requires_human_review(self):
        result = localization.evaluate(
            self.source, dataclasses.replace(self.candidate, locale="pt-BR")
        )
        self.assertEqual(result["decision"]["action"], "human_review")
