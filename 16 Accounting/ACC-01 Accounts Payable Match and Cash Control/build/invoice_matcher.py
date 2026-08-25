#!/usr/bin/env python3
"""Deterministic three-way AP matcher with financial-control gates."""
from dataclasses import asdict, dataclass
from hashlib import sha256
import json

@dataclass(frozen=True)
class Invoice:
    supplier_id: str; invoice_number: str; currency: str; quantity: float
    unit_price: float; tax: float; total: float; bank_details_changed: bool = False

@dataclass(frozen=True)
class PurchaseEvidence:
    po_quantity: float; po_unit_price: float; received_quantity: float; expected_tax: float

def evaluate(i: Invoice, e: PurchaseEvidence, known_fingerprints: set[str] | None = None) -> dict:
    fingerprint = sha256(f"{i.supplier_id}:{i.invoice_number}:{i.currency}:{i.total:.2f}".encode()).hexdigest()[:20]
    reasons = []
    if fingerprint in (known_fingerprints or set()): reasons.append("duplicate_invoice")
    if i.bank_details_changed: reasons.append("bank_details_changed")
    if i.quantity > e.received_quantity: reasons.append("quantity_exceeds_receipt")
    if abs(i.unit_price - e.po_unit_price) > max(2, e.po_unit_price * .02): reasons.append("unit_price_outside_tolerance")
    if abs(i.tax - e.expected_tax) > .01: reasons.append("tax_mismatch")
    expected = i.quantity * i.unit_price + i.tax
    if abs(i.total - expected) > .01: reasons.append("invoice_math_mismatch")
    blocked = {"duplicate_invoice", "bank_details_changed"} & set(reasons)
    action = "blocked" if blocked else ("exception_review" if reasons else "draft_payable")
    return {"fingerprint": fingerprint, "invoice": asdict(i), "decision": {"action": action, "reasons": reasons, "payment_release_allowed": False}}

if __name__ == "__main__":
    inv=Invoice("v1","INV-42","EUR",10,20,40,240); ev=PurchaseEvidence(10,20,10,40)
    print(json.dumps(evaluate(inv,ev), indent=2))
