"""Trial intent must use only valid in-window usage evidence."""

import unittest
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta, timezone

from test_ecommerce_suite import PORTFOLIO_ROOT, load_module

usage = load_module(
    "trial_usage_contract",
    "14 SaaS/SAAS-01 Trial-to-Paid Conversion and Usage Nurture Engine/build/usage_scoring.py",
    PORTFOLIO_ROOT,
)
START = date(2026, 10, 1)
DAY = date(2026, 10, 9)


def event(kind, timestamp, number="one", account="a"):
    return usage.UsageEvent(kind, account, "u", timestamp, number)


def snapshot(**changes):
    base = usage.UsageSnapshot("a", DAY, 9, 3, 2, 0, 0, datetime(2026, 10, 9, tzinfo=UTC))
    return replace(base, **changes)


class TrialUsageContractTests(unittest.TestCase):
    def test_pretrial_events_cannot_qualify_an_account(self):
        old = datetime(2026, 9, 30, 23, 59, 59, tzinfo=UTC)
        events = [event("integration_connected", old, str(i)) for i in range(3)]
        events += [event("seat_invited", old, str(i + 3)) for i in range(2)]
        result = usage.aggregate_daily_usage(events, "a", START, DAY)
        self.assertEqual(usage.compute_intent_score(result), 0)
        self.assertFalse(usage.is_high_intent(result))
        self.assertTrue(result.no_usage_data)

    def test_full_final_second_is_included_but_next_midnight_is_not(self):
        events = [
            event("seat_invited", datetime(2026, 10, 9, 23, 59, 59, 999999, tzinfo=UTC)),
            event("seat_invited", datetime(2026, 10, 10, tzinfo=UTC), "two"),
        ]
        result = usage.aggregate_daily_usage(events, "a", START, DAY)
        self.assertEqual(result.seats_invited, 1)
        self.assertEqual(result.last_event_at, events[0].timestamp)

    def test_timezone_offsets_are_compared_in_utc_at_both_boundaries(self):
        offset = timezone(timedelta(hours=-4))
        events = [
            event("seat_invited", datetime(2026, 9, 30, 20, tzinfo=offset)),
            event("seat_invited", datetime(2026, 10, 9, 20, tzinfo=offset), "two"),
        ]
        result = usage.aggregate_daily_usage(events, "a", START, DAY)
        self.assertEqual(result.seats_invited, 1)
        self.assertIs(result.last_event_at.tzinfo, UTC)
        self.assertEqual(result.last_event_at, datetime(2026, 10, 1, tzinfo=UTC))

    def test_invalid_or_reversed_calendar_dates_are_rejected(self):
        for start, as_of in (
            (START, date(2026, 9, 30)),
            (datetime(2026, 10, 1, tzinfo=UTC), DAY),
            (START, "2026-10-09"),
            (True, DAY),
        ):
            with self.subTest(start=start, as_of=as_of), self.assertRaises(ValueError):
                usage.aggregate_daily_usage([], "a", start, as_of)

    def test_malformed_relevant_timestamp_rejected_but_unrelated_events_ignored(self):
        with self.assertRaises(ValueError):
            usage.aggregate_daily_usage([event("seat_invited", "yesterday")], "a", START, DAY)
        result = usage.aggregate_daily_usage(
            [event("unknown", None), event("seat_invited", None, account="other")],
            "a",
            START,
            DAY,
        )
        self.assertTrue(result.no_usage_data)

    def test_invalid_counts_and_trial_days_never_reach_any_consumer(self):
        changes = [
            {field: value}
            for field in (
                "integrations_connected",
                "seats_invited",
                "workflows_created",
                "features_activated",
            )
            for value in (-1, True, 1.5, float("nan"), float("inf"), "3")
        ]
        changes += [{"trial_day": value} for value in (-1, 0, True, 1.5)]
        for change in changes:
            for consume in (
                usage.compute_intent_score,
                usage.is_high_intent,
                usage.classify_intent_tier,
                usage.build_checkpoint_milestones,
            ):
                with (
                    self.subTest(change=change, consume=consume.__name__),
                    self.assertRaises(ValueError),
                ):
                    consume(snapshot(**change))

    def test_missing_contradictory_or_out_of_window_evidence_is_rejected(self):
        for change in (
            {"last_event_at": None},
            {"no_usage_data": True},
            {"no_usage_data": "false"},
            {"last_event_at": "today"},
            {"score_date": "2026-10-09"},
            {"last_event_at": datetime(2026, 10, 10, tzinfo=UTC)},
            {"last_event_at": datetime(2026, 9, 30, tzinfo=UTC)},
        ):
            for consume in (
                usage.compute_intent_score,
                usage.is_high_intent,
                usage.build_checkpoint_milestones,
            ):
                with (
                    self.subTest(change=change, consume=consume.__name__),
                    self.assertRaises(ValueError),
                ):
                    consume(snapshot(**change))

    def test_valid_empty_capped_and_day_cutoff_behavior(self):
        empty = usage.aggregate_daily_usage([], "a", START, DAY)
        self.assertEqual(usage.compute_intent_score(empty), 0)
        self.assertEqual(usage.build_checkpoint_milestones(empty)[0], [])
        self.assertTrue(usage.is_high_intent(snapshot()))
        self.assertFalse(usage.is_high_intent(snapshot(trial_day=10)))
        self.assertEqual(usage.compute_intent_score(snapshot(integrations_connected=100)), 76)
        self.assertEqual(usage.compute_intent_score(snapshot(workflows_created=100)), 82)
        self.assertEqual(usage.compute_intent_score(snapshot(seats_invited=100)), 84)
        self.assertEqual(usage.compute_intent_score(snapshot(features_activated=100)), 72)
        self.assertEqual(
            usage.compute_intent_score(snapshot(integrations_connected=100, seats_invited=100)), 100
        )


if __name__ == "__main__":
    unittest.main()
