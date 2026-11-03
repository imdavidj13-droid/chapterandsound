-- Chapter & Sound BOOK_DB catalogue, staging candidate. NEVER apply to application DB.
-- 0001: identity, editions, recordings, contributors and series.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS works(
 id TEXT PRIMARY KEY,
 canonical_title TEXT NOT NULL CHECK(length(trim(canonical_title)) BETWEEN 1 AND 500),
 original_language TEXT,
 work_type TEXT NOT NULL DEFAULT 'book' CHECK(work_type IN ('book','short_story','collection','graphic_novel','comic','poetry','play','reference','other')),
 first_publication_date TEXT CHECK(first_publication_date IS NULL OR (length(first_publication_date) IN (4,7,10) AND substr(first_publication_date,1,4) GLOB '[0-9][0-9][0-9][0-9]')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','needs_review','verified','published','withdrawn','suppressed')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_works_title ON works(canonical_title COLLATE NOCASE,id);
CREATE INDEX IF NOT EXISTS idx_cat_works_status ON works(status,updated_at);
CREATE TABLE IF NOT EXISTS work_versions(
 id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 version_type TEXT NOT NULL CHECK(version_type IN ('original','translation','revision','abridgement','adaptation','annotated','other')),
 title TEXT,language TEXT,source_version_id TEXT REFERENCES work_versions(id) ON DELETE RESTRICT,
 date TEXT,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(source_version_id IS NULL OR source_version_id!=id)
);
CREATE INDEX IF NOT EXISTS idx_cat_versions_work ON work_versions(work_id);
CREATE TABLE IF NOT EXISTS work_titles(
 id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(trim(title))>0),subtitle TEXT,
 title_type TEXT NOT NULL CHECK(title_type IN ('alternative','original','translated','regional','working','other')),
 language TEXT,territory TEXT,source_claim_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_titles_work ON work_titles(work_id);
CREATE INDEX IF NOT EXISTS idx_cat_titles_text ON work_titles(title COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS organisations(
 id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(trim(name))>0),
 organisation_type TEXT NOT NULL DEFAULT 'other' CHECK(organisation_type IN ('publisher','studio','rights_holder','agency','distributor','other')),
 country TEXT,website_url TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS publishers(
 organisation_id TEXT PRIMARY KEY REFERENCES organisations(id) ON DELETE RESTRICT,
 primary_market TEXT,publisher_notes TEXT
);
CREATE TABLE IF NOT EXISTS imprints(
 id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(trim(name))>0),
 publisher_id TEXT REFERENCES publishers(organisation_id) ON DELETE RESTRICT,
 website_url TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS people(
 id TEXT PRIMARY KEY,preferred_name TEXT NOT NULL CHECK(length(trim(preferred_name))>0),
 sort_name TEXT,bio TEXT,birth_date TEXT,death_date TEXT,
 identity_status TEXT NOT NULL DEFAULT 'provisional' CHECK(identity_status IN ('provisional','verified','disambiguation_required','merged','suppressed')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_people_name ON people(preferred_name COLLATE NOCASE,id);
CREATE TABLE IF NOT EXISTS person_names(
 id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 name_type TEXT NOT NULL CHECK(name_type IN ('pen_name','credited','birth_name','transliteration','alias','other')),
 language TEXT,script TEXT,is_public INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_cat_person_names ON person_names(person_id);
CREATE TABLE IF NOT EXISTS editions(
 id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 version_id TEXT REFERENCES work_versions(id) ON DELETE RESTRICT,
 format TEXT NOT NULL CHECK(format IN ('paperback','hardback','ebook','audiobook','audio_cd','other_print','other_digital','unknown')),
 edition_statement TEXT,title_override TEXT,language TEXT,
 page_count INTEGER CHECK(page_count IS NULL OR page_count>0),
 page_count_type TEXT CHECK(page_count_type IS NULL OR page_count_type IN ('printed','ebook','publisher_reported','other')),
 publication_status TEXT NOT NULL DEFAULT 'draft' CHECK(publication_status IN ('draft','announced','preorder','published','withdrawn','out_of_print')),
 verification_status TEXT NOT NULL DEFAULT 'draft' CHECK(verification_status IN ('draft','needs_review','verified','published','withdrawn','suppressed')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_editions_work ON editions(work_id,format);
CREATE INDEX IF NOT EXISTS idx_cat_editions_status ON editions(verification_status);
-- Validate version/work match both at insert and update; SQLite cross-table CHECK is unavailable.
CREATE TRIGGER IF NOT EXISTS trg_cat_edition_version_insert BEFORE INSERT ON editions
 WHEN NEW.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_versions v WHERE v.id=NEW.version_id AND v.work_id=NEW.work_id)
 BEGIN SELECT RAISE(ABORT,'edition version must belong to edition work');END;
CREATE TRIGGER IF NOT EXISTS trg_cat_edition_version_update BEFORE UPDATE OF version_id,work_id ON editions
 WHEN NEW.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_versions v WHERE v.id=NEW.version_id AND v.work_id=NEW.work_id)
 BEGIN SELECT RAISE(ABORT,'edition version must belong to edition work');END;
CREATE TABLE IF NOT EXISTS audio_recordings(
 id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 version_id TEXT REFERENCES work_versions(id) ON DELETE RESTRICT,recording_title TEXT,language TEXT,
 abridgement TEXT NOT NULL DEFAULT 'unknown' CHECK(abridgement IN ('unabridged','abridged','adapted','unknown')),
 performance_type TEXT NOT NULL DEFAULT 'unknown' CHECK(performance_type IN ('single_narrator','multi_narrator','full_cast','dramatised','synthetic_voice','unknown')),
 duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds>0),
 duration_precision TEXT DEFAULT 'unknown' CHECK(duration_precision IN ('exact','rounded','approximate','unknown')),
 recorded_date TEXT,master_version TEXT,
 verification_status TEXT NOT NULL DEFAULT 'draft' CHECK(verification_status IN ('draft','needs_review','verified','published','withdrawn','suppressed')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_audio_work ON audio_recordings(work_id);
CREATE TRIGGER IF NOT EXISTS trg_cat_recording_version_insert BEFORE INSERT ON audio_recordings
 WHEN NEW.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_versions v WHERE v.id=NEW.version_id AND v.work_id=NEW.work_id)
 BEGIN SELECT RAISE(ABORT,'recording version must belong to recording work');END;
CREATE TRIGGER IF NOT EXISTS trg_cat_recording_version_update BEFORE UPDATE OF version_id,work_id ON audio_recordings
 WHEN NEW.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_versions v WHERE v.id=NEW.version_id AND v.work_id=NEW.work_id)
 BEGIN SELECT RAISE(ABORT,'recording version must belong to recording work');END;
CREATE TABLE IF NOT EXISTS edition_recordings(
 edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
 recording_id TEXT NOT NULL REFERENCES audio_recordings(id) ON DELETE RESTRICT,
 sequence INTEGER NOT NULL DEFAULT 1 CHECK(sequence>0),
 primary_recording INTEGER NOT NULL DEFAULT 0 CHECK(primary_recording IN (0,1)),
 PRIMARY KEY(edition_id,recording_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_primary_recording ON edition_recordings(edition_id) WHERE primary_recording=1;
CREATE TRIGGER IF NOT EXISTS trg_cat_edition_recording_insert BEFORE INSERT ON edition_recordings
 WHEN NOT EXISTS(SELECT 1 FROM editions e JOIN audio_recordings r ON r.id=NEW.recording_id
 WHERE e.id=NEW.edition_id AND e.work_id=r.work_id AND e.format IN ('audiobook','audio_cd'))
 BEGIN SELECT RAISE(ABORT,'recording and edition must share work and audio format');END;
CREATE TRIGGER IF NOT EXISTS trg_cat_edition_recording_update BEFORE UPDATE OF edition_id,recording_id ON edition_recordings
 WHEN NOT EXISTS(SELECT 1 FROM editions e JOIN audio_recordings r ON r.id=NEW.recording_id
 WHERE e.id=NEW.edition_id AND e.work_id=r.work_id AND e.format IN ('audiobook','audio_cd'))
 BEGIN SELECT RAISE(ABORT,'recording and edition must share work and audio format');END;
CREATE TABLE IF NOT EXISTS contributions(
 id TEXT PRIMARY KEY,
 person_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
 organisation_id TEXT REFERENCES organisations(id) ON DELETE RESTRICT,
 work_id TEXT REFERENCES works(id) ON DELETE RESTRICT,
 version_id TEXT REFERENCES work_versions(id) ON DELETE RESTRICT,
 edition_id TEXT REFERENCES editions(id) ON DELETE RESTRICT,
 recording_id TEXT REFERENCES audio_recordings(id) ON DELETE RESTRICT,
 role_code TEXT NOT NULL CHECK(role_code IN ('author','coauthor','narrator','cast','translator','editor','illustrator','cover_artist','foreword','afterword','adapter','producer','director','audio_engineer','other')),
 credit_name TEXT,credit_order INTEGER NOT NULL DEFAULT 0 CHECK(credit_order>=0),notes TEXT,
 CHECK((person_id IS NOT NULL)+(organisation_id IS NOT NULL)=1),
 CHECK((work_id IS NOT NULL)+(version_id IS NOT NULL)+(edition_id IS NOT NULL)+(recording_id IS NOT NULL)=1),
 CHECK(role_code NOT IN ('narrator','cast','audio_engineer') OR recording_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_cat_contrib_person ON contributions(person_id,role_code);
CREATE INDEX IF NOT EXISTS idx_cat_contrib_work ON contributions(work_id,role_code);
CREATE INDEX IF NOT EXISTS idx_cat_contrib_edition ON contributions(edition_id,role_code);
CREATE INDEX IF NOT EXISTS idx_cat_contrib_recording ON contributions(recording_id,role_code);
CREATE TABLE IF NOT EXISTS series(
 id TEXT PRIMARY KEY,title TEXT NOT NULL CHECK(length(trim(title))>0),
 description TEXT,series_type TEXT NOT NULL DEFAULT 'series' CHECK(series_type IN ('series','subseries','universe','collection')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS series_memberships(
 id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
 work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 sequence_decimal REAL,display_number TEXT,
 membership_type TEXT NOT NULL DEFAULT 'primary' CHECK(membership_type IN ('primary','related','companion','alternate')),
 source_claim_id TEXT,UNIQUE(series_id,work_id,membership_type)
);
CREATE INDEX IF NOT EXISTS idx_cat_series_memberships ON series_memberships(series_id,sequence_decimal);
CREATE TABLE IF NOT EXISTS publication_events(
 id TEXT PRIMARY KEY,edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type IN ('announced','preorder','released','reprinted','revised','withdrawn','out_of_print')),
 date_value TEXT,territory TEXT,
 publisher_id TEXT REFERENCES publishers(organisation_id) ON DELETE RESTRICT,
 imprint_id TEXT REFERENCES imprints(id) ON DELETE RESTRICT,
 source_claim_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_pub_events ON publication_events(edition_id,date_value);
