-- まるのこし initial schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  picture_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS family_members (
  family_id TEXT NOT NULL REFERENCES families(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'uploader', 'viewer')),
  joined_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (family_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  uploader_user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'other')),
  original_filename TEXT NOT NULL,
  original_mime_type TEXT NOT NULL,
  original_size_bytes INTEGER NOT NULL,
  original_sha256 TEXT NOT NULL,
  original_storage_key TEXT NOT NULL UNIQUE,
  captured_at TEXT,
  client_last_modified_at TEXT,
  uploaded_at TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')) DEFAULT 'ready',
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'owner_only'))
);

CREATE INDEX IF NOT EXISTS idx_media_assets_family_uploaded ON media_assets(family_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS download_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_download_tokens_hash ON download_tokens(token_hash);
