-- Proposed PostgreSQL persistence model; the local demo currently uses SQLite.
-- Apply once to a fresh disposable database. No DROP statements or runtime wiring.
BEGIN;
CREATE SCHEMA inv_01;
CREATE TABLE inv_01.stock_snapshot (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  sku text NOT NULL,
  on_hand integer NOT NULL CHECK (on_hand >= 0),
  reserved integer NOT NULL CHECK (reserved >= 0 AND reserved <= on_hand),
  target integer NOT NULL CHECK (target >= 0),
  pack_size integer NOT NULL CHECK (pack_size > 0),
  stock_age_hours integer NOT NULL CHECK (stock_age_hours >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE inv_01.decision_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id text NOT NULL REFERENCES inv_01.stock_snapshot(id),
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  queue text NOT NULL CHECK (length(btrim(queue)) > 0),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON inv_01.decision_event (subject_id, recorded_at);
COMMIT;
