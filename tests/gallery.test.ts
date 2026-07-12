import { describe, expect, it, vi } from 'vitest';
import * as core from '../src/core';
import worker, { type Env } from '../src/worker';

interface PreviewDescriptor {
  offset: number;
  length: number;
  width: number;
  height: number;
}

interface PreviewRangeSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array | null>;
}

const parser = (core as unknown as {
  findRawJpegPreview?: (
    source: Uint8Array | PreviewRangeSource,
  ) => PreviewDescriptor | null | Promise<PreviewDescriptor | null>;
}).findRawJpegPreview;

function writeIfd(
  view: DataView,
  offset: number,
  entries: Array<{ tag: number; type: number; count: number; value: number }>,
  nextIfdOffset = 0,
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
  view.setUint32(offset + 2 + entries.length * 12, nextIfdOffset, true);
}

function createJpegHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
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
}

function createJpegWithComment(width: number, height: number, commentBytes: number): Uint8Array {
  const base = createJpegHeader(width, height);
  const payload = new Uint8Array(commentBytes).fill(0x41);
  const result = new Uint8Array(base.byteLength - 2 + 4 + payload.byteLength + 2);
  result.set(base.subarray(0, -2), 0);
  let cursor = base.byteLength - 2;
  result.set([0xff, 0xfe, ((payload.byteLength + 2) >> 8) & 0xff, (payload.byteLength + 2) & 0xff], cursor);
  cursor += 4;
  result.set(payload, cursor);
  result.set([0xff, 0xd9], cursor + payload.byteLength);
  return result;
}

function createJpegWithEntropy(width: number, height: number, entropyBytes: number): Uint8Array {
  const base = createJpegHeader(width, height);
  const result = new Uint8Array(base.byteLength + entropyBytes);
  const endOfScan = base.byteLength - 2;
  result.set(base.subarray(0, endOfScan));
  result.fill(0x11, endOfScan, endOfScan + entropyBytes);
  result.set([0xff, 0xd9], endOfScan + entropyBytes);
  return result;
}

function createDngHeaderFixture(galleryTrailingBytes = new Uint8Array()): Uint8Array {
  const bytes = new Uint8Array(4_096);
  const view = new DataView(bytes.buffer);
  const smallJpeg = createJpegHeader(160, 120);
  const fullJpeg = createJpegHeader(9_504, 6_320);
  const galleryJpeg = createJpegHeader(2_112, 1_408);
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

  jpegIfd(200, 160, 120, 2_000, smallJpeg.byteLength);
  jpegIfd(400, 9_504, 6_320, 2_500, fullJpeg.byteLength);
  jpegIfd(600, 2_112, 1_408, 3_000, galleryJpeg.byteLength + galleryTrailingBytes.byteLength);
  bytes.set(smallJpeg, 2_000);
  bytes.set(fullJpeg, 2_500);
  bytes.set(galleryJpeg, 3_000);
  bytes.set(galleryTrailingBytes, 3_000 + galleryJpeg.byteLength);
  return bytes;
}

function createArwHeaderFixture(): { header: Uint8Array; jpeg: Uint8Array } {
  const smallJpeg = createJpegHeader(1_616, 1_080);
  const galleryJpeg = createJpegWithEntropy(1_616, 1_080, 70_000);
  const header = new Uint8Array(3_500 + galleryJpeg.byteLength);
  const view = new DataView(header.buffer);
  header[0] = 0x49;
  header[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  // Sony ARWはIFD0に小さい旧JPEGサムネイルを持ち、
  // linked IFD側に同じ表示解像度でも高品質なJPEGプレビューを持つことがある。
  writeIfd(view, 8, [
    { tag: 254, type: 4, count: 1, value: 1 },
    { tag: 259, type: 3, count: 1, value: 6 },
    { tag: 513, type: 4, count: 1, value: 3_000 },
    { tag: 514, type: 4, count: 1, value: smallJpeg.byteLength },
  ], 200);
  writeIfd(view, 200, [
    { tag: 254, type: 4, count: 1, value: 1 },
    { tag: 259, type: 3, count: 1, value: 6 },
  ], 400);
  writeIfd(view, 400, [
    { tag: 254, type: 4, count: 1, value: 1 },
    { tag: 256, type: 4, count: 1, value: 1_616 },
    { tag: 257, type: 4, count: 1, value: 1_080 },
    { tag: 259, type: 3, count: 1, value: 7 },
    { tag: 262, type: 3, count: 1, value: 6 },
    { tag: 277, type: 3, count: 1, value: 3 },
    { tag: 513, type: 4, count: 1, value: 3_500 },
    { tag: 514, type: 4, count: 1, value: galleryJpeg.byteLength },
  ]);
  header.set(smallJpeg, 3_000);
  header.set(galleryJpeg, 3_500);
  return { header, jpeg: galleryJpeg };
}

function createLateIfdArwFixture(): { file: Uint8Array; jpeg: Uint8Array; firstIfdOffset: number } {
  const firstIfdOffset = 1_200_000;
  const jpegOffset = 1_250_000;
  const jpeg = createJpegHeader(1_616, 1_080);
  const file = new Uint8Array(jpegOffset + jpeg.byteLength);
  const view = new DataView(file.buffer);
  file[0] = 0x49;
  file[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, firstIfdOffset, true);
  writeIfd(view, firstIfdOffset, [
    { tag: 259, type: 3, count: 1, value: 6 },
    { tag: 513, type: 4, count: 1, value: jpegOffset },
    { tag: 514, type: 4, count: 1, value: jpeg.byteLength },
  ]);
  file.set(jpeg, jpegOffset);
  return { file, jpeg, firstIfdOffset };
}

function createOverBudgetTiffFixture(): Uint8Array {
  const jpeg = createJpegHeader(1_616, 1_080);
  const bytes = new Uint8Array(4_096);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  const entries = [
    { tag: 256, type: 4, count: 1, value: 1_616 },
    { tag: 257, type: 4, count: 1, value: 1_080 },
    { tag: 259, type: 3, count: 1, value: 7 },
    { tag: 262, type: 3, count: 1, value: 6 },
    { tag: 273, type: 4, count: 1, value: 3_500 },
    { tag: 277, type: 3, count: 1, value: 3 },
    { tag: 279, type: 4, count: 1, value: jpeg.byteLength },
    ...Array.from({ length: 250 }, (_, index) => ({
      tag: 40_000 + index,
      type: 4,
      count: 1,
      value: index,
    })),
  ];
  writeIfd(view, 8, entries);
  bytes.set(jpeg, 3_500);
  return bytes;
}

function createRangeReadBudgetFixture(): Uint8Array {
  const bytes = new Uint8Array(8_192);
  const view = new DataView(bytes.buffer);
  const tags = [256, 257, 259, 262, 273, 277, 279, 324, 325, 513, 514];
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  for (let directoryIndex = 0; directoryIndex < 16; directoryIndex += 1) {
    const directoryOffset = 8 + directoryIndex * 160;
    const nextOffset = directoryIndex < 15 ? directoryOffset + 160 : 0;
    const entries = tags.map((tag, tagIndex) => {
      const valueOffset = 4_000 + (directoryIndex * tags.length + tagIndex) * 8;
      view.setUint32(valueOffset, 0, true);
      view.setUint32(valueOffset + 4, 0, true);
      return { tag, type: 4, count: 2, value: valueOffset };
    });
    writeIfd(view, directoryOffset, entries, nextOffset);
  }
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
  sourceBytes?: Uint8Array,
  familyRows: Array<Record<string, unknown>> = [{ id: 'fam_1', name: '家族', role: 'owner' }],
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
                return { results: familyRows };
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
      if (sourceBytes) {
        const offset = range?.offset ?? 0;
        const length = range?.length ?? Math.max(0, sourceBytes.byteLength - offset);
        if (offset < 0 || length < 0 || offset + length > sourceBytes.byteLength) return null;
        return fakeR2Object(sourceBytes.slice(offset, offset + length), range as R2Range | undefined);
      }
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

async function signTestNasToken(payload: Record<string, unknown>, secret = 'test-nas-secret'): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of payloadBytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded)));
  let signatureBinary = '';
  for (const byte of signatureBytes) signatureBinary += String.fromCharCode(byte);
  const signature = btoa(signatureBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encoded}.${signature}`;
}

interface CompleteUploadCapture {
  batches: Array<Array<{ sql: string; values: unknown[] }>>;
  puts: string[];
}

function fakeCompleteUploadEnv(capture: CompleteUploadCapture): Env {
  const statements: Array<{ sql: string; values: unknown[]; run(): Promise<unknown> }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const statement = {
            sql,
            values,
            async first<T>() {
              if (sql.includes('FROM sessions s')) {
                return {
                  id: 'usr_1',
                  display_name: 'Kan',
                  picture_url: null,
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  line_group_binding_id: null,
                } as T;
              }
              if (sql.includes('FROM media_upload_sessions')) {
                return {
                  id: 'upl_1',
                  asset_id: 'ast_1',
                  family_id: 'fam_1',
                  uploader_user_id: 'usr_1',
                  original_filename: 'sample.bin',
                  original_mime_type: 'application/octet-stream',
                  original_size_bytes: 11,
                  original_storage_key: 'originals/fam_1/ast_1/original.arw',
                  client_last_modified_at: null,
                  status: 'uploading',
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
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
            async run() {
              return { success: true, meta: { changes: 1 } };
            },
          };
          statements.push(statement);
          return statement;
        },
      };
    },
    async batch(batchStatements: Array<{ sql: string; values: unknown[]; run(): Promise<unknown> }>) {
      capture.batches.push(batchStatements.map(({ sql, values }) => ({ sql, values })));
      return Promise.all(batchStatements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;
  const bucket = {
    async put(key: string) {
      capture.puts.push(key);
      return {};
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
    NAS_STORAGE_ORIGIN: 'https://upload.mrnks.2-38.com',
    NAS_STORAGE_SECRET: 'test-nas-secret',
    DB: db,
    MEDIA_BUCKET: bucket,
  } as Env;
}

interface UploadInitCapture {
  runs: Array<{ sql: string; values: unknown[] }>;
}

function fakeUploadInitEnv(
  role: 'owner' | 'admin' | 'uploader' | 'viewer',
  capture: UploadInitCapture,
): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('FROM sessions s')) {
                return {
                  id: 'usr_1',
                  display_name: 'Kan',
                  picture_url: null,
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  line_group_binding_id: null,
                } as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM family_members fm')) {
                return { results: [{ id: 'fam_1', name: '家族', role }] as T[] };
              }
              return { results: [] as T[] };
            },
            async run() {
              capture.runs.push({ sql, values });
              return { success: true, meta: { changes: 1 } };
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
    SESSION_SECRET: 'test-session-secret',
    NAS_STORAGE_ORIGIN: 'https://upload.mrnks.2-38.com',
    NAS_STORAGE_SECRET: 'test-nas-secret',
    DB: db,
    MEDIA_BUCKET: {} as R2Bucket,
  } as unknown as Env;
}

interface DeleteCapture {
  deletedKeys: string[];
  runs: Array<{ sql: string; values: unknown[] }>;
  operations?: string[];
  batchFailure?: boolean;
  trashRows?: Array<Record<string, unknown>>;
  legacyDeletionJob?: {
    asset_id: string;
    original_storage_key: string;
    original_storage_backend: 'r2' | 'nas';
    notification_preview_storage_key: string | null;
  };
}

function fakeDeleteEnv(
  role: 'owner' | 'admin' | 'uploader' | 'viewer',
  capture: DeleteCapture,
  assetExists = true,
  assetFamilyId = 'fam_1',
  storageBackend: 'r2' | 'nas' = 'r2',
  assetTrashedAt: string | null = null,
): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('FROM sessions s')) {
                return {
                  id: 'usr_1',
                  display_name: 'Kan',
                  picture_url: null,
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  line_group_binding_id: null,
                } as T;
              }
              if (sql.includes('FROM media_assets')) {
                if (!assetExists) return null;
                return {
                  id: 'ast_1',
                  family_id: assetFamilyId,
                  type: 'other',
                  original_filename: 'sample.arw',
                  original_mime_type: 'image/x-sony-arw',
                  original_size_bytes: 1234,
                  original_sha256: 'sha256-fixture',
                  original_storage_key: 'originals/fam_1/ast_1/sample.arw',
                  original_storage_backend: storageBackend,
                  notification_preview_storage_key: 'previews/fam_1/ast_1/line.jpg',
                  notification_preview_mime_type: 'image/jpeg',
                  notification_preview_size_bytes: 321,
                  captured_at: null,
                  client_last_modified_at: null,
                  uploaded_at: '2026-07-12T00:00:00.000Z',
                  processing_status: 'ready',
                  trashed_at: assetTrashedAt,
                  trashed_by_user_id: assetTrashedAt ? 'usr_1' : null,
                } as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM family_members fm')) {
                return { results: [{ id: 'fam_1', name: '家族', role }] as T[] };
              }
              if (sql.includes('FROM media_assets')) return { results: (capture.trashRows ?? []) as T[] };
              if (sql.includes('FROM media_deletion_jobs')) {
                return { results: (capture.legacyDeletionJob ? [capture.legacyDeletionJob] : []) as T[] };
              }
              return { results: [] as T[] };
            },
            async run() {
              capture.runs.push({ sql, values });
              capture.operations?.push('db:' + sql.replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' '));
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      if (capture.batchFailure) throw new Error('d1_unavailable');
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;

  const bucket = {
    async delete(keys: string | string[]) {
      capture.operations?.push('r2:delete');
      capture.deletedKeys.push(...(Array.isArray(keys) ? keys : [keys]));
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
    NAS_STORAGE_ORIGIN: 'https://upload.mrnks.2-38.com',
    NAS_STORAGE_SECRET: 'test-nas-secret',
    DB: db,
    MEDIA_BUCKET: bucket,
  };
}

describe('gallery and RAW previews', () => {
  it.each(['owner', 'admin', 'uploader'] as const)(
    'spec: %s can initiate a signed NAS upload without sending original bytes through the Worker',
    async (role) => {
      const capture: UploadInitCapture = { runs: [] };
      const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/families/fam_1/uploads', {
        method: 'POST',
        headers: {
          cookie: 'mrnks_session=session-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          filename: 'DSC00001.ARW',
          mimeType: 'image/x-sony-arw',
          sizeBytes: 45_000_000,
          clientLastModifiedAt: '2026-07-12T01:02:03.000Z',
        }),
      }), fakeUploadInitEnv(role, capture));

      expect(response.status).toBe(201);
      const body = await response.json() as Record<string, unknown>;
      expect(body.gatewayOrigin).toBe('https://upload.mrnks.2-38.com');
      expect(body.chunkSizeBytes).toBe(32 * 1024 * 1024);
      expect(body.uploadToken).toEqual(expect.any(String));
      expect(body.uploadId).toEqual(expect.any(String));
      expect(capture.runs.some(({ sql }) => sql.includes('INSERT INTO media_upload_sessions'))).toBe(true);
    },
  );

  it('spec: viewer cannot initiate a NAS upload', async () => {
    const capture: UploadInitCapture = { runs: [] };
    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/families/fam_1/uploads', {
      method: 'POST',
      headers: {
        cookie: 'mrnks_session=session-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ filename: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1234 }),
    }), fakeUploadInitEnv('viewer', capture));

    expect(response.status).toBe(403);
    expect(capture.runs).toHaveLength(0);
  });

  it('spec: commits a NAS original only when the signed completion receipt matches the reserved upload', async () => {
    const capture: CompleteUploadCapture = { batches: [], puts: [] };
    const receipt = await signTestNasToken({
      v: 1,
      action: 'complete',
      uploadId: 'upl_1',
      assetId: 'ast_1',
      familyId: 'fam_1',
      key: 'originals/fam_1/ast_1/original.arw',
      sizeBytes: 11,
      sha256: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/uploads/upl_1/complete', {
      method: 'POST',
      headers: {
        cookie: 'mrnks_session=session-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ receipt }),
    }), fakeCompleteUploadEnv(capture));

    expect(response.status).toBe(201);
    expect(capture.batches).toHaveLength(1);
    const insert = capture.batches[0].find(({ sql }) => sql.includes('INSERT INTO media_assets'));
    expect(insert?.sql).toContain('original_storage_backend');
    expect(insert?.values).toContain('nas');
    expect(insert?.values).toContain('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('spec: rejects a mismatched NAS receipt without writing D1 or R2', async () => {
    const capture: CompleteUploadCapture = { batches: [], puts: [] };
    const receipt = await signTestNasToken({
      v: 1,
      action: 'complete',
      uploadId: 'upl_1',
      assetId: 'ast_wrong',
      familyId: 'fam_1',
      key: 'originals/fam_1/ast_1/original.arw',
      sizeBytes: 11,
      sha256: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/uploads/upl_1/complete', {
      method: 'POST',
      headers: {
        cookie: 'mrnks_session=session-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ receipt }),
    }), fakeCompleteUploadEnv(capture));

    expect(response.status).toBe(400);
    expect(capture.batches).toHaveLength(0);
    expect(capture.puts).toHaveLength(0);
  });

  it('selects a gallery-sized embedded JPEG instead of the full-resolution DNG preview', async () => {
    expect(parser).toBeTypeOf('function');
    expect(await parser?.(createDngHeaderFixture())).toEqual({
      offset: 3_000,
      length: createJpegHeader(2_112, 1_408).byteLength,
      width: 2_112,
      height: 1_408,
    });
  });

  it('selects the gallery-sized old-JPEG thumbnail embedded in Sony ARW', async () => {
    const { header, jpeg } = createArwHeaderFixture();
    expect(parser).toBeTypeOf('function');
    expect(await parser?.(header)).toEqual({
      offset: 3_500,
      length: jpeg.byteLength,
      width: 1_616,
      height: 1_080,
    });
  });

  it('rejects TIFF directories that exceed the global parser budget', async () => {
    expect(parser).toBeTypeOf('function');
    expect(await parser?.(createOverBudgetTiffFixture())).toBeNull();
  });

  it('caps range reads for TIFF values across the whole parse', async () => {
    expect(parser).toBeTypeOf('function');
    const bytes = createRangeReadBudgetFixture();
    let readCalls = 0;
    const source: PreviewRangeSource = {
      size: bytes.byteLength,
      async read(offset, length) {
        readCalls += 1;
        return bytes.slice(offset, offset + length);
      },
    };

    expect(await parser?.(source)).toBeNull();
    expect(readCalls).toBeLessThanOrEqual(32);
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

  it('spec: denies every media surface to an authenticated user without explicit family access', async () => {
    const env = fakeGalleryEnv(
      createDngHeaderFixture(),
      new Uint8Array(),
      [],
      [],
      {},
      undefined,
      [],
    );
    const requests = [
      new Request('https://mrnks.2-38.com/api/families/fam_1/media', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      new Request('https://mrnks.2-38.com/api/media/ast_1/content', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      new Request('https://mrnks.2-38.com/api/media/ast_1/download-url', {
        method: 'POST',
        headers: { cookie: 'mrnks_session=test-token' },
      }),
    ];

    for (const request of requests) {
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
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

  it.each(['owner', 'admin', 'uploader'] as const)(
    'spec: %s moves family media to an indefinite trash without deleting stored objects',
    async (role) => {
      const capture: DeleteCapture = { deletedKeys: [], runs: [], operations: [] };
      const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1', {
        method: 'DELETE',
        headers: { cookie: 'mrnks_session=test-token' },
      }), fakeDeleteEnv(role, capture));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        ok: true,
        assetId: 'ast_1',
        trashed: true,
        trashedAt: expect.any(String),
      });
      expect(capture.deletedKeys).toEqual([]);
      expect(capture.runs.map(({ sql }) => sql)).toEqual([
        expect.stringContaining('UPDATE media_assets'),
        expect.stringContaining('DELETE FROM line_notification_deliveries'),
        expect.stringContaining('DELETE FROM download_tokens'),
      ]);
      expect(capture.runs[0]?.sql).toContain('trashed_at');
      expect(capture.runs[0]?.sql).toContain('trashed_by_user_id');
      expect(capture.runs.every(({ sql }) => !sql.includes('media_deletion_jobs'))).toBe(true);
      expect(capture.runs.every(({ sql }) => !sql.includes('DELETE FROM media_assets'))).toBe(true);
      expect(capture.operations).not.toContain('r2:delete');
    },
  );

  it.each(['owner', 'admin', 'uploader'] as const)(
    'spec: %s can restore trashed media without rewriting its stored objects',
    async (role) => {
      const capture: DeleteCapture = { deletedKeys: [], runs: [], operations: [] };
      const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1/restore', {
        method: 'POST',
        headers: { cookie: 'mrnks_session=test-token' },
      }), fakeDeleteEnv(role, capture, true, 'fam_1', 'nas', '2026-07-12T00:00:00.000Z'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, assetId: 'ast_1', restored: true });
      expect(capture.deletedKeys).toEqual([]);
      expect(capture.runs).toHaveLength(1);
      expect(capture.runs[0]?.sql).toContain('trashed_at = NULL');
      expect(capture.runs[0]?.sql).toContain('trashed_by_user_id = NULL');
      expect(capture.operations).not.toContain('r2:delete');
    },
  );

  it('spec: lists only trashed media for editors with a trash-scoped preview URL', async () => {
    const capture: DeleteCapture = {
      deletedKeys: [],
      runs: [],
      trashRows: [{
        id: 'ast_1',
        type: 'other',
        original_filename: 'sample.arw',
        original_mime_type: 'image/x-sony-arw',
        original_size_bytes: 1234,
        original_sha256: 'sha256-fixture',
        captured_at: null,
        client_last_modified_at: null,
        uploaded_at: '2026-07-12T00:00:00.000Z',
        processing_status: 'ready',
        trashed_at: '2026-07-12T03:04:05.000Z',
        total_count: 1,
      }],
    };
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/families/fam_1/trash', {
      headers: { cookie: 'mrnks_session=test-token' },
    }), fakeDeleteEnv('owner', capture));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      assets: [expect.objectContaining({
        id: 'ast_1',
        originalFilename: 'sample.arw',
        trashedAt: '2026-07-12T03:04:05.000Z',
        previewUrl: '/api/media/ast_1/preview?trash=1',
      })],
      totalCount: 1,
      hasMore: false,
      nextOffset: 1,
    });
  });

  it('spec: paginates indefinite trash instead of rendering it without a bound', async () => {
    const trashRows = Array.from({ length: 61 }, (_, index) => ({
      id: `ast_${index}`,
      type: 'image',
      original_filename: `photo-${index}.jpg`,
      original_mime_type: 'image/jpeg',
      original_size_bytes: 1_000 + index,
      original_sha256: `hash-${index}`,
      captured_at: null,
      client_last_modified_at: null,
      uploaded_at: '2026-07-12T00:00:00.000Z',
      processing_status: 'ready',
      trashed_at: new Date(Date.UTC(2026, 6, 12, 0, 0, 61 - index)).toISOString(),
      total_count: 75,
    }));
    const capture: DeleteCapture = { deletedKeys: [], runs: [], trashRows };
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/families/fam_1/trash?offset=0', {
      headers: { cookie: 'mrnks_session=test-token' },
    }), fakeDeleteEnv('owner', capture));
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

  it('spec: a trashed asset is hidden from normal preview access but remains previewable to an editor from trash', async () => {
    const trashedAt = '2026-07-12T03:04:05.000Z';
    const fixture = createDngHeaderFixture();
    const hidden = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(fixture, new Uint8Array(), [], [], { trashed_at: trashedAt }, fixture),
    );
    expect(hidden.status).toBe(404);

    const visible = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview?trash=1', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(fixture, new Uint8Array(), [], [], { trashed_at: trashedAt }, fixture),
    );
    expect(visible.status).toBe(200);
  });

  it('spec: viewer cannot list trash, restore media, or use a trash-scoped preview', async () => {
    const capture: DeleteCapture = { deletedKeys: [], runs: [] };
    const trashList = await worker.fetch(new Request('https://mrnks.2-38.com/api/families/fam_1/trash', {
      headers: { cookie: 'mrnks_session=test-token' },
    }), fakeDeleteEnv('viewer', capture));
    expect(trashList.status).toBe(403);

    const restore = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1/restore', {
      method: 'POST',
      headers: { cookie: 'mrnks_session=test-token' },
    }), fakeDeleteEnv('viewer', capture, true, 'fam_1', 'nas', '2026-07-12T00:00:00.000Z'));
    expect(restore.status).toBe(403);

    const fixture = createDngHeaderFixture();
    const preview = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1/preview?trash=1', {
      headers: { cookie: 'mrnks_session=test-token' },
    }), fakeGalleryEnv(
      fixture,
      new Uint8Array(),
      [],
      [],
      { trashed_at: '2026-07-12T00:00:00.000Z' },
      fixture,
      [{ id: 'fam_1', name: '家族', role: 'viewer' }],
    ));
    expect(preview.status).toBe(403);
  });

  it('spec: scheduled maintenance never permanently deletes legacy queued media', async () => {
    const capture: DeleteCapture = {
      deletedKeys: [],
      runs: [],
      operations: [],
      legacyDeletionJob: {
        asset_id: 'ast_1',
        original_storage_key: 'originals/fam_1/ast_1/sample.arw',
        original_storage_backend: 'r2',
        notification_preview_storage_key: 'previews/fam_1/ast_1/line.jpg',
      },
    };
    const scheduledPromises: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) { scheduledPromises.push(promise); },
      passThroughOnException() {},
    } as unknown as ExecutionContext;

    worker.scheduled({} as ScheduledController, fakeDeleteEnv('owner', capture), ctx);
    await Promise.all(scheduledPromises);

    expect(capture.deletedKeys).toEqual([]);
    expect(capture.operations).not.toContain('r2:delete');
    expect(capture.runs.every(({ sql }) => !sql.includes('DELETE FROM media_deletion_jobs'))).toBe(true);
  });

  it('does not let a viewer delete family media or touch R2', async () => {
    const capture: DeleteCapture = { deletedKeys: [], runs: [] };
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1', {
      method: 'DELETE',
      headers: { cookie: 'mrnks_session=test-token' },
    }), fakeDeleteEnv('viewer', capture));

    expect(res.status).toBe(403);
    expect(capture.deletedKeys).toEqual([]);
    expect(capture.runs).toEqual([]);
  });

  it('requires authentication before deleting media', async () => {
    const capture: DeleteCapture = { deletedKeys: [], runs: [] };
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1', {
      method: 'DELETE',
    }), fakeDeleteEnv('owner', capture));

    expect(res.status).toBe(401);
    expect(capture.deletedKeys).toEqual([]);
    expect(capture.runs).toEqual([]);
  });

  it('does not let an editor delete media from another family', async () => {
    const capture: DeleteCapture = { deletedKeys: [], runs: [] };
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1', {
      method: 'DELETE',
      headers: { cookie: 'mrnks_session=test-token' },
    }), fakeDeleteEnv('owner', capture, true, 'fam_2'));

    expect(res.status).toBe(403);
    expect(capture.deletedKeys).toEqual([]);
    expect(capture.runs).toEqual([]);
  });

  it('returns 404 without storage side effects when deleting missing media', async () => {
    const capture: DeleteCapture = { deletedKeys: [], runs: [] };
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/missing', {
      method: 'DELETE',
      headers: { cookie: 'mrnks_session=test-token' },
    }), fakeDeleteEnv('owner', capture, false));

    expect(res.status).toBe(404);
    expect(capture.deletedKeys).toEqual([]);
    expect(capture.runs).toEqual([]);
  });

  it('serves the embedded DNG JPEG through the authenticated preview endpoint', async () => {
    const trailingBytes = new Uint8Array([0x76, 0x97]);
    const file = createDngHeaderFixture(trailingBytes);
    const jpeg = createJpegHeader(2_112, 1_408);
    const rangeCalls: Array<{ offset?: number; length?: number }> = [];
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(new Uint8Array(), new Uint8Array(), rangeCalls, [], {
        original_size_bytes: file.byteLength,
      }, file),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-mrnks-preview-source')).toBe('embedded-dng');
    expect(res.headers.get('content-length')).toBe(String(jpeg.byteLength));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
    expect(rangeCalls).toContainEqual({ offset: 3_000, length: jpeg.byteLength + trailingBytes.byteLength });
    expect(rangeCalls.every((range) => (range.length ?? 0) <= 65_536)).toBe(true);
    expect(rangeCalls.length).toBeLessThanOrEqual(33);
  });

  it('serves the embedded Sony ARW JPEG through the authenticated preview endpoint', async () => {
    const { header, jpeg } = createArwHeaderFixture();
    const rangeCalls: Array<{ offset?: number; length?: number }> = [];
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(header, jpeg, rangeCalls, [], {
        original_filename: '_DSC9863.arw',
        original_mime_type: 'image/x-sony-arw',
        original_size_bytes: header.byteLength,
        original_storage_key: 'originals/fam_1/ast_1/DSC9863.arw',
      }, header),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-mrnks-preview-source')).toBe('embedded-arw');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
    const finalPreviewRead = { offset: 3_500, length: jpeg.byteLength };
    expect(jpeg.byteLength).toBeGreaterThan(65_536);
    expect(rangeCalls).toContainEqual(finalPreviewRead);
    expect(rangeCalls
      .filter((range) => range.offset !== finalPreviewRead.offset || range.length !== finalPreviewRead.length)
      .every((range) => (range.length ?? 0) <= 65_536)).toBe(true);
    expect(rangeCalls.length).toBeLessThanOrEqual(33);
  });

  it('finds Sony ARW IFDs located beyond the first 1 MiB without reading the full RAW', async () => {
    const { file, jpeg, firstIfdOffset } = createLateIfdArwFixture();
    const rangeCalls: Array<{ offset?: number; length?: number }> = [];
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(new Uint8Array(), new Uint8Array(), rangeCalls, [], {
        original_filename: 'late-ifd.arw',
        original_mime_type: 'image/x-sony-arw',
        original_size_bytes: file.byteLength,
        original_storage_key: 'originals/fam_1/ast_1/late-ifd.arw',
      }, file),
    );

    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
    expect(rangeCalls).toContainEqual({ offset: firstIfdOffset, length: 2 });
    expect(rangeCalls.every((range) => (range.length ?? 0) <= 65_536)).toBe(true);
    expect(rangeCalls.length).toBeLessThanOrEqual(33);
  });

  it('rejects an embedded RAW JPEG whose declared range has no EOI marker', async () => {
    const { header, jpeg } = createArwHeaderFixture();
    const corrupted = header.slice();
    corrupted[3_500 + jpeg.byteLength - 2] = 0;
    corrupted[3_500 + jpeg.byteLength - 1] = 0;
    const res = await worker.fetch(
      new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }),
      fakeGalleryEnv(new Uint8Array(), new Uint8Array(), [], [], {
        original_filename: 'corrupted.arw',
        original_mime_type: 'image/x-sony-arw',
        original_size_bytes: corrupted.byteLength,
        original_storage_key: 'originals/fam_1/ast_1/corrupted.arw',
      }, corrupted),
    );

    expect(res.status).toBe(415);
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

  it('spec: streams a NAS-backed original through a short-lived signed gateway request', async () => {
    const rangeCalls: Array<{ offset?: number; length?: number }> = [];
    const gatewayFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toMatch(/^Bearer /);
      expect(new Headers(init?.headers).get('range')).toBe('bytes=1-3');
      return new Response(new TextEncoder().encode('bcd'), {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-length': '3',
          'content-range': 'bytes 1-3/5',
          'accept-ranges': 'bytes',
        },
      });
    });
    vi.stubGlobal('fetch', gatewayFetch);
    try {
      const env = fakeGalleryEnv(new Uint8Array(), new Uint8Array(), rangeCalls, [], {
        type: 'video',
        original_filename: 'clip.mp4',
        original_mime_type: 'video/mp4',
        original_size_bytes: 5,
        original_storage_key: 'originals/fam_1/ast_1/original.mp4',
        original_storage_backend: 'nas',
      });
      Object.assign(env, {
        NAS_STORAGE_ORIGIN: 'https://upload.mrnks.2-38.com',
        NAS_STORAGE_SECRET: 'test-nas-secret',
      });
      const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1/content', {
        headers: {
          cookie: 'mrnks_session=session-token',
          range: 'bytes=1-3',
        },
      }), env);
      expect(response.status).toBe(206);
      expect(await response.text()).toBe('bcd');
      expect(gatewayFetch).toHaveBeenCalledWith(
        'https://upload.mrnks.2-38.com/v1/objects/ast_1',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(rangeCalls).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('spec: serves the R2 gallery preview for a NAS original without touching the NAS', async () => {
    const previewBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const rangeCalls: Array<{ offset?: number; length?: number }> = [];
    const gatewayFetch = vi.fn(async () => {
      throw new Error('NAS must not be called when an R2 preview exists');
    });
    vi.stubGlobal('fetch', gatewayFetch);
    try {
      const env = fakeGalleryEnv(new Uint8Array(), new Uint8Array(), rangeCalls, [], {
        original_filename: 'sample.arw',
        original_mime_type: 'image/x-sony-arw',
        original_size_bytes: 1234,
        original_storage_key: 'originals/fam_1/ast_1/original.arw',
        original_storage_backend: 'nas',
        notification_preview_storage_key: 'previews/fam_1/ast_1/gallery.jpg',
      }, previewBytes);
      Object.assign(env, {
        NAS_STORAGE_ORIGIN: 'https://mrnks-storage.pochimo.com',
        NAS_STORAGE_SECRET: 'test-nas-secret',
      });
      const response = await worker.fetch(new Request('https://mrnks.2-38.com/api/media/ast_1/preview', {
        headers: { cookie: 'mrnks_session=test-token' },
      }), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(previewBytes);
      expect(gatewayFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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
