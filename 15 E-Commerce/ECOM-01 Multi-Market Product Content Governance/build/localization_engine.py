#!/usr/bin/env python3
"""Deterministic reference policy engine for governed product localization."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
import re


FORBIDDEN_CLAIMS = ("cures", "carbon neutral", "clinically proven", "guaranteed results")


@dataclass(frozen=True)
class Product:
    product_id: str
    revision: int
    sku: str
    locale: str
    title: str
    description: str
    material: str
    dimensions_cm: str
    warranty_months: int


@dataclass(frozen=True)
class Candidate:
    locale: str
    title: str
    description: str
    material: str
    dimensions_cm: str
    warranty_months: int


def idempotency_key(product: Product, locale: str) -> str:
    raw = f"{product.product_id}:{product.revision}:{locale}"
    return sha256(raw.encode()).hexdigest()[:20]


def validate(product: Product, candidate: Candidate) -> dict:
    reasons: list[str] = []
    protected = {
        "material": (product.material, candidate.material),
        "dimensions_cm": (product.dimensions_cm, candidate.dimensions_cm),
        "warranty_months": (product.warranty_months, candidate.warranty_months),
    }
    for field, (source, localized) in protected.items():
        if source != localized:
            reasons.append(f"protected_fact_changed:{field}")

    source_numbers = set(re.findall(r"\d+(?:[.,]\d+)?", product.description))
    candidate_numbers = set(re.findall(r"\d+(?:[.,]\d+)?", candidate.description))
    if source_numbers - candidate_numbers:
        reasons.append("numeric_fact_omitted")

    text = f"{candidate.title} {candidate.description}".lower()
    for claim in FORBIDDEN_CLAIMS:
        if claim in text and claim not in product.description.lower():
            reasons.append(f"unsupported_claim:{claim}")

    if reasons:
        action = "blocked"
    elif candidate.locale not in {"en-US", "es-ES", "de-DE", "fr-FR"}:
        action = "human_review"
        reasons.append("locale_not_in_auto_publish_allowlist")
    else:
        action = "auto_publish"
    return {"action": action, "reasons": reasons}


def evaluate(product: Product, candidate: Candidate) -> dict:
    return {
        "idempotency_key": idempotency_key(product, candidate.locale),
        "product_id": product.product_id,
        "source_revision": product.revision,
        "candidate": asdict(candidate),
        "decision": validate(product, candidate),
    }


def demo() -> list[dict]:
    source = Product(
        "gid://shopify/Product/1001", 7, "FRAME-A4-OAK", "en-US",
        "Solid oak A4 frame", "A 21 x 29 cm frame with a 24 month warranty.",
        "FSC-certified oak", "21 x 29", 24,
    )
    safe = Candidate(
        "es-ES", "Marco A4 de roble macizo",
        "Marco de 21 x 29 cm con una garantía de 24 meses.",
        "FSC-certified oak", "21 x 29", 24,
    )
    unsafe = Candidate(
        "de-DE", "Klimaneutraler A4-Rahmen",
        "Ein 20 x 30 cm Rahmen; carbon neutral and guaranteed results.",
        "oak veneer", "20 x 30", 12,
    )
    return [evaluate(source, safe), evaluate(source, unsafe)]


if __name__ == "__main__":
    print(json.dumps(demo(), indent=2, ensure_ascii=False))
