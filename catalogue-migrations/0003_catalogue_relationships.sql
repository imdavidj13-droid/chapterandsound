-- Catalogue extension 0003: work/edition/audio/series and contributor relationships.
-- Additive ONLY. Depends on 0001 and 0002; no changes to previously applied tables.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS work_relationships (
 id TEXT PRIMARY KEY,
 from_work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 to_work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 relation_type TEXT NOT NULL CHECK(relation_type IN ('sequel','prequel','adaptation','compilation','contains','contained_in','related','same_universe','other')),
 ordinal INTEGER CHECK(ordinal IS NULL OR ordinal >= 0),
 notes TEXT,
 CHECK(from_work_id <> to_work_id),
 UNIQUE(from_work_id,to_work_id,relation_type)
);
CREATE INDEX IF NOT EXISTS idx_cat_work_relationship_target ON work_relationships(to_work_id,relation_type);

CREATE TABLE IF NOT EXISTS work_languages (
 id TEXT PRIMARY KEY,
 work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 language TEXT NOT NULL CHECK(length(trim(language)) BETWEEN 2 AND 35),
 relationship TEXT NOT NULL CHECK(relationship IN ('original','available','translation','other')),
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT,
 UNIQUE(work_id,language,relationship)
);
CREATE INDEX IF NOT EXISTS idx_cat_work_languages_language ON work_languages(language,work_id);

CREATE TABLE IF NOT EXISTS edition_details (
 edition_id TEXT PRIMARY KEY REFERENCES editions(id) ON DELETE RESTRICT,
 binding TEXT,
 trim_height_mm REAL CHECK(trim_height_mm IS NULL OR trim_height_mm>0),
 trim_width_mm REAL CHECK(trim_width_mm IS NULL OR trim_width_mm>0),
 thickness_mm REAL CHECK(thickness_mm IS NULL OR thickness_mm>0),
 weight_g REAL CHECK(weight_g IS NULL OR weight_g>0),
 illustration_count INTEGER CHECK(illustration_count IS NULL OR illustration_count>=0),
 file_format TEXT,
 file_size_bytes INTEGER CHECK(file_size_bytes IS NULL OR file_size_bytes>0),
 technical_json TEXT CHECK(technical_json IS NULL OR json_valid(technical_json))
);

CREATE TABLE IF NOT EXISTS edition_relationships (
 id TEXT PRIMARY KEY,
 edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
 related_edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
 relation_type TEXT NOT NULL CHECK(relation_type IN ('replaces','replaced_by','same_content','reprint_of','digital_of','part_of','contains','related','other')),
 notes TEXT,
 CHECK(edition_id <> related_edition_id),
 UNIQUE(edition_id,related_edition_id,relation_type)
);
CREATE INDEX IF NOT EXISTS idx_cat_edition_relationship_related ON edition_relationships(related_edition_id);

CREATE TABLE IF NOT EXISTS edition_languages (
 edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
 language TEXT NOT NULL CHECK(length(trim(language)) BETWEEN 2 AND 35),
 usage TEXT NOT NULL CHECK(usage IN ('text','original','parallel','translation','narration','other')),
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT,
 PRIMARY KEY(edition_id,language,usage)
);
CREATE INDEX IF NOT EXISTS idx_cat_edition_languages_language ON edition_languages(language);

CREATE TABLE IF NOT EXISTS audio_tracks (
 id TEXT PRIMARY KEY,
 recording_id TEXT NOT NULL REFERENCES audio_recordings(id) ON DELETE RESTRICT,
 sequence INTEGER NOT NULL CHECK(sequence>0),
 title TEXT,
 duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds>0),
 start_offset_seconds INTEGER CHECK(start_offset_seconds IS NULL OR start_offset_seconds>=0),
 track_type TEXT CHECK(track_type IS NULL OR track_type IN ('chapter','introduction','credits','sample','bonus','part','other')),
 UNIQUE(recording_id,sequence)
);

CREATE TABLE IF NOT EXISTS audio_recording_details (
 recording_id TEXT PRIMARY KEY REFERENCES audio_recordings(id) ON DELETE RESTRICT,
 studio_id TEXT REFERENCES organisations(id) ON DELETE RESTRICT,
 channels INTEGER CHECK(channels IS NULL OR channels BETWEEN 1 AND 32),
 sample_rate_hz INTEGER CHECK(sample_rate_hz IS NULL OR sample_rate_hz>0),
 bitrate_kbps INTEGER CHECK(bitrate_kbps IS NULL OR bitrate_kbps>0),
 audio_codec TEXT,
 production_notes TEXT,
 includes_music INTEGER CHECK(includes_music IS NULL OR includes_music IN (0,1)),
 sound_effects INTEGER CHECK(sound_effects IS NULL OR sound_effects IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_cat_audio_details_studio ON audio_recording_details(studio_id);

CREATE TABLE IF NOT EXISTS organisation_names (
 id TEXT PRIMARY KEY,
 organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 valid_from TEXT,
 valid_to TEXT,
 name_type TEXT NOT NULL CHECK(name_type IN ('former','alternative','translated','trading','acronym','other'))
);
CREATE INDEX IF NOT EXISTS idx_cat_org_names_owner ON organisation_names(organisation_id);
CREATE INDEX IF NOT EXISTS idx_cat_org_names_search ON organisation_names(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS publisher_imprints (
 publisher_id TEXT NOT NULL REFERENCES publishers(organisation_id) ON DELETE RESTRICT,
 imprint_id TEXT NOT NULL REFERENCES imprints(id) ON DELETE RESTRICT,
 valid_from TEXT NOT NULL DEFAULT '',
 valid_to TEXT,
 PRIMARY KEY(publisher_id,imprint_id,valid_from)
);
CREATE INDEX IF NOT EXISTS idx_cat_imprint_publishers ON publisher_imprints(imprint_id);

CREATE TABLE IF NOT EXISTS series_relationships (
 parent_series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
 child_series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
 relation_type TEXT NOT NULL CHECK(relation_type IN ('subseries','shared_universe','related','other')),
 CHECK(parent_series_id <> child_series_id),
 PRIMARY KEY(parent_series_id,child_series_id,relation_type)
);
CREATE INDEX IF NOT EXISTS idx_cat_series_relation_child ON series_relationships(child_series_id);
