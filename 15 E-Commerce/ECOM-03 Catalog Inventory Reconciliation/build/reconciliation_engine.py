#!/usr/bin/env python3
"""Three-way inventory reconciliation with field-level source authority."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from hashlib import sha256


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
    # Reject malformed intake before arithmetic, hashing or a correction proposal.
    for field in ("sku", "location", "warehouse_version", "erp_version"):
        value = getattr(record, field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field} must be a nonblank string")
    for field in ("shopify_available", "warehouse_on_hand", "erp_reserved", "safety_buffer"):
        value = getattr(record, field)
        if type(value) is not int or not 0 <= value <= 2**31 - 1:
            raise ValueError(f"{field} must be a nonnegative PostgreSQL INTEGER")
    if type(record.age_minutes) is not int or record.age_minutes < 0:
        raise ValueError("age_minutes must be a nonnegative integer")
    if type(record.mapped) is not bool:
        raise ValueError("mapped must be a boolean")
    reasons: list[str] = []
    expected = record.warehouse_on_hand - record.erp_reserved - record.safety_buffer
    if expected < -(2**31):
        raise ValueError("Derived sellable quantity must fit a PostgreSQL INTEGER")
    key_raw = json.dumps(
        [record.sku, record.location, record.warehouse_version, record.erp_version, expected],
        ensure_ascii=True,
        separators=(",", ":"),
    )
    correction_key = "inventory-v2-" + sha256(key_raw.encode("utf-8")).hexdigest()

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
        "evaluated_at": datetime.now(UTC).isoformat(),
        "correction_key": correction_key,
        "record": asdict(record),
        "expected_sellable": expected,
        "decision": {"action": action, "reasons": reasons},
        "automatic_write_allowed": False,
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
