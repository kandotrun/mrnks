ALTER TABLE media_assets ADD COLUMN trashed_at TEXT;
ALTER TABLE media_assets ADD COLUMN trashed_by_user_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_media_assets_family_trash
  ON media_assets(family_id, trashed_at DESC);

-- Deleted media is retained indefinitely. Cancel legacy queued object deletion
-- so no original or preview is removed after this migration is applied.
DELETE FROM media_deletion_jobs;
