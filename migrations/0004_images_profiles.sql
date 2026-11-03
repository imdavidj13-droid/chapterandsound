-- Media metadata and portrait/cover ownership. No third-party image import is authorised by this migration.
CREATE TABLE IF NOT EXISTS images (
 id TEXT PRIMARY KEY,
 storage_key TEXT,
 original_url TEXT,
 mime_type TEXT,
 width INTEGER CHECK(width IS NULL OR width>0),
 height INTEGER CHECK(height IS NULL OR height>0),
 source_name TEXT NOT NULL,
 source_page_url TEXT,
 credit TEXT,
 license TEXT,
 usage_rights_verified INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS person_portraits (
 person_id TEXT PRIMARY KEY REFERENCES people(id),
 image_id TEXT NOT NULL REFERENCES images(id),
 object_position_x REAL NOT NULL DEFAULT 50 CHECK(object_position_x BETWEEN 0 AND 100),
 object_position_y REAL NOT NULL DEFAULT 50 CHECK(object_position_y BETWEEN 0 AND 100)
);
CREATE TABLE IF NOT EXISTS edition_covers (
 edition_id TEXT PRIMARY KEY REFERENCES editions(id),
 image_id TEXT NOT NULL REFERENCES images(id)
);
CREATE TABLE IF NOT EXISTS review_reflections (
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES reviews(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 reflection_text TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reader_profile_visibility (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 show_favourites INTEGER NOT NULL DEFAULT 0,
 show_shelves INTEGER NOT NULL DEFAULT 0,
 show_challenges INTEGER NOT NULL DEFAULT 0
);
