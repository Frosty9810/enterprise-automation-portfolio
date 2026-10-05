-- Proposed PostgreSQL persistence model; the local demo currently uses SQLite.
-- Apply once to a fresh disposable database. No DROP statements or runtime wiring.
BEGIN;
CREATE SCHEMA agt_01;
CREATE TABLE agt_01.tool_proposal (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  ticket_id text NOT NULL,
  tool_name text NOT NULL,
  estimated_cents integer NOT NULL CHECK (estimated_cents >= 0),
  budget_cents integer NOT NULL CHECK (budget_cents >= 0),
  grounded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE agt_01.decision_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id text NOT NULL REFERENCES agt_01.tool_proposal(id),
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  queue text NOT NULL CHECK (length(btrim(queue)) > 0),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON agt_01.decision_event (subject_id, recorded_at);
COMMIT;
