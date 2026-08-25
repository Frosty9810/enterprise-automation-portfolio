"""Dunning case state machine — reference implementation.

Real, runnable Python 3 reference implementation of the graduated
14-day dunning cadence described in SAAS-02's SOP (Section 14,
"Automation Logic"). This module is a standalone, dependency-free
mirror of the branching logic the Make.com/n8n orchestration layer
executes on each scheduled tick.

No external dependencies. No credentials required. Uses only the
Python standard library (`datetime`, `enum`, `dataclasses`).

Run directly for a self-test against four sample cases:

    python3 dunning_state_machine.py
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum


class PlanTier(str, Enum):
    """Subscription tier, drives branching and CSM carve-out."""

    SMB = "smb"
    MID_MARKET = "mid_market"
    ENTERPRISE = "enterprise"


class DeclineReason(str, Enum):
    """Stripe decline/failure reason code (subset tracked by this workflow)."""

    CARD_DECLINED = "card_declined"
    INSUFFICIENT_FUNDS = "insufficient_funds"
    EXPIRED_CARD = "expired_card"
    UNKNOWN = "unknown"


class CaseState(str, Enum):
    """Lifecycle states for a dunning case.

    Mirrors the 14-day graduated cadence: Day 0 (failure/Smart Retry),
    Day 3 (first recovery email), Day 7 (escalation email + optional
    SMS, or a standing CSM task for Enterprise), Day 14 (grace period
    expiration -> downgrade/suspension), plus the two terminal
    non-time-boxed states (recovered, paused).
    """

    FAILED = "failed"                    # Day 0: case just created, Smart Retry window
    RETRYING = "retrying"                # Stripe Smart Retry still in progress, < Day 3
    DAY3_EMAIL_SENT = "day3_email_sent"  # Day 3-6: first recovery email sent
    DAY7_WARNING_SENT = "day7_warning_sent"  # Day 7-13: escalation email/SMS/banner sent
    ENTERPRISE_CSM_TASK_OPEN = "enterprise_csm_task_open"  # Enterprise-only holding state
    RECOVERED = "recovered"              # Terminal: payment succeeded
    SUSPENDED = "suspended"              # Terminal: Day 14 grace period expired
    PAUSED = "paused"                    # Manual override: clock frozen


# Cadence boundaries, in days since `failed_at`. Configurable per Section 18.
DAY3_OFFSET = timedelta(days=3)
DAY7_OFFSET = timedelta(days=7)
DAY14_OFFSET = timedelta(days=14)

# High-value SMS escalation threshold (Section 14 / FR-4), in cents.
HIGH_VALUE_MRR_THRESHOLD_CENTS = 150_000  # $1,500/mo


@dataclass
class DunningCase:
    """Normalized internal dunning case record (mirrors SOP Section 15)."""

    dunning_case_id: str
    invoice_id: str
    customer_id: str
    plan_tier: PlanTier
    decline_reason: DeclineReason
    amount_due_cents: int
    mrr_cents: int
    failed_at: datetime
    status: CaseState = CaseState.FAILED
    csm_task_id: str | None = None
    recovered_at: datetime | None = None
    audit_trail: list[dict] = field(default_factory=list)


def is_high_value(case: DunningCase) -> bool:
    """High-value accounts receive SMS escalation at Day 7 in addition to email.

    Re-evaluated at each failure event against current MRR rather than a
    cached flag, per SOP Section 38 (Technical Notes).
    """
    return case.mrr_cents >= HIGH_VALUE_MRR_THRESHOLD_CENTS


def requires_csm_task(case: DunningCase) -> bool:
    """Enterprise-tier failures bypass pure automation and get a human-owned task.

    Per BR-3 / FR-3: the Close CRM task is created in parallel with Day 0
    processing, not instead of the standard cadence — Enterprise accounts
    still follow the same Day 3/7/14 skeleton, but suspension at Day 14 is
    deferred pending CSM sign-off (SOP Section 10, Step 10).
    """
    return case.plan_tier == PlanTier.ENTERPRISE


def email_template_for(reason: DeclineReason) -> str:
    """Map decline reason to the HubSpot template most likely to drive resolution."""
    mapping = {
        DeclineReason.EXPIRED_CARD: "dunning_update_card_v2",
        DeclineReason.INSUFFICIENT_FUNDS: "dunning_retry_timing_v2",
        DeclineReason.CARD_DECLINED: "dunning_generic_recovery_v2",
        DeclineReason.UNKNOWN: "dunning_generic_recovery_v2",
    }
    return mapping[reason]


def determine_state_and_action(case: DunningCase, now: datetime) -> tuple[CaseState, str]:
    """Determine the case's current state and the action that should fire now.

    Implements the exact Day 3 / Day 7 / Day 14 graduated cadence from the
    SOP (Section 14 / Section 18), including the Enterprise-tier carve-out
    to a CSM task instead of pure automated suspension at Day 14.

    This mirrors the Make.com/n8n scheduled-check pattern: the platform
    evaluates this on a recurring scenario tick rather than a continuous
    stream, so `now` is always the tick time.

    Args:
        case: the dunning case being evaluated.
        now: the evaluation timestamp (the scheduled-check tick time).

    Returns:
        A tuple of (resulting CaseState, human-readable action string).
    """
    if case.status == CaseState.PAUSED:
        return CaseState.PAUSED, "no_action_case_paused"

    if case.status == CaseState.RECOVERED:
        return CaseState.RECOVERED, "no_action_case_closed"

    elapsed = now - case.failed_at

    # Enterprise CSM task fires at Day 0 in parallel with the standard
    # cadence — it does not replace any step (SOP Section 18).
    enterprise_prefix = ""
    if requires_csm_task(case):
        enterprise_prefix = "create_close_crm_csm_task+"

    if elapsed < DAY3_OFFSET:
        action = f"{enterprise_prefix}await_smart_retry" if enterprise_prefix else "await_smart_retry"
        return CaseState.RETRYING, action

    if elapsed < DAY7_OFFSET:
        template = email_template_for(case.decline_reason)
        action = f"{enterprise_prefix}send_day3_email:{template}"
        return CaseState.DAY3_EMAIL_SENT, action

    if elapsed < DAY14_OFFSET:
        action = "send_day7_email_and_banner_and_restriction_warning"
        if is_high_value(case):
            action += "+sms_escalation"
        action = f"{enterprise_prefix}{action}"
        return CaseState.DAY7_WARNING_SENT, action

    # Day 14+: grace period has expired.
    if case.plan_tier == PlanTier.ENTERPRISE:
        # Enterprise suspension is deferred pending CSM sign-off (SOP
        # Section 10, Step 10) — the automated system opens/holds the
        # task rather than unilaterally suspending a negotiated contract.
        return (
            CaseState.ENTERPRISE_CSM_TASK_OPEN,
            "defer_to_csm_signoff_before_suspension",
        )

    return CaseState.SUSPENDED, "trigger_downgrade_or_suspension"


def advance_case(case: DunningCase, now: datetime) -> DunningCase:
    """Simulate a state transition for a case, returning an updated copy.

    Applies `determine_state_and_action` and writes an audit-trail entry,
    mirroring the append-only audit pattern in SOP Section 23. Does not
    mutate the input case; returns a new `DunningCase` instance.

    Args:
        case: the dunning case to advance.
        now: the current evaluation timestamp.

    Returns:
        A new DunningCase with updated `status` and an appended audit entry.
    """
    new_state, action = determine_state_and_action(case, now)

    new_audit_trail = list(case.audit_trail)
    new_audit_trail.append(
        {
            "ts": now.isoformat(),
            "event": action,
            "actor": "system",
            "previous_status": case.status.value,
            "new_status": new_state.value,
        }
    )

    updated = DunningCase(
        dunning_case_id=case.dunning_case_id,
        invoice_id=case.invoice_id,
        customer_id=case.customer_id,
        plan_tier=case.plan_tier,
        decline_reason=case.decline_reason,
        amount_due_cents=case.amount_due_cents,
        mrr_cents=case.mrr_cents,
        failed_at=case.failed_at,
        status=new_state,
        csm_task_id=case.csm_task_id,
        recovered_at=case.recovered_at,
        audit_trail=new_audit_trail,
    )
    return updated


def _build_sample_cases(now: datetime) -> list[DunningCase]:
    """Build 4 hardcoded sample cases at different points in the cadence."""
    return [
        # 1. Fresh failure, still within the Day 0-3 Smart Retry window.
        DunningCase(
            dunning_case_id="dc_20260630_00841_01",
            invoice_id="in_1PdXk82eZvKYlo2CQb6mZzZa",
            customer_id="cus_QwErTyUiOpAsDf",
            plan_tier=PlanTier.MID_MARKET,
            decline_reason=DeclineReason.INSUFFICIENT_FUNDS,
            amount_due_cents=49_900,
            mrr_cents=89_000,
            failed_at=now - timedelta(hours=6),
        ),
        # 2. At Day 3, expired card, SMB tier -> Day 3 email fires.
        DunningCase(
            dunning_case_id="dc_20260627_01192_01",
            invoice_id="in_2QeYl93fAwLZmp3DRc7nAaBb",
            customer_id="cus_ZxCvBnMaSdFg",
            plan_tier=PlanTier.SMB,
            decline_reason=DeclineReason.EXPIRED_CARD,
            amount_due_cents=9_900,
            mrr_cents=39_000,
            failed_at=now - timedelta(days=3, hours=1),
        ),
        # 3. At Day 7, Enterprise tier, high-value MRR -> CSM task + escalation.
        DunningCase(
            dunning_case_id="dc_20260623_00512_01",
            invoice_id="in_3RfZm04gBxMZnq4ESd8oBbCc",
            customer_id="cus_PoIuYtReWq12",
            plan_tier=PlanTier.ENTERPRISE,
            decline_reason=DeclineReason.CARD_DECLINED,
            amount_due_cents=420_000,
            mrr_cents=1_850_000,
            failed_at=now - timedelta(days=7, hours=2),
            csm_task_id="task_close_88213",
        ),
        # 4. Past Day 14, Mid-Market, unrecovered -> downgrade/suspension.
        DunningCase(
            dunning_case_id="dc_20260615_00329_01",
            invoice_id="in_4SgAn15hCyNAor5FTe9pCcDd",
            customer_id="cus_LkJhGfDsAqWe",
            plan_tier=PlanTier.MID_MARKET,
            decline_reason=DeclineReason.CARD_DECLINED,
            amount_due_cents=129_900,
            mrr_cents=210_000,
            failed_at=now - timedelta(days=16),
        ),
    ]


if __name__ == "__main__":
    NOW = datetime(2026, 6, 30, 12, 0, 0)

    print(f"Dunning state machine self-test — evaluated at {NOW.isoformat()}")
    print("=" * 78)

    for sample_case in _build_sample_cases(NOW):
        result_state, result_action = determine_state_and_action(sample_case, NOW)
        advanced = advance_case(sample_case, NOW)

        elapsed_days = (NOW - sample_case.failed_at).days
        print(f"Case: {sample_case.dunning_case_id}")
        print(f"  Plan tier:        {sample_case.plan_tier.value}")
        print(f"  Decline reason:   {sample_case.decline_reason.value}")
        print(f"  MRR:              ${sample_case.mrr_cents / 100:,.2f}/mo "
              f"(high_value={is_high_value(sample_case)})")
        print(f"  Failed at:        {sample_case.failed_at.isoformat()} "
              f"(~{elapsed_days} days ago)")
        print(f"  Determined state: {result_state.value}")
        print(f"  Determined action: {result_action}")
        print(f"  Audit entry appended: {advanced.audit_trail[-1]}")
        print("-" * 78)

    print("Self-test complete: 4/4 sample cases evaluated successfully.")
