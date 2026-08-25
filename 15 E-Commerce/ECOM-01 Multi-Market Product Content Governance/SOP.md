# ECOM-01 — Multi-Market Product Content Governance

**Complexity:** Advanced  
**Context:** Illustrative nine-market Shopify brand  
**Artifacts:** [Runnable implementation](build/README.md)

## Job to be done

Move an approved source-market product from “content ready” to a publishable market bundle without letting generated copy alter dimensions, materials, care instructions, warranty terms, or regulated claims.

## Flow

`Shopify product webhook → normalize facts → build locale plan → generate candidate copy → validate terminology and protected facts → auto-publish low risk / queue approval → audit`

## System boundary

Shopify remains the product system of record. PostgreSQL stores immutable source facts, generated revisions, validation findings, approval state, token/cost telemetry, and publish receipts. The model proposes language; it never owns product facts or publication permission.

## Technical core

The hard part is a two-contract pipeline. A `SourceProduct` contract separates immutable facts from translatable copy, and a `LocalizedCandidate` contract must preserve every protected fact. A validator computes omissions, forbidden-claim hits, glossary violations, and numeric drift before assigning `auto_publish`, `human_review`, or `blocked`.

## Hard constraint

Numbers, materials, certifications, warranty terms, and SKU identity must survive localization exactly. Any mismatch blocks publication, even if the copy is fluent.

## Decision and tradeoff

Use deterministic validation after bounded generation, rather than asking an agent to “double-check itself.” This adds a validation pass and some manual review, but gives operations an explainable reason for every block.

## Reliability and cost controls

- Event idempotency key: `product_id + source_revision + locale`.
- Generation is skipped when the same source hash already has an approved locale revision.
- Model output is schema-validated; malformed output is retried once, then queued.
- Per-locale character and token budgets prevent runaway prompts.
- Publication uses a separate credential and workflow from generation.

## What was cut

Automatic image generation was excluded. Product imagery has brand, licensing, and representation risks that require a separate approval and asset-provenance system.

## Acceptance tests

1. A candidate preserving facts and glossary terms is eligible for automatic publication.
2. A changed dimension or unsupported medical/environmental claim is blocked.
3. Replaying the same event does not produce a second publish action.
4. A model outage creates a recoverable queue item without changing Shopify.

## Takeover notes

The glossary, protected-field list, risk thresholds, and locale ownership are configuration, not prompt text. A new owner can replace the model adapter without changing the policy engine or database contract.
