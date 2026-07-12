import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hmacSha256Base64, sha256Hex } from '../src/core';
import worker, { type Env } from '../src/worker';
import { renderAppHtml } from '../src/html';

describe('LINE group schema', () => {
  it('defines group bindings, short-lived session context, safe previews, and idempotent deliveries', () => {
    const sql = readFileSync(new URL('../migrations/0002_line_groups.sql', import.meta.url), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS line_group_bindings');
    expect(sql).toContain("CHECK (default_role IN ('uploader', 'viewer'))");
    expect(sql).toContain("CHECK (status IN ('pending', 'active', 'left'))");
    expect(sql).toContain('ALTER TABLE sessions ADD COLUMN line_group_binding_id');
    expect(sql).toContain('ALTER TABLE media_assets ADD COLUMN notification_preview_storage_key');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS line_notification_deliveries');
    expect(sql).toContain('UNIQUE (media_asset_id, line_group_binding_id)');
  });
});

describe('LINE group LIFF UI', () => {
  it('supports setup links, group-context auth, and multipart notification previews', () => {
    const html = renderAppHtml();
    expect(html).toContain('id="groupSetupPanel"');
    expect(html).toContain("params.get('liff.state')");
    expect(html).toContain('groupBindingId');
    expect(html).toContain("completionForm.append('notificationPreview'");
    expect(html).toContain('createNotificationPreview');
    expect(html).toContain("'/api/line-groups/bind'");
  });
});

interface CapturedRun {
  sql: string;
  values: unknown[];
}

interface CapturedPut {
  key: string;
  bytes: Uint8Array;
  options?: R2PutOptions;
}

function createDngWithEmbeddedJpeg(): { dng: Uint8Array; jpeg: Uint8Array } {
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x01, 0xe0,
    0x02, 0x80,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x0c, 0x03,
    0x01, 0x00, 0x02, 0x11, 0x03, 0x11,
    0x00, 0x3f, 0x00,
    0x11, 0xff, 0x00, 0x22,
    0xff, 0xd9,
  ]);
  const dng = new Uint8Array(800);
  const view = new DataView(dng.buffer);
  dng[0] = 0x49;
  dng[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 330, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 128, true);
  view.setUint32(22, 0, true);

  const entries = [
    [254, 4, 1, 1],
    [256, 4, 1, 640],
    [257, 4, 1, 480],
    [259, 3, 1, 7],
    [262, 3, 1, 6],
    [273, 4, 1, 700],
    [277, 3, 1, 3],
    [279, 4, 1, jpeg.byteLength],
  ];
  view.setUint16(128, entries.length, true);
  entries.forEach(([tag, type, count, value], index) => {
    const offset = 130 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    if (type === 3) view.setUint16(offset + 8, value, true);
    else view.setUint32(offset + 8, value, true);
  });
  view.setUint32(130 + entries.length * 12, 0, true);
  dng.set(jpeg, 700);
  return { dng, jpeg };
}

function groupEnv(runs: CapturedRun[]): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              runs.push({ sql, values });
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              return null;
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return {
    ENVIRONMENT: 'test',
    APP_ORIGIN: 'https://mrnks.2-38.com',
    LINE_LIFF_ID: 'test-liff-id',
    LINE_LOGIN_CHANNEL_ID: 'login-channel',
    LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
    LINE_MESSAGING_CHANNEL_ID: 'messaging-channel',
    LINE_MESSAGING_CHANNEL_SECRET: 'messaging-secret',
    LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: 'messaging-token',
    SESSION_SECRET: 'session-secret',
    DB: db,
    MEDIA_BUCKET: {} as R2Bucket,
  };
}

function notificationEnv(runs: CapturedRun[], puts: CapturedPut[]): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              runs.push({ sql, values });
              return { success: true, meta: { changes: 1 } };
            },
            async first<T>() {
              if (sql.includes('FROM sessions s')) {
                return {
                  id: 'usr_alice',
                  display_name: 'Alice',
                  picture_url: null,
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  line_group_binding_id: null,
                } as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM family_members fm')) {
                return { results: [{ id: 'fam_1', name: '家族', role: 'uploader' }] as T[] };
              }
              if (sql.includes('FROM line_group_bindings') && sql.includes('notifications_enabled')) {
                return {
                  results: [{
                    id: 'lgb_1',
                    line_group_id: 'C_group_1',
                    group_name: '家族グループ',
                  }] as T[],
                };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const bucket = {
    async put(key: string, value: ArrayBuffer | ArrayBufferView, options?: R2PutOptions) {
      const bytes = value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      puts.push({ key, bytes: new Uint8Array(bytes), options });
      return {} as R2Object;
    },
  } as unknown as R2Bucket;
  return { ...groupEnv(runs), DB: db, MEDIA_BUCKET: bucket };
}

function groupAccessEnv(runs: CapturedRun[]): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              runs.push({ sql, values });
              return { success: true, meta: { changes: 1 } };
            },
            async first<T>() {
              if (sql.includes('FROM users WHERE line_user_id')) {
                return { id: 'usr_group', display_name: 'Alice', picture_url: null } as T;
              }
              if (sql.includes('FROM line_group_bindings') && sql.includes("status = 'active'")) {
                return {
                  id: 'lgb_1',
                  line_group_id: 'C_group_1',
                  family_id: 'fam_relatives',
                  default_role: 'viewer',
                  group_name: '親戚グループ',
                  family_name: '親戚アルバム',
                } as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM family_members fm')) return { results: [] as T[] };
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { ...groupEnv(runs), DB: db };
}

function bindingEnv(runs: CapturedRun[]): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              runs.push({ sql, values });
              return { success: true, meta: { changes: 1 } };
            },
            async first<T>() {
              if (sql.includes('FROM sessions s')) {
                return {
                  id: 'usr_owner',
                  display_name: 'Kan',
                  picture_url: null,
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  line_group_binding_id: null,
                } as T;
              }
              if (sql.includes('SELECT line_user_id FROM users')) {
                return { line_user_id: 'U_owner' } as T;
              }
              if (sql.includes('FROM line_group_bindings') && sql.includes('bind_token_hash')) {
                return {
                  id: 'lgb_1',
                  line_group_id: 'C_group_1',
                  group_name: '親戚グループ',
                  group_picture_url: null,
                  status: 'pending',
                } as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM family_members fm')) {
                return { results: [{ id: 'fam_1', name: '家族', role: 'owner' }] as T[] };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { ...groupEnv(runs), DB: db };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LINE group lifecycle', () => {
  it('records an invited group with a hashed one-time binding token and replies with its setup link', async () => {
    const runs: CapturedRun[] = [];
    const replies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v2/bot/group/C_group_1/summary')) {
        return Response.json({ groupId: 'C_group_1', groupName: '親戚グループ', pictureUrl: 'https://example.com/group.jpg' });
      }
      if (url.endsWith('/v2/bot/message/reply')) {
        replies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({});
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const payload = JSON.stringify({
      destination: 'bot',
      events: [{
        type: 'join',
        replyToken: 'reply-token',
        webhookEventId: 'evt-1',
        source: { type: 'group', groupId: 'C_group_1' },
      }],
    });
    const signature = await hmacSha256Base64('messaging-secret', payload);
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) { pending.push(promise); },
      passThroughOnException() {},
    } as unknown as ExecutionContext;

    const response = await worker.fetch(new Request('https://mrnks.2-38.com/webhook/line', {
      method: 'POST',
      headers: { 'x-line-signature': signature },
      body: payload,
    }), groupEnv(runs), ctx);
    await Promise.all(pending);

    expect(response.status).toBe(200);
    const insert = runs.find((item) => item.sql.includes('line_group_bindings'));
    expect(insert?.values).toContain('C_group_1');
    expect(insert?.values).toContain('親戚グループ');
    expect(replies).toHaveLength(1);
    const replyText = JSON.stringify(replies[0]);
    const token = /groupBind=([a-zA-Z0-9_]+)/.exec(replyText)?.[1];
    expect(token).toBeTruthy();
    expect(replyText).toContain('https://liff.line.me/test-liff-id');
    expect(insert?.values).toContain(await sha256Hex(`session-secret:${token}`));
    expect(insert?.values).not.toContain(token);
  });

  it('grants the bound family role only after LINE confirms current group membership', async () => {
    const runs: CapturedRun[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/oauth2/v2.1/verify')) {
        return Response.json({ sub: 'U_group_member', name: 'Alice' });
      }
      if (url.endsWith('/v2/bot/group/C_group_1/member/U_group_member')) {
        return Response.json({ userId: 'U_group_member', displayName: 'Alice' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/auth/line', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'id-token', groupBindingId: 'lgb_1' }),
    }), groupAccessEnv(runs));

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=3600');
    await expect(response.json()).resolves.toMatchObject({
      families: [{ id: 'fam_relatives', name: '親戚アルバム', role: 'viewer' }],
    });
    const sessionInsert = runs.find((item) => item.sql.includes('INSERT INTO sessions'));
    expect(sessionInsert?.values).toContain('lgb_1');
  });

  it('does not create a group-derived session for a non-member', async () => {
    const runs: CapturedRun[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/oauth2/v2.1/verify')) {
        return Response.json({ sub: 'U_group_member', name: 'Alice' });
      }
      if (url.endsWith('/v2/bot/group/C_group_1/member/U_group_member')) {
        return Response.json({ message: 'Not found' }, { status: 404 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/auth/line', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'id-token', groupBindingId: 'lgb_1' }),
    }), groupAccessEnv(runs));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'line_group_membership_required' });
    expect(runs.some((item) => item.sql.includes('INSERT INTO sessions'))).toBe(false);
  });

  it('lets a direct family owner bind the group with viewer or uploader access and sends confirmation', async () => {
    const runs: CapturedRun[] = [];
    const pushes: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v2/bot/group/C_group_1/member/U_owner')) {
        return Response.json({ userId: 'U_owner', displayName: 'Kan' });
      }
      if (url.endsWith('/v2/bot/message/push')) {
        pushes.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ sentMessages: [{ id: '1' }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/line-groups/bind', {
      method: 'POST',
      headers: {
        cookie: 'mrnks_session=test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: 'bind-token',
        familyId: 'fam_1',
        role: 'viewer',
        notificationsEnabled: true,
      }),
    }), bindingEnv(runs));

    expect(response.status).toBe(200);
    const data = await response.json() as { groupUrl?: string };
    expect(data.groupUrl).toContain('groupBinding=lgb_1');
    const update = runs.find((item) => item.sql.includes("status = 'active'"));
    expect(update?.values).toEqual(expect.arrayContaining(['fam_1', 'viewer', 1, 'usr_owner', 'lgb_1']));
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ to: 'C_group_1' });
    expect(JSON.stringify(pushes[0])).toContain('groupBinding=lgb_1');
  });

  it('does not let an album owner bind a LINE group they are not currently in', async () => {
    const runs: CapturedRun[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v2/bot/group/C_group_1/member/U_owner')) {
        return new Response(null, { status: 404 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/line-groups/bind', {
      method: 'POST',
      headers: {
        cookie: 'mrnks_session=test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: 'bind-token',
        familyId: 'fam_1',
        role: 'viewer',
        notificationsEnabled: true,
      }),
    }), bindingEnv(runs));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'line_group_membership_required' });
    expect(runs.some((item) => item.sql.includes("status = 'active'"))).toBe(false);
  });

  it('uploads a LINE-safe preview and pushes the photo plus uploader name to active groups', async () => {
    const runs: CapturedRun[] = [];
    const puts: CapturedPut[] = [];
    const pushes: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v2/bot/message/push')) {
        pushes.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ sentMessages: [{ id: 'message-1' }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const original = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
    const preview = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
    const form = new FormData();
    form.append('original', new Blob([original], { type: 'image/jpeg' }), 'summer.jpg');
    form.append('notificationPreview', new Blob([preview], { type: 'image/jpeg' }), 'preview.jpg');
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) { pending.push(promise); },
      passThroughOnException() {},
    } as unknown as ExecutionContext;

    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/families/fam_1/media', {
      method: 'PUT',
      headers: {
        cookie: 'mrnks_session=test-token',
        'x-file-name': encodeURIComponent('summer.jpg'),
        'x-content-sha256': await sha256Hex(original),
      },
      body: form,
    }), notificationEnv(runs, puts), ctx);
    await Promise.all(pending);

    expect(response.status).toBe(201);
    const data = await response.json() as { asset: { id: string } };
    const asset = data.asset;
    expect(puts.some((item) => item.key.includes('/summer.jpg'))).toBe(true);
    expect(puts.some((item) => item.key === `previews/fam_1/${asset.id}/line.jpg`)).toBe(true);
    expect(runs.some((item) => item.sql.includes('line_notification_deliveries'))).toBe(true);
    expect(pushes).toHaveLength(1);
    const messages = (pushes[0].messages ?? []) as Array<Record<string, unknown>>;
    expect(messages[0]).toMatchObject({ type: 'image' });
    expect(String(messages[0].originalContentUrl)).toMatch(new RegExp(`/api/line-preview/${asset.id}/[a-f0-9]{64}$`));
    expect(JSON.stringify(messages[1])).toContain('Alice');
    expect(JSON.stringify(messages[1])).toContain('summer.jpg');
  });

  it('extracts an embedded JPEG from a raw DNG upload for the LINE notification preview', async () => {
    const runs: CapturedRun[] = [];
    const puts: CapturedPut[] = [];
    const { dng, jpeg } = createDngWithEmbeddedJpeg();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v2/bot/message/push')) return Response.json({ sentMessages: [{ id: 'message-dng' }] });
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) { pending.push(promise); },
      passThroughOnException() {},
    } as unknown as ExecutionContext;
    const dngBody = new Uint8Array(dng.byteLength);
    dngBody.set(dng);
    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/families/fam_1/media', {
      method: 'PUT',
      headers: {
        cookie: 'mrnks_session=test-token',
        'content-type': 'image/x-adobe-dng',
        'x-file-name': 'sample.dng',
        'x-client-sha256': await sha256Hex(dng),
      },
      body: dngBody.buffer as ArrayBuffer,
    }), notificationEnv(runs, puts), ctx);
    await Promise.all(pending);

    expect(response.status).toBe(201);
    const previewPut = puts.find((item) => item.key.startsWith('previews/'));
    expect(previewPut?.bytes).toEqual(jpeg);
    expect(previewPut?.options?.httpMetadata).toMatchObject({ contentType: 'image/jpeg' });
  });

  it('serves only the stored thumbnail at the unguessable LINE preview URL', async () => {
    const previewBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const preparedSql: string[] = [];
    const db = {
      prepare(sql: string) {
        preparedSql.push(sql);
        return {
          bind() {
            return {
              async first<T>() {
                if (sql.includes('notification_preview_storage_key')) {
                  return {
                    notification_preview_storage_key: 'previews/fam_1/ast_1/line.jpg',
                    notification_preview_mime_type: 'image/jpeg',
                    notification_preview_size_bytes: previewBytes.byteLength,
                  } as T;
                }
                return null;
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    const bucket = {
      async get(key: string) {
        if (key !== 'previews/fam_1/ast_1/line.jpg') return null;
        return {
          body: new Response(previewBytes).body,
          size: previewBytes.byteLength,
        } as R2ObjectBody;
      },
    } as unknown as R2Bucket;
    const env = { ...groupEnv([]), DB: db, MEDIA_BUCKET: bucket };
    const token = await sha256Hex('session-secret:line-preview:ast_1');

    const response = await worker.fetch(new Request(`https://mrnks.2-38.com/api/line-preview/ast_1/${token}`), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(preparedSql.some((sql) => sql.includes('trashed_at IS NULL'))).toBe(true);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(previewBytes);

    const denied = await worker.fetch(new Request(`https://mrnks.2-38.com/api/line-preview/ast_1/${'0'.repeat(64)}`), env);
    expect(denied.status).toBe(404);
  });

  it('rejects owner or admin as a group-derived role', async () => {
    const runs: CapturedRun[] = [];
    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/line-groups/bind', {
      method: 'POST',
      headers: {
        cookie: 'mrnks_session=test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: 'bind-token',
        familyId: 'fam_1',
        role: 'admin',
        notificationsEnabled: true,
      }),
    }), bindingEnv(runs));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_group_role' });
    expect(runs.some((item) => item.sql.includes("status = 'active'"))).toBe(false);
  });
});
