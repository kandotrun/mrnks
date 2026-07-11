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

export function findDngJpegPreview(bytes: Uint8Array): EmbeddedJpegPreview | null {
  if (bytes.byteLength < 8) return null;
  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49;
  const bigEndian = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!littleEndian && !bigEndian) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readUint16 = (offset: number): number | null => {
    if (offset < 0 || offset + 2 > view.byteLength) return null;
    return view.getUint16(offset, littleEndian);
  };
  const readUint32 = (offset: number): number | null => {
    if (offset < 0 || offset + 4 > view.byteLength) return null;
    return view.getUint32(offset, littleEndian);
  };
  if (readUint16(2) !== 42) return null;

  const readValues = (entryOffset: number, type: number, count: number): number[] | null => {
    const valueSize = type === 3 ? 2 : type === 4 || type === 13 ? 4 : 0;
    if (!valueSize || count < 1 || count > 4_096) return null;
    const totalBytes = valueSize * count;
    const dataOffset = totalBytes <= 4 ? entryOffset + 8 : readUint32(entryOffset + 8);
    if (dataOffset === null || dataOffset < 0 || dataOffset + totalBytes > view.byteLength) return null;
    const values: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const valueOffset = dataOffset + index * valueSize;
      const value = valueSize === 2 ? readUint16(valueOffset) : readUint32(valueOffset);
      if (value === null) return null;
      values.push(value);
    }
    return values;
  };

  const readIfd = (offset: number): Map<number, number[]> | null => {
    const entryCount = readUint16(offset);
    if (entryCount === null || entryCount > 4_096) return null;
    const entriesEnd = offset + 2 + entryCount * 12;
    if (entriesEnd + 4 > view.byteLength) return null;
    const tags = new Map<number, number[]>();
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = offset + 2 + index * 12;
      const tag = readUint16(entryOffset);
      const type = readUint16(entryOffset + 2);
      const count = readUint32(entryOffset + 4);
      if (tag === null || type === null || count === null) continue;
      const values = readValues(entryOffset, type, count);
      if (values) tags.set(tag, values);
    }
    return tags;
  };

  const firstIfdOffset = readUint32(4);
  if (firstIfdOffset === null) return null;
  const root = readIfd(firstIfdOffset);
  if (!root) return null;

  const directories = [root];
  const subIfdOffsets = root.get(330) || [];
  for (const offset of subIfdOffsets.slice(0, 32)) {
    const directory = readIfd(offset);
    if (directory) directories.push(directory);
  }

  const candidates: EmbeddedJpegPreview[] = [];
  for (const directory of directories) {
    const width = directory.get(256)?.[0];
    const height = directory.get(257)?.[0];
    const compression = directory.get(259)?.[0];
    const photometric = directory.get(262)?.[0];
    const samplesPerPixel = directory.get(277)?.[0];
    const jpegOffset = directory.get(513)?.[0] ?? directory.get(273)?.[0] ?? directory.get(324)?.[0];
    const jpegLength = directory.get(514)?.[0] ?? directory.get(279)?.[0] ?? directory.get(325)?.[0];
    if (!width || !height || compression !== 7 || (!samplesPerPixel || samplesPerPixel < 3) && photometric !== 6) continue;
    if (jpegOffset === undefined || !jpegLength || jpegLength > 10 * 1024 * 1024) continue;
    candidates.push({ offset: jpegOffset, length: jpegLength, width, height });
  }
  if (candidates.length === 0) return null;

  const gallerySized = candidates
    .filter((candidate) => Math.max(candidate.width, candidate.height) >= 1_600)
    .sort((a, b) => (a.width * a.height) - (b.width * b.height));
  if (gallerySized.length > 0) return gallerySized[0];
  return candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
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
