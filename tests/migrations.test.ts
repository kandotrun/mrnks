import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

function migrationSql(name: string): string {
  return readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8');
}

const migrations = [
  '0001_initial.sql',
  '0002_line_groups.sql',
  '0003_media_deletion_jobs.sql',
  '0004_hybrid_nas_storage.sql',
  '0005_indefinite_media_trash.sql',
  '0006_disable_legacy_hard_delete.sql',
  '0007_gallery_messages.sql',
];

describe('database migrations', () => {
  it('applies cleanly and makes rollback to the legacy hard-delete Worker fail closed', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const migration of migrations) {
        db.exec(migrationSql(migration));
      }

      const mediaColumns = db.prepare('PRAGMA table_info(media_assets)').all() as Array<{ name: string }>;
      expect(mediaColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
        'trashed_at',
        'trashed_by_user_id',
      ]));
      const legacyQueue = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_deletion_jobs'",
      ).get();
      expect(legacyQueue).toBeUndefined();

      db.exec(`
        INSERT INTO users (id, line_user_id, created_at, updated_at)
        VALUES ('usr_1', 'line_1', '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z');
        INSERT INTO families (id, name, owner_user_id, created_at, updated_at)
        VALUES ('fam_1', '家族', 'usr_1', '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z');
        INSERT INTO media_assets (
          id, family_id, uploader_user_id, type, original_filename, original_mime_type,
          original_size_bytes, original_sha256, original_storage_key, uploaded_at,
          processing_status, visibility, original_storage_backend
        ) VALUES (
          'ast_1', 'fam_1', 'usr_1', 'image', 'photo.jpg', 'image/jpeg',
          4, 'hash', 'originals/fam_1/ast_1/photo.jpg', '2026-07-12T00:00:00.000Z',
          'ready', 'family', 'r2'
        );
      `);

      expect(() => db.exec(`
        INSERT INTO media_deletion_jobs (
          asset_id, original_storage_key, notification_preview_storage_key,
          attempts, created_at, updated_at, original_storage_backend
        ) VALUES (
          'ast_1', 'originals/fam_1/ast_1/photo.jpg', NULL,
          0, '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z', 'r2'
        );
        DELETE FROM media_assets WHERE id = 'ast_1';
      `)).toThrow(/media_deletion_jobs/);
      expect(db.prepare("SELECT id FROM media_assets WHERE id = 'ast_1'").get()).toMatchObject({ id: 'ast_1' });
    } finally {
      db.close();
    }
  });

  it('stores a gallery message against exactly one media asset or album day', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const migration of migrations) db.exec(migrationSql(migration));
      db.exec(`
        INSERT INTO users (id, line_user_id, display_name, created_at, updated_at)
        VALUES ('usr_1', 'line_1', 'Kan', '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z');
        INSERT INTO families (id, name, owner_user_id, created_at, updated_at)
        VALUES ('fam_1', '家族', 'usr_1', '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z');
        INSERT INTO media_assets (
          id, family_id, uploader_user_id, type, original_filename, original_mime_type,
          original_size_bytes, original_sha256, original_storage_key, uploaded_at,
          processing_status, visibility, original_storage_backend
        ) VALUES (
          'ast_1', 'fam_1', 'usr_1', 'image', 'photo.jpg', 'image/jpeg',
          4, 'hash', 'originals/fam_1/ast_1/photo.jpg', '2026-07-12T00:00:00.000Z',
          'ready', 'family', 'r2'
        );
        INSERT INTO gallery_messages (
          id, family_id, author_user_id, target_type, media_asset_id, target_day, body, created_at
        ) VALUES
          ('msg_media', 'fam_1', 'usr_1', 'media', 'ast_1', NULL, 'いい写真！', '2026-07-12T01:00:00.000Z'),
          ('msg_day', 'fam_1', 'usr_1', 'day', NULL, '2026-07-12', 'この日は海へ行った日', '2026-07-12T01:01:00.000Z');
      `);

      expect(db.prepare('SELECT COUNT(*) AS count FROM gallery_messages').get()).toMatchObject({ count: 2 });
      expect(() => db.exec(`
        INSERT INTO gallery_messages (
          id, family_id, author_user_id, target_type, media_asset_id, target_day, body, created_at
        ) VALUES (
          'msg_invalid', 'fam_1', 'usr_1', 'media', 'ast_1', '2026-07-12', '両方には紐付けない', '2026-07-12T01:02:00.000Z'
        );
      `)).toThrow();
      expect(() => db.exec(`
        INSERT INTO gallery_messages (
          id, family_id, author_user_id, target_type, media_asset_id, target_day, body, created_at
        ) VALUES (
          'msg_long', 'fam_1', 'usr_1', 'day', NULL, '2026-07-12', '${'あ'.repeat(501)}', '2026-07-12T01:03:00.000Z'
        );
      `)).toThrow();
    } finally {
      db.close();
    }
  });
});
