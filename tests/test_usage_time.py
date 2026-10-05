"""Regression for mixed UTC/legacy timestamps at the scoring boundary."""

import unittest
from datetime import UTC, date, datetime

from test_ecommerce_suite import PORTFOLIO_ROOT, load_module

usage = load_module(
    "usage_scoring",
    "14 SaaS/SAAS-01 Trial-to-Paid Conversion and Usage Nurture Engine/build/usage_scoring.py",
    PORTFOLIO_ROOT,
)


class UsageTimeTests(unittest.TestCase):
    def test_mixed_timestamp_awareness(self):
        events = [
            usage.UsageEvent(
                event_type="seat_invited",
                account_id="a",
                user_id="u",
                timestamp=datetime(2026, 6, 1, 9, tzinfo=UTC),
                event_id="one",
            ),
            usage.UsageEvent(
                event_type="seat_invited",
                account_id="a",
                user_id="u",
                timestamp=datetime(2026, 6, 1, 10, tzinfo=None),  # noqa: DTZ001 - legacy input
                event_id="two",
            ),
        ]
        snapshot = usage.aggregate_daily_usage(events, "a", date(2026, 6, 1), date(2026, 6, 1))
        self.assertEqual(snapshot.last_event_at, datetime(2026, 6, 1, 10, tzinfo=UTC))
