-- =============================================================================
-- SAAS-02: Automated Dunning & Failed-Payment Recovery Engine
-- PostgreSQL DDL for the dunning case lifecycle data model (SOP Section 15).
--
-- Executes cleanly against a fresh PostgreSQL 13+ database:
--   psql -U postgres -d dunning_engine -f schema.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------

CREATE TYPE plan_tier AS ENUM (
    'smb',
    'mid_market',
    'enterprise'
);

CREATE TYPE decline_reason AS ENUM (
    'card_declined',
    'insufficient_funds',
    'expired_card',
    'unknown'
);

-- Mirrors dunning_state_machine.py's CaseState enum.
CREATE TYPE dunning_status AS ENUM (
    'new',
    'retrying',
    'day3_email_sent',
    'day7_warning_sent',
    'enterprise_csm_task_open',
    'recovered',
    'suspended',
    'downgraded',
    'paused',
    'unresolved_customer'
);

CREATE TYPE terminal_action AS ENUM (
    'recovered',
    'downgraded',
    'suspended',
    'written_off'
);

-- -----------------------------------------------------------------------------
-- Core table: dunning_cases
-- One row per failed-charge lifecycle, keyed on Stripe invoice_id for
-- idempotent case creation (SOP Section 17, Scenario 1).
-- -----------------------------------------------------------------------------

CREATE TABLE dunning_cases (
    dunning_case_id         TEXT PRIMARY KEY,
    invoice_id              TEXT NOT NULL UNIQUE,
    stripe_customer_id      TEXT NOT NULL,
    account_id              TEXT NOT NULL,

    plan_tier                plan_tier NOT NULL,
    decline_reason           decline_reason NOT NULL DEFAULT 'unknown',

    card_last4               VARCHAR(4),
    card_brand               TEXT,

    amount_due_cents         BIGINT NOT NULL CHECK (amount_due_cents > 0),
    currency                 CHAR(3) NOT NULL DEFAULT 'usd',
    mrr_cents                BIGINT NOT NULL DEFAULT 0 CHECK (mrr_cents >= 0),
    high_value                BOOLEAN NOT NULL DEFAULT FALSE,

    status                    dunning_status NOT NULL DEFAULT 'new',
    sequence_stage             TEXT,

    -- Cadence timestamps: one column per graduated step, matching the
    -- Day 0 / Day 3 / Day 7 / Day 14 offsets in SOP Section 18.
    failed_at                 TIMESTAMPTZ NOT NULL,
    day3_email_sent_at        TIMESTAMPTZ,
    day7_warning_sent_at      TIMESTAMPTZ,
    day7_sms_sent_at          TIMESTAMPTZ,
    day14_evaluated_at        TIMESTAMPTZ,
    recovered_at              TIMESTAMPTZ,
    terminal_at                TIMESTAMPTZ,

    terminal_action            terminal_action,

    csm_task_id                TEXT,
    csm_owner_id                TEXT,

    -- Manual override support (SOP Section 20).
    paused_at                  TIMESTAMPTZ,
    paused_reason_code          TEXT,
    clock_offset_seconds         BIGINT NOT NULL DEFAULT 0,

    -- QuickBooks Online reconciliation tracking (SOP Section 17, Scenario 5).
    qbo_reconciled                BOOLEAN NOT NULL DEFAULT FALSE,
    qbo_reconciled_at             TIMESTAMPTZ,
    qbo_journal_entry_id          TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_recovered_terminal
        CHECK (
            (status = 'recovered' AND recovered_at IS NOT NULL)
            OR (status <> 'recovered')
        )
);

CREATE INDEX idx_dunning_cases_status ON dunning_cases (status);
CREATE INDEX idx_dunning_cases_customer_id ON dunning_cases (stripe_customer_id);
CREATE INDEX idx_dunning_cases_account_id ON dunning_cases (account_id);
CREATE INDEX idx_dunning_cases_plan_tier ON dunning_cases (plan_tier);
CREATE INDEX idx_dunning_cases_failed_at ON dunning_cases (failed_at);
CREATE INDEX idx_dunning_cases_high_value ON dunning_cases (high_value) WHERE high_value = TRUE;

-- -----------------------------------------------------------------------------
-- Audit trail: append-only log of every state transition (SOP Section 23).
-- -----------------------------------------------------------------------------

CREATE TABLE dunning_case_audit_log (
    audit_id            BIGSERIAL PRIMARY KEY,
    dunning_case_id       TEXT NOT NULL REFERENCES dunning_cases (dunning_case_id)
                              ON DELETE CASCADE,
    event                  TEXT NOT NULL,
    actor                    TEXT NOT NULL,               -- 'system' or a named human
    reason_code               TEXT,
    source_event_id            TEXT,                       -- Stripe event ID, if applicable
    previous_status              dunning_status,
    new_status                    dunning_status,
    occurred_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_case_id ON dunning_case_audit_log (dunning_case_id);
CREATE INDEX idx_audit_log_occurred_at ON dunning_case_audit_log (occurred_at);

-- -----------------------------------------------------------------------------
-- Trigger: keep updated_at current on every row change.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dunning_cases_set_updated_at
    BEFORE UPDATE ON dunning_cases
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

-- -----------------------------------------------------------------------------
-- View: cases currently eligible for a scheduled-tick evaluation
-- (excludes paused and terminal-state cases).
-- -----------------------------------------------------------------------------

CREATE VIEW active_dunning_cases AS
SELECT *
FROM dunning_cases
WHERE status NOT IN ('recovered', 'suspended', 'downgraded', 'paused');

COMMIT;
