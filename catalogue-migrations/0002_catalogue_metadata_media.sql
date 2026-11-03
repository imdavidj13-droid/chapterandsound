-- Chapter & Sound BOOK_DB staging candidate. Source, IDs, media and audit.
-- Never run against application DB.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS metadata_licences(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,licence_url TEXT,
 display_allowed INTEGER NOT NULL DEFAULT 0 CHECK(display_allowed IN (0,1)),
 storage_allowed INTEGER NOT NULL DEFAULT 0 CHECK(storage_allowed IN (0,1)),
 external_api_allowed INTEGER NOT NULL DEFAULT 0 CHECK(external_api_allowed IN (0,1)),
 attribution_required INTEGER NOT NULL DEFAULT 1 CHECK(attribution_required IN (0,1)),
 expires_at TEXT
);
CREATE TABLE IF NOT EXISTS metadata_sources(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,source_type TEXT NOT NULL
 CHECK(source_type IN ('public_dataset','publisher','distributor','library','retailer','editorial','other')),
 licence_id TEXT NOT NULL REFERENCES metadata_licences(id) ON DELETE RESTRICT,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 base_url TEXT,refresh_policy_json TEXT CHECK(refresh_policy_json IS NULL OR json_valid(refresh_policy_json))
);
CREATE TABLE IF NOT EXISTS source_records(
 id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES metadata_sources(id) ON DELETE RESTRICT,
 external_key TEXT NOT NULL,payload_r2_key TEXT,payload_hash TEXT,
 fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 licence_id TEXT NOT NULL REFERENCES metadata_licences(id) ON DELETE RESTRICT,
 parse_status TEXT NOT NULL DEFAULT 'received' CHECK(parse_status IN ('received','parsed','rejected','expired')),
 UNIQUE(source_id,external_key)
);
CREATE INDEX IF NOT EXISTS idx_cat_src_source ON source_records(source_id,fetched_at);
CREATE TABLE IF NOT EXISTS field_claims(
 id TEXT PRIMARY KEY,entity_kind TEXT NOT NULL CHECK(entity_kind IN ('work','version','edition','recording','person','series','organisation')),
 entity_id TEXT NOT NULL,field_path TEXT NOT NULL,
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
 confidence REAL CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)),
 observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 chosen INTEGER NOT NULL DEFAULT 0 CHECK(chosen IN (0,1)),
 locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_cat_claim_entity ON field_claims(entity_kind,entity_id,field_path);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_claim_chosen ON field_claims(entity_kind,entity_id,field_path) WHERE chosen=1;
CREATE TABLE IF NOT EXISTS identifier_schemes(
 id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,issuer TEXT,
 entity_scope TEXT NOT NULL CHECK(entity_scope IN ('work','version','edition','recording','person','series','organisation','multiple')),
 uniqueness_scope TEXT NOT NULL CHECK(uniqueness_scope IN ('global','issuer','market','none')),
 validator_code TEXT,
 public_lookup INTEGER NOT NULL DEFAULT 1 CHECK(public_lookup IN (0,1))
);
CREATE TABLE IF NOT EXISTS entity_identifiers(
 id TEXT PRIMARY KEY,
 scheme_id TEXT NOT NULL REFERENCES identifier_schemes(id) ON DELETE RESTRICT,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('work','version','edition','recording','person','series','organisation')),
 entity_id TEXT NOT NULL,
 value TEXT NOT NULL CHECK(length(trim(value))>0),
 normalized_value TEXT NOT NULL CHECK(length(trim(normalized_value))>0),
 issuer_scope TEXT NOT NULL DEFAULT '',
 market_scope TEXT NOT NULL DEFAULT '',
 is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
 status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','verified','disputed','retired')),
 source_record_id TEXT REFERENCES source_records(id) ON DELETE RESTRICT,
 UNIQUE(scheme_id,normalized_value,issuer_scope,market_scope),
 UNIQUE(scheme_id,entity_kind,entity_id,normalized_value,issuer_scope,market_scope)
);
CREATE INDEX IF NOT EXISTS idx_cat_ident_entity ON entity_identifiers(entity_kind,entity_id);
CREATE TABLE IF NOT EXISTS media_rights(
 id TEXT PRIMARY KEY,rights_holder TEXT,licence_name TEXT,licence_url TEXT,
 source_url TEXT,credit TEXT,verified_by TEXT,verified_at TEXT,
 public_display INTEGER NOT NULL DEFAULT 0 CHECK(public_display IN (0,1)),
 api_redistribution INTEGER NOT NULL DEFAULT 0 CHECK(api_redistribution IN (0,1))
);
CREATE TABLE IF NOT EXISTS media_assets(
 id TEXT PRIMARY KEY,r2_key TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','image/avif')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 width INTEGER CHECK(width IS NULL OR width>0),
 height INTEGER CHECK(height IS NULL OR height>0),
 state TEXT NOT NULL DEFAULT 'staging' CHECK(state IN ('staging','uploaded','scanning','pending_rights','approved','quarantined','rejected','retired')),
 uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,approved_at TEXT,
 rights_id TEXT REFERENCES media_rights(id) ON DELETE RESTRICT,
 CHECK(state!='approved' OR (approved_at IS NOT NULL AND rights_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_cat_media_sha ON media_assets(sha256);
CREATE TABLE IF NOT EXISTS media_links(
 id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('work','edition','person','organisation','series')),
 entity_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('front_cover','back_cover','representative_cover','portrait','publisher_logo','sample_artwork','other')),
 is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
 sort_order INTEGER NOT NULL DEFAULT 0,crop_json TEXT CHECK(crop_json IS NULL OR json_valid(crop_json)),
 CHECK((role IN ('front_cover','back_cover') AND entity_kind='edition') OR
       (role='representative_cover' AND entity_kind='work') OR
       (role='portrait' AND entity_kind='person') OR
       (role='publisher_logo' AND entity_kind='organisation') OR
       (role IN ('sample_artwork','other')))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_media_primary ON media_links(entity_kind,entity_id,role) WHERE is_primary=1;
CREATE INDEX IF NOT EXISTS idx_cat_media_entity ON media_links(entity_kind,entity_id);
-- Prevent linking unapproved media; asset and rights state must remain valid after linking.
CREATE TRIGGER IF NOT EXISTS trg_cat_media_link_insert BEFORE INSERT ON media_links
 WHEN NOT EXISTS(SELECT 1 FROM media_assets a JOIN media_rights r ON r.id=a.rights_id
  WHERE a.id=NEW.asset_id AND a.state='approved' AND r.public_display=1)
 BEGIN SELECT RAISE(ABORT,'linked media must be approved and display-permitted');END;
CREATE TRIGGER IF NOT EXISTS trg_cat_media_link_update BEFORE UPDATE OF asset_id ON media_links
 WHEN NOT EXISTS(SELECT 1 FROM media_assets a JOIN media_rights r ON r.id=a.rights_id
  WHERE a.id=NEW.asset_id AND a.state='approved' AND r.public_display=1)
 BEGIN SELECT RAISE(ABORT,'linked media must be approved and display-permitted');END;
CREATE TRIGGER IF NOT EXISTS trg_cat_media_asset_state_update BEFORE UPDATE OF state,rights_id ON media_assets
 WHEN EXISTS(SELECT 1 FROM media_links l WHERE l.asset_id=OLD.id)
 AND (NEW.state!='approved' OR NOT EXISTS(SELECT 1 FROM media_rights r WHERE r.id=NEW.rights_id AND r.public_display=1))
 BEGIN SELECT RAISE(ABORT,'unlink media before suppressing asset');END;
CREATE TRIGGER IF NOT EXISTS trg_cat_media_rights_change BEFORE UPDATE OF public_display ON media_rights
 WHEN NEW.public_display=0 AND EXISTS(
  SELECT 1 FROM media_assets a JOIN media_links l ON l.asset_id=a.id WHERE a.rights_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'unlink associated images before revoking public-display right');END;
CREATE TABLE IF NOT EXISTS text_content(
 id TEXT PRIMARY KEY,entity_kind TEXT NOT NULL CHECK(entity_kind IN ('work','version','edition','recording','person','series')),
 entity_id TEXT NOT NULL,content_type TEXT NOT NULL CHECK(content_type IN ('synopsis','short_description','long_description','biography','excerpt','table_of_contents','other')),
 language TEXT,body TEXT NOT NULL CHECK(length(trim(body))>0),
 rights_policy_id TEXT REFERENCES metadata_licences(id) ON DELETE RESTRICT,
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT,
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public','restricted'))
);
CREATE INDEX IF NOT EXISTS idx_cat_text_entity ON text_content(entity_kind,entity_id,content_type);
CREATE TABLE IF NOT EXISTS record_revisions(
 id TEXT PRIMARY KEY,entity_kind TEXT NOT NULL,entity_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
 after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 actor_external_id TEXT,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reason TEXT,UNIQUE(entity_kind,entity_id,revision)
);
CREATE TABLE IF NOT EXISTS verification_reviews(
 id TEXT PRIMARY KEY,entity_kind TEXT NOT NULL,entity_id TEXT NOT NULL,
 issue_type TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','approved','rejected','dismissed')),
 assigned_to_external_actor_id TEXT,notes TEXT,
 opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cat_verification_queue ON verification_reviews(status,opened_at);
CREATE TABLE IF NOT EXISTS catalogue_audit_log(
 id TEXT PRIMARY KEY,actor_external_id TEXT,service_client_id TEXT,
 action TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,
 details_json TEXT CHECK(details_json IS NULL OR json_valid(details_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_audit_target ON catalogue_audit_log(target_kind,target_id,created_at);
