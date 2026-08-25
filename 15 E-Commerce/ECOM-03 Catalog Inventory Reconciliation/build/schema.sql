CREATE SCHEMA IF NOT EXISTS ecom_inventory;

CREATE TABLE IF NOT EXISTS ecom_inventory.sku_maps (
  canonical_sku TEXT NOT NULL,
  location_code TEXT NOT NULL,
  shopify_inventory_item_id TEXT NOT NULL,
  warehouse_sku TEXT NOT NULL,
  erp_item_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (canonical_sku, location_code)
);

CREATE TABLE IF NOT EXISTS ecom_inventory.snapshots (
  snapshot_id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('shopify','warehouse','erp')),
  source_version TEXT NOT NULL,
  canonical_sku TEXT NOT NULL,
  location_code TEXT NOT NULL,
  payload JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  UNIQUE (source, source_version, canonical_sku, location_code)
);

CREATE TABLE IF NOT EXISTS ecom_inventory.reconciliation_runs (
  run_id UUID PRIMARY KEY,
  watermark JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running','completed','partial','failed'))
);

CREATE TABLE IF NOT EXISTS ecom_inventory.decisions (
  decision_id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES ecom_inventory.reconciliation_runs(run_id),
  canonical_sku TEXT NOT NULL,
  location_code TEXT NOT NULL,
  correction_key TEXT NOT NULL UNIQUE,
  expected_sellable INTEGER,
  observed_shopify INTEGER,
  action TEXT NOT NULL CHECK (action IN ('aligned','safe_correction','quarantine')),
  reasons JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecom_inventory.correction_receipts (
  correction_key TEXT PRIMARY KEY REFERENCES ecom_inventory.decisions(correction_key),
  external_request_id TEXT NOT NULL UNIQUE,
  requested_quantity INTEGER NOT NULL CHECK (requested_quantity >= 0),
  verified_quantity INTEGER CHECK (verified_quantity >= 0),
  applied_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ecom_inventory.conflicts (
  conflict_id BIGSERIAL PRIMARY KEY,
  decision_id BIGINT NOT NULL REFERENCES ecom_inventory.decisions(decision_id),
  owner_queue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inventory_conflicts ON ecom_inventory.conflicts(status, owner_queue);
