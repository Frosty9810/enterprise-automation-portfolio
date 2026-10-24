-- Proposed PostgreSQL persistence model; the local demo currently uses SQLite.
-- Apply once to a fresh disposable database. No DROP statements or runtime wiring.
BEGIN;
CREATE SCHEMA con_01;
CREATE TABLE con_01.change_request (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  requester text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  version integer NOT NULL CHECK (version > 0),
  certificate_expiry date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE con_01.decision_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id text NOT NULL REFERENCES con_01.change_request(id),
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  queue text NOT NULL CHECK (length(btrim(queue)) > 0),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON con_01.decision_event (subject_id, recorded_at);
COMMIT;
