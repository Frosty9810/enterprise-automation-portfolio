#!/usr/bin/env python3
"""Privacy-minimized, evidence-grounded support QA reference engine."""

import json
import math
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Evaluation:
    ticket_id: str
    answer: str
    approved_knowledge: str
    confidence: float


def redact(text: str) -> str:
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[EMAIL]", text)
    text = re.sub(r"\b(?:\d[ -]*?){13,16}\b", "[PAYMENT_NUMBER]", text)
    return re.sub(r"\+?\d[\d\s().-]{7,}\d", "[PHONE_OR_NUMBER]", text)


def _screen_text(text: str) -> str:
    # Placeholder overlap cannot establish that the original claims agree.
    return re.sub(r"\[(?:EMAIL|PAYMENT_NUMBER|PHONE_OR_NUMBER)\]", "", text).lower()


def _numeric_claims(text: str) -> set[str]:
    claims = re.findall(
        r"\b\d+(?:[.,]\d+)?(?:\s*(?:days?|months?|years?|hours?|weeks?|usd|eur|%))?",
        text,
    )
    return {re.sub(r"\s+", " ", claim).strip() for claim in claims}


def evaluate(e: Evaluation) -> dict:
    if not all(isinstance(value, str) for value in (e.ticket_id, e.answer, e.approved_knowledge)):
        raise ValueError("ticket_id, answer and approved_knowledge must be strings")
    answer = redact(e.answer)
    answer_text = _screen_text(answer)
    knowledge_text = _screen_text(redact(e.approved_knowledge))
    knowledge = set(re.findall(r"[a-z]{4,}", knowledge_text))
    claims = set(re.findall(r"[a-z]{4,}", answer_text))
    overlap = len(claims & knowledge) / max(1, len(claims))
    reasons = []
    if overlap < 0.35:
        reasons.append("answer_not_sufficiently_grounded")
    valid_confidence = (
        type(e.confidence) in (int, float)
        and 0 <= e.confidence <= 1
        and math.isfinite(e.confidence)
    )
    if not valid_confidence:
        reasons.append("invalid_evaluator_confidence")
    elif e.confidence < 0.75:
        reasons.append("low_evaluator_confidence")
    if _numeric_claims(answer_text) - _numeric_claims(knowledge_text):
        reasons.append("unsupported_numeric_claim")
    negations = {"no", "not", "never", "without", "cannot", "can't", "don't", "isn't", "won't"}
    answer_negations = set(re.findall(r"\b[a-z]+(?:'[a-z]+)?\b", answer_text)) & negations
    knowledge_negations = set(re.findall(r"\b[a-z]+(?:'[a-z]+)?\b", knowledge_text)) & negations
    if answer_negations != knowledge_negations:
        reasons.append("negation_requires_review")
    action = "human_qa" if reasons else "pass"
    return {
        "ticket_id": e.ticket_id,
        "redacted_answer": answer,
        "grounding_overlap": round(overlap, 3),
        "grounding_method": "lexical_screen_only",
        "decision": {
            "action": action,
            "reasons": reasons,
            "requires_semantic_review": True,
            "automatic_answer_send_allowed": False,
            "automatic_penalty_allowed": False,
        },
    }


if __name__ == "__main__":
    e = Evaluation(
        "t1",
        "Email me at a@b.com. Refunds are available within 30 days.",
        "Refunds are available within 30 days of delivery.",
        0.91,
    )
    print(json.dumps(evaluate(e), indent=2))
