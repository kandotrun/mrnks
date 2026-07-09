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

export function contentDispositionAttachment(filename: string): string {
  const safe = sanitizeFilename(filename);
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`;
}

function encodePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}
