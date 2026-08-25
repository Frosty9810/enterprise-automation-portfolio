-- =============================================================================
-- schema.sql — SAAS-03 Churn Prediction & Proactive CS Intervention System
-- Real PostgreSQL DDL for the feature store, model score history, and
-- outcome feedback-loop tables described in SOP.md Sections 8, 12, 14, 23.
--
-- Target: PostgreSQL 14+ (per SOP.md Section 6, Technical Requirements).
-- Designed to execute cleanly against a fresh database:
--   psql -U postgres -d your_db -f schema.sql
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS churn_intel;

SET search_path TO churn_intel, public;

-- -----------------------------------------------------------------------------
-- Reference / lookup types
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_tier_enum') THEN
        CREATE TYPE churn_intel.plan_tier_enum AS ENUM ('starter', 'growth', 'enterprise');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status_enum') THEN
        CREATE TYPE churn_intel.account_status_enum AS ENUM ('active', 'churned', 'suspended', 'trial');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intervention_type_enum') THEN
        CREATE TYPE churn_intel.intervention_type_enum AS ENUM ('human_touch', 'automated', 'none');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outcome_label_enum') THEN
        CREATE TYPE churn_intel.outcome_label_enum AS ENUM ('retained', 'churned', 'no_action_needed', 'moot_already_churned');
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Table: active_accounts
-- Referenced in SOP.md Step 2 ("Pull active account roster").
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.active_accounts (
    account_id              VARCHAR(64) PRIMARY KEY,
    arr                     NUMERIC(12, 2) NOT NULL CHECK (arr >= 0),
    plan_tier               churn_intel.plan_tier_enum NOT NULL,
    csm_owner_id            VARCHAR(64),
    status                  churn_intel.account_status_enum NOT NULL DEFAULT 'active',
    account_tenure_days     INTEGER NOT NULL DEFAULT 0 CHECK (account_tenure_days >= 0),
    contract_days_to_renewal INTEGER CHECK (contract_days_to_renewal >= 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_accounts_status ON churn_intel.active_accounts (status);
CREATE INDEX IF NOT EXISTS idx_active_accounts_csm ON churn_intel.active_accounts (csm_owner_id);

-- -----------------------------------------------------------------------------
-- Table: feature_snapshots
-- Referenced in SOP.md Step 3 ("Feature extraction per account") and
-- Section 14 (FEATURE_COLUMNS). One row per account per scoring run.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.feature_snapshots (
    snapshot_id                     BIGSERIAL PRIMARY KEY,
    account_id                      VARCHAR(64) NOT NULL REFERENCES churn_intel.active_accounts (account_id),
    snapshot_date                   DATE NOT NULL,
    login_frequency_delta           NUMERIC(6, 4),
    feature_usage_delta             NUMERIC(6, 4),
    seat_utilization_rate           NUMERIC(5, 4) CHECK (seat_utilization_rate BETWEEN 0 AND 1),
    seat_utilization_delta          NUMERIC(6, 4),
    support_ticket_sentiment_score  NUMERIC(5, 4) CHECK (support_ticket_sentiment_score BETWEEN -1 AND 1),
    support_ticket_volume_delta     NUMERIC(6, 4),
    nps_trend                       NUMERIC(6, 4),
    nps_data_sparse                 BOOLEAN NOT NULL DEFAULT FALSE,
    payment_failure_flag            BOOLEAN NOT NULL DEFAULT FALSE,
    contract_days_to_renewal        INTEGER,
    account_tenure_days             INTEGER,
    plan_tier_encoded               SMALLINT CHECK (plan_tier_encoded BETWEEN 0 AND 2),
    low_confidence_flag             BOOLEAN NOT NULL DEFAULT FALSE,
    sentiment_computed_at           TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_feature_snapshot_account_date UNIQUE (account_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_feature_snapshots_account ON churn_intel.feature_snapshots (account_id);
CREATE INDEX IF NOT EXISTS idx_feature_snapshots_date ON churn_intel.feature_snapshots (snapshot_date);

-- -----------------------------------------------------------------------------
-- Table: score_history
-- Referenced in SOP.md Step 9 ("Score persistence for non-flagged accounts")
-- and Section 27 (drift monitoring source of truth).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.score_history (
    score_id                BIGSERIAL PRIMARY KEY,
    account_id               VARCHAR(64) NOT NULL REFERENCES churn_intel.active_accounts (account_id),
    snapshot_id              BIGINT REFERENCES churn_intel.feature_snapshots (snapshot_id),
    scored_at                DATE NOT NULL,
    churn_probability        NUMERIC(6, 5) NOT NULL CHECK (churn_probability BETWEEN 0 AND 1),
    top_factors              JSONB NOT NULL,
    explanation_method       VARCHAR(32) NOT NULL DEFAULT 'shap',
    model_version            VARCHAR(32) NOT NULL,
    above_probability_threshold BOOLEAN NOT NULL,
    intervention_type        churn_intel.intervention_type_enum NOT NULL DEFAULT 'none',
    stale_score               BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_score_history_account_date UNIQUE (account_id, scored_at)
);

CREATE INDEX IF NOT EXISTS idx_score_history_account ON churn_intel.score_history (account_id);
CREATE INDEX IF NOT EXISTS idx_score_history_scored_at ON churn_intel.score_history (scored_at);
CREATE INDEX IF NOT EXISTS idx_score_history_top_factors ON churn_intel.score_history USING GIN (top_factors);

-- -----------------------------------------------------------------------------
-- Table: score_overrides
-- Referenced in SOP.md Section 20 (Manual Override, override type 1).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.score_overrides (
    override_id       BIGSERIAL PRIMARY KEY,
    account_id         VARCHAR(64) NOT NULL REFERENCES churn_intel.active_accounts (account_id),
    score_id           BIGINT REFERENCES churn_intel.score_history (score_id),
    reason_code        VARCHAR(64) NOT NULL,
    reason_notes        TEXT,
    reviewer_identity   VARCHAR(128) NOT NULL,
    overridden_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_overrides_account ON churn_intel.score_overrides (account_id);

-- -----------------------------------------------------------------------------
-- Table: interventions
-- Tracks Close CRM tasks and HubSpot enrollments created from a scoring run,
-- per SOP.md Steps 7b, 8, and Section 13 decision tree.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.interventions (
    intervention_id        BIGSERIAL PRIMARY KEY,
    account_id              VARCHAR(64) NOT NULL REFERENCES churn_intel.active_accounts (account_id),
    score_id                 BIGINT NOT NULL REFERENCES churn_intel.score_history (score_id),
    intervention_type        churn_intel.intervention_type_enum NOT NULL,
    close_task_id             VARCHAR(64),
    hubspot_enrollment_id     VARCHAR(64),
    playbook_json              JSONB,
    playbook_fallback_used      BOOLEAN NOT NULL DEFAULT FALSE,
    shap_consistency_check_passed BOOLEAN,
    duplicate_suppressed        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_intervention_account_score UNIQUE (account_id, score_id)
);

CREATE INDEX IF NOT EXISTS idx_interventions_account ON churn_intel.interventions (account_id);
CREATE INDEX IF NOT EXISTS idx_interventions_type ON churn_intel.interventions (intervention_type);

-- -----------------------------------------------------------------------------
-- Table: outcome_feedback
-- Referenced in SOP.md FR-6, Step 10, and Section 31 (monthly retrain input).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.outcome_feedback (
    outcome_id          BIGSERIAL PRIMARY KEY,
    account_id            VARCHAR(64) NOT NULL REFERENCES churn_intel.active_accounts (account_id),
    intervention_id        BIGINT REFERENCES churn_intel.interventions (intervention_id),
    score_id                BIGINT NOT NULL REFERENCES churn_intel.score_history (score_id),
    outcome_label             churn_intel.outcome_label_enum NOT NULL,
    outcome_observed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    days_to_outcome             INTEGER,
    used_in_retrain_version      VARCHAR(32),
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_feedback_account ON churn_intel.outcome_feedback (account_id);
CREATE INDEX IF NOT EXISTS idx_outcome_feedback_label ON churn_intel.outcome_feedback (outcome_label);
CREATE INDEX IF NOT EXISTS idx_outcome_feedback_retrain_version ON churn_intel.outcome_feedback (used_in_retrain_version);

-- -----------------------------------------------------------------------------
-- Table: audit_log
-- Referenced in SOP.md Section 23. Common event log across the whole pipeline.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.audit_log (
    audit_id           BIGSERIAL PRIMARY KEY,
    event_type           VARCHAR(64) NOT NULL,
    account_id            VARCHAR(64) REFERENCES churn_intel.active_accounts (account_id),
    actor                  VARCHAR(128) NOT NULL,
    payload_snapshot         JSONB,
    reason_code               VARCHAR(64),
    occurred_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON churn_intel.audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_account ON churn_intel.audit_log (account_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON churn_intel.audit_log (occurred_at);

-- -----------------------------------------------------------------------------
-- Table: model_registry
-- Supports Section 30 (Deployment) and Section 31 (Maintenance) — tracks
-- promoted model artifact versions and their holdout metrics.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.model_registry (
    model_version         VARCHAR(32) PRIMARY KEY,
    trained_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    holdout_precision        NUMERIC(5, 4),
    holdout_recall            NUMERIC(5, 4),
    promoted                   BOOLEAN NOT NULL DEFAULT FALSE,
    promotion_notes             TEXT,
    artifact_uri                 TEXT
);

-- -----------------------------------------------------------------------------
-- Table: job_completion_flags
-- Referenced in SOP.md Section 15 — cross-workflow dependency check shared
-- with SAAS-01 (usage_event_nightly_aggregation).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS churn_intel.job_completion_flags (
    job_name        VARCHAR(128) NOT NULL,
    run_date          DATE NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
    completed_at          TIMESTAMPTZ,
    PRIMARY KEY (job_name, run_date)
);

COMMIT;

-- =============================================================================
-- End of schema.sql
-- =============================================================================
