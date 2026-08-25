#!/usr/bin/env python3
"""deadline_engine.py — RE-02 Transaction Coordination & Compliance Automation.

Reference implementation of the deadline calculation, notification-tier, and
escalation logic described in SOP RE-02 Section 14 ("Automation Logic") and
Section 22 ("Notifications"). This module is stdlib-only (datetime) so it can
run anywhere with zero external dependencies or live credentials, and is the
same logic a nightly n8n Code node (see build/n8n-workflow.json) would run
against Postgres-backed transaction rows in a live deployment.

Run directly to execute a self-test against sample transactions:

    python3 deadline_engine.py
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Optional


class TransactionType(str, Enum):
    """Enumerated transaction types recognized by the workflow (SOP Section 16)."""

    FINANCED = "financed"
    CASH = "cash"
    SHORT_SALE = "short_sale"


class DeadlineStatus(str, Enum):
    """Lifecycle status of a single milestone deadline."""

    PENDING = "pending"
    COMPLETE = "complete"
    MISSED = "missed"


# Illustrative brokerage-wide default offsets, in calendar days from the
# contract execution date. Configurable per office via a `deadline_offsets`
# override table in a live deployment (SOP Section 20); these are the
# defaults absent such an override.
DEFAULT_OFFSETS_DAYS: dict[str, int] = {
    "earnest_money": 3,
    "inspection_contingency": 10,
    "financing_contingency": 21,
    "closing": 30,
}

# Short-sale transactions do not carry a financing contingency milestone in
# this checklist model; lender approval is tracked separately by a
# short-sale specialist outside this deadline set (SOP Section 14/39).
SHORT_SALE_EXCLUDED_MILESTONES: set[str] = {"financing_contingency"}

# Notification tiers evaluated nightly against every open deadline
# (SOP Section 14 notification_windows(), Section 22 Notifications table).
NOTIFICATION_TIER_OFFSETS: dict[int, str] = {3: "T-3", 1: "T-1", 0: "T-0"}


@dataclass
class Deadline:
    """A single contractual milestone deadline derived from the contract date."""

    milestone: str
    due_date: date
    status: DeadlineStatus = DeadlineStatus.PENDING
    completed_at: Optional[datetime] = None


@dataclass
class Transaction:
    """A minimal in-memory transaction record for self-test purposes.

    Mirrors the shape of the `transactions` row in schema.sql, trimmed to the
    fields this module's functions actually consume.
    """

    transaction_id: str
    property_address: str
    transaction_type: str
    contract_execution_date: date
    office_code: str = "HV-04"
    deadlines: list[Deadline] = field(default_factory=list)


def select_template_id(transaction_type: str) -> str:
    """Map a validated transaction_type value to a Dotloop template ID.

    Raises:
        ValueError: if transaction_type is outside the enumerated set, so the
            calling scenario routes to the TC exception queue rather than
            guessing (SOP Section 16, Section 21).
    """
    mapping = {
        TransactionType.FINANCED: "tmpl_financed_purchase_v3",
        TransactionType.CASH: "tmpl_cash_purchase_v2",
        TransactionType.SHORT_SALE: "tmpl_short_sale_purchase_v4",
    }
    try:
        return mapping[TransactionType(transaction_type)]
    except ValueError as exc:
        raise ValueError(
            f"Unrecognized transaction_type '{transaction_type}'; "
            "routing to TC exception queue."
        ) from exc


def calculate_deadlines(
    contract_execution_date: date,
    transaction_type: str,
    office_offsets: Optional[dict[str, int]] = None,
) -> list[Deadline]:
    """Derive the deadline schedule from the contract execution date.

    Args:
        contract_execution_date: the date the contract was executed (not the
            date the deal entered the CRM — SOP Business Requirement BR-3).
        transaction_type: one of "financed", "cash", "short_sale".
        office_offsets: optional per-office override of DEFAULT_OFFSETS_DAYS
            (SOP Section 20, manual override of deadline offsets). Must be
            validated by the caller for the ordering constraint described in
            SOP Section 16 before being passed in; this function trusts its
            input.

    Returns:
        A list of Deadline objects, one per applicable milestone, excluding
        any milestone in SHORT_SALE_EXCLUDED_MILESTONES when transaction_type
        is "short_sale".
    """
    offsets = office_offsets or DEFAULT_OFFSETS_DAYS
    excluded = (
        SHORT_SALE_EXCLUDED_MILESTONES
        if transaction_type == TransactionType.SHORT_SALE
        else set()
    )
    return [
        Deadline(
            milestone=name,
            due_date=contract_execution_date + timedelta(days=days),
        )
        for name, days in offsets.items()
        if name not in excluded
    ]


def validate_office_offsets(offsets: dict[str, int]) -> None:
    """Validate a candidate office-level offset override (SOP Section 16).

    Enforces: all offsets positive, and
    earnest_money < inspection_contingency < financing_contingency < closing
    (financing_contingency is only checked if present, to accommodate
    short-sale offset sets that omit it).

    Raises:
        ValueError: if any offset is non-positive or the ordering constraint
            is violated.
    """
    for name, days in offsets.items():
        if days <= 0:
            raise ValueError(f"Offset for '{name}' must be a positive integer, got {days}")

    ordered_keys = ["earnest_money", "inspection_contingency", "financing_contingency", "closing"]
    present = [k for k in ordered_keys if k in offsets]
    values = [offsets[k] for k in present]
    if values != sorted(values):
        raise ValueError(
            "Offset ordering constraint violated: expected "
            "earnest_money < inspection_contingency < financing_contingency < closing "
            f"for present milestones {present}, got {values}"
        )


def notification_tier(deadline: Deadline, today: date) -> Optional[str]:
    """Return which notification window (if any) 'today' falls into for a deadline.

    Mirrors SOP Section 14 notification_windows(). Only pending deadlines are
    evaluated — a deadline already marked complete or missed does not fire a
    fresh notification.

    Returns:
        "T-3", "T-1", "T-0", or None.
    """
    if deadline.status != DeadlineStatus.PENDING:
        return None
    delta = (deadline.due_date - today).days
    return NOTIFICATION_TIER_OFFSETS.get(delta)


def evaluate_escalation(deadline: Deadline, today: date) -> bool:
    """Flag escalation when a T-0 deadline has passed without completion.

    Per SOP Section 14 (step 8/9) and Section 22: if a deadline's due_date is
    today or earlier and it has not been marked complete, it is past its T-0
    window without resolution and must escalate to the managing broker.

    Returns:
        True if the deadline should trigger a broker escalation, else False.
    """
    if deadline.status == DeadlineStatus.COMPLETE:
        return False
    return deadline.due_date <= today


def mark_complete(deadline: Deadline, completed_at: Optional[datetime] = None) -> None:
    """Mark a deadline complete, recording the completion timestamp."""
    deadline.status = DeadlineStatus.COMPLETE
    deadline.completed_at = completed_at or datetime.utcnow()


def build_transaction_report(transaction: Transaction, today: date) -> list[str]:
    """Build a human-readable report of a transaction's deadline state.

    Used by the self-test block below; a real deployment would instead write
    these evaluations into the Postgres `deadlines` / `escalations` tables
    (see schema.sql) via the nightly n8n Code + Postgres nodes.
    """
    lines: list[str] = []
    lines.append(
        f"Transaction {transaction.transaction_id} — {transaction.property_address} "
        f"[{transaction.transaction_type}] (office {transaction.office_code})"
    )
    lines.append(f"  Contract executed: {transaction.contract_execution_date.isoformat()}")

    for deadline in transaction.deadlines:
        tier = notification_tier(deadline, today)
        escalate = evaluate_escalation(deadline, today)
        delta_days = (deadline.due_date - today).days

        status_bits = [f"status={deadline.status.value}"]
        if tier:
            status_bits.append(f"notify={tier}")
        if escalate:
            status_bits.append("ESCALATE-TO-BROKER")
        if deadline.status == DeadlineStatus.COMPLETE and deadline.completed_at:
            status_bits.append(f"completed_at={deadline.completed_at.isoformat()}")

        lines.append(
            f"    - {deadline.milestone:<24} due {deadline.due_date.isoformat()} "
            f"(T{delta_days:+d}d) :: {', '.join(status_bits)}"
        )

    return lines


def _build_sample_transactions(today: date) -> list[Transaction]:
    """Construct 2-3 hardcoded sample transactions for the self-test report.

    - A financed purchase with deadlines calculated from a recent contract
      date, all still pending (normal in-flight case).
    - A cash purchase, contract executed today, to show near-term T-3/T-1/T-0
      windows computed cleanly (cash skips financing_contingency naturally
      since it's not excluded for "cash" — Harborview's exclusion rule only
      applies to short_sale — but a cash deal typically has no lender so we
      still compute the standard set for illustration).
    - A short-sale purchase, deliberately overdue: contract executed well in
      the past with the earnest_money deadline still pending, to exercise
      the escalation path.
    """
    transactions: list[Transaction] = []

    # 1. Financed purchase — in flight, contract executed 5 days ago.
    financed_contract_date = today - timedelta(days=5)
    financed = Transaction(
        transaction_id="txn_8a41f0c2",
        property_address="412 Cedarwood Ln, Beaverhaven, OR 97006",
        transaction_type=TransactionType.FINANCED.value,
        contract_execution_date=financed_contract_date,
        office_code="HV-04",
    )
    financed.deadlines = calculate_deadlines(financed_contract_date, financed.transaction_type)
    # Earnest money (T+3 from 5 days ago = 2 days overdue) already collected.
    for d in financed.deadlines:
        if d.milestone == "earnest_money":
            mark_complete(d, completed_at=datetime.utcnow() - timedelta(days=1))
    transactions.append(financed)

    # 2. Cash purchase — contract executed today, so T-3 windows land soon;
    #    used to demonstrate deadline math starting from "today".
    cash_contract_date = today
    cash = Transaction(
        transaction_id="txn_c2b19e77",
        property_address="88 Harbor Vista Ct, Portmere, OR 97219",
        transaction_type=TransactionType.CASH.value,
        contract_execution_date=cash_contract_date,
        office_code="HV-01",
    )
    cash.deadlines = calculate_deadlines(cash_contract_date, cash.transaction_type)
    transactions.append(cash)

    # 3. Short-sale purchase — deliberately overdue: contract executed 15
    #    days ago, so the T+3 earnest_money and T+10 inspection_contingency
    #    deadlines have both passed without completion, exercising the
    #    escalation path. financing_contingency is excluded per the
    #    short-sale rule.
    short_sale_contract_date = today - timedelta(days=15)
    short_sale = Transaction(
        transaction_id="txn_f01d55aa",
        property_address="27 Millrace Rd, Beaverhaven, OR 97006",
        transaction_type=TransactionType.SHORT_SALE.value,
        contract_execution_date=short_sale_contract_date,
        office_code="HV-04",
    )
    short_sale.deadlines = calculate_deadlines(
        short_sale_contract_date, short_sale.transaction_type
    )
    # Nothing marked complete — both earnest_money (T+3) and
    # inspection_contingency (T+10) are now overdue as of `today`.
    transactions.append(short_sale)

    return transactions


def main() -> None:
    """Run the self-test: build sample transactions and print a report."""
    today = date.today()

    print("=" * 78)
    print("RE-02 Deadline Engine — Self-Test Report")
    print(f"Evaluated as of: {today.isoformat()}")
    print("=" * 78)

    transactions = _build_sample_transactions(today)

    total_escalations = 0
    total_notifications = 0

    for transaction in transactions:
        print()
        for line in build_transaction_report(transaction, today):
            print(line)

        for deadline in transaction.deadlines:
            if evaluate_escalation(deadline, today):
                total_escalations += 1
            if notification_tier(deadline, today):
                total_notifications += 1

    print()
    print("-" * 78)
    print(f"Summary: {len(transactions)} transactions evaluated, "
          f"{total_notifications} notification(s) due, "
          f"{total_escalations} deadline(s) requiring broker escalation.")
    print("-" * 78)

    # Exercise select_template_id() and validate_office_offsets() as part of
    # the self-test so every public function in this module is demonstrated.
    print()
    print("Template selection check:")
    for t_type in ("financed", "cash", "short_sale"):
        print(f"  {t_type:<12} -> {select_template_id(t_type)}")

    try:
        select_template_id("reo")
    except ValueError as exc:
        print(f"  Invalid type correctly rejected: {exc}")

    print()
    print("Office offset override validation check:")
    try:
        validate_office_offsets({
            "earnest_money": 2,
            "inspection_contingency": 7,
            "financing_contingency": 18,
            "closing": 25,
        })
        print("  Valid override accepted (2 < 7 < 18 < 25).")
    except ValueError as exc:
        print(f"  Unexpected rejection: {exc}")

    try:
        validate_office_offsets({
            "earnest_money": 10,
            "inspection_contingency": 5,
            "closing": 25,
        })
    except ValueError as exc:
        print(f"  Invalid override correctly rejected: {exc}")


if __name__ == "__main__":
    main()
