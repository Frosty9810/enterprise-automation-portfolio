#!/usr/bin/env python3
"""Consent-gated, explainable candidate/job skills matching."""
from dataclasses import dataclass
from datetime import date
import json

@dataclass(frozen=True)
class Candidate:
    candidate_id: str; skills: tuple[str, ...]; consent_expires: date | None

@dataclass(frozen=True)
class Job:
    job_id: str; required: tuple[str, ...]; preferred: tuple[str, ...]

def match(candidate: Candidate, job: Job, today: date | None = None) -> dict:
    today = today or date.today()
    if candidate.consent_expires is None or candidate.consent_expires < today:
        return {"candidate_id": candidate.candidate_id, "job_id": job.job_id, "status": "blocked", "reasons": ["missing_or_expired_consent"]}
    evidence = {x.lower() for x in candidate.skills}
    matched_required = [x for x in job.required if x.lower() in evidence]
    missing_required = [x for x in job.required if x.lower() not in evidence]
    matched_preferred = [x for x in job.preferred if x.lower() in evidence]
    score = round(100 * ((2 * len(matched_required) + len(matched_preferred)) / max(1, 2 * len(job.required) + len(job.preferred))), 1)
    return {"candidate_id": candidate.candidate_id, "job_id": job.job_id, "status": "recruiter_review", "score": score, "evidence": {"matched_required": matched_required, "missing_required": missing_required, "matched_preferred": matched_preferred}, "automatic_rejection_allowed": False}

if __name__ == "__main__":
    c = Candidate("cand-1", ("Python","SQL","n8n"), date(2027,1,1)); j = Job("job-1", ("Python","SQL"), ("Shopify","n8n"))
    print(json.dumps(match(c,j,date(2026,8,25)), indent=2))
