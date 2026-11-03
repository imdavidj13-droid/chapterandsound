-- Permanent audit trail for all administrator writes.
-- No public route may update this table directly.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES members(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_date ON admin_audit_log(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_log(actor_id,created_at DESC);
CREATE TABLE IF NOT EXISTS admin_site_notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft','published','archived')),
  updated_by TEXT NOT NULL REFERENCES members(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_site_notices_state ON admin_site_notices(visibility,updated_at DESC);
