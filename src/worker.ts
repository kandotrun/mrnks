import {
  SESSION_COOKIE_NAME,
  buildOriginalKey,
  clearSessionCookie,
  contentDispositionAttachment,
  createSessionCookie,
  findDngJpegPreview,
  getOrigin,
  htmlResponse,
  jsonResponse,
  normalizeMediaMimeType,
  nowIso,
  parseCookieHeader,
  parseSingleByteRange,
  randomId,
  sha256Hex,
  textResponse,
  verifyLineSignature,
} from './core';
import { renderAppHtml } from './html';

export interface Env {
  ENVIRONMENT?: string;
  APP_ORIGIN?: string;
  LINE_LIFF_ID?: string;
  LINE_LOGIN_CHANNEL_ID: string;
  LINE_LOGIN_CHANNEL_SECRET: string;
  LINE_MESSAGING_CHANNEL_ID: string;
  LINE_MESSAGING_CHANNEL_SECRET: string;
  LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: string;
  SESSION_SECRET: string;
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
}

interface AuthedUser {
  id: string;
  displayName: string | null;
  pictureUrl: string | null;
  families: FamilySummary[];
}

interface FamilySummary {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'uploader' | 'viewer';
}

interface LineVerifyResponse {
  sub: string;
  name?: string;
  picture?: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DOWNLOAD_TTL_SECONDS = 60 * 10;
const DNG_HEADER_READ_BYTES = 1024 * 1024;
const MEDIA_PAGE_SIZE = 60;
const MAX_MEDIA_OFFSET = 1_000_000;
const BROWSER_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
]);

interface StoredMediaAsset {
  id: string;
  family_id: string;
  type: string;
  original_filename: string;
  original_mime_type: string;
  original_size_bytes: number;
  original_storage_key: string;
}

const worker = {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, { status: error.status });
      }
      console.error('request failed', error instanceof Error ? error.message : String(error));
      return jsonResponse({ error: 'internal_error' }, { status: 500 });
    }
  },
};

export default worker;

async function route(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'GET' && path === '/') return htmlResponse(renderAppHtml());
  if (request.method === 'GET' && path === '/health') return jsonResponse({ ok: true, service: 'mrnks', environment: env.ENVIRONMENT ?? 'production' });
  if (request.method === 'GET' && path === '/api/config') return handleConfig(env);
  if (request.method === 'POST' && path === '/api/auth/line') return handleLineAuth(request, env);
  if (request.method === 'GET' && path === '/api/auth/session') return handleSession(request, env);
  if (request.method === 'POST' && path === '/api/auth/logout') return handleLogout();
  if (request.method === 'POST' && path === '/webhook/line') return handleLineWebhook(request, env, ctx);
  if (request.method === 'GET' && path === '/api/line/bot-info') return handleLineBotInfo(env);

  const familyMediaMatch = path.match(/^\/api\/families\/([^/]+)\/media$/);
  if (familyMediaMatch && request.method === 'GET') return handleListMedia(request, env, decodeURIComponent(familyMediaMatch[1]));
  if (familyMediaMatch && request.method === 'PUT') return handleUploadMedia(request, env, decodeURIComponent(familyMediaMatch[1]));

  const previewMatch = path.match(/^\/api\/media\/([^/]+)\/preview$/);
  if (previewMatch && request.method === 'GET') return handleMediaPreview(request, env, decodeURIComponent(previewMatch[1]));

  const contentMatch = path.match(/^\/api\/media\/([^/]+)\/content$/);
  if (contentMatch && request.method === 'GET') return handleMediaContent(request, env, decodeURIComponent(contentMatch[1]));

  const downloadUrlMatch = path.match(/^\/api\/media\/([^/]+)\/download-url$/);
  if (downloadUrlMatch && request.method === 'POST') return handleCreateDownloadUrl(request, env, decodeURIComponent(downloadUrlMatch[1]));

  const downloadMatch = path.match(/^\/api\/download\/([^/]+)$/);
  if (downloadMatch && request.method === 'GET') return handleDownload(request, env, decodeURIComponent(downloadMatch[1]));

  if (path.startsWith('/api/')) return jsonResponse({ error: 'not_found' }, { status: 404 });
  return htmlResponse(renderAppHtml());
}

function handleConfig(env: Env): Response {
  return jsonResponse({
    appName: 'まるのこし',
    tagline: '思い出を、画質ごと残す。',
    liffId: env.LINE_LIFF_ID || '',
    maxUploadNote: 'MVPではWorker経由で保存します。大容量動画はmultipart対応予定です。',
  });
}

async function handleLineAuth(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { idToken?: string } | null;
  if (!body?.idToken) return jsonResponse({ error: 'id_token_required' }, { status: 400 });

  const profile = await verifyLineIdToken(body.idToken, env.LINE_LOGIN_CHANNEL_ID);
  const user = await upsertLineUser(env, profile);
  const families = await ensureDefaultFamily(env, user.id);
  const token = randomId('ses');
  const tokenHash = await hashSecretToken(token, env.SESSION_SECRET);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(randomId('session'), user.id, tokenHash, createdAt, expiresAt).run();

  return jsonResponse(
    { user: publicUser(user), families },
    { headers: { 'set-cookie': createSessionCookie(token, SESSION_TTL_SECONDS) } },
  );
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  return jsonResponse({ user: publicUser(user), families: user.families });
}

function handleLogout(): Response {
  return jsonResponse({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } });
}

async function handleUploadMedia(request: Request, env: Env, familyId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await requireFamilyRole(user, familyId, ['owner', 'admin', 'uploader']);

  const rawFilename = decodeURIComponent(request.headers.get('x-file-name') || 'original-file');
  const mimeType = normalizeMediaMimeType(rawFilename, request.headers.get('content-type'));
  const clientHash = request.headers.get('x-client-sha256')?.toLowerCase() || null;
  const clientLastModified = request.headers.get('x-client-last-modified') || null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  const serverHash = await sha256Hex(bytes);
  if (clientHash && clientHash !== serverHash) {
    return jsonResponse({ error: 'sha256_mismatch', serverHash }, { status: 400 });
  }

  const assetId = randomId('ast');
  const key = buildOriginalKey(familyId, assetId, rawFilename);
  await env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: {
      sha256: serverHash,
      originalFilename: rawFilename,
      uploadedBy: user.id,
      familyId,
    },
  });

  const uploadedAt = nowIso();
  const type = mediaTypeFromMime(mimeType);
  await env.DB.prepare(
    `INSERT INTO media_assets (
      id, family_id, uploader_user_id, type, original_filename, original_mime_type,
      original_size_bytes, original_sha256, original_storage_key, client_last_modified_at,
      uploaded_at, processing_status, visibility
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 'family')`,
  ).bind(
    assetId,
    familyId,
    user.id,
    type,
    rawFilename,
    mimeType,
    bytes.byteLength,
    serverHash,
    key,
    clientLastModified,
    uploadedAt,
  ).run();

  return jsonResponse({
    ok: true,
    asset: {
      id: assetId,
      familyId,
      originalFilename: rawFilename,
      mimeType,
      sizeBytes: bytes.byteLength,
      sha256: serverHash,
      uploadedAt,
    },
  }, { status: 201 });
}

async function handleListMedia(request: Request, env: Env, familyId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await requireFamilyRole(user, familyId, ['owner', 'admin', 'uploader', 'viewer']);
  const requestedOffset = Number.parseInt(new URL(request.url).searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(requestedOffset)
    ? Math.min(Math.max(requestedOffset, 0), MAX_MEDIA_OFFSET)
    : 0;
  const rows = await env.DB.prepare(
    `SELECT id, type, original_filename, original_mime_type, original_size_bytes, original_sha256,
            captured_at, client_last_modified_at, uploaded_at, processing_status,
            COUNT(*) OVER () AS total_count
       FROM media_assets
      WHERE family_id = ?
      ORDER BY COALESCE(captured_at, client_last_modified_at, uploaded_at) DESC, uploaded_at DESC, id DESC
      LIMIT ? OFFSET ?`,
  ).bind(familyId, MEDIA_PAGE_SIZE + 1, offset).all<{
    id: string;
    type: string;
    original_filename: string;
    original_mime_type: string;
    original_size_bytes: number;
    original_sha256: string;
    captured_at: string | null;
    client_last_modified_at: string | null;
    uploaded_at: string;
    processing_status: string;
    total_count: number;
  }>();

  const resultRows = rows.results || [];
  const pageRows = resultRows.slice(0, MEDIA_PAGE_SIZE);
  return jsonResponse({
    assets: pageRows.map((row) => ({
      id: row.id,
      type: row.type,
      originalFilename: row.original_filename,
      mimeType: row.original_mime_type,
      sizeBytes: row.original_size_bytes,
      sha256: row.original_sha256,
      capturedAt: row.captured_at,
      clientLastModifiedAt: row.client_last_modified_at,
      uploadedAt: row.uploaded_at,
      processingStatus: row.processing_status,
      previewUrl: `/api/media/${encodeURIComponent(row.id)}/preview`,
      contentUrl: `/api/media/${encodeURIComponent(row.id)}/content`,
    })),
    totalCount: resultRows[0]?.total_count ?? 0,
    hasMore: resultRows.length > MEDIA_PAGE_SIZE,
    nextOffset: offset + pageRows.length,
  });
}

async function loadAuthorizedMediaAsset(request: Request, env: Env, assetId: string): Promise<StoredMediaAsset> {
  const user = await requireUser(request, env);
  const asset = await env.DB.prepare(
    `SELECT id, family_id, type, original_filename, original_mime_type, original_size_bytes, original_storage_key
       FROM media_assets
      WHERE id = ?
      LIMIT 1`,
  ).bind(assetId).first<StoredMediaAsset>();
  if (!asset) throw new HttpError(404, 'asset_not_found');
  await requireFamilyRole(user, asset.family_id, ['owner', 'admin', 'uploader', 'viewer']);
  return asset;
}

async function handleMediaPreview(request: Request, env: Env, assetId: string): Promise<Response> {
  const asset = await loadAuthorizedMediaAsset(request, env, assetId);
  const isDng = asset.original_mime_type === 'image/x-adobe-dng' || asset.original_filename.toLowerCase().endsWith('.dng');

  if (isDng) {
    const headerObject = await env.MEDIA_BUCKET.get(asset.original_storage_key, {
      range: { offset: 0, length: Math.min(DNG_HEADER_READ_BYTES, asset.original_size_bytes) },
    });
    if (!headerObject) throw new HttpError(404, 'original_object_not_found');
    const descriptor = findDngJpegPreview(await headerObject.bytes());
    if (!descriptor || descriptor.offset + descriptor.length > asset.original_size_bytes) {
      throw new HttpError(415, 'dng_preview_unavailable');
    }

    const previewObject = await env.MEDIA_BUCKET.get(asset.original_storage_key, {
      range: { offset: descriptor.offset, length: descriptor.length },
    });
    if (!previewObject) throw new HttpError(404, 'original_object_not_found');
    const previewBytes = await previewObject.bytes();
    if (previewBytes.byteLength < 2 || previewBytes[0] !== 0xff || previewBytes[1] !== 0xd8) {
      throw new HttpError(415, 'dng_preview_invalid');
    }

    const responseBytes = new Uint8Array(previewBytes.byteLength);
    responseBytes.set(previewBytes);
    return new Response(responseBytes.buffer, {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(previewBytes.byteLength),
        'cache-control': 'private, max-age=86400',
        'vary': 'Cookie',
        'x-content-type-options': 'nosniff',
        'x-mrnks-preview-source': 'embedded-dng',
      },
    });
  }

  if (!BROWSER_IMAGE_MIME_TYPES.has(asset.original_mime_type)) {
    throw new HttpError(415, 'preview_unavailable');
  }
  const object = await env.MEDIA_BUCKET.get(asset.original_storage_key);
  if (!object) throw new HttpError(404, 'original_object_not_found');
  return new Response(object.body, {
    headers: {
      'content-type': asset.original_mime_type,
      'content-length': String(asset.original_size_bytes),
      'cache-control': 'private, max-age=86400',
      'vary': 'Cookie',
      'x-content-type-options': 'nosniff',
      'x-mrnks-preview-source': 'original-image',
    },
  });
}

async function handleMediaContent(request: Request, env: Env, assetId: string): Promise<Response> {
  const asset = await loadAuthorizedMediaAsset(request, env, assetId);
  const requestedRange = parseSingleByteRange(request.headers.get('range'), asset.original_size_bytes);
  if (requestedRange.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: {
        'content-range': `bytes */${asset.original_size_bytes}`,
        'accept-ranges': 'bytes',
        'cache-control': 'private, no-store',
        'vary': 'Cookie',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const object = requestedRange.kind === 'partial'
    ? await env.MEDIA_BUCKET.get(asset.original_storage_key, {
      range: { offset: requestedRange.offset, length: requestedRange.length },
    })
    : await env.MEDIA_BUCKET.get(asset.original_storage_key);
  if (!object) throw new HttpError(404, 'original_object_not_found');

  const inlineVideo = asset.type === 'video' && /^video\/[a-z0-9.+-]+$/i.test(asset.original_mime_type);
  const headers = new Headers({
    'content-type': inlineVideo ? asset.original_mime_type : 'application/octet-stream',
    'cache-control': 'private, max-age=3600',
    'vary': 'Cookie',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
  });
  if (!inlineVideo) headers.set('content-disposition', contentDispositionAttachment(asset.original_filename));

  if (requestedRange.kind === 'partial') {
    const end = requestedRange.offset + requestedRange.length - 1;
    headers.set('content-range', `bytes ${requestedRange.offset}-${end}/${asset.original_size_bytes}`);
    headers.set('content-length', String(requestedRange.length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('content-length', String(asset.original_size_bytes));
  return new Response(object.body, { status: 200, headers });
}

async function handleCreateDownloadUrl(request: Request, env: Env, assetId: string): Promise<Response> {
  const user = await requireUser(request, env);
  const asset = await env.DB.prepare(
    `SELECT id, family_id, original_filename FROM media_assets WHERE id = ?`,
  ).bind(assetId).first<{ id: string; family_id: string; original_filename: string }>();
  if (!asset) return jsonResponse({ error: 'asset_not_found' }, { status: 404 });
  await requireFamilyRole(user, asset.family_id, ['owner', 'admin', 'uploader', 'viewer']);

  const token = randomId('dl');
  const tokenHash = await hashSecretToken(token, env.SESSION_SECRET);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO download_tokens (id, token_hash, media_asset_id, created_by_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(randomId('download'), tokenHash, asset.id, user.id, createdAt, expiresAt).run();

  return jsonResponse({
    downloadUrl: `${getOrigin(request, env.APP_ORIGIN)}/api/download/${encodeURIComponent(token)}`,
    expiresAt,
  });
}

async function handleDownload(request: Request, env: Env, token: string): Promise<Response> {
  const tokenHash = await hashSecretToken(token, env.SESSION_SECRET);
  const row = await env.DB.prepare(
    `SELECT m.original_storage_key, m.original_filename, m.original_mime_type, m.original_size_bytes, d.expires_at
       FROM download_tokens d
       JOIN media_assets m ON m.id = d.media_asset_id
      WHERE d.token_hash = ?
      LIMIT 1`,
  ).bind(tokenHash).first<{
    original_storage_key: string;
    original_filename: string;
    original_mime_type: string;
    original_size_bytes: number;
    expires_at: string;
  }>();
  if (!row) return textResponse('download token not found', { status: 404 });
  if (Date.parse(row.expires_at) < Date.now()) return textResponse('download token expired', { status: 410 });

  const object = await env.MEDIA_BUCKET.get(row.original_storage_key);
  if (!object) return textResponse('original object not found', { status: 404 });

  const headers = new Headers();
  headers.set('content-type', row.original_mime_type);
  headers.set('content-length', String(row.original_size_bytes));
  headers.set('content-disposition', contentDispositionAttachment(row.original_filename));
  headers.set('cache-control', 'private, max-age=60');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

async function handleLineWebhook(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get('x-line-signature');
  const ok = await verifyLineSignature(env.LINE_MESSAGING_CHANNEL_SECRET, body, signature);
  if (!ok) return textResponse('invalid signature', { status: 401 });

  const payload = JSON.parse(body) as { events?: Array<{ type: string; replyToken?: string; message?: { type?: string } }> };
  const origin = getOrigin(request, env.APP_ORIGIN);
  const replyTasks = (payload.events || [])
    .filter((event) => event.replyToken)
    .map((event) => {
      const text = event.message?.type === 'image' || event.message?.type === 'video'
        ? `まるのこしは原本保存のため、LINEトーク送信ではなくこちらの画面から追加してください。\n${origin}/`
        : `まるのこしを開く:\n${origin}/`;
      return replyLineMessage(env, event.replyToken!, text);
    });
  if (ctx) ctx.waitUntil(Promise.allSettled(replyTasks));
  else await Promise.allSettled(replyTasks);
  return jsonResponse({ ok: true });
}

async function handleLineBotInfo(env: Env): Promise<Response> {
  const res = await fetch('https://api.line.me/v2/bot/info', {
    headers: { authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}` },
  });
  const data = await res.json() as { displayName?: string; basicId?: string; chatMode?: string; markAsReadMode?: string };
  if (!res.ok) return jsonResponse({ error: 'line_bot_info_failed' }, { status: res.status });
  return jsonResponse({
    displayName: data.displayName,
    basicId: data.basicId,
    chatMode: data.chatMode,
    markAsReadMode: data.markAsReadMode,
  });
}

async function verifyLineIdToken(idToken: string, clientId: string): Promise<LineVerifyResponse> {
  const form = new URLSearchParams({ id_token: idToken, client_id: clientId });
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const data = await res.json() as LineVerifyResponse & { error_description?: string };
  if (!res.ok || !data.sub) {
    throw new HttpError(401, 'line_id_token_invalid');
  }
  return data;
}

async function upsertLineUser(env: Env, profile: LineVerifyResponse): Promise<Omit<AuthedUser, 'families'>> {
  const now = nowIso();
  const existing = await env.DB.prepare(
    'SELECT id, display_name, picture_url FROM users WHERE line_user_id = ?',
  ).bind(profile.sub).first<{ id: string; display_name: string | null; picture_url: string | null }>();
  if (existing) {
    await env.DB.prepare(
      'UPDATE users SET display_name = ?, picture_url = ?, updated_at = ? WHERE id = ?',
    ).bind(profile.name ?? null, profile.picture ?? null, now, existing.id).run();
    return { id: existing.id, displayName: profile.name ?? existing.display_name, pictureUrl: profile.picture ?? existing.picture_url };
  }

  const id = randomId('usr');
  await env.DB.prepare(
    'INSERT INTO users (id, line_user_id, display_name, picture_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, profile.sub, profile.name ?? null, profile.picture ?? null, now, now).run();
  return { id, displayName: profile.name ?? null, pictureUrl: profile.picture ?? null };
}

async function ensureDefaultFamily(env: Env, userId: string): Promise<FamilySummary[]> {
  const existing = await listFamilies(env, userId);
  if (existing.length > 0) return existing;
  const now = nowIso();
  const familyId = randomId('fam');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO families (id, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(familyId, 'まるのこし', userId, now, now),
    env.DB.prepare('INSERT INTO family_members (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(familyId, userId, 'owner', now),
  ]);
  return listFamilies(env, userId);
}

async function listFamilies(env: Env, userId: string): Promise<FamilySummary[]> {
  const rows = await env.DB.prepare(
    `SELECT f.id, f.name, fm.role
       FROM family_members fm
       JOIN families f ON f.id = fm.family_id
      WHERE fm.user_id = ? AND fm.revoked_at IS NULL
      ORDER BY fm.joined_at ASC`,
  ).bind(userId).all<{ id: string; name: string; role: FamilySummary['role'] }>();
  return (rows.results || []).map((row) => ({ id: row.id, name: row.name, role: row.role }));
}

async function requireUser(request: Request, env: Env): Promise<AuthedUser> {
  const token = parseCookieHeader(request.headers.get('cookie'))[SESSION_COOKIE_NAME];
  if (!token) throw new HttpError(401, 'not_authenticated');
  const tokenHash = await hashSecretToken(token, env.SESSION_SECRET);
  const row = await env.DB.prepare(
    `SELECT u.id, u.display_name, u.picture_url, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1`,
  ).bind(tokenHash).first<{ id: string; display_name: string | null; picture_url: string | null; expires_at: string }>();
  if (!row) throw new HttpError(401, 'not_authenticated');
  if (Date.parse(row.expires_at) < Date.now()) throw new HttpError(401, 'session_expired');
  return {
    id: row.id,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    families: await listFamilies(env, row.id),
  };
}

async function requireFamilyRole(user: AuthedUser, familyId: string, allowed: FamilySummary['role'][]): Promise<void> {
  const family = user.families.find((item) => item.id === familyId);
  if (!family || !allowed.includes(family.role)) throw new HttpError(403, 'forbidden');
}

function publicUser(user: Pick<AuthedUser, 'id' | 'displayName' | 'pictureUrl'>): { id: string; displayName: string | null; pictureUrl: string | null } {
  return { id: user.id, displayName: user.displayName, pictureUrl: user.pictureUrl };
}

function mediaTypeFromMime(mimeType: string): 'image' | 'video' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'other';
}

async function hashSecretToken(token: string, secret: string): Promise<string> {
  return sha256Hex(`${secret}:${token}`);
}

async function replyLineMessage(env: Env, replyToken: string, text: string): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
