import { describe, expect, it } from 'vitest';
import * as core from '../src/core';
import worker, { type Env } from '../src/worker';

interface PreviewDescriptor {
  offset: number;
  length: number;
  width: number;
  height: number;
}

const parser = (core as unknown as {
  findDngJpegPreview?: (bytes: Uint8Array) => PreviewDescriptor | null;
}).findDngJpegPreview;

function writeIfd(
  view: DataView,
  offset: number,
  entries: Array<{ tag: number; type: number; count: number; value: number }>,
): void {
  view.setUint16(offset, entries.length, true);
  entries.forEach((entry, index) => {
    const base = offset + 2 + index * 12;
    view.setUint16(base, entry.tag, true);
    view.setUint16(base + 2, entry.type, true);
    view.setUint32(base + 4, entry.count, true);
    if (entry.type === 3 && entry.count === 1) {
      view.setUint16(base + 8, entry.value, true);
      view.setUint16(base + 10, 0, true);
    } else {
      view.setUint32(base + 8, entry.value, true);
    }
  });
  view.setUint32(offset + 2 + entries.length * 12, 0, true);
}

function createDngHeaderFixture(): Uint8Array {
  const bytes = new Uint8Array(1_024);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  writeIfd(view, 8, [
    { tag: 330, type: 4, count: 3, value: 120 },
  ]);
  view.setUint32(120, 200, true);
  view.setUint32(124, 400, true);
  view.setUint32(128, 600, true);

  const jpegIfd = (offset: number, width: number, height: number, dataOffset: number, length: number) => writeIfd(view, offset, [
    { tag: 254, type: 4, count: 1, value: 1 },
    { tag: 256, type: 4, count: 1, value: width },
    { tag: 257, type: 4, count: 1, value: height },
    { tag: 259, type: 3, count: 1, value: 7 },
    { tag: 262, type: 3, count: 1, value: 6 },
    { tag: 273, type: 4, count: 1, value: dataOffset },
    { tag: 277, type: 3, count: 1, value: 3 },
    { tag: 279, type: 4, count: 1, value: length },
  ]);

  jpegIfd(200, 160, 120, 2_000, 4);
  jpegIfd(400, 9_504, 6_320, 2_500, 2_000_000);
  jpegIfd(600, 2_112, 1_408, 3_000, 6);
  return bytes;
}

function fakeR2Object(bytes: Uint8Array, range?: R2Range): R2ObjectBody {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const buffer = copy.buffer;
  return {
    body: new Blob([buffer]).stream(),
    bodyUsed: false,
    bytes: async () => copy,
    arrayBuffer: async () => buffer.slice(0),
    text: async () => new TextDecoder().decode(copy),
    json: async <T>() => JSON.parse(new TextDecoder().decode(copy)) as T,
    blob: async () => new Blob([buffer]),
    key: 'fixture',
    version: '1',
    size: bytes.byteLength,
    etag: 'fixture',
    httpEtag: '"fixture"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date(0),
    storageClass: 'Standard',
    range,
    writeHttpMetadata: () => undefined,
  } as R2ObjectBody;
}

function fakeGalleryEnv(
  header: Uint8Array,
  jpeg: Uint8Array,
  rangeCalls: Array<{ offset?: number; length?: number }>,
  listRows: Array<Record<string, unknown>> = [],
  assetOverrides: Record<string, unknown> = {},
): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('FROM sessions s')) {
                return {
                  id: 'usr_1',
                  display_name: 'Kan',
                  picture_url: null,
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                };
              }
              if (sql.includes('FROM media_assets')) {
                return {
                  id: 'ast_1',
                  family_id: 'fam_1',
                  type: 'other',
                  original_filename: 'sample.dng',
                  original_mime_type: 'image/x-adobe-dng',
                  original_size_bytes: 4_000_000,
                  original_storage_key: 'originals/fam_1/ast_1/sample.dng',
                  ...assetOverrides,
                };
              }
              return null;
            },
            async all() {
              if (sql.includes('FROM family_members fm')) {
                return { results: [{ id: 'fam_1', name: '家族', role: 'owner' }] };
              }
              if (sql.includes('FROM media_assets')) return { results: listRows };
              return { results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  const bucket = {
    async get(_key: string, options?: R2GetOptions) {
      const range = options?.range as { offset?: number; length?: number } | undefined;
      rangeCalls.push({ offset: range?.offset, length: range?.length });
      if (range?.offset === 3_000) return fakeR2Object(jpeg, range as R2Range);
      if (range?.offset === 0 && typeof range.length === 'number' && range.length <= jpeg.byteLength) {
        return fakeR2Object(jpeg.slice(0, range.length), range as R2Range);
      }
      return fakeR2Object(header, range as R2Range | undefined);
    },
  } as unknown as R2Bucket;

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
    DB: db,
    MEDIA_BUCKET: bucket,
  };
}

describe('gallery and DNG previews', () => {
  it('selects a gallery-sized embedded JPEG instead of the full-resolution DNG preview', () => {
    expect(parser).toBeTypeOf('function');
    expect(parser?.(createDngHeaderFixture())).toEqual({
      offset: 3_000,
      length: 6,
      width: 2_112,
      height: 1_408,
    });
  });

  it('requires authentication for media previews and original content', async () => {
    const env = fakeGalleryEnv(createDngHeaderFixture(), new Uint8Array(), []);
    for (const endpoint of ['preview', 'content']) {
      const res = await worker.fetch(
        new Request(`https://mrnks.2-38.com/api/media/ast_1/${endpoint}`),
        env,
      );
      expect(res.status).toBe(401);
    }
  });

  it('rejects media access when the authenticated user is not in the asset family', async () => {
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(createDngHeaderFixture(), new Uint8Array(), [], [], { family_id: 'fam_2' }),
    );

    expect(res.status).toBe(403);
  });

  it('serves the embedded DNG JPEG through the authenticated preview endpoint', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
    const rangeCalls: Array<{ offset?: number; length?: number }> = [];
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(createDngHeaderFixture(), jpeg, rangeCalls),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-mrnks-preview-source')).toBe('embedded-dng');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
    expect(rangeCalls).toEqual([
      { offset: 0, length: 1_048_576 },
      { offset: 3_000, length: 6 },
    ]);
  });

  it('paginates media lists without hiding the total album size', async () => {
    const rows = Array.from({ length: 61 }, (_, index) => ({
      id: `ast_${index}`,
      type: 'image',
      original_filename: `photo-${index}.jpg`,
      original_mime_type: 'image/jpeg',
      original_size_bytes: 1_000 + index,
      original_sha256: `hash-${index}`,
      captured_at: null,
      client_last_modified_at: null,
      uploaded_at: new Date(Date.UTC(2026, 6, 11, 0, 0, 61 - index)).toISOString(),
      processing_status: 'ready',
      total_count: 75,
    }));
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/families/fam_1/media?offset=0', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(createDngHeaderFixture(), new Uint8Array(), [], rows),
    );
    const body = await res.json() as {
      assets: Array<{ id: string }>;
      totalCount: number;
      hasMore: boolean;
      nextOffset: number;
    };

    expect(res.status).toBe(200);
    expect(body.assets).toHaveLength(60);
    expect(body.totalCount).toBe(75);
    expect(body.hasMore).toBe(true);
    expect(body.nextOffset).toBe(60);
  });

  it('returns 416 without reading R2 for malformed, multiple, or out-of-bounds ranges', async () => {
    for (const range of ['bytes=999999999-', 'bytes=abc-def', 'bytes=0-0,2-3']) {
      const rangeCalls: Array<{ offset?: number; length?: number }> = [];
      const res = await worker.fetch(
        new Request('https://mrnks.2-38.com/api/media/ast_1/content', {
          headers: { cookie: 'mrnks_session=test-token', range },
        }),
        fakeGalleryEnv(createDngHeaderFixture(), new Uint8Array([1, 2, 3]), rangeCalls),
      );

      expect(res.status).toBe(416);
      expect(res.headers.get('content-range')).toBe('bytes */4000000');
      expect(rangeCalls).toEqual([]);
    }
  });

  it('serves authenticated video content inline without making other uploads executable', async () => {
    const body = new Uint8Array([0, 0, 0, 1]);
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/content', {
        headers: { cookie: 'mrnks_session=test-token', range: 'bytes=0-3' },
      }),
      fakeGalleryEnv(createDngHeaderFixture(), body, [], [], {
        type: 'video',
        original_filename: 'clip.mp4',
        original_mime_type: 'video/mp4',
      }),
    );

    expect(res.status).toBe(206);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('content-disposition')).toBeNull();
  });

  it('serves validated single-range responses with exact partial bytes', async () => {
    const body = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x01, 0x02]);
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/content', {
        headers: {
          cookie: 'mrnks_session=test-token',
          range: 'bytes=0-5',
        },
      }),
      fakeGalleryEnv(createDngHeaderFixture(), body, []),
    );

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-5/4000000');
    expect(res.headers.get('content-length')).toBe('6');
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(body);
  });
});
