-- Shared family messages attached to one media asset or one gallery day.
CREATE TABLE IF NOT EXISTS gallery_messages (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('media', 'day')),
  media_asset_id TEXT REFERENCES media_assets(id),
  target_day TEXT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL,
  CHECK (
    (target_type = 'media' AND media_asset_id IS NOT NULL AND target_day IS NULL)
    OR
    (target_type = 'day' AND media_asset_id IS NULL AND target_day IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_gallery_messages_media_created
  ON gallery_messages(family_id, media_asset_id, created_at DESC)
  WHERE target_type = 'media';

CREATE INDEX IF NOT EXISTS idx_gallery_messages_day_created
  ON gallery_messages(family_id, target_day, created_at DESC)
  WHERE target_type = 'day';
