-- Administrators are granted explicitly in the D1 database by a trusted operator.
-- Never derive elevated permissions from client parameters or email domain.
CREATE TABLE IF NOT EXISTS site_roles(
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  role TEXT NOT NULL CHECK(role IN ('admin','moderator')),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by TEXT
);
CREATE TABLE IF NOT EXISTS moderation_actions(
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES members(id),
  report_id TEXT REFERENCES content_reports(id),
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('dismiss','hide_review')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mod_actor ON moderation_actions(actor_id,created_at);
