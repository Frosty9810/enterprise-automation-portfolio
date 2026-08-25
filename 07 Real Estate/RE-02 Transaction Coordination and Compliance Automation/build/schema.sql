-- =============================================================================
-- RE-02: Transaction Coordination & Compliance Automation
-- PostgreSQL 14+ schema for the transaction/deadline/compliance ledger model
-- described in SOP RE-02 Sections 12, 14, 20, 21, 23, 34.
--
-- Deploy with:
--   psql -h <host> -U <user> -d <database> -f schema.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- transactions
-- One row per Dotloop loop / Close Opportunity that has reached Under
-- Contract. This is the compliance dashboard's primary table (SOP FR-9).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id                      BIGSERIAL PRIMARY KEY,
    close_opportunity_id    TEXT NOT NULL UNIQUE,
    dotloop_loop_id         TEXT UNIQUE,
    office_code             TEXT NOT NULL,
    office_timezone         TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    transaction_type        TEXT NOT NULL
        CHECK (transaction_type IN ('financed', 'cash', 'short_sale')),
    property_address        TEXT NOT NULL,
    contract_execution_date DATE,
    buyer_name               TEXT,
    buyer_email              TEXT,
    buyer_phone               TEXT,
    seller_name              TEXT,
    seller_email             TEXT,
    seller_phone              TEXT,
    agent_email              TEXT,
    escrow_officer_name      TEXT,
    escrow_officer_email     TEXT,
    escrow_officer_phone     TEXT,
    closing_folder_url       TEXT,
    document_status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (document_status IN ('pending', 'partially_signed', 'fully_executed', 'stale')),
    lifecycle_state           TEXT NOT NULL DEFAULT 'under_contract'
        CHECK (lifecycle_state IN (
            'under_contract', 'inspection', 'financing', 'clear_to_close',
            'closed', 'fell_through'
        )),
    status                    TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'closed', 'fell_through', 'exception')),
    notification_degraded      BOOLEAN NOT NULL DEFAULT FALSE,
    template_corrected_at       TIMESTAMPTZ,
    last_document_poll_at        TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_office_code ON transactions (office_code);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_lifecycle_state ON transactions (lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_transactions_dotloop_loop_id ON transactions (dotloop_loop_id);

-- -----------------------------------------------------------------------------
-- deadline_offsets
-- Per-office override of the brokerage-wide default milestone offsets
-- (SOP Section 14 DEFAULT_OFFSETS_DAYS, Section 20 manual override path).
-- A NULL office_code row represents the brokerage-wide default.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deadline_offsets (
    id                    BIGSERIAL PRIMARY KEY,
    office_code           TEXT,
    milestone             TEXT NOT NULL
        CHECK (milestone IN (
            'earnest_money', 'inspection_contingency',
            'financing_contingency', 'closing'
        )),
    offset_days           INTEGER NOT NULL CHECK (offset_days > 0),
    approved_by_business_owner TEXT,
    approved_by_compliance_owner TEXT,
    effective_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (office_code, milestone)
);

-- -----------------------------------------------------------------------------
-- deadlines
-- One row per contractual milestone per transaction (earnest_money,
-- inspection_contingency, financing_contingency, closing). Short-sale
-- transactions omit financing_contingency (SOP Section 14).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deadlines (
    id              BIGSERIAL PRIMARY KEY,
    transaction_id  BIGINT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    milestone       TEXT NOT NULL
        CHECK (milestone IN (
            'earnest_money', 'inspection_contingency',
            'financing_contingency', 'closing'
        )),
    due_date        DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'complete', 'missed')),
    completed_at    TIMESTAMPTZ,
    version         INTEGER NOT NULL DEFAULT 1,  -- optimistic locking (SOP Section 21)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaction_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_deadlines_transaction_id ON deadlines (transaction_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines (due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_status_due_date ON deadlines (status, due_date);

-- -----------------------------------------------------------------------------
-- deadline_overrides
-- Audit-preserving override history for a deadline date change
-- (SOP Section 20). The original deadline row is never deleted.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deadline_overrides (
    id                    BIGSERIAL PRIMARY KEY,
    deadline_id           BIGINT NOT NULL REFERENCES deadlines (id) ON DELETE CASCADE,
    prior_due_date        DATE NOT NULL,
    new_due_date          DATE NOT NULL,
    reason                TEXT NOT NULL,
    requires_broker_approval BOOLEAN NOT NULL DEFAULT FALSE,
    broker_approved_by    TEXT,
    broker_approved_at    TIMESTAMPTZ,
    submitted_by          TEXT NOT NULL,
    submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deadline_overrides_deadline_id ON deadline_overrides (deadline_id);

-- -----------------------------------------------------------------------------
-- notifications
-- One row per notification send attempt (email or SMS) at a given tier,
-- supporting idempotency checks and the "re-trigger" manual override
-- (SOP Section 18, Section 20).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id              BIGSERIAL PRIMARY KEY,
    deadline_id     BIGINT NOT NULL REFERENCES deadlines (id) ON DELETE CASCADE,
    recipient_role  TEXT NOT NULL
        CHECK (recipient_role IN ('buyer', 'seller', 'agent', 'escrow', 'managing_broker', 'tc')),
    channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
    tier            TEXT NOT NULL CHECK (tier IN ('T-3', 'T-1', 'T-0', 'escalation')),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivery_status TEXT NOT NULL DEFAULT 'sent'
        CHECK (delivery_status IN ('sent', 'failed', 'skipped_missing_contact')),
    re_triggered    BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (deadline_id, recipient_role, channel, tier, re_triggered)
);

CREATE INDEX IF NOT EXISTS idx_notifications_deadline_id ON notifications (deadline_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications (sent_at);

-- -----------------------------------------------------------------------------
-- escalations
-- One row per missed-T-0 escalation to the managing broker (SOP Section 14
-- step 9, Section 22, Section 28 KPI tracking).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escalations (
    id              BIGSERIAL PRIMARY KEY,
    deadline_id     BIGINT NOT NULL REFERENCES deadlines (id) ON DELETE CASCADE,
    transaction_id  BIGINT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    escalated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason          TEXT NOT NULL,
    broker_responded_at TIMESTAMPTZ,
    resolution_notes TEXT,
    is_false_positive BOOLEAN NOT NULL DEFAULT FALSE  -- SOP Section 35 troubleshooting case
);

CREATE INDEX IF NOT EXISTS idx_escalations_transaction_id ON escalations (transaction_id);
CREATE INDEX IF NOT EXISTS idx_escalations_escalated_at ON escalations (escalated_at);

-- -----------------------------------------------------------------------------
-- exceptions
-- Human-reviewed exception queue entries (SOP Section 16, Section 21):
-- unrecognized transaction_type, missing escrow contact, unrecognized office
-- code, etc.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exceptions (
    id              BIGSERIAL PRIMARY KEY,
    opportunity_id  TEXT NOT NULL,
    transaction_id  BIGINT REFERENCES transactions (id) ON DELETE SET NULL,
    exception_type  TEXT NOT NULL
        CHECK (exception_type IN (
            'transaction_type_invalid', 'escrow_contact_missing',
            'office_code_unrecognized', 'ambiguous_property_address',
            'pending_manual_creation', 'duplicate_loop_suspected'
        )),
    reason          TEXT NOT NULL,
    assigned_to     TEXT,
    resolved_at     TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exceptions_opportunity_id ON exceptions (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_resolved_at ON exceptions (resolved_at);

-- -----------------------------------------------------------------------------
-- audit_log
-- Append-only audit trail for every state-changing event (SOP Section 23).
-- Application/service accounts should be granted INSERT only; UPDATE/DELETE
-- reserved for a separate DBA role used for approved corrections only.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    transaction_id  BIGINT REFERENCES transactions (id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,
    acting_principal TEXT NOT NULL,  -- service account name or named user ID
    before_value    JSONB,
    after_value     JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_transaction_id ON audit_log (transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON audit_log (occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log (event_type);

-- -----------------------------------------------------------------------------
-- Trigger: keep transactions.updated_at current on any row update.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_deadlines_updated_at ON deadlines;
CREATE TRIGGER trg_deadlines_updated_at
    BEFORE UPDATE ON deadlines
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Compliance dashboard view (SOP FR-9): one row per transaction, queryable
-- by office, TC assignment (not modeled as a column here — join to a TC
-- assignment table in a full deployment), and deadline status.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW compliance_dashboard AS
SELECT
    t.id                          AS transaction_id,
    t.close_opportunity_id,
    t.dotloop_loop_id,
    t.office_code,
    t.transaction_type,
    t.property_address,
    t.lifecycle_state,
    t.status,
    t.document_status,
    t.notification_degraded,
    COUNT(d.id) FILTER (WHERE d.status = 'pending')  AS open_deadlines,
    COUNT(d.id) FILTER (WHERE d.status = 'missed')   AS missed_deadlines,
    COUNT(e.id)                                       AS escalation_count,
    t.last_document_poll_at,
    t.updated_at
FROM transactions t
LEFT JOIN deadlines d ON d.transaction_id = t.id
LEFT JOIN escalations e ON e.transaction_id = t.id
GROUP BY t.id;

COMMIT;
