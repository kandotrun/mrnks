-- Hybrid NAS storage: existing originals remain on R2, new originals can be committed on NAS.
ALTER TABLE media_assets
  ADD COLUMN original_storage_backend TEXT NOT NULL DEFAULT 'r2'
  CHECK (original_storage_backend IN ('r2', 'nas'));

ALTER TABLE media_deletion_jobs
  ADD COLUMN original_storage_backend TEXT NOT NULL DEFAULT 'r2'
  CHECK (original_storage_backend IN ('r2', 'nas'));

CREATE TABLE IF NOT EXISTS media_upload_sessions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL REFERENCES families(id),
  uploader_user_id TEXT NOT NULL REFERENCES users(id),
  original_filename TEXT NOT NULL,
  original_mime_type TEXT NOT NULL,
  original_size_bytes INTEGER NOT NULL CHECK (original_size_bytes > 0),
  original_storage_key TEXT NOT NULL UNIQUE,
  client_last_modified_at TEXT,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'finalizing', 'ready', 'expired', 'failed')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_upload_sessions_expiry
  ON media_upload_sessions(status, expires_at);
