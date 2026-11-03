-- Website-first relational model. Metadata providers can be connected later.
-- All records must be real, verified or explicitly marked as awaiting verification.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  synopsis TEXT,
  first_published INTEGER,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','verified','needs_review')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_works_title ON works(title);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  biography TEXT,
  image_key TEXT,
  image_credit TEXT,
  image_rights TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_people_name ON people(display_name);
CREATE TABLE IF NOT EXISTS work_contributors (
  work_id TEXT NOT NULL REFERENCES works(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  role TEXT NOT NULL CHECK (role IN ('author','editor','translator','illustrator')),
  ordinal INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(work_id,person_id,role)
);
CREATE TABLE IF NOT EXISTS editions (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  format TEXT NOT NULL CHECK (format IN ('paperback','hardback','ebook','audiobook','unknown')),
  isbn13 TEXT, asin TEXT, language TEXT, publisher TEXT,
  published_at TEXT, page_count INTEGER CHECK (page_count IS NULL OR page_count>=0),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes>=0),
  abridged INTEGER, cover_key TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(isbn13), UNIQUE(asin)
);
CREATE INDEX IF NOT EXISTS idx_editions_work ON editions(work_id);
CREATE TABLE IF NOT EXISTS edition_contributors (
  edition_id TEXT NOT NULL REFERENCES editions(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  role TEXT NOT NULL CHECK (role IN ('narrator','translator','editor')),
  ordinal INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(edition_id,person_id,role)
);
CREATE TABLE IF NOT EXISTS source_identifiers (
  id TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('work','edition','person')),
  entity_id TEXT NOT NULL,
  provider TEXT NOT NULL, external_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_checked_at TEXT,
  UNIQUE(provider,entity_kind,external_id)
);
CREATE TABLE IF NOT EXISTS field_provenance (
  entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL, provider TEXT NOT NULL,
  source_id TEXT, checked_at TEXT, locked_by_admin INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(entity_kind,entity_id,field_name)
);
CREATE TABLE IF NOT EXISTS image_assets (
  id TEXT PRIMARY KEY, r2_key TEXT UNIQUE,
  source_url TEXT,source_name TEXT,attribution TEXT,
  usage_permission TEXT, positioning_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS missing_book_requests (
  id TEXT PRIMARY KEY, member_id TEXT,
  requested_title TEXT NOT NULL,requested_author TEXT,requested_format TEXT,
  notes TEXT,state TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
