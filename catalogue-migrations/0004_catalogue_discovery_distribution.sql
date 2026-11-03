-- Catalogue extension 0004: classification, content descriptors, media variants and offers.
-- Additive ONLY. Depends on 0001-0003. No writes to application DB.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS classification_schemes (
 id TEXT PRIMARY KEY,
 scheme_code TEXT NOT NULL CHECK(length(trim(scheme_code))>0),
 version TEXT NOT NULL DEFAULT '',
 licence_policy_id TEXT REFERENCES metadata_licences(id) ON DELETE RESTRICT,
 UNIQUE(scheme_code,version)
);
CREATE TABLE IF NOT EXISTS subjects (
 id TEXT PRIMARY KEY,
 scheme_id TEXT NOT NULL REFERENCES classification_schemes(id) ON DELETE RESTRICT,
 code TEXT NOT NULL CHECK(length(trim(code))>0),
 label TEXT NOT NULL CHECK(length(trim(label))>0),
 parent_subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT,
 CHECK(parent_subject_id IS NULL OR parent_subject_id<>id),
 UNIQUE(scheme_id,code)
);
CREATE INDEX IF NOT EXISTS idx_cat_subjects_parent ON subjects(parent_subject_id);

CREATE TABLE IF NOT EXISTS work_subjects (
 id TEXT PRIMARY KEY,
 work_id TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
 subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
 primary_flag INTEGER NOT NULL DEFAULT 0 CHECK(primary_flag IN (0,1)),
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT,
 UNIQUE(work_id,subject_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_work_subject_subject ON work_subjects(subject_id,work_id);

CREATE TABLE IF NOT EXISTS content_advisories (
 id TEXT PRIMARY KEY,
 work_id TEXT REFERENCES works(id) ON DELETE RESTRICT,
 version_id TEXT REFERENCES work_versions(id) ON DELETE RESTRICT,
 advisory_code TEXT NOT NULL CHECK(length(trim(advisory_code))>0),
 severity TEXT CHECK(severity IS NULL OR severity IN ('low','moderate','high','unspecified')),
 details TEXT,
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT,
 CHECK((work_id IS NOT NULL)+(version_id IS NOT NULL)=1)
);
CREATE INDEX IF NOT EXISTS idx_cat_content_advisory_work ON content_advisories(work_id);
CREATE INDEX IF NOT EXISTS idx_cat_content_advisory_version ON content_advisories(version_id);

CREATE TABLE IF NOT EXISTS audience_descriptors (
 id TEXT PRIMARY KEY,
 work_id TEXT REFERENCES works(id) ON DELETE RESTRICT,
 edition_id TEXT REFERENCES editions(id) ON DELETE RESTRICT,
 descriptor_code TEXT NOT NULL CHECK(length(trim(descriptor_code))>0),
 minimum_age INTEGER CHECK(minimum_age IS NULL OR minimum_age BETWEEN 0 AND 120),
 maximum_age INTEGER CHECK(maximum_age IS NULL OR maximum_age BETWEEN 0 AND 120),
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT,
 CHECK((work_id IS NOT NULL)+(edition_id IS NOT NULL)=1),
 CHECK(minimum_age IS NULL OR maximum_age IS NULL OR minimum_age<=maximum_age)
);
CREATE INDEX IF NOT EXISTS idx_cat_audience_work ON audience_descriptors(work_id);
CREATE INDEX IF NOT EXISTS idx_cat_audience_edition ON audience_descriptors(edition_id);

CREATE TABLE IF NOT EXISTS descriptor_definitions (
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE CHECK(length(trim(code))>0),
 label TEXT NOT NULL CHECK(length(trim(label))>0),
 category TEXT NOT NULL CHECK(category IN ('theme','mood','setting','style','pacing','tone','award','accessibility','other')),
 data_type TEXT NOT NULL CHECK(data_type IN ('text','number','boolean','json')),
 allowed_values_json TEXT CHECK(allowed_values_json IS NULL OR json_valid(allowed_values_json)),
 public INTEGER NOT NULL DEFAULT 0 CHECK(public IN (0,1))
);
CREATE TABLE IF NOT EXISTS record_descriptors (
 id TEXT PRIMARY KEY,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('work','version','edition','recording','person','series')),
 entity_id TEXT NOT NULL,
 definition_id TEXT NOT NULL REFERENCES descriptor_definitions(id) ON DELETE RESTRICT,
 text_value TEXT,
 number_value REAL,
 boolean_value INTEGER CHECK(boolean_value IS NULL OR boolean_value IN (0,1)),
 json_value TEXT CHECK(json_value IS NULL OR json_valid(json_value)),
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT,
 CHECK((text_value IS NOT NULL)+(number_value IS NOT NULL)+(boolean_value IS NOT NULL)+(json_value IS NOT NULL)=1)
);
CREATE INDEX IF NOT EXISTS idx_cat_descriptor_target ON record_descriptors(entity_kind,entity_id);
CREATE INDEX IF NOT EXISTS idx_cat_descriptor_definition ON record_descriptors(definition_id);

CREATE TABLE IF NOT EXISTS media_variants (
 id TEXT PRIMARY KEY,
 asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
 variant_name TEXT NOT NULL CHECK(length(trim(variant_name))>0),
 r2_key TEXT NOT NULL UNIQUE CHECK(length(trim(r2_key))>0),
 width INTEGER NOT NULL CHECK(width>0),
 height INTEGER NOT NULL CHECK(height>0),
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','image/avif')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 UNIQUE(asset_id,variant_name)
);
CREATE INDEX IF NOT EXISTS idx_cat_media_variants_asset ON media_variants(asset_id);

CREATE TABLE IF NOT EXISTS territories (
 code TEXT PRIMARY KEY CHECK(length(code) BETWEEN 2 AND 12),
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 parent_code TEXT REFERENCES territories(code) ON DELETE RESTRICT,
 CHECK(parent_code IS NULL OR parent_code<>code)
);
CREATE TABLE IF NOT EXISTS distribution_rights (
 id TEXT PRIMARY KEY,
 edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
 territory_code TEXT NOT NULL REFERENCES territories(code) ON DELETE RESTRICT,
 rights_type TEXT NOT NULL CHECK(rights_type IN ('publish','distribute','sell','lend','stream','download','other')),
 start_date TEXT,
 end_date TEXT,
 rights_holder_id TEXT REFERENCES organisations(id) ON DELETE RESTRICT,
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT,
 CHECK(start_date IS NULL OR end_date IS NULL OR start_date<=end_date)
);
CREATE INDEX IF NOT EXISTS idx_cat_dist_rights_edition ON distribution_rights(edition_id,territory_code,rights_type);

CREATE TABLE IF NOT EXISTS product_offers (
 id TEXT PRIMARY KEY,
 edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
 seller_id TEXT REFERENCES organisations(id) ON DELETE RESTRICT,
 territory_code TEXT REFERENCES territories(code) ON DELETE RESTRICT,
 currency TEXT NOT NULL CHECK(length(currency)=3),
 price_minor INTEGER CHECK(price_minor IS NULL OR price_minor>=0),
 offer_url TEXT,
 valid_from TEXT,
 valid_to TEXT,
 source_record_id TEXT REFERENCES source_records(id) ON DELETE RESTRICT,
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_from<=valid_to)
);
CREATE INDEX IF NOT EXISTS idx_cat_offers_edition ON product_offers(edition_id,territory_code,valid_to);
CREATE INDEX IF NOT EXISTS idx_cat_offers_seller ON product_offers(seller_id);

CREATE TABLE IF NOT EXISTS availability_events (
 id TEXT PRIMARY KEY,
 edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
 territory_code TEXT REFERENCES territories(code) ON DELETE RESTRICT,
 availability_status TEXT NOT NULL CHECK(availability_status IN ('available','preorder','out_of_stock','out_of_print','withdrawn','unknown')),
 effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 source_claim_id TEXT REFERENCES field_claims(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_cat_availability_edition ON availability_events(edition_id,effective_at DESC);
