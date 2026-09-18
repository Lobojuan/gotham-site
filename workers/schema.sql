-- Gotham Consult × Carlson Capital — CRM database schema (Cloudflare D1)
-- Apply with:  wrangler d1 execute gotham-crm --file=schema.sql
CREATE TABLE IF NOT EXISTS registrations (
  ref              TEXT PRIMARY KEY,
  item_id          TEXT,
  item_title       TEXT,
  item_sub         TEXT,
  qty              INTEGER NOT NULL DEFAULT 1,
  unit_price       REAL    NOT NULL DEFAULT 0,
  total            REAL    NOT NULL DEFAULT 0,
  currency         TEXT    NOT NULL DEFAULT 'USD',
  payment_method   TEXT,
  company          TEXT,
  reg_no           TEXT,
  name             TEXT,
  role             TEXT,
  email            TEXT,
  phone            TEXT,
  country          TEXT,
  sector           TEXT,
  guests           TEXT,
  txn_ref          TEXT,
  status           TEXT    NOT NULL DEFAULT 'new',
  amount_received  REAL    NOT NULL DEFAULT 0,
  received_currency TEXT,
  received_method  TEXT,
  notes            TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_registrations_status  ON registrations (status);
CREATE INDEX IF NOT EXISTS idx_registrations_created ON registrations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_email   ON registrations (email);
