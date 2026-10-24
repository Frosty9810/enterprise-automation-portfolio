#!/usr/bin/env python3
"""Deterministic reference policy engine for governed product localization."""

from __future__ import annotations

import json
import re
import sys
from dataclasses import asdict, dataclass
from hashlib import sha256

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
    for entity in (product, candidate):
        for field in ("locale", "title", "description", "material", "dimensions_cm"):
            value = getattr(entity, field)
            if not isinstance(value, str) or not value.strip() or len(value) > 5000:
                raise ValueError(f"{field} must be nonempty text of at most 5000 characters")
        if type(entity.warranty_months) is not int or not 0 <= entity.warranty_months <= 1200:
            raise ValueError("warranty_months must be a whole number between 0 and 1200")
        if not re.fullmatch(r"[a-z]{2}-[A-Z]{2}", entity.locale):
            raise ValueError("locale must use the language-REGION format")
    if type(product.revision) is not int or not 1 <= product.revision <= 9007199254740991:
        raise ValueError("revision must be a positive safe integer")
    for field in ("product_id", "sku"):
        value = getattr(product, field)
        if not isinstance(value, str) or not value.strip() or len(value) > 200:
            raise ValueError(f"{field} must be nonempty text of at most 200 characters")
    reasons: list[str] = []
    protected = {
        "material": (product.material, candidate.material),
        "dimensions_cm": (product.dimensions_cm, candidate.dimensions_cm),
        "warranty_months": (product.warranty_months, candidate.warranty_months),
    }
    for field, (source, localized) in protected.items():
        if source != localized:
            reasons.append(f"protected_fact_changed:{field}")

    source_text = f"{product.title} {product.description}"
    candidate_text = f"{candidate.title} {candidate.description}"
    source_numbers = set(re.findall(r"\d+(?:[.,]\d+)?", source_text))
    candidate_numbers = set(re.findall(r"\d+(?:[.,]\d+)?", candidate_text))
    if source_numbers - candidate_numbers:
        reasons.append("numeric_fact_omitted")
    if candidate_numbers - source_numbers:
        reasons.append("numeric_fact_introduced")

    text = f"{candidate.title} {candidate.description}".lower()
    for claim in FORBIDDEN_CLAIMS:
        if claim in text and claim not in source_text.lower():
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
        "gid://shopify/Product/1001",
        7,
        "FRAME-A4-OAK",
        "en-US",
        "Solid oak A4 frame",
        "A 21 x 29 cm frame with a 24 month warranty.",
        "FSC-certified oak",
        "21 x 29",
        24,
    )
    safe = Candidate(
        "es-ES",
        "Marco A4 de roble macizo",
        "Marco de 21 x 29 cm con una garantía de 24 meses.",
        "FSC-certified oak",
        "21 x 29",
        24,
    )
    unsafe = Candidate(
        "de-DE",
        "Klimaneutraler A4-Rahmen",
        "Ein 20 x 30 cm Rahmen; carbon neutral and guaranteed results.",
        "oak veneer",
        "20 x 30",
        12,
    )
    return [evaluate(source, safe), evaluate(source, unsafe)]


if __name__ == "__main__":
    if "--stdin" in sys.argv:
        try:
            payload = json.loads(sys.stdin.read(32769))
            result = evaluate(Product(**payload["source"]), Candidate(**payload["candidate"]))
        except (ValueError, TypeError, KeyError) as error:
            print(json.dumps({"error": str(error)}), file=sys.stderr)
            raise SystemExit(2) from error
    else:
        result = demo()
    print(json.dumps(result, indent=2, ensure_ascii=False))
