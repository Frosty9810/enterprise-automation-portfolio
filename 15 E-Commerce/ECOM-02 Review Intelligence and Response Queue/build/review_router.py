#!/usr/bin/env python3
"""Rules-first ecommerce review triage with explainable decisions."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json


SAFETY_TERMS = ("fire", "hot", "burn", "injury", "smoke", "unsafe")
LEGAL_TERMS = ("lawyer", "lawsuit", "consumer authority", "chargeback")
DEFECT_TERMS = ("broken", "cracked", "missing", "damaged", "defect")


@dataclass(frozen=True)
class Review:
    review_id: str
    sku: str
    rating: int
    text: str
    verified_purchase: bool
    customer_lifetime_value: int = 0


def route(review: Review) -> dict:
    text = review.text.lower()
    reasons: list[str] = []
    if any(term in text for term in SAFETY_TERMS):
        queue, priority, sla_hours = "safety_escalation", "urgent", 1
        reasons.append("safety_language")
    elif any(term in text for term in LEGAL_TERMS):
        queue, priority, sla_hours = "legal_or_payments", "urgent", 2
        reasons.append("legal_or_chargeback_language")
    elif review.rating <= 2 or any(term in text for term in DEFECT_TERMS):
        queue, priority, sla_hours = "product_quality", "high", 8
        reasons.append("negative_or_defect_review")
    elif review.rating >= 4 and review.verified_purchase:
        queue, priority, sla_hours = "low_risk_response", "normal", 48
        reasons.append("positive_verified_review")
    else:
        queue, priority, sla_hours = "manual_review", "normal", 24
        reasons.append("ambiguous_review")

    auto_publish = queue == "low_risk_response" and review.customer_lifetime_value < 5000
    return {
        "event_key": sha256(review.review_id.encode()).hexdigest()[:20],
        "review": asdict(review),
        "decision": {
            "queue": queue,
            "priority": priority,
            "sla_hours": sla_hours,
            "auto_publish_allowed": auto_publish,
            "reasons": reasons,
        },
    }


def demo() -> list[dict]:
    reviews = [
        Review("rvw-100", "MUG-01", 5, "Beautiful print and fast delivery.", True, 120),
        Review("rvw-101", "LAMP-02", 1, "The battery became hot and smelled like smoke.", True, 80),
        Review("rvw-102", "FRAME-03", 2, "The corner arrived cracked.", True, 650),
    ]
    return [route(review) for review in reviews]


if __name__ == "__main__":
    print(json.dumps(demo(), indent=2))
