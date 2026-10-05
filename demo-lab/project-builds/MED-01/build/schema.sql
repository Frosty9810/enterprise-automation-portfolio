-- Proposed PostgreSQL persistence model; the local demo currently uses SQLite.
-- Apply once to a fresh disposable database. No DROP statements or runtime wiring.
BEGIN;
CREATE SCHEMA med_01;
CREATE TABLE med_01.referral (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  payer_code text NOT NULL,
  storage_consent boolean NOT NULL DEFAULT false,
  documents jsonb NOT NULL CHECK (jsonb_typeof(documents) = 'array'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE med_01.decision_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id text NOT NULL REFERENCES med_01.referral(id),
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  queue text NOT NULL CHECK (length(btrim(queue)) > 0),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON med_01.decision_event (subject_id, recorded_at);
COMMIT;
