#!/usr/bin/env python3
"""Three-way inventory reconciliation with field-level source authority."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json


@dataclass(frozen=True)
class InventoryRecord:
    sku: str
    location: str
    shopify_available: int
    warehouse_on_hand: int
    erp_reserved: int
    safety_buffer: int
    warehouse_version: str
    erp_version: str
    age_minutes: int
    mapped: bool = True


def reconcile(record: InventoryRecord) -> dict:
    reasons: list[str] = []
    expected = record.warehouse_on_hand - record.erp_reserved - record.safety_buffer
    key_raw = (
        f"{record.sku}:{record.location}:{record.warehouse_version}:"
        f"{record.erp_version}:{expected}"
    )
    correction_key = sha256(key_raw.encode()).hexdigest()[:20]

    if not record.mapped:
        action = "quarantine"
        reasons.append("missing_sku_mapping")
    elif record.age_minutes > 30:
        action = "quarantine"
        reasons.append("authoritative_snapshot_stale")
    elif expected < 0:
        action = "quarantine"
        reasons.append("negative_sellable_quantity")
    elif abs(expected - record.shopify_available) > 100:
        action = "quarantine"
        reasons.append("delta_exceeds_safety_limit")
    elif expected == record.shopify_available:
        action = "aligned"
        reasons.append("no_change_required")
    else:
        action = "safe_correction"
        reasons.append("shopify_differs_from_authoritative_derivation")

    return {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "correction_key": correction_key,
        "record": asdict(record),
        "expected_sellable": expected,
        "decision": {"action": action, "reasons": reasons},
    }


def demo() -> list[dict]:
    records = [
        InventoryRecord("FRAME-01", "EU", 12, 20, 5, 3, "w10", "e20", 4),
        InventoryRecord("MUG-02", "US", 35, 51, 6, 5, "w11", "e21", 6),
        InventoryRecord("POSTER-03", "UK", 4, 200, 0, 2, "w12", "e22", 5),
        InventoryRecord("UNKNOWN", "EU", 0, 8, 0, 1, "w13", "e23", 2, False),
    ]
    return [reconcile(record) for record in records]


if __name__ == "__main__":
    print(json.dumps(demo(), indent=2))
