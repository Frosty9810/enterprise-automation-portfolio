-- =============================================================================
-- schema.sql — Real Build Artifact for SOP RE-03
-- AI-Powered Buyer/Seller Lead Qualification & Cross-Platform Scoring Engine
--
-- Real, executable PostgreSQL DDL for the lead scoring / feedback-loop tables
-- described in SOP Section 34 (Appendix) and referenced throughout Sections
-- 12, 17, 20, 23, and 25. Matches the ER relationships implied by the SOP:
--   score_events (append-only audit trail)
--       -> lead_current_state (1:1 projection per contact_id)
--       -> manual_overrides (1:many, ISA corrections)
--   re_engagement_queue (independent queue for disqualified leads)
--
-- Tested to execute cleanly against a fresh PostgreSQL 14+ database.
--
-- Usage:
--   createdb lead_scoring_demo
--   psql -d lead_scoring_demo -f schema.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Schema container (SOP Section 6: "dedicated lead_scoring schema, row-level
-- security enabled for multi-office data isolation")
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS lead_scoring;

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Table: lead_scoring.score_events
-- Append-only audit trail. One row per scoring event (SOP Section 12, Step 7;
-- Section 23, Audit Logs). Never updated or deleted — corrections happen via
-- new rows only.
-- -----------------------------------------------------------------------------
CREATE TABLE lead_scoring.score_events (
    score_event_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id                     TEXT NOT NULL,
    location_id                    TEXT NOT NULL,
    conversation_id                TEXT NOT NULL,
    model_version                  TEXT NOT NULL,
    prompt_version                 TEXT NOT NULL,

    -- classify_and_extract_lead tool output (SOP Section 14.1)
    intent                         TEXT NOT NULL CHECK (
        intent IN (
            'schedule_tour', 'pricing_inquiry', 'seller_valuation_request',
            'immediate_move', 'relocation_1_3mo', 'just_browsing',
            'renter_not_buyer', 'unresponsive'
        )
    ),
    confidence                     NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    entities                       JSONB NOT NULL,

    -- scoring inputs / outputs (SOP Section 14.4)
    lead_source                    TEXT,
    hours_since_last_engagement    NUMERIC(6,2),
    score                          SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
    score_breakdown                JSONB NOT NULL,
    rationale                      TEXT NOT NULL,

    -- routing / operational metadata
    routing_outcome                TEXT NOT NULL CHECK (
        routing_outcome IN (
            'close_crm_handoff', 'ghl_nurture', 'needs_human_review',
            'disqualified', 'pending_close_handoff'
        )
    ),
    disqualification_reason_code   TEXT CHECK (
        disqualification_reason_code IS NULL OR disqualification_reason_code IN (
            'RENTER_NOT_BUYER', 'OUT_OF_MARKET_AREA', 'JUST_BROWSING_LOW_INTENT',
            'UNRESPONSIVE_3_ATTEMPTS', 'BUDGET_BELOW_INVENTORY_FLOOR',
            'DUPLICATE_CONTACT', 'TIMELINE_EXCEEDS_12_MONTHS'
        )
    ),
    scored_via_fallback            BOOLEAN NOT NULL DEFAULT FALSE,
    prompt_injection_flag          BOOLEAN NOT NULL DEFAULT FALSE,
    validation_status              TEXT NOT NULL DEFAULT 'valid' CHECK (
        validation_status IN ('valid', 'schema_invalid_reprompted', 'fallback_used')
    ),

    -- raw request/response preserved for prompt-engineering review
    -- (SOP Section 17, Scenario 2) and audit replay (Section 23)
    raw_request                    JSONB,
    raw_response                   JSONB,

    assigned_agent_id              TEXT,
    superseded_by                  UUID REFERENCES lead_scoring.score_events(score_event_id),

    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_score_events_contact_id ON lead_scoring.score_events (contact_id);
CREATE INDEX idx_score_events_location_id ON lead_scoring.score_events (location_id);
CREATE INDEX idx_score_events_created_at ON lead_scoring.score_events (created_at);
CREATE INDEX idx_score_events_routing_outcome ON lead_scoring.score_events (routing_outcome);
CREATE INDEX idx_score_events_scored_via_fallback ON lead_scoring.score_events (scored_via_fallback)
    WHERE scored_via_fallback = TRUE;
CREATE INDEX idx_score_events_entities_gin ON lead_scoring.score_events USING GIN (entities);

COMMENT ON TABLE lead_scoring.score_events IS
    'Append-only audit trail of every lead scoring event. System of record for SOP RE-03 Section 23.';

-- -----------------------------------------------------------------------------
-- Table: lead_scoring.lead_current_state
-- 1:1 "current state" projection per contact_id, upserted on every new
-- score_event (SOP Section 12, Step 7; concurrency handled via
-- SELECT ... FOR UPDATE per Section 17, Scenario 5).
-- -----------------------------------------------------------------------------
CREATE TABLE lead_scoring.lead_current_state (
    contact_id              TEXT PRIMARY KEY,
    location_id             TEXT NOT NULL,
    latest_score_event_id   UUID REFERENCES lead_scoring.score_events(score_event_id),
    current_score           SMALLINT CHECK (current_score BETWEEN 0 AND 100),
    current_status           TEXT CHECK (
        current_status IN (
            'close_crm_handoff', 'ghl_nurture', 'needs_human_review',
            'disqualified', 'pending_close_handoff'
        )
    ),
    assigned_agent_id        TEXT,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_current_state_location_id ON lead_scoring.lead_current_state (location_id);
CREATE INDEX idx_lead_current_state_status ON lead_scoring.lead_current_state (current_status);

COMMENT ON TABLE lead_scoring.lead_current_state IS
    'Latest score/status projection per contact_id. Upserted from score_events; row-locked on concurrent writes (SOP Section 17, Scenario 5).';

-- -----------------------------------------------------------------------------
-- Table: lead_scoring.manual_overrides
-- ISA/agent corrections (SOP Section 20, Manual Override). Never merged into
-- the original AI-generated record — both are retained for the model
-- feedback loop (Section 27).
-- -----------------------------------------------------------------------------
CREATE TABLE lead_scoring.manual_overrides (
    override_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_score_event_id   UUID NOT NULL REFERENCES lead_scoring.score_events(score_event_id),
    overridden_by_user_id     TEXT NOT NULL,
    corrected_intent           TEXT CHECK (
        corrected_intent IS NULL OR corrected_intent IN (
            'schedule_tour', 'pricing_inquiry', 'seller_valuation_request',
            'immediate_move', 'relocation_1_3mo', 'just_browsing',
            'renter_not_buyer', 'unresponsive'
        )
    ),
    corrected_entities         JSONB,
    corrected_score            SMALLINT CHECK (corrected_score IS NULL OR corrected_score BETWEEN 0 AND 100),
    forced_routing_outcome     TEXT CHECK (
        forced_routing_outcome IS NULL OR forced_routing_outcome IN (
            'close_crm_handoff', 'ghl_nurture', 'needs_human_review', 'disqualified'
        )
    ),
    justification               TEXT NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_overrides_original_event ON lead_scoring.manual_overrides (original_score_event_id);
CREATE INDEX idx_manual_overrides_created_at ON lead_scoring.manual_overrides (created_at);

COMMENT ON TABLE lead_scoring.manual_overrides IS
    'ISA/agent corrections to AI-generated classifications. Linked to, never merged into, the original score_events row (SOP Section 20).';

-- -----------------------------------------------------------------------------
-- Table: lead_scoring.re_engagement_queue
-- Scheduled quarterly re-engagement for disqualified leads (SOP Section 34
-- Appendix; Section 12, Step 8).
-- -----------------------------------------------------------------------------
CREATE TABLE lead_scoring.re_engagement_queue (
    queue_id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id                     TEXT NOT NULL,
    location_id                    TEXT NOT NULL,
    originating_score_event_id     UUID REFERENCES lead_scoring.score_events(score_event_id),
    disqualification_reason_code   TEXT NOT NULL CHECK (
        disqualification_reason_code IN (
            'RENTER_NOT_BUYER', 'OUT_OF_MARKET_AREA', 'JUST_BROWSING_LOW_INTENT',
            'UNRESPONSIVE_3_ATTEMPTS', 'BUDGET_BELOW_INVENTORY_FLOOR',
            'DUPLICATE_CONTACT', 'TIMELINE_EXCEEDS_12_MONTHS'
        )
    ),
    scheduled_for                   DATE NOT NULL,
    executed                        BOOLEAN NOT NULL DEFAULT FALSE,
    executed_at                     TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_re_engagement_queue_scheduled_for ON lead_scoring.re_engagement_queue (scheduled_for)
    WHERE executed = FALSE;
CREATE INDEX idx_re_engagement_queue_contact_id ON lead_scoring.re_engagement_queue (contact_id);

COMMENT ON TABLE lead_scoring.re_engagement_queue IS
    'Scheduled quarterly re-engagement rows for leads scored below the disqualification floor (SOP RE-03 Section 34).';

-- -----------------------------------------------------------------------------
-- Table: lead_scoring.model_feedback
-- Aggregated classification-accuracy feedback loop (SOP Section 3, "Build a
-- feedback loop that measures classification accuracy against outcomes";
-- Section 27, holdout-set accuracy measurement; Section 31, quarterly
-- re-labeling). Distinct from manual_overrides: this table stores the
-- periodic *aggregate* holdout-set/spot-audit judgments used to track
-- model drift over time, not individual ISA corrections.
-- -----------------------------------------------------------------------------
CREATE TABLE lead_scoring.model_feedback (
    feedback_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    score_event_id         UUID REFERENCES lead_scoring.score_events(score_event_id),
    review_cycle            TEXT NOT NULL,              -- e.g. '2026-Q2-holdout'
    reviewer_id             TEXT NOT NULL,               -- ISA/adjudicator identifier
    ai_intent               TEXT NOT NULL,
    human_labeled_intent    TEXT NOT NULL,
    intent_match             BOOLEAN NOT NULL,
    notes                    TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_model_feedback_review_cycle ON lead_scoring.model_feedback (review_cycle);
CREATE INDEX idx_model_feedback_intent_match ON lead_scoring.model_feedback (intent_match);

COMMENT ON TABLE lead_scoring.model_feedback IS
    'Quarterly holdout-set / spot-audit accuracy review records (SOP Section 27, Section 31). Feeds the classification-accuracy KPI.';

-- -----------------------------------------------------------------------------
-- Row-level security (SOP Section 6: "row-level security enabled for
-- multi-office data isolation"; Section 25, Permissions table)
-- -----------------------------------------------------------------------------
ALTER TABLE lead_scoring.score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring.lead_current_state ENABLE ROW LEVEL SECURITY;

-- Example office-scoping policy: application roles set
-- `SET app.current_location_id = '<location_id>'` per session, and this
-- policy restricts ISA/Director-scoped roles to their own office's rows.
-- The Automation Architecture Lead role bypasses RLS via BYPASSRLS grant
-- (see SOP Section 25 permissions matrix).
CREATE POLICY score_events_office_isolation ON lead_scoring.score_events
    USING (location_id = current_setting('app.current_location_id', true));

CREATE POLICY lead_current_state_office_isolation ON lead_scoring.lead_current_state
    USING (location_id = current_setting('app.current_location_id', true));

COMMIT;

-- =============================================================================
-- Sanity-check seed row (optional — comment out for a schema-only deploy).
-- Demonstrates the full insert path matching the SOP Section 14.5 worked
-- example (Elmwood referral lead, score 88, routed to Close CRM).
-- =============================================================================
-- INSERT INTO lead_scoring.score_events (
--     contact_id, location_id, conversation_id, model_version, prompt_version,
--     intent, confidence, entities, lead_source, hours_since_last_engagement,
--     score, score_breakdown, rationale, routing_outcome, assigned_agent_id
-- ) VALUES (
--     'ghl_c_7a19f0e2', 'ghl_loc_elmwood_office', 'ghl_conv_44210987',
--     'claude-sonnet-4-5', 'v1.0',
--     'schedule_tour', 0.940,
--     '{"budget_range": "up_to_650000", "bedroom_count": 4, "timeline": "1_3_months", "financing_status": "preapproved", "property_address_if_seller": null}'::jsonb,
--     'referral', 0.4,
--     88,
--     '{"intent_component": 36.7, "entity_completeness_component": 25.0, "source_quality_component": 16.5, "engagement_recency_component": 9.9}'::jsonb,
--     'intent=schedule_tour (conf=0.94) contributed 36.7; entity completeness 100% contributed 25.0; source=referral contributed 16.5; recency=0.4h contributed 9.9',
--     'close_crm_handoff', 'hrp_agent_0091'
-- );
