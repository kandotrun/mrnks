-- LINE group bindings and upload notifications
CREATE TABLE IF NOT EXISTS line_group_bindings (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL UNIQUE,
  group_name TEXT NOT NULL,
  group_picture_url TEXT,
  family_id TEXT REFERENCES families(id),
  default_role TEXT NOT NULL DEFAULT 'viewer' CHECK (default_role IN ('uploader', 'viewer')),
  notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'left')),
  bind_token_hash TEXT UNIQUE,
  bound_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  left_at TEXT,
  CHECK (status != 'active' OR family_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_line_group_bindings_family
  ON line_group_bindings(family_id, status, notifications_enabled);

ALTER TABLE sessions ADD COLUMN line_group_binding_id TEXT REFERENCES line_group_bindings(id);
ALTER TABLE sessions ADD COLUMN group_membership_verified_at TEXT;

ALTER TABLE media_assets ADD COLUMN notification_preview_storage_key TEXT;
ALTER TABLE media_assets ADD COLUMN notification_preview_mime_type TEXT;
ALTER TABLE media_assets ADD COLUMN notification_preview_size_bytes INTEGER;

CREATE TABLE IF NOT EXISTS line_notification_deliveries (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
  line_group_binding_id TEXT NOT NULL REFERENCES line_group_bindings(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  retry_key TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE (media_asset_id, line_group_binding_id)
);

CREATE INDEX IF NOT EXISTS idx_line_notification_deliveries_status
  ON line_notification_deliveries(status, created_at);
