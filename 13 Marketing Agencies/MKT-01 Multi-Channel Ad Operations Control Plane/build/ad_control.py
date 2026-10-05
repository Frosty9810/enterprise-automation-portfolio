#!/usr/bin/env python3
"""Canonical ad metrics and approval-only optimization recommendations."""

import json
from dataclasses import asdict, dataclass
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


def analyze(s: Snapshot) -> dict:
    roas = s.revenue / s.spend if s.spend else None
    pacing = s.spend / (s.budget * s.elapsed_ratio) if s.budget and s.elapsed_ratio else None
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
    key = sha256(f"{s.platform}:{s.campaign_id}:{s.spend}:{s.revenue}".encode()).hexdigest()[:20]
    return {
        "snapshot": asdict(s),
        "idempotency_key": key,
        "metrics": {"roas": roas, "pacing": pacing},
        "decision": {
            "action": action,
            "reasons": reasons,
            "requires_approval": action == "optimization_review",
        },
    }


if __name__ == "__main__":
    rows = [
        Snapshot("meta", "c1", 250, 300, 1000, 0.5, 2.0, 0.96),
        Snapshot("google", "c2", 400, 900, 800, 0.5, 2.1, 0.55),
    ]
    print(json.dumps([analyze(x) for x in rows], indent=2))
