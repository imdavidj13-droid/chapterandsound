-- Community schema draft. Requires 0001_catalogue.sql and a configured D1 binding.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS members (
 id TEXT PRIMARY KEY, email_normalized TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL, handle TEXT UNIQUE, bio TEXT, avatar_key TEXT,
 email_verified_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id),
 expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);
CREATE TABLE IF NOT EXISTS preferences (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 format_json TEXT NOT NULL DEFAULT '[]', genre_json TEXT NOT NULL DEFAULT '[]',
 mood_json TEXT NOT NULL DEFAULT '[]', onboarding_step INTEGER NOT NULL DEFAULT 0,
 onboarding_completed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS favourite_people (
 member_id TEXT NOT NULL REFERENCES members(id), person_id TEXT NOT NULL REFERENCES people(id),
 role TEXT NOT NULL CHECK(role IN ('author','narrator')),
 PRIMARY KEY(member_id,person_id,role)
);
CREATE TABLE IF NOT EXISTS reading_experiences (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id),
 work_id TEXT NOT NULL REFERENCES works(id), edition_id TEXT REFERENCES editions(id),
 status TEXT NOT NULL CHECK(status IN ('want_to_read','in_progress','paused','finished','dnf')),
 started_at TEXT, finished_at TEXT, progress_unit TEXT, progress_value REAL, 
 private_note TEXT, private_rating REAL CHECK(private_rating IS NULL OR (private_rating>=0 AND private_rating<=5)),
 note_has_spoilers INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reading_owner ON reading_experiences(member_id,status);
CREATE TABLE IF NOT EXISTS progress_entries (
 id TEXT PRIMARY KEY,experience_id TEXT NOT NULL REFERENCES reading_experiences(id),
 progress_unit TEXT NOT NULL, progress_value REAL NOT NULL, logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 private_note TEXT
);
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),
 book_id TEXT NOT NULL REFERENCES works(id),edition_id TEXT REFERENCES editions(id),
 experience_id TEXT REFERENCES reading_experiences(id),
 title TEXT,body TEXT,story_rating REAL CHECK(story_rating IS NULL OR (story_rating>=0 AND story_rating<=5)),
 narration_rating REAL CHECK(narration_rating IS NULL OR (narration_rating>=0 AND narration_rating<=5)),
 spoilers INTEGER NOT NULL DEFAULT 0,
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','removed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,published_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reviews_public ON reviews(status,visibility,published_at);
CREATE INDEX IF NOT EXISTS idx_reviews_owner ON reviews(member_id,status);
CREATE TABLE IF NOT EXISTS review_helpful (
 review_id TEXT NOT NULL REFERENCES reviews(id), member_id TEXT NOT NULL REFERENCES members(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(review_id,member_id)
);
CREATE TABLE IF NOT EXISTS content_reports (
 id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES members(id),
 content_type TEXT NOT NULL, content_id TEXT NOT NULL,
 reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS curated_lists (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES members(id),title TEXT NOT NULL,
 description TEXT,visibility TEXT NOT NULL DEFAULT 'private',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS curated_list_books (
 list_id TEXT NOT NULL REFERENCES curated_lists(id),work_id TEXT NOT NULL REFERENCES works(id),
 ordinal INTEGER NOT NULL DEFAULT 0, note TEXT,
 PRIMARY KEY(list_id,work_id)
);
CREATE TABLE IF NOT EXISTS discussions (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES members(id),title TEXT NOT NULL,
 body TEXT NOT NULL,spoilers INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS discussion_replies (
 id TEXT PRIMARY KEY,discussion_id TEXT NOT NULL REFERENCES discussions(id),
 member_id TEXT NOT NULL REFERENCES members(id),body TEXT NOT NULL,
 spoilers INTEGER NOT NULL DEFAULT 0,deleted_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS discussion_saves (
 member_id TEXT NOT NULL REFERENCES members(id),discussion_id TEXT NOT NULL REFERENCES discussions(id),
 PRIMARY KEY(member_id,discussion_id)
);
CREATE TABLE IF NOT EXISTS clubs (
 id TEXT PRIMARY KEY,host_id TEXT NOT NULL REFERENCES members(id),
 name TEXT NOT NULL,description TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS club_members (
 club_id TEXT NOT NULL REFERENCES clubs(id),member_id TEXT NOT NULL REFERENCES members(id),
 role TEXT NOT NULL DEFAULT 'member',PRIMARY KEY(club_id,member_id)
);
CREATE TABLE IF NOT EXISTS club_reads (
 id TEXT PRIMARY KEY,club_id TEXT NOT NULL REFERENCES clubs(id),
 work_id TEXT NOT NULL REFERENCES works(id),started_at TEXT,ends_at TEXT,
 timezone TEXT
);
CREATE TABLE IF NOT EXISTS club_rooms (
 id TEXT PRIMARY KEY,club_read_id TEXT NOT NULL REFERENCES club_reads(id),
 title TEXT NOT NULL,spoiler_scope TEXT NOT NULL
 CHECK(spoiler_scope IN ('none','chapter_range','full_book')),
 chapter_start INTEGER,chapter_end INTEGER
);
CREATE TABLE IF NOT EXISTS recommendation_requests (
 id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),
 title TEXT NOT NULL,description TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recommendations (
 id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES recommendation_requests(id),
 member_id TEXT NOT NULL REFERENCES members(id),work_id TEXT NOT NULL REFERENCES works(id),
 reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS challenges (
 id TEXT PRIMARY KEY,owner_id TEXT REFERENCES members(id),title TEXT NOT NULL,
 description TEXT,rule_json TEXT NOT NULL,starts_at TEXT,ends_at TEXT,
 visibility TEXT NOT NULL DEFAULT 'public'
);
CREATE TABLE IF NOT EXISTS challenge_members (
 challenge_id TEXT NOT NULL REFERENCES challenges(id),member_id TEXT NOT NULL REFERENCES members(id),
 privacy TEXT NOT NULL DEFAULT 'private',joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(challenge_id,member_id)
);
CREATE TABLE IF NOT EXISTS challenge_books (
 challenge_id TEXT NOT NULL,member_id TEXT NOT NULL,
 experience_id TEXT NOT NULL REFERENCES reading_experiences(id),
 PRIMARY KEY(challenge_id,member_id,experience_id),
 FOREIGN KEY(challenge_id,member_id) REFERENCES challenge_members(challenge_id,member_id)
);
-- All member-owned tables require verified session/owner checks in server routes before exposing writes or private reads.
