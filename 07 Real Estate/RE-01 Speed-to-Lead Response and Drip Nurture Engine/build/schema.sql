-- =============================================================================
-- RE-01: Speed-to-Lead Response & Drip Nurture Engine
-- PostgreSQL schema (executable DDL)
--
-- Matches the data model described in SOP.md:
--   - Section 12 (canonical lead schema, dedup keys)
--   - Section 17 (lead_exceptions, race-condition unique constraint)
--   - Section 19 (lead_dlq dead-letter queue)
--   - Section 23 (lead_audit_log, append-only, 24-month retention)
--
-- Target: PostgreSQL 14+ (per SOP Section 6, Technical Requirements)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------

-- Required for trigram-based fuzzy similarity matching on email/phone
-- (SOP Section 6, Section 12 Step 3).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Provides gen_random_uuid() for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- leads: system-of-record for a deduplicated person/household
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leads (
    lead_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name          TEXT,
    last_name           TEXT,
    email               TEXT,                     -- normalized: trimmed, lowercased
    phone               TEXT,                      -- normalized: E.164 (+1XXXXXXXXXX)
    source              TEXT NOT NULL
                        CHECK (source IN ('zillow', 'realtor_com', 'brokerage_site', 'manual', 'other')),
    source_lead_type    TEXT,                      -- buyer_inquiry | seller_inquiry | showing_request | valuation_request
    property_address    TEXT,
    listing_ref         TEXT,
    list_price          INTEGER CHECK (list_price IS NULL OR list_price >= 0),
    price_band          TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (price_band IN ('under_300k', '300k-500k', '500k-750k', '750k-plus', 'unknown')),
    inquiry_note        TEXT,
    captured_at         TIMESTAMPTZ NOT NULL,
    timestamp_inferred  BOOLEAN NOT NULL DEFAULT FALSE,
    email_invalid       BOOLEAN NOT NULL DEFAULT FALSE,
    phone_invalid       BOOLEAN NOT NULL DEFAULT FALSE,
    sms_undeliverable   BOOLEAN NOT NULL DEFAULT FALSE,
    form_completeness   NUMERIC(4,3) CHECK (form_completeness IS NULL OR (form_completeness >= 0 AND form_completeness <= 1)),
    score               INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    tier                TEXT CHECK (tier IS NULL OR tier IN ('fast_track', 'standard', 'long_cycle')),
    ghl_contact_id      TEXT,                      -- GoHighLevel contact ID once created
    last_sms_sent_at    TIMESTAMPTZ,
    last_touch_at       TIMESTAMPTZ,
    is_hot              BOOLEAN NOT NULL DEFAULT FALSE,
    close_lead_id       TEXT,                      -- Close CRM lead ID once escalated
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- At least one identifier must be present (SOP Section 16, Data Validation)
    CONSTRAINT leads_must_have_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Enforces the race-condition guard in SOP Section 17, Scenario 3:
-- a unique constraint on normalized phone (where not null) so that two
-- near-simultaneous inserts for the same person cannot both succeed.
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_unique_idx
    ON leads (phone)
    WHERE phone IS NOT NULL;

-- Trigram indexes powering the fuzzy-match dedup query (SOP Section 12, Step 3):
--   similarity(email, $1) > 0.85 OR similarity(phone, $2) > 0.92
CREATE INDEX IF NOT EXISTS leads_email_trgm_idx
    ON leads USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS leads_phone_trgm_idx
    ON leads USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS leads_source_idx ON leads (source);
CREATE INDEX IF NOT EXISTS leads_tier_idx ON leads (tier);
CREATE INDEX IF NOT EXISTS leads_is_hot_idx ON leads (is_hot) WHERE is_hot = TRUE;

-- -----------------------------------------------------------------------------
-- lead_inquiries: child inquiry events appended to an existing lead on a
-- dedup merge (SOP Section 12, Step 3 — "merge into existing lead record")
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_inquiries (
    inquiry_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id         UUID NOT NULL REFERENCES leads (lead_id) ON DELETE CASCADE,
    source          TEXT NOT NULL,
    inquiry_note    TEXT,
    listing_ref     TEXT,
    captured_at     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_inquiries_lead_id_idx ON lead_inquiries (lead_id);

-- -----------------------------------------------------------------------------
-- lead_exceptions: malformed/partial payloads that never became a lead
-- record (SOP Section 17, Scenario 2; Section 21)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_exceptions (
    exception_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_payload      JSONB NOT NULL,
    reason           TEXT NOT NULL,
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved         BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at      TIMESTAMPTZ,
    resolved_by      TEXT
);

CREATE INDEX IF NOT EXISTS lead_exceptions_resolved_idx ON lead_exceptions (resolved) WHERE resolved = FALSE;

-- -----------------------------------------------------------------------------
-- lead_dlq: dead-letter queue for exhausted retries on outbound API calls
-- (SOP Section 19, Fallback Procedures)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_dlq (
    dlq_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             UUID REFERENCES leads (lead_id) ON DELETE SET NULL,
    target_system       TEXT NOT NULL CHECK (target_system IN ('twilio', 'gohighlevel', 'close')),
    operation           TEXT NOT NULL,              -- e.g. 'send_sms', 'enroll_drip', 'create_hot_task'
    request_payload     JSONB NOT NULL,
    error_detail         TEXT,
    idempotency_key      TEXT NOT NULL,
    attempt_count        INTEGER NOT NULL DEFAULT 4,
    resolved             BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_dlq_idempotency_key_idx ON lead_dlq (idempotency_key);
CREATE INDEX IF NOT EXISTS lead_dlq_resolved_idx ON lead_dlq (resolved) WHERE resolved = FALSE;

-- -----------------------------------------------------------------------------
-- lead_audit_log: append-only audit trail of every state transition
-- (SOP Section 18, Section 23 — 24-month retention, never updated/deleted)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_audit_log (
    audit_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                  UUID REFERENCES leads (lead_id) ON DELETE SET NULL,
    event_type               TEXT NOT NULL
                             CHECK (event_type IN (
                                 'created', 'deduplicated', 'scored', 'enrolled',
                                 'escalated', 're_scored', 'manual_override',
                                 'exception_logged', 'dlq_written', 'dlq_resolved'
                             )),
    resulting_state           TEXT NOT NULL,
    workflow_execution_id     TEXT NOT NULL,        -- n8n execution ID that produced this row
    actor                     TEXT,                  -- populated for manual_override events
    reason                    TEXT,                  -- required free-text reason for manual_override
    occurred_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Idempotent composite key (SOP Section 18): a retried audit write
    -- cannot double-count the same state transition.
    CONSTRAINT lead_audit_log_idempotent UNIQUE (lead_id, event_type, occurred_at)
);

CREATE INDEX IF NOT EXISTS lead_audit_log_lead_id_idx ON lead_audit_log (lead_id);
CREATE INDEX IF NOT EXISTS lead_audit_log_event_type_idx ON lead_audit_log (event_type);
CREATE INDEX IF NOT EXISTS lead_audit_log_occurred_at_idx ON lead_audit_log (occurred_at);

-- -----------------------------------------------------------------------------
-- engagement_events: raw GHL engagement webhook events (reply/click/booking)
-- feeding the escalation decision (SOP Section 14, Section 15)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS engagement_events (
    event_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id              UUID REFERENCES leads (lead_id) ON DELETE SET NULL,
    ghl_contact_id        TEXT NOT NULL,
    event_type            TEXT NOT NULL CHECK (event_type IN ('sms_reply', 'email_click', 'appointment_booked')),
    event_timestamp        TIMESTAMPTZ NOT NULL,
    escalated              BOOLEAN NOT NULL DEFAULT FALSE,
    orphaned                BOOLEAN NOT NULL DEFAULT FALSE,  -- contactId did not resolve to a known lead
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engagement_events_lead_id_idx ON engagement_events (lead_id);
CREATE INDEX IF NOT EXISTS engagement_events_orphaned_idx ON engagement_events (orphaned) WHERE orphaned = TRUE;

-- -----------------------------------------------------------------------------
-- agent_roster: active-agent roster used for round-robin Close CRM
-- assignment (SOP Section 7, Dependencies; Section 42, Risk Assessment)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_roster (
    agent_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name        TEXT NOT NULL,
    office            TEXT NOT NULL,
    close_user_id     TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_assigned_at  TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_roster_active_idx ON agent_roster (is_active) WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- Trigger: keep updated_at current on leads and agent_roster
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_set_updated_at ON leads;
CREATE TRIGGER leads_set_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS agent_roster_set_updated_at ON agent_roster;
CREATE TRIGGER agent_roster_set_updated_at
    BEFORE UPDATE ON agent_roster
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Example fuzzy-dedup query (SOP Section 12, Step 3) — reference only,
-- shown here for documentation; executed at runtime by the n8n Postgres
-- node with $1 = normalized email, $2 = normalized phone.
-- -----------------------------------------------------------------------------

-- SELECT lead_id, email, phone, last_sms_sent_at
-- FROM leads
-- WHERE (similarity(email, $1) > 0.85 AND $1 IS NOT NULL)
--    OR (similarity(phone, $2) > 0.92 AND $2 IS NOT NULL)
-- ORDER BY GREATEST(similarity(email, $1), similarity(phone, $2)) DESC
-- LIMIT 1;
