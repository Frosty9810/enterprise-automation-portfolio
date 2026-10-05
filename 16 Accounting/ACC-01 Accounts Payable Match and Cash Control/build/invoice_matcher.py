#!/usr/bin/env python3
"""Deterministic three-way AP matcher with financial-control gates."""

import json
import sys
from dataclasses import asdict, dataclass
from decimal import Decimal
from hashlib import sha256
from math import isfinite


@dataclass(frozen=True)
class Invoice:
    supplier_id: str
    invoice_number: str
    currency: str
    quantity: float
    unit_price: float
    tax: float
    total: float
    bank_details_changed: bool = False


@dataclass(frozen=True)
class PurchaseEvidence:
    po_quantity: float
    po_unit_price: float
    received_quantity: float
    expected_tax: float


def evaluate(i: Invoice, e: PurchaseEvidence, known_fingerprints: set[str] | None = None) -> dict:
    for name in ("supplier_id", "invoice_number", "currency"):
        value = getattr(i, name)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{name} must be nonempty text")
    if (
        len(i.currency) != 3
        or not i.currency.isascii()
        or not i.currency.isalpha()
        or not i.currency.isupper()
    ):
        raise ValueError("currency must be a three-letter uppercase code")
    if type(i.bank_details_changed) is not bool:
        raise ValueError("bank_details_changed must be boolean")
    for record, names in (
        (i, ("quantity", "unit_price", "tax", "total")),
        (e, ("po_quantity", "po_unit_price", "received_quantity", "expected_tax")),
    ):
        for name in names:
            value = getattr(record, name)
            if type(value) not in (int, float) or not isfinite(value) or value < 0:
                raise ValueError(f"{name} must be a finite nonnegative number")
    # Identity excludes mutable amount and currency: editing them cannot evade a duplicate hold.
    fingerprint = sha256(
        json.dumps([i.supplier_id.strip(), i.invoice_number.strip()]).encode()
    ).hexdigest()[:20]
    reasons = []
    if fingerprint in (known_fingerprints or set()):
        reasons.append("duplicate_invoice")
    if i.bank_details_changed:
        reasons.append("bank_details_changed")
    if i.quantity > e.received_quantity:
        reasons.append("quantity_exceeds_receipt")
    if i.quantity > e.po_quantity:
        reasons.append("quantity_exceeds_purchase_order")

    def number(value):
        return Decimal(str(value))

    if abs(number(i.unit_price) - number(e.po_unit_price)) > max(
        Decimal(2), number(e.po_unit_price) * Decimal("0.02")
    ):
        reasons.append("unit_price_outside_tolerance")
    if abs(number(i.tax) - number(e.expected_tax)) > Decimal("0.01"):
        reasons.append("tax_mismatch")
    expected = number(i.quantity) * number(i.unit_price) + number(i.tax)
    if abs(number(i.total) - expected) > Decimal("0.01"):
        reasons.append("invoice_math_mismatch")
    blocked = {"duplicate_invoice", "bank_details_changed"} & set(reasons)
    action = "blocked" if blocked else ("exception_review" if reasons else "draft_payable")
    return {
        "fingerprint": fingerprint,
        "invoice": asdict(i),
        "decision": {"action": action, "reasons": reasons, "payment_release_allowed": False},
    }


if __name__ == "__main__":
    if "--stdin" in sys.argv:
        payload = json.load(sys.stdin)
        print(
            json.dumps(
                evaluate(
                    Invoice(**payload["invoice"]),
                    PurchaseEvidence(**payload["purchase"]),
                    set(payload.get("knownFingerprints", [])),
                ),
                allow_nan=False,
            )
        )
    else:
        inv = Invoice("v1", "INV-42", "EUR", 10, 20, 40, 240)
        ev = PurchaseEvidence(10, 20, 10, 40)
        print(json.dumps(evaluate(inv, ev), indent=2))
