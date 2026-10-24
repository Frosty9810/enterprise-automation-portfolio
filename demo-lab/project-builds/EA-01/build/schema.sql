-- Proposed PostgreSQL persistence model; the local demo currently uses SQLite.
-- Apply once to a fresh disposable database. No DROP statements or runtime wiring.
BEGIN;
CREATE SCHEMA ea_01;
CREATE TABLE ea_01.commitment (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  owner_name text NOT NULL CHECK (length(btrim(owner_name)) > 0),
  commitment_text text NOT NULL CHECK (length(btrim(commitment_text)) > 0),
  authorized boolean NOT NULL DEFAULT false,
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ea_01.decision_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id text NOT NULL REFERENCES ea_01.commitment(id),
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  queue text NOT NULL CHECK (length(btrim(queue)) > 0),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON ea_01.decision_event (subject_id, recorded_at);
COMMIT;
