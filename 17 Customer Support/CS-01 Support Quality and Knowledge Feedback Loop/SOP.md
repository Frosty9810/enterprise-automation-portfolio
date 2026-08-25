# CS-01 — Support Quality & Knowledge Feedback Loop

**Flow:** `Closed conversation → privacy minimization → risk-aware sampling → answer/knowledge retrieval → grounding checks → QA score → coaching or content task → outcome feedback`  
**System:** The helpdesk owns conversations; the knowledge base owns approved articles; this service stores redacted evaluation evidence, scores, and improvement tasks.  
**Hard constraint:** Raw customer identifiers and payment/authentication data never enter the evaluation model context.

## Technical core

The evaluator checks whether material claims in an answer are supported by cited approved knowledge and whether required policy steps were present. Repeated unsupported topics are clustered into knowledge gaps rather than treated only as agent mistakes.

## Decision and tradeoff

Use stratified sampling plus deterministic policy checks and bounded AI evaluation. Evaluating every ticket would cost more and amplify noisy model judgments without improving coaching coverage proportionally.

## Reliability

Evaluation versions are immutable, model failure leaves tickets unevaluated rather than failed, low-confidence scores require QA review, and coaching metrics never use a single sample.

## What was cut

Automatic performance penalties were cut because probabilistic QA scores are evidence for review, not a fair employment decision on their own.

## Acceptance tests

- PII is redacted before evaluation.
- Unsupported material claims produce a grounding failure.
- Low-confidence evaluations route to a human QA queue.
- Recurring gaps create one aggregated knowledge task.

## Takeover

Sampling strata, policy checks, article versions, evaluator prompt, and confidence thresholds have separate version IDs and owners.
