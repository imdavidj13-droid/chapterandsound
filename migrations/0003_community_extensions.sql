-- Community interaction tables beyond the initial schema.
CREATE TABLE IF NOT EXISTS discussion_reactions (
 discussion_id TEXT NOT NULL REFERENCES discussions(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 reaction TEXT NOT NULL CHECK(reaction IN ('heart')),
 PRIMARY KEY(discussion_id,member_id,reaction)
);
CREATE TABLE IF NOT EXISTS club_room_messages (
 id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL REFERENCES club_rooms(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 body TEXT NOT NULL,
 spoilers INTEGER NOT NULL DEFAULT 0,
 deleted_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_club_room_messages ON club_room_messages(room_id,created_at);
CREATE TABLE IF NOT EXISTS member_challenge_goals (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id),
 title TEXT NOT NULL,
 target_count INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 10000),
 rules_json TEXT NOT NULL,
 privacy TEXT NOT NULL DEFAULT 'private',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS site_settings (
 setting_key TEXT PRIMARY KEY,
 setting_json TEXT NOT NULL,
 updated_by TEXT REFERENCES members(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Role assignments and audited actions live in 0004_moderation_roles.sql.
