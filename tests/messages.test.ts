import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/worker';

const migrations = [
  '0001_initial.sql',
  '0002_line_groups.sql',
  '0003_media_deletion_jobs.sql',
  '0004_hybrid_nas_storage.sql',
  '0005_indefinite_media_trash.sql',
  '0006_disable_legacy_hard_delete.sql',
  '0007_gallery_messages.sql',
];

interface BoundStatement {
  sql: string;
  values: SQLInputValue[];
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: true; meta: { changes: number } }>;
}

function sqliteD1(db: DatabaseSync): D1Database {
  const prepare = (sql: string) => ({
    bind(...values: SQLInputValue[]): BoundStatement {
      return {
        sql,
        values,
        async first<T>() {
          return (db.prepare(sql).get(...values) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: db.prepare(sql).all(...values) as T[] };
        },
        async run() {
          const result = db.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
  });
  return {
    prepare,
    async batch(statements: BoundStatement[]) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;
}

const databases: DatabaseSync[] = [];

afterEach(() => {
  while (databases.length) databases.pop()?.close();
});

function createMessageEnv(role: 'owner' | 'admin' | 'uploader' | 'viewer' = 'viewer'): Env {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  for (const migration of migrations) {
    db.exec(readFileSync(resolve(process.cwd(), 'migrations', migration), 'utf8'));
  }
  const now = '2026-07-12T00:00:00.000Z';
  const tokenHash = createHash('sha256').update('test-session-secret:test-token').digest('hex');
  db.exec(`
    INSERT INTO users (id, line_user_id, display_name, picture_url, created_at, updated_at) VALUES
      ('usr_1', 'line_1', 'Kan', 'https://example.com/kan.jpg', '${now}', '${now}'),
      ('usr_2', 'line_2', 'Other', NULL, '${now}', '${now}');
    INSERT INTO families (id, name, owner_user_id, created_at, updated_at) VALUES
      ('fam_1', '家族', 'usr_1', '${now}', '${now}'),
      ('fam_2', '別の家族', 'usr_2', '${now}', '${now}');
    INSERT INTO family_members (family_id, user_id, role, joined_at) VALUES
      ('fam_1', 'usr_1', '${role}', '${now}'),
      ('fam_2', 'usr_2', 'owner', '${now}');
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES
      ('session_1', 'usr_1', '${tokenHash}', '${now}', '2099-01-01T00:00:00.000Z');
    INSERT INTO media_assets (
      id, family_id, uploader_user_id, type, original_filename, original_mime_type,
      original_size_bytes, original_sha256, original_storage_key, uploaded_at,
      processing_status, visibility, original_storage_backend
    ) VALUES
      ('ast_1', 'fam_1', 'usr_1', 'image', 'photo.jpg', 'image/jpeg', 100, 'hash-1', 'originals/fam_1/ast_1/photo.jpg', '${now}', 'ready', 'family', 'r2'),
      ('ast_2', 'fam_2', 'usr_2', 'image', 'other.jpg', 'image/jpeg', 100, 'hash-2', 'originals/fam_2/ast_2/other.jpg', '${now}', 'ready', 'family', 'r2');
  `);
  return {
    ENVIRONMENT: 'test',
    APP_ORIGIN: 'https://mrnks.2-38.com',
    LINE_LIFF_ID: 'test-liff-id',
    LINE_LOGIN_CHANNEL_ID: 'login-channel',
    LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
    LINE_MESSAGING_CHANNEL_ID: 'messaging-channel',
    LINE_MESSAGING_CHANNEL_SECRET: 'messaging-secret',
    LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: 'messaging-token',
    SESSION_SECRET: 'test-session-secret',
    DB: sqliteD1(db),
    MEDIA_BUCKET: {} as R2Bucket,
  } as Env;
}

function messageRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://mrnks.2-38.com${path}`, {
    method: 'POST',
    headers: {
      cookie: 'mrnks_session=test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('gallery messages', () => {
  it('lets a viewer post and list independent media and day messages', async () => {
    const env = createMessageEnv('viewer');
    const mediaPost = await worker.fetch(messageRequest('/api/families/fam_1/messages', {
      targetType: 'media',
      mediaId: 'ast_1',
      body: '  いい写真！  ',
    }), env);
    expect(mediaPost.status).toBe(201);
    await expect(mediaPost.json()).resolves.toMatchObject({
      message: {
        id: expect.stringMatching(/^msg_/),
        targetType: 'media',
        mediaId: 'ast_1',
        day: null,
        body: 'いい写真！',
        author: { id: 'usr_1', displayName: 'Kan', pictureUrl: 'https://example.com/kan.jpg' },
      },
    });

    const dayPost = await worker.fetch(messageRequest('/api/families/fam_1/messages', {
      targetType: 'day',
      day: '2026-07-12',
      body: '海へ行った日',
    }), env);
    expect(dayPost.status).toBe(201);

    const mediaList = await worker.fetch(new Request(
      'https://mrnks.2-38.com/api/families/fam_1/messages?targetType=media&mediaId=ast_1',
      { headers: { cookie: 'mrnks_session=test-token' } },
    ), env);
    expect(mediaList.status).toBe(200);
    await expect(mediaList.json()).resolves.toMatchObject({
      messages: [{ targetType: 'media', body: 'いい写真！' }],
      totalCount: 1,
    });

    const dayList = await worker.fetch(new Request(
      'https://mrnks.2-38.com/api/families/fam_1/messages?targetType=day&day=2026-07-12',
      { headers: { cookie: 'mrnks_session=test-token' } },
    ), env);
    expect(dayList.status).toBe(200);
    await expect(dayList.json()).resolves.toMatchObject({
      messages: [{ targetType: 'day', body: '海へ行った日' }],
      totalCount: 1,
    });
  });

  it('requires authentication, family membership, a valid target, and a 1-500 character body', async () => {
    const env = createMessageEnv('viewer');
    const unauthenticated = await worker.fetch(new Request(
      'https://mrnks.2-38.com/api/families/fam_1/messages?targetType=day&day=2026-07-12',
    ), env);
    expect(unauthenticated.status).toBe(401);

    const otherFamilyMedia = await worker.fetch(messageRequest('/api/families/fam_1/messages', {
      targetType: 'media', mediaId: 'ast_2', body: '見えてはいけない',
    }), env);
    expect(otherFamilyMedia.status).toBe(404);

    for (const [body, error] of [
      [{ targetType: 'day', day: '2026-02-30', body: '不正日付' }, 'invalid_message_day'],
      [{ targetType: 'media', mediaId: 'ast_1', day: '2026-07-12', body: '対象が重複' }, 'invalid_message_target'],
      [{ targetType: 'day', day: '2026-07-12', body: '   ' }, 'message_required'],
      [{ targetType: 'day', day: '2026-07-12', body: 'あ'.repeat(501) }, 'message_too_long'],
    ] as const) {
      const response = await worker.fetch(messageRequest('/api/families/fam_1/messages', body), env);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error });
    }
  });

  it('retains media messages while an asset is trashed but does not expose them until restore', async () => {
    const env = createMessageEnv('owner');
    expect((await worker.fetch(messageRequest('/api/families/fam_1/messages', {
      targetType: 'media', mediaId: 'ast_1', body: '残しておく',
    }), env)).status).toBe(201);

    const db = databases.at(-1)!;
    db.prepare("UPDATE media_assets SET trashed_at = '2026-07-12T01:00:00.000Z' WHERE id = 'ast_1'").run();
    const hidden = await worker.fetch(new Request(
      'https://mrnks.2-38.com/api/families/fam_1/messages?targetType=media&mediaId=ast_1',
      { headers: { cookie: 'mrnks_session=test-token' } },
    ), env);
    expect(hidden.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS count FROM gallery_messages').get()).toMatchObject({ count: 1 });

    db.prepare("UPDATE media_assets SET trashed_at = NULL WHERE id = 'ast_1'").run();
    const restored = await worker.fetch(new Request(
      'https://mrnks.2-38.com/api/families/fam_1/messages?targetType=media&mediaId=ast_1',
      { headers: { cookie: 'mrnks_session=test-token' } },
    ), env);
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({ messages: [{ body: '残しておく' }] });
  });
});
