#!/usr/bin/env python3
"""Canonical ad metrics and approval-only optimization recommendations."""

import json
import math
from dataclasses import asdict, dataclass
from decimal import Decimal
from hashlib import sha256


@dataclass(frozen=True)
class Snapshot:
    platform: str
    campaign_id: str
    spend: float
    revenue: float
    budget: float
    elapsed_ratio: float
    baseline_roas: float
    attribution_completeness: float


def _finite_number(value: object) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _hold(snapshot: dict, invalid_fields: list[str], reason: str) -> dict:
    return {
        "snapshot": snapshot,
        "analysis_version": "ad-review-v2",
        "idempotency_key": None,
        "invalid_fields": invalid_fields,
        "metrics": {"roas": None, "pacing": None},
        "decision": {
            "action": "data_quality_review",
            "reasons": [reason],
            "requires_approval": True,
            "automatic_budget_change_allowed": False,
        },
    }


def analyze(s: Snapshot) -> dict:
    raw = asdict(s)
    identity_fields = {"platform", "campaign_id"}
    invalid_fields = [
        name
        for name, value in raw.items()
        if name in identity_fields and (not isinstance(value, str) or not value.strip())
    ]
    # Sanitize before returning invalid evidence: no NaN/Infinity or arbitrary
    # object can leak into a JSON snapshot that a downstream service persists.
    snapshot = {
        name: value if isinstance(value, str) else None
        for name, value in raw.items()
        if name in identity_fields
    }
    for name, value in raw.items():
        if name in identity_fields:
            continue
        finite = _finite_number(value)
        snapshot[name] = value if finite else None
        if (
            not finite
            or value < 0
            or (name in {"budget", "elapsed_ratio"} and value == 0)
            or (name in {"elapsed_ratio", "attribution_completeness"} and value > 1)
        ):
            invalid_fields.append(name)
    if invalid_fields:
        return _hold(snapshot, invalid_fields, "invalid_snapshot")

    denominator = s.budget * s.elapsed_ratio
    if not _finite_number(denominator) or denominator <= 0:
        return _hold(snapshot, [], "unrepresentable_derived_metric")
    roas = s.revenue / s.spend if s.spend else None
    pacing = s.spend / denominator
    if not _finite_number(pacing) or (roas is not None and not _finite_number(roas)):
        return _hold(snapshot, [], "unrepresentable_derived_metric")
    reasons = []
    if s.attribution_completeness < 0.8:
        action = "data_quality_review"
        reasons.append("attribution_incomplete")
    else:
        if pacing is not None and pacing < 0.75:
            reasons.append("under_pacing")
        if roas is not None and roas < s.baseline_roas * 0.7:
            reasons.append("roas_below_baseline")
        action = "optimization_review" if reasons else "monitor"
    canonical = {}
    for name, value in snapshot.items():
        if name in identity_fields:
            canonical[name] = value
        else:
            text = format(Decimal(str(value)), "f")
            canonical[name] = text.rstrip("0").rstrip(".") if "." in text else text
            if value == 0:
                canonical[name] = "0"
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), allow_nan=False)
    key = "ad-v2-" + sha256(encoded.encode()).hexdigest()[:32]
    return {
        "snapshot": snapshot,
        "analysis_version": "ad-review-v2",
        "idempotency_key": key,
        "invalid_fields": [],
        "metrics": {"roas": roas, "pacing": pacing},
        "decision": {
            "action": action,
            "reasons": reasons,
            "requires_approval": action != "monitor",
            "automatic_budget_change_allowed": False,
        },
    }


if __name__ == "__main__":
    rows = [
        Snapshot("meta", "c1", 250, 300, 1000, 0.5, 2.0, 0.96),
        Snapshot("google", "c2", 400, 900, 800, 0.5, 2.1, 0.55),
    ]
    print(json.dumps([analyze(x) for x in rows], indent=2))
