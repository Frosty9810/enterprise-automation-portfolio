# REC-01 — Candidate Consent, Matching & Interview Operations

**Flow:** `Application → consent check → resume normalization → skills evidence → explainable match → recruiter review → interview state machine → retention/deletion`  
**System:** The ATS owns candidate records; this service owns consent evidence, redacted feature vectors, score explanations, and workflow state.  
**Hard constraint:** Name, age, gender, photo, nationality, address, and other protected/proxy attributes are excluded from ranking.

## Technical core

The matcher scores required and preferred skills with explicit evidence and missing requirements. Consent scope and expiration are evaluated before parsing, matching, outreach, or retention.

## Decision and tradeoff

Use weighted rules with evidence links instead of opaque model ranking. It captures fewer semantic similarities but makes recruiter review and bias testing practical.

## Reliability

Applications are idempotent by candidate/job/revision. Consent revocation stops future processing and schedules deletion. Interview transitions are validated, and no score can automatically reject a person.

## What was cut

Automated rejection messages based solely on match score were cut; evidence quality and nontraditional experience require accountable human review.

## Acceptance tests

- Matching uses skills evidence only.
- Missing consent blocks parsing and outreach.
- A score always includes matched and missing requirements.
- Invalid interview-state transitions are rejected.

## Takeover

Job requirements, weights, consent text/version, retention windows, and state transitions are configuration with named business owners.
