-- Theme choice belongs to the authenticated member, not browser local storage.
CREATE TABLE IF NOT EXISTS member_theme_preferences (
 member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 theme_id TEXT NOT NULL DEFAULT 'editorial'
  CHECK(theme_id IN ('editorial','reading-room')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
