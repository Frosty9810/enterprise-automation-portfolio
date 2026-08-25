# ECOM-04 — Support Routing & SLA Control

**Complexity:** Intermediate  
**Context:** Illustrative nine-market ecommerce support operation  
**Artifacts:** [Runnable implementation](build/README.md)

## Job to be done

Move every inbound support message to the right queue, priority, and response target while enriching agents with order context and preventing sensitive data from crossing the AI boundary.

## Flow

`Helpdesk webhook → redact PII → validate customer/order → deterministic policy checks → bounded intent summary → queue + SLA assignment → agent context card → escalation and audit`

## System boundary

The helpdesk owns tickets and agent communication. Shopify owns order state. This service owns redacted classification inputs, route decisions, SLA timers, escalation events, and routing quality metrics.

## Technical core

The router separates deterministic intents (cancellation window, chargeback, privacy request, delivery exception) from ambiguous language classification. A policy table calculates route and deadline from market, order value, customer tier, risk markers, and current queue capacity.

## Hard constraint

Email addresses, phone numbers, street addresses, payment fragments, and free-form order notes are redacted before text can be sent to a model.

## Decision and tradeoff

Keep SLA and permission decisions deterministic while using AI only for summary and ambiguous intent. This limits conversational flexibility, but makes priority and compliance behavior testable.

## Reliability and cost controls

- Ticket event IDs prevent duplicate routing.
- Existing order status is fetched once and cached for the workflow execution.
- Model failure falls back to `general_review`; it never delays urgent policy routes.
- SLA breach jobs run independently of classification and alert on-call operations.

## What was cut

Fully autonomous refunds were excluded. Refund eligibility can be suggested, but payment-changing actions remain behind an explicit approval and scoped credential.

## Acceptance tests

1. A chargeback or safety message is routed urgently without an AI dependency.
2. PII redaction occurs before classification.
3. An ambiguous request falls back safely when the classifier is unavailable.
4. SLA timers remain active even if downstream enrichment fails.
