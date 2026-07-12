CREATE TABLE IF NOT EXISTS media_deletion_jobs (
  asset_id TEXT PRIMARY KEY,
  original_storage_key TEXT NOT NULL,
  notification_preview_storage_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_deletion_jobs_created_at
  ON media_deletion_jobs(created_at);
