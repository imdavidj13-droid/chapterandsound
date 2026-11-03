-- Public reader profiles: all optional disclosures are opt-in.
CREATE TABLE IF NOT EXISTS profile_visibility (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  show_tastes INTEGER NOT NULL DEFAULT 0 CHECK(show_tastes IN (0,1)),
  show_favourite_authors INTEGER NOT NULL DEFAULT 0 CHECK(show_favourite_authors IN (0,1)),
  show_favourite_narrators INTEGER NOT NULL DEFAULT 0 CHECK(show_favourite_narrators IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_member_public_handle ON members(handle) WHERE handle IS NOT NULL;
