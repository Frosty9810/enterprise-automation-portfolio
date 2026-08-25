-- =============================================================================
-- SAAS-01: Trial-to-Paid Conversion & Usage-Triggered Nurture Engine
-- PostgreSQL schema — usage event ingestion, daily scoring rollup, audit log,
-- dead-letter queue, and manual override support.
--
-- Target: PostgreSQL 14+
-- Matches SOP Sections 12, 14, 16, 17, 19, 20, 23, 34.
--
-- Run with:  psql -d your_database -f schema.sql
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. trial_accounts
--    Master record for a trial account. Mirrors the subset of HubSpot/Close
--    ownership and trial metadata that n8n needs locally to evaluate
--    day-relative triggers without round-tripping to those systems on every
--    scoring pass (SOP Section 7, 12 Step 3).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trial_accounts (
    account_id                      TEXT PRIMARY KEY,
    hubspot_contact_id              TEXT,
    close_lead_id                   TEXT,
    assigned_ae_id                  TEXT,
    assigned_ae_slack_channel       TEXT,
    trial_start_date                DATE NOT NULL,
    trial_end_date                  DATE NOT NULL,
    trial_extended_until            DATE,                      -- SOP Section 21: manual extension override
    card_on_file                    BOOLEAN NOT NULL DEFAULT FALSE,
    stripe_customer_id              TEXT,
    intent_tier                     TEXT NOT NULL DEFAULT 'standard'
                                        CHECK (intent_tier IN ('high', 'standard')),
    intent_tier_source              TEXT NOT NULL DEFAULT 'automated'
                                        CHECK (intent_tier_source IN ('automated', 'manual_override')),
    high_intent_opportunity_created BOOLEAN NOT NULL DEFAULT FALSE,   -- idempotency guard, SOP Section 12 Step 4
    close_opportunity_id            TEXT,
    access_state                    TEXT NOT NULL DEFAULT 'trial_active'
                                        CHECK (access_state IN (
                                            'trial_active',
                                            'converted_active',
                                            'paywalled_sales',
                                            'paywalled_standard',
                                            'grace_period'
                                        )),
    is_active_trial                 BOOLEAN NOT NULL DEFAULT TRUE,
    partner_sourced                 BOOLEAN NOT NULL DEFAULT FALSE,   -- SOP Section 37 FAQ: excluded from this workflow
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_accounts_trial_end_date
    ON trial_accounts (trial_end_date)
    WHERE is_active_trial = TRUE;

CREATE INDEX IF NOT EXISTS idx_trial_accounts_intent_tier
    ON trial_accounts (intent_tier)
    WHERE is_active_trial = TRUE;

-- -----------------------------------------------------------------------------
-- 2. usage_events
--    Append-only raw event log. One row per event received via the n8n
--    webhook. Deduplicated on event_id (SOP Section 17, Scenario 2).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_events (
    event_id                TEXT PRIMARY KEY,
    account_id              TEXT NOT NULL REFERENCES trial_accounts (account_id),
    user_id                 TEXT NOT NULL,
    event_type              TEXT NOT NULL
                                CHECK (event_type IN (
                                    'feature_activated',
                                    'integration_connected',
                                    'workflow_created',
                                    'seat_invited'
                                )),
    event_timestamp         TIMESTAMPTZ NOT NULL,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata_schema_valid   BOOLEAN NOT NULL DEFAULT TRUE,   -- SOP Section 21: malformed metadata still persisted
    source                  TEXT NOT NULL DEFAULT 'atlas-product-event-api',
    received_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_account_ts
    ON usage_events (account_id, event_timestamp);

CREATE INDEX IF NOT EXISTS idx_usage_events_type
    ON usage_events (event_type);

-- -----------------------------------------------------------------------------
-- 2a. usage_events_rejected
--     Events that failed HMAC validation, had an unrecognized event_type,
--     or an out-of-bounds timestamp (SOP Section 16).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_events_rejected (
    id                  BIGSERIAL PRIMARY KEY,
    raw_payload         JSONB NOT NULL,
    rejection_reason    TEXT NOT NULL,
    source_ip           TEXT,
    rejected_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2b. orphaned_events
--     Events whose account_id does not match any known active trial account
--     (SOP Section 16) — held for manual review, does not block ingestion.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orphaned_events (
    id                  BIGSERIAL PRIMARY KEY,
    event_id            TEXT NOT NULL,
    account_id          TEXT NOT NULL,
    raw_payload         JSONB NOT NULL,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed            BOOLEAN NOT NULL DEFAULT FALSE
);

-- -----------------------------------------------------------------------------
-- 3. account_usage_daily
--    Wide, denormalized daily rollup — one row per account per score_date.
--    Intentionally denormalized (not a join-heavy event-count schema) so the
--    hourly checkpoint sweep is a single indexed lookup (SOP Section 38).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_usage_daily (
    account_id                      TEXT NOT NULL REFERENCES trial_accounts (account_id),
    score_date                      DATE NOT NULL,
    trial_day                       INTEGER NOT NULL,
    integrations_connected          INTEGER NOT NULL DEFAULT 0,
    seats_invited                   INTEGER NOT NULL DEFAULT 0,
    workflows_created                INTEGER NOT NULL DEFAULT 0,
    features_activated              INTEGER NOT NULL DEFAULT 0,
    last_event_at                   TIMESTAMPTZ,
    no_usage_data                   BOOLEAN NOT NULL DEFAULT FALSE,   -- SOP Section 17 Scenario 5
    intent_score                    NUMERIC(5, 1) NOT NULL DEFAULT 0.0
                                        CHECK (intent_score >= 0.0 AND intent_score <= 100.0),
    intent_tier                     TEXT NOT NULL DEFAULT 'standard'
                                        CHECK (intent_tier IN ('high', 'standard')),
    high_intent_opportunity_created BOOLEAN NOT NULL DEFAULT FALSE,
    checkpoint_stage_sent           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],  -- e.g. {'day_7','day_3'}
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, score_date)
);

CREATE INDEX IF NOT EXISTS idx_account_usage_daily_score_date
    ON account_usage_daily (score_date);

CREATE INDEX IF NOT EXISTS idx_account_usage_daily_intent_tier
    ON account_usage_daily (intent_tier);

-- -----------------------------------------------------------------------------
-- 4. workflow_audit_log
--    Every state-changing action (SOP Section 23): event ingested, score
--    updated, checkpoint email sent, Opportunity created, Stripe conversion
--    executed, manual override applied.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    account_id          TEXT NOT NULL REFERENCES trial_accounts (account_id),
    action_type         TEXT NOT NULL
                            CHECK (action_type IN (
                                'event_ingested',
                                'score_updated',
                                'checkpoint_email_sent',
                                'opportunity_created',
                                'stripe_conversion_executed',
                                'manual_override_applied',
                                'retry_attempted',
                                'dead_letter_queued'
                            )),
    triggering_event_id TEXT,
    actor_id            TEXT,                 -- populated for manual_override_applied
    previous_state      JSONB,
    new_state           JSONB,
    outcome             TEXT NOT NULL DEFAULT 'success'
                            CHECK (outcome IN ('success', 'failure', 'retried')),
    attempt_count       INTEGER NOT NULL DEFAULT 1,
    justification       TEXT,                 -- required free-text for manual overrides (SOP Section 20)
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_audit_log_account
    ON workflow_audit_log (account_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_workflow_audit_log_action_type
    ON workflow_audit_log (action_type);

-- -----------------------------------------------------------------------------
-- 5. workflow_dead_letter
--    Operations that exhausted their retry budget (SOP Section 18, 19).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_dead_letter (
    id                  BIGSERIAL PRIMARY KEY,
    account_id          TEXT REFERENCES trial_accounts (account_id),
    target_system       TEXT NOT NULL
                            CHECK (target_system IN ('hubspot', 'close', 'stripe', 'slack', 'postgres')),
    operation           TEXT NOT NULL,        -- e.g. 'checkpoint_email_send', 'opportunity_create'
    payload             JSONB NOT NULL,
    error_detail        TEXT,
    attempt_count        INTEGER NOT NULL DEFAULT 5,
    queued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at          TIMESTAMPTZ,
    resolved             BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_workflow_dead_letter_unresolved
    ON workflow_dead_letter (target_system)
    WHERE resolved = FALSE;

-- -----------------------------------------------------------------------------
-- 6. manual_overrides
--    Time-bound intent-tier overrides applied by CS Leads / Sales Managers /
--    Revenue Operations (SOP Section 20). Referenced by, not merged into,
--    the audit log — overrides are never edited in place.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_overrides (
    id                  BIGSERIAL PRIMARY KEY,
    account_id          TEXT NOT NULL REFERENCES trial_accounts (account_id),
    actor_id            TEXT NOT NULL,
    actor_role          TEXT NOT NULL
                            CHECK (actor_role IN ('revenue_operations', 'customer_success_lead', 'sales_manager')),
    prior_tier          TEXT NOT NULL CHECK (prior_tier IN ('high', 'standard')),
    new_tier            TEXT NOT NULL CHECK (new_tier IN ('high', 'standard')),
    justification       TEXT NOT NULL,
    trial_cycle_start   DATE NOT NULL,   -- overrides are scoped to the trial cycle in effect at application time
    applied_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_overrides_account
    ON manual_overrides (account_id, applied_at);

-- -----------------------------------------------------------------------------
-- Trigger: keep trial_accounts.updated_at current on any row update.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trial_accounts_updated_at ON trial_accounts;
CREATE TRIGGER trg_trial_accounts_updated_at
    BEFORE UPDATE ON trial_accounts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_account_usage_daily_updated_at ON account_usage_daily;
CREATE TRIGGER trg_account_usage_daily_updated_at
    BEFORE UPDATE ON account_usage_daily
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Convenience view: current-cycle high-intent accounts still inside the
-- day-10 sales-assist window and not yet handed to an AE (drives the n8n
-- If-node threshold check without re-deriving the logic in every workflow).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_high_intent_pending_handoff AS
SELECT
    a.account_id,
    a.assigned_ae_id,
    a.assigned_ae_slack_channel,
    u.trial_day,
    u.integrations_connected,
    u.seats_invited,
    u.intent_score,
    u.score_date
FROM trial_accounts a
JOIN account_usage_daily u
    ON u.account_id = a.account_id
   AND u.score_date = (
        SELECT MAX(u2.score_date)
        FROM account_usage_daily u2
        WHERE u2.account_id = a.account_id
   )
WHERE a.is_active_trial = TRUE
  AND u.integrations_connected >= 3
  AND u.seats_invited >= 2
  AND u.trial_day < 10
  AND a.high_intent_opportunity_created = FALSE;

COMMIT;
