CREATE SCHEMA IF NOT EXISTS ecom_localization;

CREATE TABLE IF NOT EXISTS ecom_localization.source_revisions (
  product_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  source_locale TEXT NOT NULL,
  sku TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  protected_facts JSONB NOT NULL,
  translatable_copy JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, revision)
);

CREATE TABLE IF NOT EXISTS ecom_localization.locale_jobs (
  job_id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  target_locale TEXT NOT NULL,
  glossary_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','generated','human_review','blocked','approved','published','failed')),
  estimated_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, source_revision)
    REFERENCES ecom_localization.source_revisions(product_id, revision)
);

CREATE TABLE IF NOT EXISTS ecom_localization.candidates (
  candidate_id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES ecom_localization.locale_jobs(job_id),
  content JSONB NOT NULL,
  model_name TEXT,
  prompt_version TEXT NOT NULL,
  validation_action TEXT NOT NULL CHECK (validation_action IN ('auto_publish','human_review','blocked')),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecom_localization.approvals (
  approval_id BIGSERIAL PRIMARY KEY,
  candidate_id BIGINT NOT NULL REFERENCES ecom_localization.candidates(candidate_id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  actor_id TEXT NOT NULL,
  note TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecom_localization.publish_receipts (
  receipt_id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL UNIQUE REFERENCES ecom_localization.locale_jobs(job_id),
  shopify_resource_id TEXT NOT NULL,
  published_hash TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locale_jobs_status ON ecom_localization.locale_jobs(status, created_at);
