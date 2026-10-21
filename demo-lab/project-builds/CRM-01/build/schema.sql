-- Proposed PostgreSQL persistence model; the local demo currently uses SQLite.
-- Apply once to a fresh disposable database. No DROP statements or runtime wiring.
BEGIN;
CREATE SCHEMA crm_01;
CREATE TABLE crm_01.account_handoff (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  account_id text NOT NULL,
  owner_name text NOT NULL,
  email text NOT NULL,
  incoming_version integer NOT NULL CHECK (incoming_version >= 0),
  current_version integer NOT NULL CHECK (current_version >= 0),
  consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE crm_01.decision_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id text NOT NULL REFERENCES crm_01.account_handoff(id),
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  queue text NOT NULL CHECK (length(btrim(queue)) > 0),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON crm_01.decision_event (subject_id, recorded_at);
COMMIT;
