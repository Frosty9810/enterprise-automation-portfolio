#!/usr/bin/env python3
"""
usage_scoring.py
=================

Reference implementation of the usage-scoring, intent-classification, and
lifecycle-checkpoint logic described in SAAS-01 (Trial-to-Paid Conversion &
Usage-Triggered Nurture Engine), Sections 12 and 14 of the SOP.

This module is a standalone, dependency-free (stdlib only) reference build.
In production, the equivalent logic runs inside the n8n Code node shown in
`n8n-workflow.json`, reading raw events from the `usage_events` Postgres
table and writing rollups to `account_usage_daily` (see `schema.sql`).

Run directly to execute a self-test against three synthetic sample accounts:

    python3 usage_scoring.py

No external dependencies, no credentials, no network calls.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Iterable, Literal

# ---------------------------------------------------------------------------
# Constants — mirror the thresholds and weights defined in SOP Sections 13/14
# ---------------------------------------------------------------------------

# Event types accepted from the internal event API (SOP Section 8, 12, 16).
VALID_EVENT_TYPES = frozenset(
    {"feature_activated", "integration_connected", "workflow_created", "seat_invited"}
)

# High-intent threshold (SOP Section 13/14): both conditions must hold,
# and the crossing must happen before trial day 10.
HIGH_INTENT_MIN_INTEGRATIONS = 3
HIGH_INTENT_MIN_SEATS = 2
HIGH_INTENT_DAY_CUTOFF = 10  # exclusive upper bound: trial_day < 10

# Lifecycle checkpoints are expressed as "days remaining in the trial"
# (SOP Section 12, Step 3 / Section 15). Trial length is 14 days.
TRIAL_LENGTH_DAYS = 14
CHECKPOINTS_DAYS_REMAINING = (7, 3, 1)

# Scoring weights (SOP Section 14) — capped contributions per usage dimension.
WEIGHT_INTEGRATIONS = 12
WEIGHT_SEATS = 8
WEIGHT_WORKFLOWS = 3
WEIGHT_FEATURES = 1
CAP_INTEGRATIONS = 5
CAP_SEATS = 6
CAP_WORKFLOWS = 10
CAP_FEATURES = 20
MAX_SCORE = 100.0

IntentTier = Literal["high", "standard"]


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class UsageEvent:
    """A single raw usage event as received by the n8n webhook.

    Mirrors the payload shape in SOP Section 15 / 34.
    """

    event_type: str
    account_id: str
    user_id: str
    timestamp: datetime
    event_id: str
    metadata: dict = field(default_factory=dict)


@dataclass
class UsageSnapshot:
    """Cumulative usage counts for a trial account as of a given date.

    Equivalent to one row of `account_usage_daily` (see schema.sql).
    """

    account_id: str
    score_date: date
    trial_day: int
    integrations_connected: int
    seats_invited: int
    workflows_created: int
    features_activated: int
    last_event_at: datetime | None
    no_usage_data: bool = False


@dataclass
class CheckpointResult:
    """Result of evaluating an account against the day 7/3/1 checkpoints."""

    checkpoint: str | None  # "day_7", "day_3", "day_1", or None if no boundary crossed
    days_remaining: int
    milestones_hit: list[str]
    milestones_missed: list[str]


# ---------------------------------------------------------------------------
# Aggregation: raw event stream -> daily per-account usage score
# ---------------------------------------------------------------------------


def aggregate_daily_usage(
    events: Iterable[UsageEvent],
    account_id: str,
    trial_start: date,
    as_of: date,
) -> UsageSnapshot:
    """Aggregate a stream of raw usage events into a daily usage snapshot.

    This mirrors the nightly/incremental rollup job in SOP Section 12,
    Step 2: cumulative counts per account for each of the four tracked
    event types, computed over all events for `account_id` with a
    timestamp on or before `as_of` (inclusive, end-of-day UTC semantics).

    Deduplication (SOP Section 17, Scenario 2) is handled by the caller /
    the Postgres unique constraint on `event_id` in production; this
    function assumes the incoming iterable has already been deduplicated
    (as `INSERT ... ON CONFLICT (event_id) DO NOTHING` guarantees upstream).

    Args:
        events: raw usage events for this account (any order).
        account_id: the account being scored.
        trial_start: the date the trial began (trial_day is derived from this).
        as_of: the date to score as of (inclusive).

    Returns:
        A UsageSnapshot with cumulative counts, last_event_at, and the
        no_usage_data flag set per SOP Section 17 Scenario 5.
    """
    integrations = 0
    seats = 0
    workflows = 0
    features = 0
    last_event_at: datetime | None = None

    cutoff = datetime(as_of.year, as_of.month, as_of.day, 23, 59, 59)

    for evt in events:
        if evt.account_id != account_id:
            continue
        if evt.event_type not in VALID_EVENT_TYPES:
            continue  # malformed/unrecognized event type — excluded from scoring
        if evt.timestamp > cutoff:
            continue  # not yet "as of" this scoring date

        if evt.event_type == "integration_connected":
            integrations += 1
        elif evt.event_type == "seat_invited":
            seats += 1
        elif evt.event_type == "workflow_created":
            workflows += 1
        elif evt.event_type == "feature_activated":
            features += 1

        if last_event_at is None or evt.timestamp > last_event_at:
            last_event_at = evt.timestamp

    trial_day = (as_of - trial_start).days + 1  # trial_day is 1-indexed
    no_usage_data = last_event_at is None

    return UsageSnapshot(
        account_id=account_id,
        score_date=as_of,
        trial_day=trial_day,
        integrations_connected=integrations,
        seats_invited=seats,
        workflows_created=workflows,
        features_activated=features,
        last_event_at=last_event_at,
        no_usage_data=no_usage_data,
    )


def compute_intent_score(snapshot: UsageSnapshot) -> float:
    """Compute a weighted 0-100 intent score from usage counts.

    Direct implementation of the scoring function in SOP Section 14.
    Weights reflect observed correlation with historical conversions:
    integration depth and team expansion are the strongest predictors,
    workflow creation is a moderate predictor, raw feature activation
    is a weak but non-zero predictor of engagement.

    An account with no usage data at all (SOP Section 17, Scenario 5)
    scores 0.0 explicitly, distinct from an account that has some usage
    but simply hasn't hit any weighted milestones.
    """
    if snapshot.no_usage_data or snapshot.last_event_at is None:
        return 0.0

    score = (
        min(snapshot.integrations_connected, CAP_INTEGRATIONS) * WEIGHT_INTEGRATIONS
        + min(snapshot.seats_invited, CAP_SEATS) * WEIGHT_SEATS
        + min(snapshot.workflows_created, CAP_WORKFLOWS) * WEIGHT_WORKFLOWS
        + min(snapshot.features_activated, CAP_FEATURES) * WEIGHT_FEATURES
    )
    return min(float(score), MAX_SCORE)


# ---------------------------------------------------------------------------
# High-intent classification
# ---------------------------------------------------------------------------


def is_high_intent(snapshot: UsageSnapshot) -> bool:
    """Determine whether an account meets the high-intent threshold.

    Per SOP Section 13/14: an account is high-intent only if it crosses
    BOTH the integration threshold (>= 3) AND the seat threshold (>= 2),
    and does so before trial day 10 (trial_day < 10). A single strong
    signal alone (e.g., 5 integrations, 0 seats) intentionally does not
    qualify — see SOP Section 37 FAQ for the rationale.
    """
    meets_integration_threshold = snapshot.integrations_connected >= HIGH_INTENT_MIN_INTEGRATIONS
    meets_seat_threshold = snapshot.seats_invited >= HIGH_INTENT_MIN_SEATS
    within_window = snapshot.trial_day < HIGH_INTENT_DAY_CUTOFF
    return meets_integration_threshold and meets_seat_threshold and within_window


def classify_intent_tier(snapshot: UsageSnapshot) -> IntentTier:
    """Classify an account as 'high' or 'standard' intent tier.

    Note: once high-intent is triggered (crossed before day 10), the tier
    is treated as sticky for the remainder of the trial in production
    (the `intent_tier` column is not silently downgraded on later reads).
    This pure function reports the tier for the given snapshot in isolation;
    stickiness is a caller/persistence-layer responsibility (see schema.sql).
    """
    return "high" if is_high_intent(snapshot) else "standard"


# ---------------------------------------------------------------------------
# Lifecycle checkpoint evaluation (day 7 / day 3 / day 1 remaining)
# ---------------------------------------------------------------------------


def determine_checkpoint(trial_start: date, today: date) -> CheckpointResult:
    """Determine which day-7/day-3/day-1 messaging checkpoint applies.

    Per SOP Section 12, Step 3 / Section 15: the hourly sweep compares
    `trial_end_date - current_time` against the 7-day, 3-day, and 1-day
    boundaries. This function computes days remaining given a trial
    start date and "today", and reports which (if any) of the three
    checkpoints matches exactly.

    Args:
        trial_start: the date the 14-day trial began.
        today: the date to evaluate against (the "current time" of the sweep).

    Returns:
        A CheckpointResult. `checkpoint` is one of "day_7", "day_3",
        "day_1", or None if `today` does not land exactly on one of
        those boundaries. `milestones_hit`/`milestones_missed` are left
        empty here — populate them by pairing this result with a
        UsageSnapshot via `build_checkpoint_milestones`.
    """
    trial_end = trial_start + timedelta(days=TRIAL_LENGTH_DAYS)
    days_remaining = (trial_end - today).days

    checkpoint = None
    if days_remaining in CHECKPOINTS_DAYS_REMAINING:
        checkpoint = f"day_{days_remaining}"

    return CheckpointResult(
        checkpoint=checkpoint,
        days_remaining=days_remaining,
        milestones_hit=[],
        milestones_missed=[],
    )


def build_checkpoint_milestones(snapshot: UsageSnapshot) -> tuple[list[str], list[str]]:
    """Build the 'milestones hit' vs 'milestones missed' lists for a
    checkpoint email personalization payload (SOP Section 12, Step 3).

    E.g. integrations_connected: 0 -> "you haven't connected an
    integration yet" branch; seats_invited: 4 -> "you've invited 4
    teammates" branch.
    """
    hit: list[str] = []
    missed: list[str] = []

    if snapshot.integrations_connected > 0:
        hit.append(f"integrations_connected:{snapshot.integrations_connected}")
    else:
        missed.append("integrations_connected:0")

    if snapshot.seats_invited > 0:
        hit.append(f"seats_invited:{snapshot.seats_invited}")
    else:
        missed.append("seats_invited:0")

    if snapshot.workflows_created > 0:
        hit.append(f"workflows_created:{snapshot.workflows_created}")
    else:
        missed.append("workflows_created:0")

    if snapshot.features_activated > 0:
        hit.append(f"features_activated:{snapshot.features_activated}")
    else:
        missed.append("features_activated:0")

    return hit, missed


# ---------------------------------------------------------------------------
# Self-test / demo
# ---------------------------------------------------------------------------


def _make_event(
    event_type: str, account_id: str, user_id: str, day_offset: int, event_id: str
) -> UsageEvent:
    """Helper: build a synthetic event `day_offset` days after a fixed epoch."""
    epoch = datetime(2026, 6, 1, 9, 0, 0)
    return UsageEvent(
        event_type=event_type,
        account_id=account_id,
        user_id=user_id,
        timestamp=epoch + timedelta(days=day_offset),
        event_id=event_id,
        metadata={},
    )


def _build_sample_accounts() -> list[tuple[str, date, date, list[UsageEvent]]]:
    """Build 3 sample accounts: one high-intent, one low-usage, one borderline.

    Each tuple is (account_id, trial_start, as_of, events).
    """
    trial_start = date(2026, 6, 1)

    # Account 1 — clearly high-intent: 4 integrations, 3 seats, all by day 6.
    # as_of = trial_start + 7 days -> trial_end (day 15) - today = 7 days
    # remaining -> lands exactly on the "day_7" checkpoint boundary.
    acct_1_events = [
        _make_event("integration_connected", "acct_high_intent_01", "usr_001", 1, "evt_h_001"),
        _make_event("integration_connected", "acct_high_intent_01", "usr_001", 2, "evt_h_002"),
        _make_event("integration_connected", "acct_high_intent_01", "usr_001", 3, "evt_h_003"),
        _make_event("integration_connected", "acct_high_intent_01", "usr_002", 4, "evt_h_004"),
        _make_event("seat_invited", "acct_high_intent_01", "usr_001", 2, "evt_h_005"),
        _make_event("seat_invited", "acct_high_intent_01", "usr_001", 3, "evt_h_006"),
        _make_event("seat_invited", "acct_high_intent_01", "usr_001", 5, "evt_h_007"),
        _make_event("workflow_created", "acct_high_intent_01", "usr_002", 5, "evt_h_008"),
        _make_event("feature_activated", "acct_high_intent_01", "usr_001", 1, "evt_h_009"),
        _make_event("feature_activated", "acct_high_intent_01", "usr_002", 6, "evt_h_010"),
    ]
    acct_1_as_of = trial_start + timedelta(days=7)  # trial_day 8, days_remaining 7 -> "day_7"

    # Account 2 — low-usage / dormant: a single feature activation, nothing else.
    # as_of = trial_start + 11 days -> days_remaining 3 -> "day_3" checkpoint boundary.
    acct_2_events = [
        _make_event("feature_activated", "acct_low_usage_02", "usr_010", 1, "evt_l_001"),
    ]
    acct_2_as_of = trial_start + timedelta(days=11)  # trial_day 12, days_remaining 3 -> "day_3"

    # Account 3 — borderline: meets integration threshold but not seat threshold
    # (3 integrations, 1 seat) -> should NOT classify as high-intent.
    # as_of = trial_start + 13 days -> days_remaining 1 -> "day_1" checkpoint boundary.
    acct_3_events = [
        _make_event("integration_connected", "acct_borderline_03", "usr_020", 1, "evt_b_001"),
        _make_event("integration_connected", "acct_borderline_03", "usr_020", 2, "evt_b_002"),
        _make_event("integration_connected", "acct_borderline_03", "usr_020", 4, "evt_b_003"),
        _make_event("seat_invited", "acct_borderline_03", "usr_020", 3, "evt_b_004"),
        _make_event("workflow_created", "acct_borderline_03", "usr_020", 4, "evt_b_005"),
        _make_event("workflow_created", "acct_borderline_03", "usr_020", 5, "evt_b_006"),
        _make_event("feature_activated", "acct_borderline_03", "usr_020", 2, "evt_b_007"),
        _make_event("feature_activated", "acct_borderline_03", "usr_020", 5, "evt_b_008"),
    ]
    acct_3_as_of = trial_start + timedelta(days=13)  # trial_day 14, days_remaining 1 -> "day_1"

    return [
        ("acct_high_intent_01", trial_start, acct_1_as_of, acct_1_events),
        ("acct_low_usage_02", trial_start, acct_2_as_of, acct_2_events),
        ("acct_borderline_03", trial_start, acct_3_as_of, acct_3_events),
    ]


def _run_self_test() -> None:
    """Run aggregation, scoring, high-intent classification, and checkpoint
    determination against the 3 hardcoded sample accounts, printing results.
    """
    print("=" * 78)
    print("SAAS-01 usage_scoring.py self-test")
    print("=" * 78)

    for account_id, trial_start, as_of, events in _build_sample_accounts():
        snapshot = aggregate_daily_usage(events, account_id, trial_start, as_of)
        score = compute_intent_score(snapshot)
        tier = classify_intent_tier(snapshot)
        high_intent = is_high_intent(snapshot)
        checkpoint_result = determine_checkpoint(trial_start, as_of)
        hit, missed = build_checkpoint_milestones(snapshot)

        print(f"\nAccount: {account_id}")
        print(f"  trial_start:            {trial_start.isoformat()}")
        print(f"  as_of (today):          {as_of.isoformat()}")
        print(f"  trial_day:              {snapshot.trial_day}")
        print(f"  integrations_connected: {snapshot.integrations_connected}")
        print(f"  seats_invited:          {snapshot.seats_invited}")
        print(f"  workflows_created:      {snapshot.workflows_created}")
        print(f"  features_activated:     {snapshot.features_activated}")
        print(f"  no_usage_data:          {snapshot.no_usage_data}")
        print(f"  intent_score:           {score:.1f}")
        print(f"  intent_tier:            {tier}")
        print(f"  is_high_intent:         {high_intent}")
        print(
            f"  checkpoint boundary:    {checkpoint_result.checkpoint} "
            f"(days_remaining={checkpoint_result.days_remaining})"
        )
        print(f"  milestones_hit:         {hit}")
        print(f"  milestones_missed:      {missed}")

    print("\n" + "=" * 78)
    print("Self-test complete. Expected outcomes:")
    print("  - acct_high_intent_01 -> intent_tier=high, is_high_intent=True")
    print("  - acct_low_usage_02   -> intent_tier=standard, low/zero score")
    print("  - acct_borderline_03  -> intent_tier=standard (seats < 2, threshold not met)")
    print("=" * 78)


if __name__ == "__main__":
    _run_self_test()
