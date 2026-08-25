# ECOM-02 — Review Intelligence and Response Queue

**Complexity:** Intermediate  
**Context:** Illustrative multi-market Shopify brand  
**Artifacts:** [Runnable implementation](build/README.md)

## Job to be done

Move each new review to the right response path quickly: publish-and-thank, draft for approval, product-quality investigation, or urgent safety escalation.

## Flow

`Review webhook → validate purchase context → detect language/theme/risk → assign route and SLA → draft bounded response → human approval where required → publish → record outcome`

## System boundary

The review platform owns the public review and response. This service owns triage decisions, draft metadata, approval state, duplicate detection, and response-time metrics. Product defects are handed to Operations; refunds and safety claims are handed to trained humans.

## Technical core

The router combines deterministic high-risk pattern detection with explainable scoring for sentiment, defect recurrence, and customer value. It returns a structured decision containing route, priority, reasons, SLA, and whether a response may be auto-published.

## Hard constraint

Any safety concern, legal threat, refund promise, personal data, or suspected coordinated abuse disables automatic publishing.

## Decision and tradeoff

Use a conservative rules-first gate before language classification. It produces more human reviews than a fully autonomous responder, but prevents polished language from masking a high-risk case.

## Reliability and cost controls

- Review IDs are idempotent and response publication is exactly-once.
- One classifier call can return language, themes, and draft intent in a single schema.
- Low-star clusters by SKU create one incident rather than duplicate tickets.
- Dead-letter records preserve payload hash and failure reason, not unnecessary customer PII.

## What was cut

Public auto-replies to one- and two-star reviews were cut. The time saved does not justify the reputational cost of an incorrect or tone-deaf response.

## Acceptance tests

1. A verified five-star review routes to a low-risk thank-you response.
2. “Battery became hot” creates an urgent safety escalation.
3. Repeated defect themes for one SKU aggregate into an Operations signal.
4. A duplicate webhook never creates a second public response.
