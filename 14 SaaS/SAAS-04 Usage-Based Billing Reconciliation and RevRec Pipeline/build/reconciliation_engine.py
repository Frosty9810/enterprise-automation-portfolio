"""
reconciliation_engine.py

Reference implementation of the core computation logic described in
SAAS-04 "Usage-Based Billing Reconciliation & Revenue Recognition Pipeline".

This module is the pure-logic core that the n8n Code nodes in
`n8n-workflow.json` are expected to run (n8n's Code node executes plain
Python/JS in-process; the functions below are written so they can be
pasted into a Code node with no modification, or imported by a test
harness / CI job that validates the logic outside of n8n).

Design constraints, per the SOP:
- All money math uses `decimal.Decimal`, never `float` (Section 38,
  Technical Notes: floating-point drift is unacceptable in a financial
  reconciliation system run across thousands of accounts).
- The 3% materiality threshold is VP-of-Finance-approved and must not be
  silently changed by an engineer (Section 10, Responsibilities).
- Financial postings must carry a deterministic idempotency key and must
  never be constructed in a way that allows a double-post (Section 18).

No external dependencies. No credentials required. Runs with a stock
Python 3.9+ interpreter.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# 3% materiality threshold, VP of Finance-approved (SOP Section 14.1 / 39).
VARIANCE_THRESHOLD_PCT = Decimal("0.03")

TWO_PLACES = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")

# QuickBooks Online chart-of-accounts mapping (SOP Section 7, Dependencies —
# stable account IDs maintained as a static mapping table).
QBO_ACCOUNT_DEFERRED_REVENUE = {"value": "2400", "name": "Deferred Revenue - Subscription"}
QBO_ACCOUNT_RECOGNIZED_SEAT = {"value": "4100", "name": "Recognized Revenue - Seats"}
QBO_ACCOUNT_RECOGNIZED_USAGE = {"value": "4200", "name": "Recognized Revenue - Usage"}


# ---------------------------------------------------------------------------
# 1. Variance calculation (nightly reconciliation)
# ---------------------------------------------------------------------------


def calculate_variance(internal_usage: dict, stripe_invoiced: dict) -> dict:
    """Compare internal metering counts against Stripe-invoiced amounts.

    Mirrors SOP Section 14.1: variance_pct = (invoiced - metered) / metered.
    A negative variance means Stripe invoiced *less* than metering recorded
    (revenue leakage — the primary risk this workflow exists to catch). A
    positive variance means Stripe invoiced *more* than metering recorded
    (overbilling risk).

    Args:
        internal_usage: dict with at least:
            account_id (str), billing_period_start (str, ISO date),
            billing_period_end (str, ISO date), metered_api_calls (int)
        stripe_invoiced: dict with at least:
            invoiced_overage_units (int), invoiced_overage_amount_usd (str|Decimal)

    Returns:
        dict matching the `reconciliation_ledger` row shape (SOP 34.3),
        minus the audit columns that are populated at persistence time.
    """
    account_id = internal_usage["account_id"]
    metered_api_calls = int(internal_usage["metered_api_calls"])
    invoiced_overage_units = int(stripe_invoiced["invoiced_overage_units"])
    invoiced_amount = Decimal(str(stripe_invoiced.get("invoiced_overage_amount_usd", "0")))

    if metered_api_calls == 0:
        # Avoid division by zero. Any invoiced overage against zero metered
        # usage is treated as a 100% variance requiring review regardless of
        # dollar size (SOP 14.1).
        variance_pct = Decimal("1.00") if invoiced_overage_units > 0 else Decimal("0.00")
    else:
        variance_pct = (
            Decimal(invoiced_overage_units - metered_api_calls) / Decimal(metered_api_calls)
        ).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)

    requires_review = abs(variance_pct) >= VARIANCE_THRESHOLD_PCT
    variance_direction = "underbilled" if variance_pct < 0 else (
        "overbilled" if variance_pct > 0 else "matched"
    )

    # Estimated dollar impact: the delta in units priced at the invoice's
    # effective per-unit rate, so Finance sees a dollar figure, not just a
    # percentage, when triaging the Slack queue (SOP Section 22).
    unit_delta = invoiced_overage_units - metered_api_calls
    if invoiced_overage_units != 0:
        effective_rate = (invoiced_amount / Decimal(invoiced_overage_units)).quantize(
            FOUR_PLACES, rounding=ROUND_HALF_UP
        )
    else:
        effective_rate = Decimal("0.00")
    estimated_dollar_impact_usd = (Decimal(unit_delta) * effective_rate).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )

    return {
        "account_id": account_id,
        "billing_period_start": internal_usage.get("billing_period_start"),
        "billing_period_end": internal_usage.get("billing_period_end"),
        "metered_api_calls": metered_api_calls,
        "invoiced_overage_units": invoiced_overage_units,
        "variance_pct": str(variance_pct),
        "variance_direction": variance_direction,
        "estimated_dollar_impact_usd": str(estimated_dollar_impact_usd),
        "status": "pending_review" if requires_review else "auto_resolved",
    }


def classify_variance(variance_pct: Decimal, context: Optional[dict] = None) -> str:
    """Classify a variance as auto-resolved or needing Finance review.

    Applies the same 3% materiality threshold as `calculate_variance`
    (kept as a standalone function so it can be unit tested against the
    boundary values called out in SOP Section 29: exactly 3.00%, 2.99%,
    3.01%). Also attaches a root-cause hint using the rule-based
    heuristics in SOP Section 14.1.

    Args:
        variance_pct: signed variance percentage as a Decimal.
        context: optional dict with heuristic flags pulled from the
            metering DB's audit trail — `plan_change_mid_cycle`,
            `duplicate_event_flag_count`, `proration_applied`.

    Returns:
        Either "auto_resolved" or "needs_finance_review".
    """
    if not isinstance(variance_pct, Decimal):
        variance_pct = Decimal(str(variance_pct))

    return "needs_finance_review" if abs(variance_pct) >= VARIANCE_THRESHOLD_PCT else "auto_resolved"


def generate_root_cause_hint(variance_pct: Decimal, context: Optional[dict] = None) -> str:
    """Rule-based root-cause heuristics (SOP Section 14.1 / step 7).

    `context` carries flags pulled from the metering DB's audit trail:
    plan_change_mid_cycle, duplicate_event_flag_count, proration_applied.
    """
    context = context or {}

    if context.get("plan_change_mid_cycle") and not context.get("proration_applied"):
        return (
            "Plan change mid-cycle not prorated — check subscription upgrade/downgrade "
            "timestamp against invoice line item split."
        )
    if context.get("duplicate_event_flag_count", 0) > 0:
        return (
            f"Usage event double-counted — {context['duplicate_event_flag_count']} "
            "duplicate event IDs detected in metering audit trail."
        )
    if variance_pct < 0:
        return (
            "Metered usage exceeds invoiced amount — possible missed Stripe "
            "usage-record submission for this period."
        )
    if variance_pct > 0:
        return (
            "Invoiced usage exceeds metered usage — possible duplicate Stripe "
            "usage-record push or a stale/incorrect metering snapshot."
        )
    return "Unclassified variance — no known heuristic matched; manual investigation required."


# ---------------------------------------------------------------------------
# 2. Revenue recognition schedule (monthly revrec)
# ---------------------------------------------------------------------------


def generate_revrec_schedule(
    contract_value: Decimal,
    seat_portion: Decimal,
    usage_portion: Decimal,
    start_date: date,
    end_date: date,
    usage_events: Optional[list] = None,
) -> list:
    """Build a per-day/per-event revenue recognition schedule.

    Splits a subscription's contract value into:
      - a straight-line daily recognition schedule for the seat component
        (ASC 606-10-25-31 — access-to-platform obligation satisfied evenly
        over time), one record per calendar day in [start_date, end_date];
      - a usage-triggered recognition list for the metered component
        (ASC 606-10-32-40 — variable consideration recognized when the
        usage event occurs), one record per usage event supplied.

    Args:
        contract_value: total contracted value for the period (informational;
            seat_portion + usage_portion should reconcile to this value for
            a clean contract, but the function does not enforce equality
            since usage_portion is often not known until period close).
        seat_portion: the flat seat/platform fee total for the period.
        usage_portion: the confirmed metered overage amount for the period
            (used only to size the usage-triggered records when explicit
            `usage_events` are not supplied).
        start_date: contract/period start (inclusive).
        end_date: contract/period end (inclusive).
        usage_events: optional list of dicts like
            {"event_date": date, "amount_usd": Decimal, "description": str}.
            If omitted, a single synthetic usage-triggered record dated
            `end_date` is emitted for `usage_portion` (this is the common
            case for this SOP: usage is recognized when *confirmed* at
            period close, not per raw event, per SOP Section 14.2).

    Returns:
        A list of recognition records. Each record has a `component` key
        of either "seat" (straight-line, one per day) or "usage"
        (usage-triggered, one per event). Amounts are strings holding
        Decimal values quantized to cents.
    """
    if end_date < start_date:
        raise ValueError(f"end_date {end_date} precedes start_date {start_date}")

    total_days = (end_date - start_date).days + 1
    daily_rate = (seat_portion / Decimal(total_days)).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)

    schedule = []

    # -- Seat component: straight-line, one record per day -----------------
    running_total = Decimal("0.00")
    for day_index in range(total_days):
        recognition_date = start_date + timedelta(days=day_index)
        is_last_day = day_index == total_days - 1
        if is_last_day:
            # Final day absorbs any rounding remainder so the sum of daily
            # seat recognition amounts equals seat_portion exactly to the
            # cent (never leave an unreconciled fractional cent).
            day_amount = (seat_portion - running_total).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        else:
            day_amount = (daily_rate).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        running_total += day_amount

        schedule.append(
            {
                "component": "seat",
                "recognition_date": recognition_date.isoformat(),
                "amount_usd": str(day_amount),
                "method": "straight_line",
                "asc606_ref": "ASC 606-10-25-31",
            }
        )

    # -- Usage component: usage-triggered, one record per event -------------
    if usage_events:
        allocated = Decimal("0.00")
        for idx, event in enumerate(usage_events):
            is_last_event = idx == len(usage_events) - 1
            event_amount = Decimal(str(event["amount_usd"])).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
            allocated += event_amount
            schedule.append(
                {
                    "component": "usage",
                    "recognition_date": event["event_date"].isoformat()
                    if isinstance(event["event_date"], date)
                    else str(event["event_date"]),
                    "amount_usd": str(event_amount),
                    "method": "usage_triggered",
                    "asc606_ref": "ASC 606-10-32-40",
                    "description": event.get("description", "Metered usage recognition event"),
                }
            )
    elif usage_portion and usage_portion != Decimal("0"):
        # Common case for this SOP: usage is confirmed and recognized as a
        # single event at period close (SOP Section 14.2, step 13).
        schedule.append(
            {
                "component": "usage",
                "recognition_date": end_date.isoformat(),
                "amount_usd": str(Decimal(usage_portion).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)),
                "method": "usage_triggered",
                "asc606_ref": "ASC 606-10-32-40",
                "description": "Confirmed metered overage recognized at period close",
            }
        )

    return schedule


# ---------------------------------------------------------------------------
# 3. QuickBooks Online journal entry construction
# ---------------------------------------------------------------------------


def compute_idempotency_key(subscription_batch_id: str, period_end_date: str, je_type: str) -> str:
    """Deterministic idempotency key per SOP Section 18.

    key = sha256(subscription_batch_id + ":" + period_end_date + ":" + je_type)
    """
    raw = f"{subscription_batch_id}:{period_end_date}:{je_type}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_journal_entry(
    recognized_amount: Decimal,
    deferred_amount: Decimal,
    cost_center: str,
    *,
    subscription_batch_id: str = "SUB-BATCH-UNSPECIFIED",
    period_end_date: str = "",
    seat_recognized_amount: Optional[Decimal] = None,
    usage_recognized_amount: Optional[Decimal] = None,
    cost_center_class_ref: Optional[str] = None,
    txn_date: Optional[str] = None,
    doc_number: Optional[str] = None,
) -> dict:
    """Construct a QuickBooks Online Journal Entry API payload.

    Shape matches SOP Section 34.4 exactly: a debit to Deferred Revenue for
    the amount being released, and credits to Recognized Revenue - Seats
    and Recognized Revenue - Usage split by component, tagged with a
    ClassRef for cost-center reporting. Debits always equal credits — this
    function raises if they do not, mirroring the hard validation rule in
    SOP Section 16 ("Debits must equal credits before submission... never
    send an unbalanced JE to QuickBooks").

    The idempotency key (SOP Section 18) is embedded in `PrivateNote` as
    `IDEMPOTENCY_KEY:{key}` since QuickBooks Online has no native
    idempotency-key field (SOP Section 38, Technical Notes).

    Args:
        recognized_amount: total amount recognized this period (seat + usage).
        deferred_amount: amount being released from/added to deferred revenue,
            debited against the Deferred Revenue account.
        cost_center: cost center code (maps to ClassRef.value via
            `cost_center_map`, SOP Section 7).
        subscription_batch_id: identifier for the batch of subscriptions
            summarized into this JE, used to build the idempotency key.
        period_end_date: ISO date string for the closed period, used to
            build the idempotency key and set TxnDate if not overridden.
        seat_recognized_amount / usage_recognized_amount: optional split of
            `recognized_amount` into its two credit lines. If omitted,
            the full `recognized_amount` is credited to Recognized Revenue
            - Seats (a degenerate but still balanced JE).
        cost_center_class_ref: QBO ClassRef.value; defaults to `cost_center`.
        txn_date: ISO date string; defaults to `period_end_date`.
        doc_number: optional QBO DocNumber to request.

    Returns:
        A dict matching the QuickBooks Online Journal Entry POST body shape.
    """
    deferred_amount = Decimal(deferred_amount).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    recognized_amount = Decimal(recognized_amount).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    if seat_recognized_amount is None and usage_recognized_amount is None:
        seat_recognized_amount = recognized_amount
        usage_recognized_amount = Decimal("0.00")
    else:
        seat_recognized_amount = Decimal(seat_recognized_amount or "0").quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )
        usage_recognized_amount = Decimal(usage_recognized_amount or "0").quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )

    total_credits = seat_recognized_amount + usage_recognized_amount
    total_debits = deferred_amount

    if total_debits != total_credits:
        raise ValueError(
            "Unbalanced journal entry rejected before submission "
            f"(debits={total_debits}, credits={total_credits}) — SOP Section 16 "
            "requires debits to equal credits before any QBO API call."
        )

    class_ref_value = cost_center_class_ref or cost_center
    resolved_txn_date = txn_date or period_end_date or date.today().isoformat()

    idempotency_key = compute_idempotency_key(
        subscription_batch_id, period_end_date or resolved_txn_date, "recognized_revenue_period_close"
    )

    lines = [
        {
            "Description": f"Deferred revenue release — subscription batch {subscription_batch_id}",
            "Amount": float(deferred_amount),
            "DetailType": "JournalEntryLineDetail",
            "JournalEntryLineDetail": {
                "PostingType": "Debit",
                "AccountRef": QBO_ACCOUNT_DEFERRED_REVENUE,
                "ClassRef": {"value": class_ref_value, "name": f"Cost Center: {cost_center}"},
            },
        }
    ]

    if seat_recognized_amount > 0:
        lines.append(
            {
                "Description": f"Recognized revenue — seat fee, period ending {period_end_date}",
                "Amount": float(seat_recognized_amount),
                "DetailType": "JournalEntryLineDetail",
                "JournalEntryLineDetail": {
                    "PostingType": "Credit",
                    "AccountRef": QBO_ACCOUNT_RECOGNIZED_SEAT,
                    "ClassRef": {"value": class_ref_value, "name": f"Cost Center: {cost_center}"},
                },
            }
        )

    if usage_recognized_amount > 0:
        lines.append(
            {
                "Description": f"Recognized revenue — usage overage, period ending {period_end_date}",
                "Amount": float(usage_recognized_amount),
                "DetailType": "JournalEntryLineDetail",
                "JournalEntryLineDetail": {
                    "PostingType": "Credit",
                    "AccountRef": QBO_ACCOUNT_RECOGNIZED_USAGE,
                    "ClassRef": {"value": class_ref_value, "name": f"Cost Center: {cost_center}"},
                },
            }
        )

    payload = {
        "Line": lines,
        "TxnDate": resolved_txn_date,
        "PrivateNote": f"IDEMPOTENCY_KEY:{idempotency_key} | Batch {subscription_batch_id}",
    }
    if doc_number:
        payload["DocNumber"] = doc_number

    # Note: `Amount` fields above are floats only because that is the shape
    # the QuickBooks Online REST API itself expects on the wire (JSON has no
    # native Decimal type). Every value is derived from Decimal arithmetic
    # and quantized to cents before conversion — the float conversion here
    # is the API boundary, not an internal computation step.
    return payload


# ---------------------------------------------------------------------------
# 4. Self-test / demo — three sample accounts
# ---------------------------------------------------------------------------


def _print_section(title: str) -> None:
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


if __name__ == "__main__":
    # ------------------------------------------------------------------
    # Sample account A — clean: metered usage matches invoiced usage,
    # variance well under the 3% threshold.
    # ------------------------------------------------------------------
    account_a_usage = {
        "account_id": "acct_am_10021",
        "billing_period_start": "2026-06-01",
        "billing_period_end": "2026-06-30",
        "metered_api_calls": 250_000,
    }
    account_a_invoiced = {
        "invoiced_overage_units": 250_100,  # 0.04% variance, well under 3%
        "invoiced_overage_amount_usd": "150.06",
    }

    # ------------------------------------------------------------------
    # Sample account B — material variance (>3%): looks like a missed
    # Stripe usage-record submission (underbilled / revenue leakage).
    # ------------------------------------------------------------------
    account_b_usage = {
        "account_id": "acct_am_48213",
        "billing_period_start": "2026-06-01",
        "billing_period_end": "2026-06-30",
        "metered_api_calls": 612_480,
    }
    account_b_invoiced = {
        "invoiced_overage_units": 108_160,  # matches SOP Appendix 34.2/34.3 example
        "invoiced_overage_amount_usd": "649.00",
    }
    account_b_context = {
        "plan_change_mid_cycle": False,
        "duplicate_event_flag_count": 0,
    }

    # ------------------------------------------------------------------
    # Sample account C — mid-cycle plan change, not prorated: also a
    # material variance, but with a specific, classifiable root cause.
    # ------------------------------------------------------------------
    account_c_usage = {
        "account_id": "acct_am_77410",
        "billing_period_start": "2026-06-01",
        "billing_period_end": "2026-06-30",
        "metered_api_calls": 90_000,
    }
    account_c_invoiced = {
        "invoiced_overage_units": 60_000,  # -33.3% variance, driven by plan change
        "invoiced_overage_amount_usd": "420.00",
    }
    account_c_context = {
        "plan_change_mid_cycle": True,
        "proration_applied": False,
        "duplicate_event_flag_count": 0,
    }

    samples = [
        ("Account A — clean, immaterial variance", account_a_usage, account_a_invoiced, {}),
        ("Account B — material variance, revenue leakage pattern", account_b_usage, account_b_invoiced, account_b_context),
        ("Account C — mid-cycle plan change, not prorated", account_c_usage, account_c_invoiced, account_c_context),
    ]

    _print_section("NIGHTLY RECONCILIATION — VARIANCE CLASSIFICATION")
    for label, usage, invoiced, context in samples:
        result = calculate_variance(usage, invoiced)
        variance_pct = Decimal(result["variance_pct"])
        classification = classify_variance(variance_pct)
        root_cause = generate_root_cause_hint(variance_pct, context)

        print(f"\n{label}")
        print(f"  account_id                : {result['account_id']}")
        print(f"  metered_api_calls         : {result['metered_api_calls']:,}")
        print(f"  invoiced_overage_units    : {result['invoiced_overage_units']:,}")
        print(f"  variance_pct              : {result['variance_pct']}")
        print(f"  variance_direction        : {result['variance_direction']}")
        print(f"  estimated_dollar_impact   : ${result['estimated_dollar_impact_usd']}")
        print(f"  ledger status             : {result['status']}")
        print(f"  classify_variance()       : {classification}")
        print(f"  root_cause_hint           : {root_cause}")

    _print_section("MONTHLY REVENUE RECOGNITION — SAMPLE SCHEDULE (Account B contract)")
    schedule = generate_revrec_schedule(
        contract_value=Decimal("148900.00"),
        seat_portion=Decimal("84000.00"),
        usage_portion=Decimal("649.00"),
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 30),
    )
    seat_records = [r for r in schedule if r["component"] == "seat"]
    usage_records = [r for r in schedule if r["component"] == "usage"]

    print(f"\nTotal records generated: {len(schedule)} "
          f"({len(seat_records)} seat/day, {len(usage_records)} usage-triggered)")
    print("\nFirst 3 seat recognition records:")
    for rec in seat_records[:3]:
        print(f"  {rec}")
    print("\nLast seat recognition record (absorbs rounding remainder):")
    print(f"  {seat_records[-1]}")
    print(f"\nSum of seat recognition records: "
          f"{sum(Decimal(r['amount_usd']) for r in seat_records)} "
          f"(should equal seat_portion 84000.00)")
    print("\nUsage-triggered recognition record(s):")
    for rec in usage_records:
        print(f"  {rec}")

    _print_section("MONTHLY REVENUE RECOGNITION — QUICKBOOKS JOURNAL ENTRY PAYLOAD")
    seat_recognized = Decimal("84000.00")
    usage_recognized = Decimal("649.00")
    je_payload = build_journal_entry(
        recognized_amount=seat_recognized + usage_recognized,
        deferred_amount=seat_recognized + usage_recognized,
        cost_center="104",
        subscription_batch_id="SUB-2026-06-CC-104",
        period_end_date="2026-06-30",
        seat_recognized_amount=seat_recognized,
        usage_recognized_amount=usage_recognized,
        cost_center_class_ref="104",
        doc_number="RR-2026-06-104",
    )
    print(json.dumps(je_payload, indent=2))

    print("\nDone. All three sample accounts processed without unhandled exceptions.")
