CREATE SCHEMA IF NOT EXISTS ecom_reviews;

CREATE TABLE IF NOT EXISTS ecom_reviews.review_events (
  review_id TEXT PRIMARY KEY,
  event_hash TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  verified_purchase BOOLEAN NOT NULL,
  market TEXT NOT NULL,
  redacted_text TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecom_reviews.triage_decisions (
  decision_id BIGSERIAL PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE REFERENCES ecom_reviews.review_events(review_id),
  queue TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal','high','urgent')),
  reasons JSONB NOT NULL,
  auto_publish_allowed BOOLEAN NOT NULL DEFAULT false,
  respond_by TIMESTAMPTZ NOT NULL,
  classifier_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecom_reviews.response_approvals (
  approval_id BIGSERIAL PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES ecom_reviews.review_events(review_id),
  draft_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','published')),
  actor_id TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecom_reviews.issue_clusters (
  cluster_id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  theme TEXT NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 1 CHECK (review_count > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  UNIQUE (sku, theme, status)
);

CREATE TABLE IF NOT EXISTS ecom_reviews.publish_receipts (
  review_id TEXT PRIMARY KEY REFERENCES ecom_reviews.review_events(review_id),
  external_response_id TEXT NOT NULL UNIQUE,
  published_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_queue ON ecom_reviews.triage_decisions(queue, respond_by);
