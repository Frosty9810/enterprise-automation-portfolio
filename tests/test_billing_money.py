"""Exact decisions and accounting invariants for the billing reference module."""

import importlib.util
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path

MODULE = (
    Path(__file__).resolve().parents[1]
    / "14 SaaS/SAAS-04 Usage-Based Billing Reconciliation and RevRec Pipeline/build/reconciliation_engine.py"
)
SPEC = importlib.util.spec_from_file_location("billing_money", MODULE)
billing = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(billing)


def variance(metered=100000, invoiced=102999, amount="10.00"):
    return billing.calculate_variance(
        {"account_id": "a1", "metered_api_calls": metered},
        {"invoiced_overage_units": invoiced, "invoiced_overage_amount_usd": amount},
    )


def journal(**changes):
    args = dict(
        recognized_amount=Decimal("10.00"),
        deferred_amount=Decimal("10.00"),
        cost_center="104",
        subscription_batch_id="batch-1",
        period_end_date="2026-10-31",
    )
    return billing.build_journal_entry(**(args | changes))


class BillingMoneyTests(unittest.TestCase):
    def test_threshold_uses_unrounded_ratio(self):
        for units in (102999, 97001):
            result = variance(invoiced=units)
            self.assertEqual(result["status"], "auto_resolved")
            self.assertEqual(
                billing.classify_variance(Decimal(result["variance_pct"])), "auto_resolved"
            )
        for units in (103000, 97000, 103001, 96999):
            self.assertEqual(variance(invoiced=units)["status"], "pending_review")

    def test_impact_does_not_round_subcent_unit_price_before_multiplication(self):
        self.assertEqual(variance(100000, 200000, "1.00")["estimated_dollar_impact_usd"], "0.50")

    def test_unpriced_missing_units_are_not_reported_as_zero_loss(self):
        self.assertIsNone(variance(100, 0, "0.00")["estimated_dollar_impact_usd"])
        self.assertEqual(variance(0, 0, "10.00")["status"], "pending_review")

    def test_invalid_counts_and_money_are_rejected(self):
        for count in (-1, 1.5, True, "1.5", "NaN"):
            with self.subTest(count=count), self.assertRaises(ValueError):
                variance(metered=count)
        for amount in ("NaN", "Infinity", "-0.01", "0.001", True, 1.1):
            with self.subTest(amount=amount), self.assertRaises(ValueError):
                variance(amount=amount)

    def test_small_daily_allocations_never_create_negative_final_day(self):
        for cents in range(1, 100):
            seat = Decimal(cents) / 100
            rows = billing.generate_revrec_schedule(
                seat, seat, Decimal(0), date(2026, 10, 1), date(2026, 10, 31)
            )
            amounts = [Decimal(row["amount_usd"]) for row in rows]
            self.assertTrue(all(item >= 0 for item in amounts))
            self.assertEqual(sum(amounts), seat)

        rows = billing.generate_revrec_schedule(
            Decimal("0.02"), Decimal("0.02"), Decimal(0), date(2026, 10, 1), date(2026, 10, 4)
        )
        self.assertEqual(
            [Decimal(row["amount_usd"]) for row in rows],
            [Decimal("0.01"), Decimal("0.00"), Decimal("0.01"), Decimal("0.00")],
        )

    def test_usage_events_reconcile_to_the_confirmed_portion_and_period(self):
        base = (Decimal(10), Decimal(5), Decimal(5), date(2026, 10, 1), date(2026, 10, 31))
        for events in (
            [],
            [{"event_date": "2026-10-10", "amount_usd": "4.99"}],
            [{"event_date": "2026-11-01", "amount_usd": "5.00"}],
            [{"event_date": "not-a-date", "amount_usd": "5.00"}],
        ):
            with self.subTest(events=events), self.assertRaises(ValueError):
                billing.generate_revrec_schedule(*base, usage_events=events)
        rows = billing.generate_revrec_schedule(
            *base,
            usage_events=[
                {"event_date": "2026-10-10", "amount_usd": "2.00"},
                {"event_date": date(2026, 10, 31), "amount_usd": "3.00"},
            ],
        )
        self.assertEqual(sum(Decimal(row["amount_usd"]) for row in rows), Decimal("10.00"))

    def test_nonfinite_values_and_negative_schedules_are_rejected(self):
        for amount in (Decimal("NaN"), Decimal("Infinity"), Decimal(-1)):
            with self.subTest(amount=amount), self.assertRaises(ValueError):
                billing.generate_revrec_schedule(
                    Decimal(10), amount, Decimal(0), date(2026, 10, 1), date(2026, 10, 2)
                )
            if not amount.is_finite():
                with self.subTest(variance=amount), self.assertRaises(ValueError):
                    billing.classify_variance(amount)
        self.assertEqual(billing.classify_variance(Decimal(-1)), "needs_finance_review")

    def test_journal_rejects_component_total_disagreement(self):
        with self.assertRaises(ValueError):
            journal(
                recognized_amount=Decimal(11),
                seat_recognized_amount=Decimal(7),
                usage_recognized_amount=Decimal(3),
            )

    def test_journal_rejects_negative_nonfinite_and_unidentified_entries(self):
        for amount in (Decimal(-10), Decimal("NaN"), Decimal("Infinity"), Decimal(0)):
            with self.subTest(amount=amount), self.assertRaises(ValueError):
                journal(recognized_amount=amount, deferred_amount=amount)
        for changes in (
            {"subscription_batch_id": ""},
            {"subscription_batch_id": "SUB-BATCH-UNSPECIFIED"},
            {"period_end_date": ""},
            {"period_end_date": "2026-02-30"},
            {"cost_center": ""},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                journal(**changes)

    def test_journal_is_balanced_and_repeatable_with_explicit_identity(self):
        first = journal(
            seat_recognized_amount=Decimal("6.25"), usage_recognized_amount=Decimal("3.75")
        )
        self.assertEqual(
            first,
            journal(
                seat_recognized_amount=Decimal("6.25"), usage_recognized_amount=Decimal("3.75")
            ),
        )
        totals = {"Debit": Decimal(0), "Credit": Decimal(0)}
        for line in first["Line"]:
            totals[line["JournalEntryLineDetail"]["PostingType"]] += Decimal(str(line["Amount"]))
        self.assertEqual(totals, {"Debit": Decimal(10), "Credit": Decimal(10)})


if __name__ == "__main__":
    unittest.main()
