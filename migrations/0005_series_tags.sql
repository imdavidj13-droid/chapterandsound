-- Series are independent catalogue entities. Multiple editions of a work share one series position.
CREATE TABLE IF NOT EXISTS series (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 description TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS series_works (
 series_id TEXT NOT NULL REFERENCES series(id),
 work_id TEXT NOT NULL REFERENCES works(id),
 sequence_number REAL,
 label TEXT,
 PRIMARY KEY(series_id,work_id)
);
CREATE INDEX IF NOT EXISTS idx_series_works_order ON series_works(series_id,sequence_number);
CREATE TABLE IF NOT EXISTS work_genres (
 work_id TEXT NOT NULL REFERENCES works(id),
 tag TEXT NOT NULL,
 PRIMARY KEY(work_id,tag)
);
