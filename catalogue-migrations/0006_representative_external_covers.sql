-- Curated representative book cover, independent of individual edition artwork.
-- Open Library cover IDs are links to source-hosted images, not stored images.
-- Requires an explicit owner selection with a matched canonical Open Library work.
CREATE TABLE IF NOT EXISTS work_representative_covers(
 work_id TEXT PRIMARY KEY REFERENCES works(id) ON DELETE RESTRICT,
 openlibrary_work_key TEXT NOT NULL CHECK(openlibrary_work_key GLOB '/works/OL*W'),
 openlibrary_cover_id INTEGER NOT NULL CHECK(openlibrary_cover_id>0),
 chosen_by TEXT NOT NULL,
 chosen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
