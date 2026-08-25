-- =============================================================================
-- schema.sql
-- SAAS-04: Usage-Based Billing Reconciliation & Revenue Recognition Pipeline
--
-- Real, executable PostgreSQL 14+ DDL matching the ER diagram in SOP.md
-- Section 34.5. Every money column uses NUMERIC — never FLOAT/REAL — per
-- SOP Section 38 (Technical Notes) and the portfolio-wide standard that
-- financial reconciliation math must never be subject to floating-point
-- rounding drift.
--
-- Run against a fresh database with:
--   psql -h <host> -U <user> -d <database> -f schema.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() for surrogate keys

-- -----------------------------------------------------------------------
-- Reference tables
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounts (
    account_id      TEXT PRIMARY KEY,
    account_name    TEXT NOT NULL,
    plan_id         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'canceled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      TEXT NOT NULL DEFAULT 'system',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS cost_center_map (
    cost_center_id      TEXT PRIMARY KEY,
    cost_center_name    TEXT NOT NULL,
    qbo_class_ref       TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          TEXT NOT NULL DEFAULT 'system',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          TEXT NOT NULL DEFAULT 'system'
);

-- -----------------------------------------------------------------------
-- Usage metering snapshots (source: metering DB replica pull, persisted
-- here for join/audit purposes — SOP Section 12, step 2)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_snapshots (
    usage_snapshot_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id                  TEXT NOT NULL REFERENCES accounts(account_id),
    billing_period_start        DATE NOT NULL,
    billing_period_end          DATE NOT NULL,
    plan_id                     TEXT NOT NULL,
    included_api_calls          BIGINT NOT NULL CHECK (included_api_calls >= 0),
    metered_api_calls           BIGINT NOT NULL CHECK (metered_api_calls >= 0),
    overage_units               BIGINT NOT NULL CHECK (overage_units >= 0),
    usage_event_count_raw       BIGINT NOT NULL CHECK (usage_event_count_raw >= 0),
    duplicate_event_flag_count  INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_event_flag_count >= 0),
    plan_change_mid_cycle       BOOLEAN NOT NULL DEFAULT FALSE,
    snapshot_generated_at       TIMESTAMPTZ NOT NULL,
    source_system                TEXT NOT NULL DEFAULT 'atlas_metering_v2',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  TEXT NOT NULL DEFAULT 'n8n_workflow_recon_nightly',
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                  TEXT NOT NULL DEFAULT 'n8n_workflow_recon_nightly',
    CONSTRAINT usage_period_valid CHECK (billing_period_end >= billing_period_start),
    CONSTRAINT usage_snapshot_unique_period UNIQUE (account_id, billing_period_start, billing_period_end)
);

CREATE INDEX IF NOT EXISTS idx_usage_snapshots_account_period
    ON usage_snapshots (account_id, billing_period_end);

-- -----------------------------------------------------------------------
-- Malformed/quarantined usage records (SOP Section 21, Exception Handling)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_ingestion_exceptions (
    exception_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id           TEXT,
    raw_payload          JSONB NOT NULL,
    exception_reason     TEXT NOT NULL,
    billing_period_end   DATE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            TEXT NOT NULL DEFAULT 'n8n_workflow_recon_nightly',
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by            TEXT NOT NULL DEFAULT 'n8n_workflow_recon_nightly'
);

-- -----------------------------------------------------------------------
-- Reconciliation ledger (SOP Section 34.5 / 34.3) — the persistent,
-- append-only record of every nightly usage-vs-invoice comparison.
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reconciliation_ledger (
    reconciliation_id            TEXT PRIMARY KEY,
    run_id                       TEXT NOT NULL,
    account_id                   TEXT NOT NULL REFERENCES accounts(account_id),
    billing_period_start         DATE NOT NULL,
    billing_period_end           DATE NOT NULL,
    metered_api_calls            BIGINT NOT NULL CHECK (metered_api_calls >= 0),
    invoiced_overage_units       BIGINT NOT NULL CHECK (invoiced_overage_units >= 0),
    variance_pct                 NUMERIC(8, 4) NOT NULL,
    variance_direction           TEXT NOT NULL
                                      CHECK (variance_direction IN ('underbilled', 'overbilled', 'matched')),
    estimated_dollar_impact_usd  NUMERIC(14, 2) NOT NULL,
    status                       TEXT NOT NULL DEFAULT 'pending_review'
                                      CHECK (status IN (
                                          'auto_resolved', 'pending_review', 'resolved',
                                          'adjusted', 'deferred_stale_source'
                                      )),
    root_cause_hint              TEXT,
    resolved_by                  TEXT,
    resolved_at                  TIMESTAMPTZ,
    resolution_notes             TEXT,
    adjusted_variance_amount_usd NUMERIC(14, 2),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                   TEXT NOT NULL DEFAULT 'n8n_workflow_recon_nightly',
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                   TEXT NOT NULL DEFAULT 'n8n_workflow_recon_nightly',
    CONSTRAINT recon_period_valid CHECK (billing_period_end >= billing_period_start),
    -- Manual overrides (SOP Section 20) require non-empty resolution_notes.
    CONSTRAINT recon_override_requires_notes CHECK (
        status NOT IN ('resolved', 'adjusted') OR
        (resolution_notes IS NOT NULL AND length(trim(resolution_notes)) > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_ledger_account
    ON reconciliation_ledger (account_id, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_reconciliation_ledger_status
    ON reconciliation_ledger (status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_ledger_run
    ON reconciliation_ledger (run_id);

-- Trigger: keep updated_at current on every row mutation (row-level audit
-- columns are mandatory on every table per SOP Section 6, Technical
-- Requirements).
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_reconciliation_ledger ON reconciliation_ledger;
CREATE TRIGGER set_updated_at_reconciliation_ledger
    BEFORE UPDATE ON reconciliation_ledger
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- -----------------------------------------------------------------------
-- Subscriptions & contract terms (SOP Section 34.5)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscriptions (
    subscription_id             TEXT PRIMARY KEY,
    account_id                  TEXT NOT NULL REFERENCES accounts(account_id),
    cost_center                 TEXT NOT NULL REFERENCES cost_center_map(cost_center_id),
    contract_start               DATE NOT NULL,
    contract_end                 DATE NOT NULL,
    seat_fee_total_usd           NUMERIC(14, 2) NOT NULL CHECK (seat_fee_total_usd > 0),
    included_api_calls           BIGINT NOT NULL CHECK (included_api_calls >= 0),
    overage_rate_per_unit_usd    NUMERIC(10, 6) NOT NULL CHECK (overage_rate_per_unit_usd >= 0),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                   TEXT NOT NULL DEFAULT 'system',
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                   TEXT NOT NULL DEFAULT 'system',
    CONSTRAINT subscription_contract_valid CHECK (contract_end >= contract_start)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_account
    ON subscriptions (account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_cost_center
    ON subscriptions (cost_center);

DROP TRIGGER IF EXISTS set_updated_at_subscriptions ON subscriptions;
CREATE TRIGGER set_updated_at_subscriptions
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- -----------------------------------------------------------------------
-- Mid-cycle plan change events (SOP Section 17, Scenario 3)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plan_change_events (
    event_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id      TEXT NOT NULL REFERENCES subscriptions(subscription_id),
    change_date           DATE NOT NULL,
    old_plan_id           TEXT NOT NULL,
    new_plan_id           TEXT NOT NULL,
    proration_applied     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by             TEXT NOT NULL DEFAULT 'system',
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by             TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_plan_change_events_subscription
    ON plan_change_events (subscription_id, change_date);

-- -----------------------------------------------------------------------
-- Revenue recognition schedule (SOP Section 34.5 / 14.2) — persisted
-- per-period recognition output for straight-line seat + usage-triggered
-- metered components.
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS revrec_schedule (
    schedule_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id          TEXT NOT NULL REFERENCES subscriptions(subscription_id),
    as_of                     DATE NOT NULL,
    component                 TEXT NOT NULL CHECK (component IN ('seat', 'usage')),
    seat_recognized_usd       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    usage_recognized_usd      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_recognized_usd      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    deferred_balance_usd      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status                    TEXT NOT NULL DEFAULT 'ready_to_post'
                                  CHECK (status IN (
                                      'ready_to_post', 'posted', 'needs_manual_split',
                                      'superseded', 'excluded_pending_review'
                                  )),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                 TEXT NOT NULL DEFAULT 'n8n_workflow_revrec_monthly',
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                 TEXT NOT NULL DEFAULT 'n8n_workflow_revrec_monthly',
    CONSTRAINT revrec_totals_consistent CHECK (
        total_recognized_usd = seat_recognized_usd + usage_recognized_usd
    )
);

CREATE INDEX IF NOT EXISTS idx_revrec_schedule_subscription
    ON revrec_schedule (subscription_id, as_of);
CREATE INDEX IF NOT EXISTS idx_revrec_schedule_status
    ON revrec_schedule (status);

DROP TRIGGER IF EXISTS set_updated_at_revrec_schedule ON revrec_schedule;
CREATE TRIGGER set_updated_at_revrec_schedule
    BEFORE UPDATE ON revrec_schedule
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Subscriptions blocked from the current posting run due to an unresolved
-- reconciliation variance or a Scenario-3-style contract split issue
-- (SOP Section 19, Fallback Procedures — `revrec_backlog`).
CREATE TABLE IF NOT EXISTS revrec_backlog (
    backlog_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   TEXT NOT NULL REFERENCES subscriptions(subscription_id),
    period_end         DATE NOT NULL,
    reason              TEXT NOT NULL,
    blocking_reconciliation_id TEXT REFERENCES reconciliation_ledger(reconciliation_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by           TEXT NOT NULL DEFAULT 'n8n_workflow_revrec_monthly',
    resolved_at          TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by             TEXT NOT NULL DEFAULT 'n8n_workflow_revrec_monthly',
    CONSTRAINT revrec_backlog_unique UNIQUE (subscription_id, period_end)
);

-- -----------------------------------------------------------------------
-- Posted journal entries (SOP Section 34.5 / 18 / 23) — the closed-loop
-- audit trail linking revrec_schedule rows to QuickBooks Online DocNumbers,
-- and the durable idempotency-key ledger that guards against double-posting.
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS posted_journal_entries (
    je_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id           UUID REFERENCES revrec_schedule(schedule_id),
    idempotency_key        TEXT NOT NULL,
    qbo_doc_number          TEXT,
    je_type                  TEXT NOT NULL
                                  CHECK (je_type IN (
                                      'deferred_revenue', 'recognized_revenue_seat',
                                      'recognized_revenue_usage', 'recognized_revenue_period_close',
                                      'reversing_entry'
                                  )),
    request_payload           JSONB NOT NULL,
    response_status             INTEGER,
    post_status                  TEXT NOT NULL DEFAULT 'pending'
                                      CHECK (post_status IN (
                                          'pending', 'posted', 'duplicate_prevented',
                                          'posting_failed'
                                      )),
    posted_at                    TIMESTAMPTZ,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                     TEXT NOT NULL DEFAULT 'n8n_workflow_revrec_monthly',
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                      TEXT NOT NULL DEFAULT 'n8n_workflow_revrec_monthly',
    -- The idempotency key must be unique per (subscription_batch, period, je_type)
    -- per SOP Section 16's data validation rule; enforced here at the DB layer
    -- as the local fast-path control described in Section 18.
    CONSTRAINT posted_journal_entries_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_posted_journal_entries_schedule
    ON posted_journal_entries (schedule_id);
CREATE INDEX IF NOT EXISTS idx_posted_journal_entries_status
    ON posted_journal_entries (post_status);

DROP TRIGGER IF EXISTS set_updated_at_posted_journal_entries ON posted_journal_entries;
CREATE TRIGGER set_updated_at_posted_journal_entries
    BEFORE UPDATE ON posted_journal_entries
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- -----------------------------------------------------------------------
-- Replica heartbeat (SOP Section 38, Technical Notes) — used by the
-- nightly job's replica-lag check (Section 17, Scenario 1) since the
-- managed Postgres provider does not expose pg_stat_replication to
-- non-superuser roles.
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS replica_heartbeat (
    heartbeat_id     SMALLINT PRIMARY KEY DEFAULT 1 CHECK (heartbeat_id = 1),
    last_updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO replica_heartbeat (heartbeat_id, last_updated_at)
VALUES (1, now())
ON CONFLICT (heartbeat_id) DO UPDATE SET last_updated_at = EXCLUDED.last_updated_at;

COMMIT;

-- =============================================================================
-- Seed data for local validation only (safe to skip in a real deployment)
-- =============================================================================

BEGIN;

INSERT INTO accounts (account_id, account_name, plan_id, status)
VALUES
    ('acct_am_10021', 'Clean Co', 'plan_growth_v3', 'active'),
    ('acct_am_48213', 'Atlas Metrics Demo Account', 'plan_growth_v3', 'active'),
    ('acct_am_77410', 'Mid-Cycle Change Inc', 'plan_growth_v3', 'active')
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO cost_center_map (cost_center_id, cost_center_name, qbo_class_ref)
VALUES ('104', 'Product-Analytics-Core', '104')
ON CONFLICT (cost_center_id) DO NOTHING;

COMMIT;
