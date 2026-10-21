#!/usr/bin/env python3
"""Consent-gated, explainable candidate/job skills matching."""

import json
from dataclasses import dataclass
from datetime import UTC, date, datetime


@dataclass(frozen=True)
class Candidate:
    candidate_id: str
    skills: tuple[str, ...]
    consent_expires: date | None


@dataclass(frozen=True)
class Job:
    job_id: str
    required: tuple[str, ...]
    preferred: tuple[str, ...]


def _skill_labels(values: object, field: str) -> dict[str, str]:
    """Normalize declared labels once; preserve their first authored display form."""
    if not isinstance(values, (tuple, list)) or any(not isinstance(x, str) for x in values):
        raise ValueError(f"{field} must be a list or tuple of strings")
    result = {}
    for value in values:
        display = " ".join(value.split())
        if display:
            result.setdefault(display.casefold(), display)
    return result


def match(candidate: Candidate, job: Job, today: date | None = None) -> dict:
    today = datetime.now(UTC).date() if today is None else today
    if type(today) is not date:
        raise ValueError("today must be a calendar date")
    for value in (candidate.candidate_id, job.job_id):
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Candidate and job identifiers must be nonblank strings")
    authority = {"automatic_rejection_allowed": False, "automatic_selection_allowed": False}
    invalid_consent = (
        candidate.consent_expires is not None and type(candidate.consent_expires) is not date
    )
    if invalid_consent or candidate.consent_expires is None or candidate.consent_expires < today:
        return {
            "candidate_id": candidate.candidate_id,
            "job_id": job.job_id,
            "status": "blocked",
            "reasons": [
                "invalid_consent_date" if invalid_consent else "missing_or_expired_consent"
            ],
            **authority,
        }
    evidence = _skill_labels(candidate.skills, "candidate.skills")
    required = _skill_labels(job.required, "job.required")
    preferred = {
        key: value
        for key, value in _skill_labels(job.preferred, "job.preferred").items()
        if key not in required
    }
    matched_required = [value for key, value in required.items() if key in evidence]
    missing_required = [value for key, value in required.items() if key not in evidence]
    matched_preferred = [value for key, value in preferred.items() if key in evidence]
    total_weight = 2 * len(required) + len(preferred)
    score = (
        round(
            100 * ((2 * len(matched_required) + len(matched_preferred)) / total_weight),
            1,
        )
        if total_weight
        else None
    )
    return {
        "candidate_id": candidate.candidate_id,
        "job_id": job.job_id,
        "status": "recruiter_review",
        "score": score,
        "score_method": "normalized_exact_skill_overlap_v2",
        "reasons": [] if total_weight else ["no_evaluable_skill_criteria"],
        "evidence": {
            "matched_required": matched_required,
            "missing_required": missing_required,
            "matched_preferred": matched_preferred,
        },
        **authority,
    }


if __name__ == "__main__":
    c = Candidate("cand-1", ("Python", "SQL", "n8n"), date(2027, 1, 1))
    j = Job("job-1", ("Python", "SQL"), ("Shopify", "n8n"))
    print(json.dumps(match(c, j, date(2026, 8, 25)), indent=2))
