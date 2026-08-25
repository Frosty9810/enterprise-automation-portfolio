#!/usr/bin/env python3
"""PII-safe, deterministic-first support queue and SLA router."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import re


PII_PATTERNS = (
    (re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"), "[EMAIL]"),
    (re.compile(r"\+?\d[\d\s().-]{7,}\d"), "[PHONE_OR_NUMBER]"),
    (re.compile(r"\b(?:\d[ -]*?){13,16}\b"), "[PAYMENT_NUMBER]"),
)


@dataclass(frozen=True)
class Ticket:
    event_id: str
    market: str
    message: str
    order_value_eur: int
    customer_tier: str = "standard"


def redact(text: str) -> str:
    redacted = text
    for pattern, replacement in PII_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def route(ticket: Ticket, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    safe_text = redact(ticket.message)
    text = safe_text.lower()
    reasons: list[str] = []

    if any(term in text for term in ("chargeback", "fraud", "unsafe", "injury")):
        queue, priority, hours = "risk_escalation", "urgent", 1
        reasons.append("risk_policy_match")
    elif any(term in text for term in ("delete my data", "privacy request", "gdpr")):
        queue, priority, hours = "privacy", "urgent", 4
        reasons.append("privacy_rights_request")
    elif any(term in text for term in ("cancel", "change address")):
        queue, priority, hours = "order_changes", "high", 2
        reasons.append("time_sensitive_order_change")
    elif any(term in text for term in ("where is", "tracking", "late delivery")):
        queue, priority, hours = "delivery", "normal", 12
        reasons.append("delivery_intent")
    else:
        queue, priority, hours = "general_review", "normal", 24
        reasons.append("safe_fallback")

    if ticket.order_value_eur >= 500 or ticket.customer_tier == "vip":
        hours = max(1, hours // 2)
        reasons.append("high_value_sla_adjustment")

    return {
        "event_key": sha256(ticket.event_id.encode()).hexdigest()[:20],
        "ticket": {**asdict(ticket), "message": "[REDACTED_AT_SOURCE]"},
        "model_safe_text": safe_text,
        "decision": {
            "queue": queue,
            "priority": priority,
            "respond_by": (now + timedelta(hours=hours)).isoformat(),
            "reasons": reasons,
        },
    }


def demo() -> list[dict]:
    fixed_now = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)
    tickets = [
        Ticket("evt-1", "DE", "Cancel order 991. Email me at person@example.com", 75),
        Ticket("evt-2", "US", "I will file a chargeback. Call +1 415 555 0184", 900, "vip"),
        Ticket("evt-3", "FR", "Where is my parcel? Tracking has not moved.", 45),
    ]
    return [route(ticket, fixed_now) for ticket in tickets]


if __name__ == "__main__":
    print(json.dumps(demo(), indent=2))
