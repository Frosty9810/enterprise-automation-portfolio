#!/usr/bin/env python3
"""Privacy-minimized, evidence-grounded support QA reference engine."""
from dataclasses import dataclass
import json, re

@dataclass(frozen=True)
class Evaluation:
    ticket_id: str; answer: str; approved_knowledge: str; confidence: float

def redact(text: str) -> str:
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[EMAIL]", text)
    return re.sub(r"\b(?:\d[ -]*?){13,16}\b", "[PAYMENT_NUMBER]", text)

def evaluate(e: Evaluation) -> dict:
    answer = redact(e.answer)
    knowledge = {w for w in re.findall(r"[a-z]{4,}", e.approved_knowledge.lower())}
    claims = {w for w in re.findall(r"[a-z]{4,}", answer.lower())}
    overlap = len(claims & knowledge) / max(1, len(claims))
    reasons = []
    if overlap < .35: reasons.append("answer_not_sufficiently_grounded")
    if e.confidence < .75: reasons.append("low_evaluator_confidence")
    action = "human_qa" if reasons else "pass"
    return {"ticket_id": e.ticket_id, "redacted_answer": answer, "grounding_overlap": round(overlap,3), "decision": {"action": action, "reasons": reasons, "automatic_penalty_allowed": False}}

if __name__ == "__main__":
    e=Evaluation("t1","Email me at a@b.com. Refunds are available within 30 days.","Refunds are available within 30 days of delivery.",.91)
    print(json.dumps(evaluate(e), indent=2))
