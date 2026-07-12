export const SESSION_COOKIE_NAME = 'mrnks_session';

export function sanitizeFilename(input: string): string {
  const trimmed = input.trim().replace(/\\+/g, '/');
  const withoutTraversal = trimmed.replace(/\.\./g, '').replace(/^\/+/, '');
  const normalized = withoutTraversal
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'original-file';
}

export function buildOriginalKey(familyId: string, assetId: string, filename: string): string {
  return `originals/${encodePathSegment(familyId)}/${encodePathSegment(assetId)}/${sanitizeFilename(filename)}`;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array
      ? new Uint8Array(data)
      : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Base64(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyLineSignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature) return false;
  const expected = await hmacSha256Base64(secret, body);
  return timingSafeEqual(expected, signature);
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey || rest.length === 0) continue;
    result[rawKey] = decodeURIComponent(rest.join('='));
  }
  return result;
}

export function createSessionCookie(token: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function textResponse(text: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(text, { ...init, headers });
}

export function htmlResponse(html: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(html, { ...init, headers });
}

export function getOrigin(request: Request, appOrigin?: string): string {
  if (appOrigin?.startsWith('https://')) return appOrigin.replace(/\/$/, '');
  const url = new URL(request.url);
  return url.origin;
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim() || null;
}

export function normalizeMediaMimeType(filename: string, contentType: string | null | undefined): string {
  const normalized = (contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (normalized && normalized !== 'application/octet-stream') return normalized;

  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  const byExtension: Record<string, string> = {
    arw: 'image/x-sony-arw',
    dng: 'image/x-adobe-dng',
    heic: 'image/heic',
    heif: 'image/heif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  return byExtension[extension] || 'application/octet-stream';
}

export type SingleByteRangeResult =
  | { kind: 'full' }
  | { kind: 'partial'; offset: number; length: number }
  | { kind: 'unsatisfiable' };

export function parseSingleByteRange(rangeHeader: string | null, totalSize: number): SingleByteRangeResult {
  if (!rangeHeader) return { kind: 'full' };
  if (!Number.isSafeInteger(totalSize) || totalSize < 0) return { kind: 'unsatisfiable' };

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2]) || totalSize === 0) return { kind: 'unsatisfiable' };

  const parseInteger = (value: string): number | null => {
    if (!/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  };

  if (!match[1]) {
    const suffixLength = parseInteger(match[2]);
    if (suffixLength === null || suffixLength <= 0) return { kind: 'unsatisfiable' };
    const length = Math.min(suffixLength, totalSize);
    return { kind: 'partial', offset: totalSize - length, length };
  }

  const offset = parseInteger(match[1]);
  if (offset === null || offset >= totalSize) return { kind: 'unsatisfiable' };

  let end = totalSize - 1;
  if (match[2]) {
    const requestedEnd = parseInteger(match[2]);
    if (requestedEnd === null || requestedEnd < offset) return { kind: 'unsatisfiable' };
    end = Math.min(requestedEnd, end);
  }
  return { kind: 'partial', offset, length: end - offset + 1 };
}

export function contentDispositionAttachment(filename: string): string {
  const safe = sanitizeFilename(filename);
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`;
}

export interface EmbeddedJpegPreview {
  offset: number;
  length: number;
  width: number;
  height: number;
}

export interface RawPreviewRangeSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array | null>;
}

const MAX_TIFF_DIRECTORIES = 16;
const MAX_TIFF_PENDING_DIRECTORIES = 64;
const MAX_TIFF_ENTRIES_PER_DIRECTORY = 256;
const MAX_TIFF_ENTRIES_TOTAL = 1_024;
const MAX_TIFF_SUB_IFDS = 16;
const MAX_RAW_RANGE_READS = 32;
const MAX_RAW_RANGE_BYTES = 512 * 1024;
const MAX_RAW_PREVIEW_DIMENSION = 65_535;
const MAX_EMBEDDED_JPEG_BYTES = 10 * 1024 * 1024;
const JPEG_HEADER_READ_BYTES = 64 * 1024;
const RAW_PREVIEW_TAGS = new Set([256, 257, 259, 262, 273, 277, 279, 324, 325, 330, 513, 514]);

function rawPreviewSource(input: Uint8Array | RawPreviewRangeSource): RawPreviewRangeSource {
  if (!(input instanceof Uint8Array)) return input;
  return {
    size: input.byteLength,
    async read(offset: number, length: number): Promise<Uint8Array | null> {
      if (offset < 0 || length < 0 || offset + length > input.byteLength) return null;
      return input.slice(offset, offset + length);
    },
  };
}

function readTiffUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number | null {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, littleEndian);
}

function readTiffUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number | null {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, littleEndian);
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf
    && marker !== 0xc4
    && marker !== 0xc8
    && marker !== 0xcc;
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const end = bytes.byteLength;
  if (end < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let cursor = 2;
  while (cursor + 4 <= end) {
    if (bytes[cursor] !== 0xff) {
      cursor += 1;
      continue;
    }
    while (cursor < end && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= end) break;
    const marker = bytes[cursor];
    cursor += 1;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda || cursor + 2 > end) break;
    const segmentLength = (bytes[cursor] << 8) | bytes[cursor + 1];
    if (segmentLength < 2 || cursor + segmentLength > end) break;
    if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
      const height = (bytes[cursor + 3] << 8) | bytes[cursor + 4];
      const width = (bytes[cursor + 5] << 8) | bytes[cursor + 6];
      if (width > 0 && height > 0) return { width, height };
    }
    cursor += segmentLength;
  }
  return null;
}

export function findCompleteJpegLength(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let cursor = 2;
  let sawFrame = false;
  let sawScan = false;

  while (cursor < bytes.byteLength) {
    if (bytes[cursor] !== 0xff) return null;
    while (cursor < bytes.byteLength && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.byteLength) return null;
    const marker = bytes[cursor];
    cursor += 1;

    if (marker === 0xd9) return sawFrame && sawScan ? cursor : null;
    if (marker === 0x00) return null;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.byteLength) return null;
    const segmentLength = (bytes[cursor] << 8) | bytes[cursor + 1];
    if (segmentLength < 2 || cursor + segmentLength > bytes.byteLength) return null;
    if (isJpegStartOfFrame(marker) && segmentLength >= 7) sawFrame = true;
    cursor += segmentLength;

    if (marker !== 0xda) continue;
    sawScan = true;
    while (cursor < bytes.byteLength) {
      if (bytes[cursor] !== 0xff) {
        cursor += 1;
        continue;
      }
      const markerStart = cursor;
      while (cursor < bytes.byteLength && bytes[cursor] === 0xff) cursor += 1;
      if (cursor >= bytes.byteLength) return null;
      const scanMarker = bytes[cursor];
      cursor += 1;
      if (scanMarker === 0x00 || scanMarker === 0x01 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) continue;
      if (scanMarker === 0xd9) return sawFrame && sawScan ? cursor : null;
      cursor = markerStart;
      break;
    }
  }
  return null;
}

export async function findRawJpegPreview(
  input: Uint8Array | RawPreviewRangeSource,
): Promise<EmbeddedJpegPreview | null> {
  const source = rawPreviewSource(input);
  if (!Number.isSafeInteger(source.size) || source.size < 8) return null;
  let rangeReads = 0;
  let rangeBytes = 0;
  let readBudgetExhausted = false;
  const readExact = async (offset: number, length: number): Promise<Uint8Array | null> => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) return null;
    const end = offset + length;
    if (!Number.isSafeInteger(end) || end > source.size) return null;
    if (rangeReads >= MAX_RAW_RANGE_READS || rangeBytes + length > MAX_RAW_RANGE_BYTES) {
      readBudgetExhausted = true;
      return null;
    }
    rangeReads += 1;
    rangeBytes += length;
    const bytes = await source.read(offset, length);
    return bytes?.byteLength === length ? bytes : null;
  };

  const header = await readExact(0, 8);
  if (!header) return null;
  const littleEndian = header[0] === 0x49 && header[1] === 0x49;
  const bigEndian = header[0] === 0x4d && header[1] === 0x4d;
  if (!littleEndian && !bigEndian) return null;
  if (readTiffUint16(header, 2, littleEndian) !== 42) return null;

  let totalEntries = 0;
  const readValues = async (
    table: Uint8Array,
    entryOffset: number,
    type: number,
    count: number,
    maxValues: number,
  ): Promise<number[] | null> => {
    const valueSize = type === 3 ? 2 : type === 4 || type === 13 ? 4 : 0;
    if (!valueSize || count < 1 || maxValues < 1) return null;
    const valueCount = Math.min(count, maxValues);
    const totalBytes = valueSize * count;
    if (!Number.isSafeInteger(totalBytes)) return null;

    let valueBytes: Uint8Array;
    let valueOffset: number;
    if (totalBytes <= 4) {
      valueBytes = table;
      valueOffset = entryOffset + 8;
    } else {
      const dataOffset = readTiffUint32(table, entryOffset + 8, littleEndian);
      if (dataOffset === null) return null;
      const externalBytes = await readExact(dataOffset, valueCount * valueSize);
      if (!externalBytes) return null;
      valueBytes = externalBytes;
      valueOffset = 0;
    }

    const values: number[] = [];
    for (let index = 0; index < valueCount; index += 1) {
      const offset = valueOffset + index * valueSize;
      const value = valueSize === 2
        ? readTiffUint16(valueBytes, offset, littleEndian)
        : readTiffUint32(valueBytes, offset, littleEndian);
      if (value === null) return null;
      values.push(value);
    }
    return values;
  };

  const readIfd = async (offset: number): Promise<{ tags: Map<number, number[]>; nextOffset: number } | null> => {
    const countBytes = await readExact(offset, 2);
    if (!countBytes) return null;
    const entryCount = readTiffUint16(countBytes, 0, littleEndian);
    if (entryCount === null || entryCount > MAX_TIFF_ENTRIES_PER_DIRECTORY) return null;
    if (totalEntries + entryCount > MAX_TIFF_ENTRIES_TOTAL) return null;

    const tableLength = 2 + entryCount * 12 + 4;
    const table = await readExact(offset, tableLength);
    if (!table) return null;
    totalEntries += entryCount;

    const tags = new Map<number, number[]>();
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = 2 + index * 12;
      const tag = readTiffUint16(table, entryOffset, littleEndian);
      const type = readTiffUint16(table, entryOffset + 2, littleEndian);
      const count = readTiffUint32(table, entryOffset + 4, littleEndian);
      if (tag === null || type === null || count === null || !RAW_PREVIEW_TAGS.has(tag)) continue;
      const values = await readValues(table, entryOffset, type, count, tag === 330 ? MAX_TIFF_SUB_IFDS : 1);
      if (values) tags.set(tag, values);
    }
    return { tags, nextOffset: readTiffUint32(table, 2 + entryCount * 12, littleEndian) ?? 0 };
  };

  const firstIfdOffset = readTiffUint32(header, 4, littleEndian);
  if (firstIfdOffset === null) return null;
  const directories: Array<Map<number, number[]>> = [];
  const pendingOffsets = [firstIfdOffset];
  const seenOffsets = new Set<number>();
  const enqueue = (offset: number): void => {
    if (
      offset > 0
      && offset < source.size
      && !seenOffsets.has(offset)
      && !pendingOffsets.includes(offset)
      && pendingOffsets.length < MAX_TIFF_PENDING_DIRECTORIES
    ) pendingOffsets.push(offset);
  };

  while (pendingOffsets.length > 0 && directories.length < MAX_TIFF_DIRECTORIES && !readBudgetExhausted) {
    const offset = pendingOffsets.shift();
    if (offset === undefined || offset <= 0 || offset >= source.size || seenOffsets.has(offset)) continue;
    seenOffsets.add(offset);
    const directory = await readIfd(offset);
    if (!directory) continue;
    directories.push(directory.tags);
    enqueue(directory.nextOffset);
    for (const subIfdOffset of directory.tags.get(330) || []) enqueue(subIfdOffset);
  }

  const candidates: EmbeddedJpegPreview[] = [];
  for (const directory of directories) {
    const compression = directory.get(259)?.[0];
    if (compression !== 6 && compression !== 7) continue;

    const interchangeOffset = directory.get(513)?.[0];
    const interchangeLength = directory.get(514)?.[0];
    const samplesPerPixel = directory.get(277)?.[0];
    const photometric = directory.get(262)?.[0];
    const rgbJpeg = (samplesPerPixel !== undefined && samplesPerPixel >= 3) || photometric === 6;
    const jpegOffset = interchangeOffset
      ?? (rgbJpeg ? directory.get(273)?.[0] ?? directory.get(324)?.[0] : undefined);
    const jpegLength = interchangeLength
      ?? (rgbJpeg ? directory.get(279)?.[0] ?? directory.get(325)?.[0] : undefined);
    if (jpegOffset === undefined || !Number.isSafeInteger(jpegOffset) || jpegOffset < 0) continue;
    if (
      jpegLength === undefined
      || !Number.isSafeInteger(jpegLength)
      || jpegLength <= 0
      || jpegLength > MAX_EMBEDDED_JPEG_BYTES
      || jpegOffset + jpegLength > source.size
    ) continue;

    const taggedWidth = directory.get(256)?.[0];
    const taggedHeight = directory.get(257)?.[0];
    const jpegHeader = await readExact(jpegOffset, Math.min(jpegLength, JPEG_HEADER_READ_BYTES));
    const jpegDimensions = jpegHeader ? readJpegDimensions(jpegHeader) : null;
    const width = jpegDimensions?.width ?? taggedWidth;
    const height = jpegDimensions?.height ?? taggedHeight;
    if (
      !width
      || !height
      || !Number.isSafeInteger(width)
      || !Number.isSafeInteger(height)
      || width > MAX_RAW_PREVIEW_DIMENSION
      || height > MAX_RAW_PREVIEW_DIMENSION
    ) continue;
    candidates.push({ offset: jpegOffset, length: jpegLength, width, height });
  }
  if (candidates.length === 0) return null;

  const gallerySized = candidates
    .filter((candidate) => Math.max(candidate.width, candidate.height) >= 1_600)
    .sort((a, b) => ((a.width * a.height) - (b.width * b.height)) || (b.length - a.length));
  if (gallerySized.length > 0) return gallerySized[0];
  return candidates.sort(
    (a, b) => ((b.width * b.height) - (a.width * a.height)) || (b.length - a.length),
  )[0];
}

export async function findDngJpegPreview(
  input: Uint8Array | RawPreviewRangeSource,
): Promise<EmbeddedJpegPreview | null> {
  return findRawJpegPreview(input);
}

function encodePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}
