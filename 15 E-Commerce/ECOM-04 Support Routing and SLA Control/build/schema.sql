CREATE SCHEMA IF NOT EXISTS ecom_support;

CREATE TABLE IF NOT EXISTS ecom_support.ticket_events (
  event_id TEXT PRIMARY KEY,
  event_hash TEXT NOT NULL UNIQUE,
  external_ticket_id TEXT NOT NULL,
  market TEXT NOT NULL,
  redacted_text TEXT NOT NULL,
  order_reference_hash TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecom_support.route_decisions (
  decision_id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES ecom_support.ticket_events(event_id),
  queue TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal','high','urgent')),
  reasons JSONB NOT NULL,
  respond_by TIMESTAMPTZ NOT NULL,
  policy_version TEXT NOT NULL,
  classifier_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecom_support.sla_events (
  sla_event_id BIGSERIAL PRIMARY KEY,
  decision_id BIGINT NOT NULL REFERENCES ecom_support.route_decisions(decision_id),
  event_type TEXT NOT NULL CHECK (event_type IN ('started','warning','breached','responded','paused')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ecom_support.escalations (
  escalation_id BIGSERIAL PRIMARY KEY,
  decision_id BIGINT NOT NULL REFERENCES ecom_support.route_decisions(decision_id),
  owner_queue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ecom_support.outcomes (
  decision_id BIGINT PRIMARY KEY REFERENCES ecom_support.route_decisions(decision_id),
  final_queue TEXT NOT NULL,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  rerouted BOOLEAN NOT NULL DEFAULT false,
  quality_label TEXT CHECK (quality_label IN ('correct','incorrect','unknown'))
);

CREATE INDEX IF NOT EXISTS idx_support_sla ON ecom_support.route_decisions(respond_by, priority);
