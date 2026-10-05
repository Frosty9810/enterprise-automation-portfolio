-- Proposed PostgreSQL persistence model; the local demo currently uses SQLite.
-- Apply once to a fresh disposable database. No DROP statements or runtime wiring.
BEGIN;
CREATE SCHEMA ops_01;
CREATE TABLE ops_01.recovery_event (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  attempt integer NOT NULL CHECK (attempt >= 0),
  http_status integer NOT NULL CHECK (http_status >= 0),
  retry_after_seconds integer NOT NULL CHECK (retry_after_seconds >= 0),
  confirmed boolean NOT NULL DEFAULT false,
  uncertain boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ops_01.decision_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id text NOT NULL REFERENCES ops_01.recovery_event(id),
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  queue text NOT NULL CHECK (length(btrim(queue)) > 0),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON ops_01.decision_event (subject_id, recorded_at);
COMMIT;
