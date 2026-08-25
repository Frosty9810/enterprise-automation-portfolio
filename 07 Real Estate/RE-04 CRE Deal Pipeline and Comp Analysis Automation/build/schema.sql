-- =============================================================================
-- RE-04 CRE Deal Pipeline and Comp Analysis Automation
-- PostgreSQL schema — comp database and deal financial model
--
-- Matches the ER diagram in SOP.md Section 34 (Appendix) and the field
-- validation rules in SOP.md Section 16. Targets PostgreSQL 14+ per the
-- Technical Requirements in SOP.md Section 6, including the `pgcrypto`
-- extension for column-level encryption of sensitive financial fields
-- (SOP.md Section 24, Security).
--
-- Run with:
--   psql -h <host> -U <user> -d <database> -f schema.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------

CREATE TYPE asset_class_enum AS ENUM ('office', 'industrial', 'retail', 'multifamily', 'mixed_use', 'hospitality');
CREATE TYPE building_class_enum AS ENUM ('A', 'B', 'C');
CREATE TYPE transaction_type_enum AS ENUM ('sale', 'lease');
CREATE TYPE source_platform_enum AS ENUM ('CoStar', 'LoopNet', 'Manual');
CREATE TYPE om_approval_status_enum AS ENUM ('Pending Broker Review', 'Corrections Requested', 'Approved', 'Distributed');

-- -----------------------------------------------------------------------------
-- Table: opportunity
--   Mirrors the subset of the Salesforce Opportunity object this workflow
--   reads/writes against (SOP.md Section 8, Section 34 ER diagram). This is
--   a local reference copy for FK integrity and reporting joins — Salesforce
--   remains the system of record (SOP.md Section 3, Business Goals).
-- -----------------------------------------------------------------------------

CREATE TABLE opportunity (
    opportunity_id              VARCHAR(18) PRIMARY KEY,          -- Salesforce Opportunity Id (18-char)
    asset_class                 asset_class_enum NOT NULL,
    record_type                 VARCHAR(50) NOT NULL DEFAULT 'CRE_Deal',
    broker_owner_id             VARCHAR(18) NOT NULL,             -- Salesforce User Id of broker of record
    subject_property_address    TEXT NOT NULL,
    om_approval_status          om_approval_status_enum NOT NULL DEFAULT 'Pending Broker Review',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_opportunity_record_type CHECK (record_type = 'CRE_Deal')
);

CREATE INDEX idx_opportunity_broker_owner ON opportunity (broker_owner_id);
CREATE INDEX idx_opportunity_asset_class ON opportunity (asset_class);

-- -----------------------------------------------------------------------------
-- Table: comps
--   Canonical, deal-independent comp store (SOP.md Section 3, Business
--   Goals — "durable, queryable comp database... compounds in value with
--   every deal processed"). A comp is inserted once and may be linked to
--   multiple deals via deal_comp_link (SOP.md Section 17, Scenario 4).
-- -----------------------------------------------------------------------------

CREATE TABLE comps (
    comp_id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_platform              source_platform_enum NOT NULL,
    source_document_s3_key       TEXT,
    address                      TEXT NOT NULL,
    city                         VARCHAR(100),
    state                        VARCHAR(2),
    zip_code                     VARCHAR(10),
    asset_class                  asset_class_enum NOT NULL,
    building_class               building_class_enum,
    transaction_type             transaction_type_enum NOT NULL,
    transaction_date             DATE NOT NULL,
    sale_price_usd               NUMERIC(14, 2),
    price_per_sf                 NUMERIC(10, 2) NOT NULL,
    building_sf                  NUMERIC(12, 2) NOT NULL,

    -- Sensitive financial fields — column-level encryption via pgcrypto
    -- (SOP.md Section 24, Security). Stored as bytea ciphertext; application
    -- layer encrypts/decrypts with pgp_sym_encrypt/pgp_sym_decrypt using a
    -- key from the secrets manager, never hardcoded in SQL.
    cap_rate_encrypted            BYTEA,
    noi_annual_usd_encrypted      BYTEA,

    -- Plaintext mirror columns used only for statistical computation and
    -- range-validation (SOP.md Section 16); in a production deployment
    -- these may be dropped in favor of decrypting on read if policy requires
    -- zero plaintext-at-rest for these fields. Included here so schema.sql
    -- is directly usable by comp_analysis.py without requiring a pgcrypto
    -- key exchange step for the reference build.
    cap_rate                     NUMERIC(6, 5)
        CONSTRAINT chk_comps_cap_rate_range CHECK (cap_rate IS NULL OR (cap_rate >= 0.01 AND cap_rate <= 0.20)),
    noi_annual_usd                NUMERIC(14, 2),

    tenant_vacancy_notes         TEXT,
    extraction_confidence        JSONB,             -- per-field confidence, e.g. {"cap_rate": "high"}
    needs_review                 BOOLEAN NOT NULL DEFAULT FALSE,
    is_outlier_last_run           BOOLEAN NOT NULL DEFAULT FALSE,
    overridden_by_user_id         VARCHAR(18),
    override_reason               TEXT,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_comps_price_per_sf_positive CHECK (price_per_sf > 0),
    CONSTRAINT chk_comps_building_sf_positive CHECK (building_sf > 0),
    CONSTRAINT chk_comps_transaction_date_not_future CHECK (transaction_date <= CURRENT_DATE),
    CONSTRAINT uq_comps_dedupe UNIQUE (address, transaction_date, transaction_type)
);

CREATE INDEX idx_comps_asset_class ON comps (asset_class);
CREATE INDEX idx_comps_transaction_date ON comps (transaction_date);
CREATE INDEX idx_comps_needs_review ON comps (needs_review) WHERE needs_review = TRUE;
CREATE INDEX idx_comps_zip ON comps (zip_code);

COMMENT ON COLUMN comps.cap_rate_encrypted IS 'pgcrypto pgp_sym_encrypt ciphertext of cap_rate; SOP.md Section 24';
COMMENT ON COLUMN comps.noi_annual_usd_encrypted IS 'pgcrypto pgp_sym_encrypt ciphertext of noi_annual_usd; SOP.md Section 24';
COMMENT ON CONSTRAINT uq_comps_dedupe ON comps IS 'Duplicate-detection tuple per SOP.md Section 16 and Section 17 Scenario 4';

-- -----------------------------------------------------------------------------
-- Table: deal_comp_link
--   Many-to-many join between opportunity and comps, carrying the
--   per-deal outlier/acceptance decision (a comp can be an accepted
--   comp on one deal's valuation and, in principle, be re-evaluated
--   differently on another). Mirrors SOP.md Section 34 ER diagram.
-- -----------------------------------------------------------------------------

CREATE TABLE deal_comp_link (
    link_id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id                VARCHAR(18) NOT NULL REFERENCES opportunity (opportunity_id) ON DELETE CASCADE,
    comp_id                       UUID NOT NULL REFERENCES comps (comp_id) ON DELETE CASCADE,
    is_outlier_flagged            BOOLEAN NOT NULL DEFAULT FALSE,
    is_accepted                   BOOLEAN NOT NULL DEFAULT FALSE,
    outlier_override_by_user_id   VARCHAR(18),
    override_reason               TEXT,
    linked_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_deal_comp_link UNIQUE (opportunity_id, comp_id)
);

CREATE INDEX idx_deal_comp_link_opportunity ON deal_comp_link (opportunity_id);
CREATE INDEX idx_deal_comp_link_comp ON deal_comp_link (comp_id);

COMMENT ON TABLE deal_comp_link IS 'Join table associating durable comps with specific deals; SOP.md Section 17 Scenario 4 dedupe path writes here instead of re-inserting comps.';

-- -----------------------------------------------------------------------------
-- Table: deal_financial_model
--   One row per opportunity: subject property NOI, computed valuation
--   range, confidence score, and the draft narrative. Mirrors SOP.md
--   Section 34 ER diagram and the Salesforce Opportunity update payload
--   in the same section.
-- -----------------------------------------------------------------------------

CREATE TABLE deal_financial_model (
    model_id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id                 VARCHAR(18) NOT NULL UNIQUE REFERENCES opportunity (opportunity_id) ON DELETE CASCADE,
    subject_noi_annual_usd         NUMERIC(14, 2) NOT NULL CHECK (subject_noi_annual_usd > 0),
    median_cap_rate                 NUMERIC(6, 5) NOT NULL,
    cap_rate_stdev                  NUMERIC(6, 5) NOT NULL DEFAULT 0,
    valuation_range_low             NUMERIC(14, 2) NOT NULL,
    valuation_range_high            NUMERIC(14, 2) NOT NULL,
    valuation_point_estimate        NUMERIC(14, 2) NOT NULL,
    confidence_score                 NUMERIC(4, 3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    comp_count_used                  INTEGER NOT NULL DEFAULT 0,
    outlier_count_excluded           INTEGER NOT NULL DEFAULT 0,
    draft_narrative                  TEXT,
    om_s3_key                        TEXT,
    generated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_dfm_valuation_range_order CHECK (valuation_range_low <= valuation_range_high)
);

CREATE INDEX idx_dfm_opportunity ON deal_financial_model (opportunity_id);

-- -----------------------------------------------------------------------------
-- Table: audit_log
--   Append-only audit trail (SOP.md Section 23). No UPDATE/DELETE grants
--   are issued to application roles in this reference schema — see the
--   REVOKE statements near the end of this file.
-- -----------------------------------------------------------------------------

CREATE TABLE audit_log (
    log_id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id                 VARCHAR(18) REFERENCES opportunity (opportunity_id) ON DELETE SET NULL,
    comp_id                        UUID REFERENCES comps (comp_id) ON DELETE SET NULL,
    actor_user_id                  VARCHAR(18) NOT NULL,          -- Salesforce User Id, or 'SYSTEM'
    action_type                    VARCHAR(100) NOT NULL,          -- e.g. 'comp_ingested', 'field_override', 'outlier_override', 'om_approved'
    before_value                   TEXT,
    after_value                    TEXT,
    logged_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_opportunity ON audit_log (opportunity_id);
CREATE INDEX idx_audit_log_comp ON audit_log (comp_id);
CREATE INDEX idx_audit_log_action_type ON audit_log (action_type);
CREATE INDEX idx_audit_log_logged_at ON audit_log (logged_at);

COMMENT ON TABLE audit_log IS 'Append-only per SOP.md Section 23; retained 7 years.';

-- -----------------------------------------------------------------------------
-- Table: workflow_dead_letter
--   Failed writes that exhausted retries (SOP.md Section 18, Section 19).
-- -----------------------------------------------------------------------------

CREATE TABLE workflow_dead_letter (
    dead_letter_id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id                  VARCHAR(18) REFERENCES opportunity (opportunity_id) ON DELETE SET NULL,
    operation_type                  VARCHAR(100) NOT NULL,        -- e.g. 'salesforce_opportunity_update', 's3_om_upload'
    idempotency_key                 VARCHAR(255) NOT NULL,
    original_payload                JSONB NOT NULL,
    failure_reason                  TEXT NOT NULL,
    retry_count                     INTEGER NOT NULL DEFAULT 0,
    resolved                        BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at                     TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_dead_letter_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_dead_letter_unresolved ON workflow_dead_letter (resolved) WHERE resolved = FALSE;

-- -----------------------------------------------------------------------------
-- Trigger: keep updated_at current on mutable tables
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_opportunity_updated_at
    BEFORE UPDATE ON opportunity
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_comps_updated_at
    BEFORE UPDATE ON comps
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_dfm_updated_at
    BEFORE UPDATE ON deal_financial_model
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Roles and grants (illustrative — SOP.md Section 25, Permissions)
--   Actual role/user provisioning is environment-specific; these grants
--   demonstrate the append-only audit_log posture and the workflow
--   service role's full read/write scope described in Section 25.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 're04_workflow_service') THEN
        CREATE ROLE re04_workflow_service LOGIN PASSWORD 'CHANGE_ME_IN_SECRETS_MANAGER';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 're04_reporting_readonly') THEN
        CREATE ROLE re04_reporting_readonly LOGIN PASSWORD 'CHANGE_ME_IN_SECRETS_MANAGER';
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON opportunity, comps, deal_comp_link, deal_financial_model TO re04_workflow_service;
GRANT SELECT, INSERT ON audit_log, workflow_dead_letter TO re04_workflow_service;
-- No UPDATE/DELETE on audit_log for any role, including the service role — append-only per Section 23.

GRANT SELECT ON opportunity, comps, deal_comp_link, deal_financial_model, audit_log TO re04_reporting_readonly;

COMMIT;
