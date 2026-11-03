-- Catalogue extension 0005: import audit, identity merges and future external API metadata.
-- Additive ONLY. Depends on 0001-0004. API tables do not enable any public endpoints.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS import_batches (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL REFERENCES metadata_sources(id) ON DELETE RESTRICT,
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finished_at TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','completed','partial','failed','cancelled')),
 imported INTEGER NOT NULL DEFAULT 0 CHECK(imported>=0),
 updated INTEGER NOT NULL DEFAULT 0 CHECK(updated>=0),
 rejected INTEGER NOT NULL DEFAULT 0 CHECK(rejected>=0),
 source_version TEXT,
 CHECK(finished_at IS NULL OR finished_at>=started_at)
);
CREATE INDEX IF NOT EXISTS idx_cat_import_batches_source ON import_batches(source_id,started_at DESC);

CREATE TABLE IF NOT EXISTS import_errors (
 id TEXT PRIMARY KEY,
 batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
 source_record_id TEXT REFERENCES source_records(id) ON DELETE RESTRICT,
 error_code TEXT NOT NULL CHECK(length(trim(error_code))>0),
 details TEXT NOT NULL,
 resolved_at TEXT,
 resolution_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_cat_import_errors_batch ON import_errors(batch_id,resolved_at);
CREATE INDEX IF NOT EXISTS idx_cat_import_errors_source ON import_errors(source_record_id);

CREATE TABLE IF NOT EXISTS merge_events (
 id TEXT PRIMARY KEY,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('work','version','edition','recording','person','series','organisation')),
 winner_id TEXT NOT NULL,
 loser_id TEXT NOT NULL,
 decision_json TEXT NOT NULL CHECK(json_valid(decision_json)),
 actor_external_id TEXT,
 occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reverted_at TEXT,
 CHECK(winner_id<>loser_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_merge_winner ON merge_events(entity_kind,winner_id);
CREATE INDEX IF NOT EXISTS idx_cat_merge_loser ON merge_events(entity_kind,loser_id);

CREATE TABLE IF NOT EXISTS record_aliases (
 id TEXT PRIMARY KEY,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('work','version','edition','recording','person','series','organisation')),
 obsolete_id TEXT NOT NULL,
 canonical_id TEXT NOT NULL,
 merge_event_id TEXT REFERENCES merge_events(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(obsolete_id<>canonical_id),
 UNIQUE(entity_kind,obsolete_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_record_alias_canonical ON record_aliases(entity_kind,canonical_id);

CREATE TABLE IF NOT EXISTS editorial_overrides (
 id TEXT PRIMARY KEY,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('work','version','edition','recording','person','series','organisation')),
 entity_id TEXT NOT NULL,
 field_path TEXT NOT NULL CHECK(length(trim(field_path))>0),
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 actor_external_id TEXT NOT NULL CHECK(length(trim(actor_external_id))>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT,
 CHECK(expires_at IS NULL OR expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS idx_cat_overrides_target ON editorial_overrides(entity_kind,entity_id,field_path);

CREATE TABLE IF NOT EXISTS api_clients (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 owner_external_id TEXT,
 status TEXT NOT NULL DEFAULT 'disabled' CHECK(status IN ('disabled','pending','active','suspended','revoked')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 contact_email TEXT
);
CREATE INDEX IF NOT EXISTS idx_cat_clients_status ON api_clients(status);

CREATE TABLE IF NOT EXISTS api_keys (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES api_clients(id) ON DELETE RESTRICT,
 key_prefix TEXT NOT NULL CHECK(length(trim(key_prefix))>0),
 key_hash TEXT NOT NULL UNIQUE CHECK(length(key_hash)>=32),
 scopes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(scopes_json) AND json_type(scopes_json)='array'),
 expires_at TEXT,
 revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_api_keys_client ON api_keys(client_id,revoked_at);
-- Store only irrecoverable hashes of credentials, never plaintext token values.

CREATE TABLE IF NOT EXISTS api_usage_daily (
 client_id TEXT NOT NULL REFERENCES api_clients(id) ON DELETE RESTRICT,
 date TEXT NOT NULL CHECK(length(date)=10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 endpoint_group TEXT NOT NULL CHECK(length(trim(endpoint_group))>0),
 requests INTEGER NOT NULL DEFAULT 0 CHECK(requests>=0),
 errors INTEGER NOT NULL DEFAULT 0 CHECK(errors>=0),
 bytes_sent INTEGER NOT NULL DEFAULT 0 CHECK(bytes_sent>=0),
 PRIMARY KEY(client_id,date,endpoint_group),
 CHECK(errors<=requests)
);

CREATE TABLE IF NOT EXISTS api_access_policies (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES api_clients(id) ON DELETE RESTRICT,
 scope_code TEXT NOT NULL CHECK(length(trim(scope_code))>0),
 rate_limit_per_minute INTEGER CHECK(rate_limit_per_minute IS NULL OR rate_limit_per_minute>0),
 daily_quota INTEGER CHECK(daily_quota IS NULL OR daily_quota>=0),
 field_policy_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(field_policy_json) AND json_type(field_policy_json)='object'),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(client_id,scope_code)
);
