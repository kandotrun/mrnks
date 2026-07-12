import {
  SESSION_COOKIE_NAME,
  buildOriginalKey,
  clearSessionCookie,
  contentDispositionAttachment,
  createSessionCookie,
  findCompleteJpegLength,
  findRawJpegPreview,
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
  timingSafeEqual,
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
  NAS_STORAGE_ORIGIN?: string;
  NAS_STORAGE_SECRET?: string;
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
}

interface AuthedUser {
  id: string;
  displayName: string | null;
  pictureUrl: string | null;
  groupBindingId: string | null;
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

interface LineWebhookSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  webhookEventId?: string;
  source?: LineWebhookSource;
  message?: { type?: string };
  left?: { members?: Array<{ type?: string; userId?: string }> };
}

interface LineGroupSummary {
  groupId: string;
  groupName: string;
  pictureUrl?: string;
}

interface ActiveLineGroupBinding {
  id: string;
  line_group_id: string;
  family_id: string;
  default_role: 'uploader' | 'viewer';
  group_name: string;
  family_name: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const GROUP_SESSION_TTL_SECONDS = 60 * 60;
const DOWNLOAD_TTL_SECONDS = 60 * 10;
const LINE_PREVIEW_MAX_BYTES = 1_000_000;
const MEDIA_PAGE_SIZE = 60;
const MAX_MEDIA_OFFSET = 1_000_000;
const MESSAGE_PAGE_SIZE = 100;
const MESSAGE_MAX_CHARACTERS = 500;
const NAS_UPLOAD_CHUNK_BYTES = 32 * 1024 * 1024;
const NAS_UPLOAD_MAX_BYTES = 8 * 1024 * 1024 * 1024;
const NAS_UPLOAD_TTL_SECONDS = 60 * 60;
const BROWSER_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
]);

interface NasUploadSession {
  id: string;
  asset_id: string;
  family_id: string;
  uploader_user_id: string;
  original_filename: string;
  original_mime_type: string;
  original_size_bytes: number;
  original_storage_key: string;
  client_last_modified_at: string | null;
  status: 'uploading' | 'finalizing' | 'ready' | 'expired' | 'failed';
  expires_at: string;
}

interface NasCompletionReceipt {
  v: number;
  action: string;
  uploadId: string;
  assetId: string;
  familyId: string;
  key: string;
  sizeBytes: number;
  sha256: string;
  exp: number;
}

interface StoredMediaAsset {
  id: string;
  family_id: string;
  type: string;
  original_filename: string;
  original_mime_type: string;
  original_size_bytes: number;
  original_storage_key: string;
  original_storage_backend: 'r2' | 'nas';
  notification_preview_storage_key: string | null;
  notification_preview_mime_type: string | null;
  notification_preview_size_bytes: number | null;
  trashed_at: string | null;
}

type GalleryMessageTarget =
  | { targetType: 'media'; mediaId: string; day: null }
  | { targetType: 'day'; mediaId: null; day: string };

interface GalleryMessageRow {
  id: string;
  target_type: 'media' | 'day';
  media_asset_id: string | null;
  target_day: string | null;
  body: string;
  created_at: string;
  author_user_id: string;
  author_display_name: string | null;
  author_picture_url: string | null;
  total_count: number;
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
  scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): void {
    // Intentionally no-op. User-initiated deletion is an indefinite, restorable trash state.
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
  if (request.method === 'POST' && path === '/api/line-groups/bind') return handleBindLineGroup(request, env);

  const pendingLineGroupMatch = path.match(/^\/api\/line-groups\/pending\/([^/]+)$/);
  if (pendingLineGroupMatch && request.method === 'GET') {
    return handlePendingLineGroup(request, env, decodeURIComponent(pendingLineGroupMatch[1]));
  }

  const familyUploadMatch = path.match(/^\/api\/families\/([^/]+)\/uploads$/);
  if (familyUploadMatch && request.method === 'POST') {
    return handleCreateNasUpload(request, env, decodeURIComponent(familyUploadMatch[1]));
  }

  const uploadCompleteMatch = path.match(/^\/api\/uploads\/([^/]+)\/complete$/);
  if (uploadCompleteMatch && request.method === 'POST') {
    return handleCompleteNasUpload(request, env, decodeURIComponent(uploadCompleteMatch[1]), ctx);
  }

  const familyMediaMatch = path.match(/^\/api\/families\/([^/]+)\/media$/);
  if (familyMediaMatch && request.method === 'GET') return handleListMedia(request, env, decodeURIComponent(familyMediaMatch[1]));
  if (familyMediaMatch && request.method === 'PUT') return handleUploadMedia(request, env, decodeURIComponent(familyMediaMatch[1]), ctx);

  const familyMessagesMatch = path.match(/^\/api\/families\/([^/]+)\/messages$/);
  if (familyMessagesMatch && request.method === 'GET') {
    return handleListGalleryMessages(request, env, decodeURIComponent(familyMessagesMatch[1]));
  }
  if (familyMessagesMatch && request.method === 'POST') {
    return handleCreateGalleryMessage(request, env, decodeURIComponent(familyMessagesMatch[1]));
  }

  const familyTrashMatch = path.match(/^\/api\/families\/([^/]+)\/trash$/);
  if (familyTrashMatch && request.method === 'GET') return handleListTrash(request, env, decodeURIComponent(familyTrashMatch[1]));

  const mediaRestoreMatch = path.match(/^\/api\/media\/([^/]+)\/restore$/);
  if (mediaRestoreMatch && request.method === 'POST') {
    return handleRestoreMedia(request, env, decodeURIComponent(mediaRestoreMatch[1]));
  }

  const mediaAssetMatch = path.match(/^\/api\/media\/([^/]+)$/);
  if (mediaAssetMatch && request.method === 'DELETE') {
    return handleDeleteMedia(request, env, decodeURIComponent(mediaAssetMatch[1]));
  }

  const linePreviewMatch = path.match(/^\/api\/line-preview\/([^/]+)\/([a-f0-9]{64})$/);
  if (linePreviewMatch && request.method === 'GET') {
    return handleLineNotificationPreview(
      env,
      decodeURIComponent(linePreviewMatch[1]),
      linePreviewMatch[2],
    );
  }

  const mediaPreviewMatch = path.match(/^\/api\/media\/([^/]+)\/preview$/);
  if (mediaPreviewMatch && request.method === 'GET') {
    return handleMediaPreview(request, env, decodeURIComponent(mediaPreviewMatch[1]));
  }

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
  const body = await request.json().catch(() => null) as { idToken?: string; groupBindingId?: string } | null;
  if (!body?.idToken) return jsonResponse({ error: 'id_token_required' }, { status: 400 });

  const profile = await verifyLineIdToken(body.idToken, env.LINE_LOGIN_CHANNEL_ID);
  const user = await upsertLineUser(env, profile);
  let groupBinding: ActiveLineGroupBinding | null = null;
  let families: FamilySummary[];
  if (body.groupBindingId) {
    groupBinding = await loadActiveLineGroupBinding(env, body.groupBindingId);
    if (!groupBinding) throw new HttpError(404, 'line_group_binding_not_found');
    await verifyLineGroupMember(env, groupBinding.line_group_id, profile.sub);
    families = await listFamilies(env, user.id, groupBinding.id);
  } else {
    families = await ensureDefaultFamily(env, user.id);
  }

  const token = randomId('ses');
  const tokenHash = await hashSecretToken(token, env.SESSION_SECRET);
  const createdAt = nowIso();
  const ttlSeconds = groupBinding ? GROUP_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (
      id, user_id, token_hash, line_group_binding_id, group_membership_verified_at, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    randomId('session'),
    user.id,
    tokenHash,
    groupBinding?.id ?? null,
    groupBinding ? createdAt : null,
    createdAt,
    expiresAt,
  ).run();

  return jsonResponse(
    { user: publicUser(user), families, groupBindingId: groupBinding?.id ?? null },
    { headers: { 'set-cookie': createSessionCookie(token, ttlSeconds) } },
  );
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  return jsonResponse({
    user: publicUser(user),
    families: user.families,
    groupBindingId: user.groupBindingId,
  });
}

function handleLogout(): Response {
  return jsonResponse({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } });
}

async function handleCreateNasUpload(request: Request, env: Env, familyId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await requireFamilyRole(user, familyId, ['owner', 'admin', 'uploader']);
  if (!env.NAS_STORAGE_ORIGIN || !env.NAS_STORAGE_SECRET) {
    throw new HttpError(503, 'nas_storage_unavailable');
  }

  const body = await request.json().catch(() => null) as {
    filename?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
    clientLastModifiedAt?: unknown;
  } | null;
  const filename = typeof body?.filename === 'string' ? body.filename.normalize('NFC').trim() : '';
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : Number.NaN;
  if (!filename || filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename)) {
    throw new HttpError(400, 'invalid_file_name');
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new HttpError(400, 'invalid_file_size');
  if (sizeBytes > NAS_UPLOAD_MAX_BYTES) throw new HttpError(413, 'file_too_large');

  const suppliedMimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const mimeType = normalizeMediaMimeType(filename, suppliedMimeType);
  const clientLastModifiedAt = typeof body?.clientLastModifiedAt === 'string'
    && Number.isFinite(Date.parse(body.clientLastModifiedAt))
    ? new Date(body.clientLastModifiedAt).toISOString()
    : null;
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + NAS_UPLOAD_TTL_SECONDS * 1000).toISOString();
  const uploadId = randomId('upl');
  const assetId = randomId('ast');
  const extensionMatch = filename.match(/\.([a-z0-9]{1,10})$/i);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '';
  const storageKey = `originals/${familyId}/${assetId}/original${extension}`;
  const totalParts = Math.ceil(sizeBytes / NAS_UPLOAD_CHUNK_BYTES);

  await env.DB.prepare(
    `INSERT INTO media_upload_sessions (
      id, asset_id, family_id, uploader_user_id, original_filename, original_mime_type,
      original_size_bytes, original_storage_key, client_last_modified_at,
      status, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?)`,
  ).bind(
    uploadId,
    assetId,
    familyId,
    user.id,
    filename,
    mimeType,
    sizeBytes,
    storageKey,
    clientLastModifiedAt,
    createdAt,
    expiresAt,
  ).run();

  const uploadToken = await signNasToken({
    v: 1,
    action: 'upload',
    uploadId,
    assetId,
    familyId,
    key: storageKey,
    sizeBytes,
    chunkSizeBytes: NAS_UPLOAD_CHUNK_BYTES,
    totalParts,
    origin: getOrigin(request, env.APP_ORIGIN),
    exp: Math.floor(Date.parse(expiresAt) / 1000),
  }, env.NAS_STORAGE_SECRET);

  return jsonResponse({
    uploadId,
    assetId,
    gatewayOrigin: env.NAS_STORAGE_ORIGIN.replace(/\/$/, ''),
    chunkSizeBytes: NAS_UPLOAD_CHUNK_BYTES,
    totalParts,
    uploadToken,
    expiresAt,
  }, { status: 201 });
}

async function handleCompleteNasUpload(
  request: Request,
  env: Env,
  uploadId: string,
  ctx?: ExecutionContext,
): Promise<Response> {
  const user = await requireUser(request, env);
  if (!env.NAS_STORAGE_SECRET) throw new HttpError(503, 'nas_storage_unavailable');
  const session = await env.DB.prepare(
    `SELECT id, asset_id, family_id, uploader_user_id, original_filename, original_mime_type,
            original_size_bytes, original_storage_key, client_last_modified_at, status, expires_at
       FROM media_upload_sessions
      WHERE id = ?
      LIMIT 1`,
  ).bind(uploadId).first<NasUploadSession>();
  if (!session) throw new HttpError(404, 'upload_not_found');
  if (session.uploader_user_id !== user.id) throw new HttpError(403, 'forbidden');
  await requireFamilyRole(user, session.family_id, ['owner', 'admin', 'uploader']);
  if (Date.parse(session.expires_at) < Date.now()) throw new HttpError(410, 'upload_expired');
  if (session.status === 'ready') {
    return jsonResponse({ ok: true, asset: { id: session.asset_id, familyId: session.family_id } });
  }
  if (session.status !== 'uploading' && session.status !== 'finalizing') {
    throw new HttpError(409, 'upload_not_completable');
  }

  let receiptToken = '';
  let notificationPreviewBytes: Uint8Array | null = null;
  let notificationPreviewMimeType: 'image/jpeg' | 'image/png' | null = null;
  const contentType = request.headers.get('content-type') || '';
  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    const form = await request.formData();
    const receiptValue = form.get('receipt');
    if (typeof receiptValue === 'string') receiptToken = receiptValue;
    const preview = form.get('notificationPreview');
    if (preview instanceof File && preview.size > 0) {
      const previewMime = normalizeMediaMimeType(preview.name || 'preview.jpg', preview.type);
      const previewBytes = new Uint8Array(await preview.arrayBuffer());
      assertLineNotificationPreview(previewBytes, previewMime);
      notificationPreviewBytes = previewBytes;
      notificationPreviewMimeType = previewMime as 'image/jpeg' | 'image/png';
    }
  } else {
    const body = await request.json().catch(() => null) as { receipt?: unknown } | null;
    if (typeof body?.receipt === 'string') receiptToken = body.receipt;
  }
  if (!receiptToken) throw new HttpError(400, 'completion_receipt_required');
  const receipt = await verifyNasToken(receiptToken, env.NAS_STORAGE_SECRET) as unknown as NasCompletionReceipt;
  const receiptMatches = receipt.action === 'complete'
    && receipt.uploadId === session.id
    && receipt.assetId === session.asset_id
    && receipt.familyId === session.family_id
    && receipt.key === session.original_storage_key
    && receipt.sizeBytes === session.original_size_bytes
    && /^[a-f0-9]{64}$/.test(receipt.sha256);
  if (!receiptMatches) throw new HttpError(400, 'completion_receipt_mismatch');

  if (!notificationPreviewBytes && rawPreviewFormat(session.original_filename, session.original_mime_type)) {
    try {
      const extracted = await extractRawPreviewBytes(env, {
        id: session.asset_id,
        original_storage_key: session.original_storage_key,
        original_storage_backend: 'nas',
        original_size_bytes: session.original_size_bytes,
        original_mime_type: session.original_mime_type,
        original_filename: session.original_filename,
      });
      assertLineNotificationPreview(extracted.bytes, 'image/jpeg');
      notificationPreviewBytes = extracted.bytes;
      notificationPreviewMimeType = 'image/jpeg';
    } catch (error) {
      console.warn('nas raw preview extraction failed', error instanceof Error ? error.message : String(error));
    }
  }

  let notificationPreviewStorageKey: string | null = null;
  if (notificationPreviewBytes && notificationPreviewMimeType) {
    const extension = notificationPreviewMimeType === 'image/png' ? 'png' : 'jpg';
    notificationPreviewStorageKey = `previews/${session.family_id}/${session.asset_id}/line.${extension}`;
    await env.MEDIA_BUCKET.put(notificationPreviewStorageKey, notificationPreviewBytes, {
      httpMetadata: { contentType: notificationPreviewMimeType },
      customMetadata: { mediaAssetId: session.asset_id, purpose: 'line-notification' },
    });
  }

  const uploadedAt = nowIso();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO media_assets (
          id, family_id, uploader_user_id, type, original_filename, original_mime_type,
          original_size_bytes, original_sha256, original_storage_key, original_storage_backend,
          client_last_modified_at, notification_preview_storage_key, notification_preview_mime_type,
          notification_preview_size_bytes, uploaded_at, processing_status, visibility
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 'family')`,
      ).bind(
        session.asset_id,
        session.family_id,
        user.id,
        mediaTypeFromMime(session.original_mime_type),
        session.original_filename,
        session.original_mime_type,
        session.original_size_bytes,
        receipt.sha256,
        session.original_storage_key,
        'nas',
        session.client_last_modified_at,
        notificationPreviewStorageKey,
        notificationPreviewMimeType,
        notificationPreviewBytes?.byteLength ?? null,
        uploadedAt,
      ),
      env.DB.prepare(
        `UPDATE media_upload_sessions
            SET status = 'ready', completed_at = ?
          WHERE id = ? AND status IN ('uploading', 'finalizing')`,
      ).bind(uploadedAt, session.id),
    ]);
  } catch (error) {
    if (notificationPreviewStorageKey) await env.MEDIA_BUCKET.delete(notificationPreviewStorageKey).catch(() => undefined);
    throw error;
  }

  const notificationTask = notifyLineGroupsForAsset(env, {
    id: session.asset_id,
    familyId: session.family_id,
    originalFilename: session.original_filename,
    notificationPreviewStorageKey,
  }, user, getOrigin(request, env.APP_ORIGIN)).catch((error) => {
    console.error('line upload notification failed', error instanceof Error ? error.message : String(error));
  });
  if (ctx) ctx.waitUntil(notificationTask);
  else await notificationTask;

  return jsonResponse({
    ok: true,
    asset: {
      id: session.asset_id,
      familyId: session.family_id,
      originalFilename: session.original_filename,
      mimeType: session.original_mime_type,
      sizeBytes: session.original_size_bytes,
      sha256: receipt.sha256,
      uploadedAt,
      storageBackend: 'nas',
    },
  }, { status: 201 });
}

async function handleUploadMedia(
  request: Request,
  env: Env,
  familyId: string,
  ctx?: ExecutionContext,
): Promise<Response> {
  const user = await requireUser(request, env);
  await requireFamilyRole(user, familyId, ['owner', 'admin', 'uploader']);

  const contentType = request.headers.get('content-type') || '';
  let rawFilename: string;
  let mimeType: string;
  let bytes: Uint8Array;
  let notificationPreviewBytes: Uint8Array | null = null;
  let notificationPreviewMimeType: 'image/jpeg' | 'image/png' | null = null;

  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    const form = await request.formData();
    const original = form.get('original');
    if (!(original instanceof File)) throw new HttpError(400, 'original_file_required');
    rawFilename = original.name || decodeUploadFilename(request.headers.get('x-file-name'));
    mimeType = normalizeMediaMimeType(rawFilename, original.type);
    bytes = new Uint8Array(await original.arrayBuffer());

    const preview = form.get('notificationPreview');
    if (preview instanceof File && preview.size > 0) {
      const previewMime = normalizeMediaMimeType(preview.name || 'preview.jpg', preview.type);
      const previewBytes = new Uint8Array(await preview.arrayBuffer());
      assertLineNotificationPreview(previewBytes, previewMime);
      notificationPreviewBytes = previewBytes;
      notificationPreviewMimeType = previewMime as 'image/jpeg' | 'image/png';
    }
  } else {
    rawFilename = decodeUploadFilename(request.headers.get('x-file-name'));
    mimeType = normalizeMediaMimeType(rawFilename, contentType);
    bytes = new Uint8Array(await request.arrayBuffer());
  }

  const clientHash = (
    request.headers.get('x-client-sha256')
    || request.headers.get('x-content-sha256')
  )?.toLowerCase() || null;
  const clientLastModified = request.headers.get('x-client-last-modified') || null;
  const serverHash = await sha256Hex(bytes);
  if (clientHash && clientHash !== serverHash) {
    return jsonResponse({ error: 'sha256_mismatch', serverHash }, { status: 400 });
  }

  if (!notificationPreviewBytes) {
    const rawPreview = await extractLinePreviewFromRaw(bytes, rawFilename, mimeType);
    if (rawPreview) {
      notificationPreviewBytes = rawPreview;
      notificationPreviewMimeType = 'image/jpeg';
    } else if (
      bytes.byteLength <= LINE_PREVIEW_MAX_BYTES
      && (mimeType === 'image/jpeg' || mimeType === 'image/png')
    ) {
      assertLineNotificationPreview(bytes, mimeType);
      notificationPreviewBytes = bytes;
      notificationPreviewMimeType = mimeType;
    }
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

  let notificationPreviewStorageKey: string | null = null;
  if (notificationPreviewBytes && notificationPreviewMimeType) {
    const extension = notificationPreviewMimeType === 'image/png' ? 'png' : 'jpg';
    notificationPreviewStorageKey = `previews/${familyId}/${assetId}/line.${extension}`;
    await env.MEDIA_BUCKET.put(notificationPreviewStorageKey, notificationPreviewBytes, {
      httpMetadata: { contentType: notificationPreviewMimeType },
      customMetadata: { mediaAssetId: assetId, purpose: 'line-notification' },
    });
  }

  const uploadedAt = nowIso();
  const type = mediaTypeFromMime(mimeType);
  await env.DB.prepare(
    `INSERT INTO media_assets (
      id, family_id, uploader_user_id, type, original_filename, original_mime_type,
      original_size_bytes, original_sha256, original_storage_key, client_last_modified_at,
      notification_preview_storage_key, notification_preview_mime_type,
      notification_preview_size_bytes, uploaded_at, processing_status, visibility
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 'family')`,
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
    notificationPreviewStorageKey,
    notificationPreviewMimeType,
    notificationPreviewBytes?.byteLength ?? null,
    uploadedAt,
  ).run();

  const notificationTask = notifyLineGroupsForAsset(env, {
    id: assetId,
    familyId,
    originalFilename: rawFilename,
    notificationPreviewStorageKey,
  }, user, getOrigin(request, env.APP_ORIGIN)).catch((error) => {
    console.error('line upload notification failed', error instanceof Error ? error.message : String(error));
  });
  if (ctx) ctx.waitUntil(notificationTask);
  else await notificationTask;

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

function decodeUploadFilename(header: string | null): string {
  if (!header) return 'original-file';
  try {
    return decodeURIComponent(header);
  } catch {
    throw new HttpError(400, 'invalid_file_name');
  }
}

function assertLineNotificationPreview(bytes: Uint8Array, mimeType: string): void {
  if (bytes.byteLength === 0 || bytes.byteLength > LINE_PREVIEW_MAX_BYTES) {
    throw new HttpError(413, 'notification_preview_too_large');
  }
  const isJpeg = mimeType === 'image/jpeg'
    && bytes.byteLength >= 4
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[bytes.byteLength - 2] === 0xff
    && bytes[bytes.byteLength - 1] === 0xd9;
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = mimeType === 'image/png'
    && bytes.byteLength >= pngSignature.length
    && pngSignature.every((value, index) => bytes[index] === value);
  if (!isJpeg && !isPng) throw new HttpError(415, 'notification_preview_invalid');
}

type RawPreviewFormat = 'dng' | 'arw';

function rawPreviewFormat(filename: string, mimeType: string): RawPreviewFormat | null {
  const lowerFilename = filename.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();
  if (normalizedMime === 'image/x-adobe-dng' || normalizedMime === 'image/dng' || lowerFilename.endsWith('.dng')) {
    return 'dng';
  }
  if (
    normalizedMime === 'image/x-sony-arw'
    || normalizedMime === 'image/arw'
    || normalizedMime === 'image/x-sony-raw'
    || lowerFilename.endsWith('.arw')
  ) {
    return 'arw';
  }
  return null;
}

async function extractLinePreviewFromRaw(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<Uint8Array | null> {
  if (!rawPreviewFormat(filename, mimeType)) return null;
  const descriptor = await findRawJpegPreview(bytes);
  if (!descriptor || descriptor.length > LINE_PREVIEW_MAX_BYTES) return null;
  if (descriptor.offset < 0 || descriptor.offset + descriptor.length > bytes.byteLength) return null;
  const declaredPreview = bytes.slice(descriptor.offset, descriptor.offset + descriptor.length);
  const completeLength = findCompleteJpegLength(declaredPreview);
  if (!completeLength) return null;
  const preview = declaredPreview.slice(0, completeLength);
  try {
    assertLineNotificationPreview(preview, 'image/jpeg');
    return preview;
  } catch {
    return null;
  }
}

async function notifyLineGroupsForAsset(
  env: Env,
  asset: {
    id: string;
    familyId: string;
    originalFilename: string;
    notificationPreviewStorageKey: string | null;
  },
  uploader: Pick<AuthedUser, 'displayName'>,
  origin: string,
): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, line_group_id, group_name
       FROM line_group_bindings
      WHERE family_id = ? AND status = 'active' AND notifications_enabled = 1
      ORDER BY created_at ASC`,
  ).bind(asset.familyId).all<{ id: string; line_group_id: string; group_name: string }>();

  await Promise.all((rows.results || []).map(async (binding) => {
    const deliveryId = randomId('lnd');
    const retryKey = crypto.randomUUID();
    const createdAt = nowIso();
    const claim = await env.DB.prepare(
      `INSERT OR IGNORE INTO line_notification_deliveries (
        id, media_asset_id, line_group_binding_id, status, retry_key, created_at
      ) VALUES (?, ?, ?, 'pending', ?, ?)`,
    ).bind(deliveryId, asset.id, binding.id, retryKey, createdAt).run();
    if ((claim.meta.changes ?? 0) !== 1) return;

    const groupUrl = buildLiffUrl(env, origin, { groupBinding: binding.id });
    const messages: Array<Record<string, unknown>> = [];
    if (asset.notificationPreviewStorageKey) {
      const previewToken = await hashSecretToken(`line-preview:${asset.id}`, env.SESSION_SECRET);
      const previewUrl = `${origin.replace(/\/$/, '')}/api/line-preview/${encodeURIComponent(asset.id)}/${previewToken}`;
      messages.push({
        type: 'image',
        originalContentUrl: previewUrl,
        previewImageUrl: previewUrl,
      });
    }
    const uploaderName = uploader.displayName?.trim() || 'メンバー';
    messages.push({
      type: 'text',
      text: `${uploaderName}さんが「${asset.originalFilename}」を追加しました。\nアルバムを見る: ${groupUrl}`,
    });

    try {
      await pushLineMessages(env, binding.line_group_id, messages, retryKey);
      await env.DB.prepare(
        `UPDATE line_notification_deliveries
            SET status = 'sent', sent_at = ?, error_message = NULL
          WHERE id = ?`,
      ).bind(nowIso(), deliveryId).run();
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      await env.DB.prepare(
        `UPDATE line_notification_deliveries
            SET status = 'failed', error_message = ?
          WHERE id = ?`,
      ).bind(message, deliveryId).run();
      throw error;
    }
  }));
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
      WHERE family_id = ? AND trashed_at IS NULL
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

function parseGalleryMessageTarget(input: {
  targetType?: unknown;
  mediaId?: unknown;
  day?: unknown;
}): GalleryMessageTarget {
  const targetType = input.targetType;
  const mediaId = typeof input.mediaId === 'string' ? input.mediaId.trim() : '';
  const day = typeof input.day === 'string' ? input.day.trim() : '';
  if (targetType === 'media' && mediaId && !day) {
    return { targetType, mediaId, day: null };
  }
  if (targetType === 'day' && day && !mediaId) {
    const parsed = new Date(`${day}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)
      || Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== day) {
      throw new HttpError(400, 'invalid_message_day');
    }
    return { targetType, mediaId: null, day };
  }
  throw new HttpError(400, 'invalid_message_target');
}

async function requireGalleryMessageTarget(
  env: Env,
  familyId: string,
  target: GalleryMessageTarget,
): Promise<void> {
  if (target.targetType !== 'media') return;
  const asset = await env.DB.prepare(
    `SELECT id
       FROM media_assets
      WHERE id = ? AND family_id = ? AND trashed_at IS NULL
      LIMIT 1`,
  ).bind(target.mediaId, familyId).first<{ id: string }>();
  if (!asset) throw new HttpError(404, 'asset_not_found');
}

function publicGalleryMessage(row: GalleryMessageRow, currentUserId: string): Record<string, unknown> {
  return {
    id: row.id,
    targetType: row.target_type,
    mediaId: row.media_asset_id,
    day: row.target_day,
    body: row.body,
    createdAt: row.created_at,
    author: {
      id: row.author_user_id,
      displayName: row.author_display_name,
      pictureUrl: row.author_picture_url,
    },
    isMine: row.author_user_id === currentUserId,
  };
}

async function handleListGalleryMessages(request: Request, env: Env, familyId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await requireFamilyRole(user, familyId, ['owner', 'admin', 'uploader', 'viewer']);
  const search = new URL(request.url).searchParams;
  const target = parseGalleryMessageTarget({
    targetType: search.get('targetType'),
    mediaId: search.get('mediaId'),
    day: search.get('day'),
  });
  await requireGalleryMessageTarget(env, familyId, target);
  const requestedOffset = Number.parseInt(search.get('offset') || '0', 10);
  const offset = Number.isFinite(requestedOffset)
    ? Math.min(Math.max(requestedOffset, 0), MAX_MEDIA_OFFSET)
    : 0;

  const query = target.targetType === 'media'
    ? env.DB.prepare(
      `SELECT gm.id, gm.target_type, gm.media_asset_id, gm.target_day, gm.body, gm.created_at,
              gm.author_user_id, u.display_name AS author_display_name,
              u.picture_url AS author_picture_url, COUNT(*) OVER () AS total_count
         FROM gallery_messages gm
         JOIN users u ON u.id = gm.author_user_id
        WHERE gm.family_id = ? AND gm.target_type = 'media' AND gm.media_asset_id = ?
        ORDER BY gm.created_at DESC, gm.id DESC
        LIMIT ? OFFSET ?`,
        ).bind(familyId, target.mediaId, MESSAGE_PAGE_SIZE + 1, offset)
    : env.DB.prepare(
      `SELECT gm.id, gm.target_type, gm.media_asset_id, gm.target_day, gm.body, gm.created_at,
              gm.author_user_id, u.display_name AS author_display_name,
              u.picture_url AS author_picture_url, COUNT(*) OVER () AS total_count
         FROM gallery_messages gm
         JOIN users u ON u.id = gm.author_user_id
        WHERE gm.family_id = ? AND gm.target_type = 'day' AND gm.target_day = ?
        ORDER BY gm.created_at DESC, gm.id DESC
        LIMIT ? OFFSET ?`,
        ).bind(familyId, target.day, MESSAGE_PAGE_SIZE + 1, offset);
  const rows = await query.all<GalleryMessageRow>();
  const resultRows = rows.results || [];
  const pageRows = resultRows.slice(0, MESSAGE_PAGE_SIZE);
  return jsonResponse({
    messages: pageRows.slice().reverse().map((row) => publicGalleryMessage(row, user.id)),
    totalCount: resultRows[0]?.total_count ?? 0,
    limit: MESSAGE_PAGE_SIZE,
    hasMore: resultRows.length > MESSAGE_PAGE_SIZE,
    nextOffset: offset + pageRows.length,
  });
}

async function handleCreateGalleryMessage(request: Request, env: Env, familyId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await requireFamilyRole(user, familyId, ['owner', 'admin', 'uploader', 'viewer']);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'json_required');
  }
  const input = await request.json().catch(() => null) as {
    targetType?: unknown;
    mediaId?: unknown;
    day?: unknown;
    body?: unknown;
  } | null;
  if (!input) throw new HttpError(400, 'invalid_json');
  const target = parseGalleryMessageTarget(input);
  const body = typeof input.body === 'string' ? input.body.normalize('NFC').trim() : '';
  if (!body) throw new HttpError(400, 'message_required');
  if (Array.from(body).length > MESSAGE_MAX_CHARACTERS) throw new HttpError(400, 'message_too_long');
  await requireGalleryMessageTarget(env, familyId, target);

  const id = randomId('msg');
  const createdAt = nowIso();
  await env.DB.prepare(
    `INSERT INTO gallery_messages (
      id, family_id, author_user_id, target_type, media_asset_id, target_day, body, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    familyId,
    user.id,
    target.targetType,
    target.mediaId,
    target.day,
    body,
    createdAt,
  ).run();

  return jsonResponse({
    message: {
      id,
      targetType: target.targetType,
      mediaId: target.mediaId,
      day: target.day,
      body,
      createdAt,
      author: publicUser(user),
      isMine: true,
    },
  }, { status: 201 });
}

async function handleListTrash(request: Request, env: Env, familyId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await requireFamilyRole(user, familyId, ['owner', 'admin', 'uploader']);
  const requestedOffset = Number.parseInt(new URL(request.url).searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(requestedOffset)
    ? Math.min(Math.max(requestedOffset, 0), MAX_MEDIA_OFFSET)
    : 0;
  const rows = await env.DB.prepare(
    `SELECT id, type, original_filename, original_mime_type, original_size_bytes, original_sha256,
            captured_at, client_last_modified_at, uploaded_at, processing_status, trashed_at,
            COUNT(*) OVER () AS total_count
       FROM media_assets
      WHERE family_id = ? AND trashed_at IS NOT NULL
      ORDER BY trashed_at DESC, id DESC
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
    trashed_at: string;
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
      trashedAt: row.trashed_at,
      previewUrl: `/api/media/${encodeURIComponent(row.id)}/preview?trash=1`,
    })),
    totalCount: resultRows[0]?.total_count ?? 0,
    hasMore: resultRows.length > MEDIA_PAGE_SIZE,
    nextOffset: offset + pageRows.length,
  });
}

async function loadAuthorizedMediaAsset(
  request: Request,
  env: Env,
  assetId: string,
  options: { allowTrashed?: boolean } = {},
): Promise<StoredMediaAsset> {
  const user = await requireUser(request, env);
  const asset = await env.DB.prepare(
    `SELECT id, family_id, type, original_filename, original_mime_type, original_size_bytes,
            original_storage_key, original_storage_backend,
            notification_preview_storage_key, notification_preview_mime_type, notification_preview_size_bytes,
            trashed_at
       FROM media_assets
      WHERE id = ?
      LIMIT 1`,
  ).bind(assetId).first<StoredMediaAsset>();
  if (!asset) throw new HttpError(404, 'asset_not_found');
  if (asset.trashed_at) {
    if (!options.allowTrashed) throw new HttpError(404, 'asset_not_found');
    await requireFamilyRole(user, asset.family_id, ['owner', 'admin', 'uploader']);
  } else {
    await requireFamilyRole(user, asset.family_id, ['owner', 'admin', 'uploader', 'viewer']);
  }
  return asset;
}

async function handleDeleteMedia(request: Request, env: Env, assetId: string): Promise<Response> {
  const user = await requireUser(request, env);
  const asset = await env.DB.prepare(
    `SELECT id, family_id, trashed_at
       FROM media_assets
      WHERE id = ?
      LIMIT 1`,
  ).bind(assetId).first<{ id: string; family_id: string; trashed_at: string | null }>();
  if (!asset) throw new HttpError(404, 'asset_not_found');
  await requireFamilyRole(user, asset.family_id, ['owner', 'admin', 'uploader']);

  const trashedAt = asset.trashed_at || nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE media_assets
          SET trashed_at = ?, trashed_by_user_id = ?
        WHERE id = ? AND trashed_at IS NULL`,
    ).bind(trashedAt, user.id, asset.id),
    env.DB.prepare('DELETE FROM line_notification_deliveries WHERE media_asset_id = ?').bind(asset.id),
    env.DB.prepare('DELETE FROM download_tokens WHERE media_asset_id = ?').bind(asset.id),
  ]);

  return jsonResponse({ ok: true, assetId: asset.id, trashed: true, trashedAt });
}

async function handleRestoreMedia(request: Request, env: Env, assetId: string): Promise<Response> {
  const user = await requireUser(request, env);
  const asset = await env.DB.prepare(
    `SELECT id, family_id, trashed_at
       FROM media_assets
      WHERE id = ?
      LIMIT 1`,
  ).bind(assetId).first<{ id: string; family_id: string; trashed_at: string | null }>();
  if (!asset) throw new HttpError(404, 'asset_not_found');
  await requireFamilyRole(user, asset.family_id, ['owner', 'admin', 'uploader']);
  if (asset.trashed_at) {
    await env.DB.prepare(
      `UPDATE media_assets
          SET trashed_at = NULL, trashed_by_user_id = NULL
        WHERE id = ? AND trashed_at IS NOT NULL`,
    ).bind(asset.id).run();
  }
  return jsonResponse({ ok: true, assetId: asset.id, restored: true });
}

async function handleLineNotificationPreview(env: Env, assetId: string, token: string): Promise<Response> {
  const expected = await hashSecretToken(`line-preview:${assetId}`, env.SESSION_SECRET);
  if (!timingSafeEqual(expected, token)) throw new HttpError(404, 'preview_not_found');

  const asset = await env.DB.prepare(
    `SELECT notification_preview_storage_key, notification_preview_mime_type,
            notification_preview_size_bytes
       FROM media_assets
      WHERE id = ? AND trashed_at IS NULL
      LIMIT 1`,
  ).bind(assetId).first<{
    notification_preview_storage_key: string | null;
    notification_preview_mime_type: string | null;
    notification_preview_size_bytes: number | null;
  }>();
  if (!asset?.notification_preview_storage_key) throw new HttpError(404, 'preview_not_found');
  if (asset.notification_preview_mime_type !== 'image/jpeg' && asset.notification_preview_mime_type !== 'image/png') {
    throw new HttpError(404, 'preview_not_found');
  }

  const object = await env.MEDIA_BUCKET.get(asset.notification_preview_storage_key);
  if (!object) throw new HttpError(404, 'preview_not_found');
  return new Response(object.body, {
    headers: {
      'content-type': asset.notification_preview_mime_type,
      'content-length': String(asset.notification_preview_size_bytes ?? object.size),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}

type OriginalAsset = Pick<StoredMediaAsset,
  'id' | 'original_storage_key' | 'original_storage_backend' | 'original_size_bytes' | 'original_mime_type' | 'original_filename'
>;

interface OriginalBodyResult {
  body: ReadableStream | null;
}

async function fetchNasOriginal(
  env: Env,
  asset: Pick<OriginalAsset, 'id' | 'original_storage_key' | 'original_size_bytes' | 'original_mime_type' | 'original_filename'>,
  range?: { offset: number; length: number },
): Promise<Response> {
  if (!env.NAS_STORAGE_ORIGIN || !env.NAS_STORAGE_SECRET) throw new HttpError(503, 'nas_storage_unavailable');
  const token = await signNasToken({
    v: 1,
    action: 'read',
    assetId: asset.id,
    key: asset.original_storage_key,
    sizeBytes: asset.original_size_bytes,
    mimeType: asset.original_mime_type,
    filename: asset.original_filename,
    exp: Math.floor(Date.now() / 1000) + 5 * 60,
  }, env.NAS_STORAGE_SECRET);
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (range) headers.set('range', `bytes=${range.offset}-${range.offset + range.length - 1}`);
  let response: Response;
  try {
    response = await fetch(`${env.NAS_STORAGE_ORIGIN.replace(/\/$/, '')}/v1/objects/${encodeURIComponent(asset.id)}`, {
      method: 'GET',
      headers,
    });
  } catch {
    throw new HttpError(503, 'nas_storage_unavailable');
  }
  if (response.status === 404) throw new HttpError(404, 'original_object_not_found');
  if (!response.ok) throw new HttpError(503, 'nas_storage_unavailable');
  return response;
}

async function getOriginalBody(
  env: Env,
  asset: OriginalAsset,
  range?: { offset: number; length: number },
): Promise<OriginalBodyResult> {
  if (asset.original_storage_backend === 'nas') {
    const response = await fetchNasOriginal(env, asset, range);
    return { body: response.body };
  }
  const object = range
    ? await env.MEDIA_BUCKET.get(asset.original_storage_key, { range })
    : await env.MEDIA_BUCKET.get(asset.original_storage_key);
  if (!object) throw new HttpError(404, 'original_object_not_found');
  return { body: object.body };
}

async function readOriginalBytes(
  env: Env,
  asset: OriginalAsset,
  offset: number,
  length: number,
): Promise<Uint8Array | null> {
  if (asset.original_storage_backend === 'nas') {
    const response = await fetchNasOriginal(env, asset, { offset, length });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength === length ? bytes : null;
  }
  const object = await env.MEDIA_BUCKET.get(asset.original_storage_key, { range: { offset, length } });
  if (!object) return null;
  const bytes = await object.bytes();
  return bytes.byteLength === length ? bytes : null;
}

async function extractRawPreviewBytes(env: Env, asset: OriginalAsset): Promise<{ bytes: Uint8Array; format: RawPreviewFormat }> {
  const format = rawPreviewFormat(asset.original_filename, asset.original_mime_type);
  if (!format) throw new HttpError(415, 'raw_preview_unavailable');
  const descriptor = await findRawJpegPreview({
    size: asset.original_size_bytes,
    async read(offset: number, length: number): Promise<Uint8Array | null> {
      return readOriginalBytes(env, asset, offset, length);
    },
  });
  if (!descriptor || descriptor.offset + descriptor.length > asset.original_size_bytes) {
    throw new HttpError(415, 'raw_preview_unavailable');
  }
  const previewBytes = await readOriginalBytes(env, asset, descriptor.offset, descriptor.length);
  if (!previewBytes) throw new HttpError(404, 'original_object_not_found');
  const completeLength = findCompleteJpegLength(previewBytes);
  if (previewBytes.byteLength !== descriptor.length || !completeLength) {
    throw new HttpError(415, 'raw_preview_invalid');
  }
  const bytes = new Uint8Array(completeLength);
  bytes.set(previewBytes.subarray(0, completeLength));
  return { bytes, format };
}

async function handleMediaPreview(request: Request, env: Env, assetId: string): Promise<Response> {
  const allowTrashed = new URL(request.url).searchParams.get('trash') === '1';
  const asset = await loadAuthorizedMediaAsset(request, env, assetId, { allowTrashed });

  if (asset.notification_preview_storage_key) {
    const storedPreview = await env.MEDIA_BUCKET.get(asset.notification_preview_storage_key);
    if (storedPreview) {
      const headers = new Headers();
      headers.set('content-type', asset.notification_preview_mime_type || 'image/jpeg');
      headers.set('content-length', String(asset.notification_preview_size_bytes || storedPreview.size));
      headers.set('cache-control', 'private, max-age=86400');
      headers.set('vary', 'Cookie');
      headers.set('x-content-type-options', 'nosniff');
      headers.set('x-mrnks-preview-source', 'r2-preview');
      return new Response(storedPreview.body, { headers });
    }
  }

  const rawFormat = rawPreviewFormat(asset.original_filename, asset.original_mime_type);

  if (rawFormat) {
    const extracted = await extractRawPreviewBytes(env, asset);
    if (asset.original_storage_backend === 'nas') {
      const previewKey = `previews/${asset.family_id}/${asset.id}/gallery.jpg`;
      await env.MEDIA_BUCKET.put(previewKey, extracted.bytes, {
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { mediaAssetId: asset.id, purpose: 'gallery-preview' },
      }).catch(() => undefined);
      await env.DB.prepare(
        `UPDATE media_assets
            SET notification_preview_storage_key = ?, notification_preview_mime_type = 'image/jpeg',
                notification_preview_size_bytes = ?
          WHERE id = ? AND notification_preview_storage_key IS NULL`,
      ).bind(previewKey, extracted.bytes.byteLength, asset.id).run().catch(() => undefined);
    }
    const responseBody = extracted.bytes.buffer.slice(
      extracted.bytes.byteOffset,
      extracted.bytes.byteOffset + extracted.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(responseBody, {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(extracted.bytes.byteLength),
        'cache-control': 'private, max-age=86400',
        'vary': 'Cookie',
        'x-content-type-options': 'nosniff',
        'x-mrnks-preview-source': `embedded-${extracted.format}`,
      },
    });
  }

  if (!BROWSER_IMAGE_MIME_TYPES.has(asset.original_mime_type)) {
    throw new HttpError(415, 'preview_unavailable');
  }
  const object = await getOriginalBody(env, asset);
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
    ? await getOriginalBody(env, asset, { offset: requestedRange.offset, length: requestedRange.length })
    : await getOriginalBody(env, asset);

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
    `SELECT id, family_id, original_filename
       FROM media_assets
      WHERE id = ? AND trashed_at IS NULL`,
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
    `SELECT m.id, m.type, m.original_storage_key, m.original_storage_backend,
            m.original_filename, m.original_mime_type, m.original_size_bytes, d.expires_at
       FROM download_tokens d
       JOIN media_assets m ON m.id = d.media_asset_id
      WHERE d.token_hash = ? AND m.trashed_at IS NULL
      LIMIT 1`,
  ).bind(tokenHash).first<{
    id: string;
    type: 'image' | 'video' | 'other';
    original_storage_key: string;
    original_storage_backend: 'r2' | 'nas';
    original_filename: string;
    original_mime_type: string;
    original_size_bytes: number;
    expires_at: string;
  }>();
  if (!row) return textResponse('download token not found', { status: 404 });
  if (Date.parse(row.expires_at) < Date.now()) return textResponse('download token expired', { status: 410 });

  const object = await getOriginalBody(env, row);

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

  const payload = JSON.parse(body) as { events?: LineWebhookEvent[] };
  const origin = getOrigin(request, env.APP_ORIGIN);
  const eventTasks = (payload.events || []).map((event) => processLineWebhookEvent(env, event, origin));
  const completion = Promise.allSettled(eventTasks);
  if (ctx) ctx.waitUntil(completion);
  else await completion;
  return jsonResponse({ ok: true });
}

async function processLineWebhookEvent(env: Env, event: LineWebhookEvent, origin: string): Promise<void> {
  if (event.type === 'join' && event.source?.type === 'group' && event.source.groupId && event.replyToken) {
    await handleLineGroupJoin(env, event.source.groupId, event.replyToken, origin);
    return;
  }

  if (event.type === 'leave' && event.source?.type === 'group' && event.source.groupId) {
    await env.DB.prepare(
      `UPDATE line_group_bindings
          SET status = 'left', left_at = ?, updated_at = ?
        WHERE line_group_id = ?`,
    ).bind(nowIso(), nowIso(), event.source.groupId).run();
    return;
  }

  if (!event.replyToken) return;
  let appUrl = `${origin}/`;
  if (event.source?.type === 'group' && event.source.groupId) {
    const binding = await env.DB.prepare(
      `SELECT id
         FROM line_group_bindings
        WHERE line_group_id = ? AND status = 'active'
        LIMIT 1`,
    ).bind(event.source.groupId).first<{ id: string }>();
    if (binding) appUrl = buildLiffUrl(env, origin, { groupBinding: binding.id });
  }
  const text = event.message?.type === 'image' || event.message?.type === 'video'
    ? `まるのこしは原本保存のため、LINEトーク送信ではなくこちらの画面から追加してください。\n${appUrl}`
    : `まるのこしを開く:\n${appUrl}`;
  await replyLineMessages(env, event.replyToken, [{ type: 'text', text }]);
}

async function handleLineGroupJoin(env: Env, groupId: string, replyToken: string, origin: string): Promise<void> {
  const existing = await env.DB.prepare(
    `SELECT id, status
       FROM line_group_bindings
      WHERE line_group_id = ?
      LIMIT 1`,
  ).bind(groupId).first<{ id: string; status: string }>();

  if (existing?.status === 'active') {
    const groupUrl = buildLiffUrl(env, origin, { groupBinding: existing.id });
    await replyLineMessages(env, replyToken, [{
      type: 'text',
      text: `このグループはすでに「まるのこし」と連携済みです。\n${groupUrl}`,
    }]);
    return;
  }

  const summary = await getLineGroupSummary(env, groupId);
  const token = randomId('bind');
  const tokenHash = await hashSecretToken(token, env.SESSION_SECRET);
  const timestamp = nowIso();
  await env.DB.prepare(
    `INSERT INTO line_group_bindings (
      id, line_group_id, group_name, group_picture_url, default_role,
      notifications_enabled, status, bind_token_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'viewer', 1, 'pending', ?, ?, ?)
    ON CONFLICT(line_group_id) DO UPDATE SET
      group_name = excluded.group_name,
      group_picture_url = excluded.group_picture_url,
      status = 'pending',
      bind_token_hash = excluded.bind_token_hash,
      left_at = NULL,
      updated_at = excluded.updated_at`,
  ).bind(
    existing?.id || randomId('lgb'),
    groupId,
    summary.groupName,
    summary.pictureUrl ?? null,
    tokenHash,
    timestamp,
    timestamp,
  ).run();

  const setupUrl = buildLiffUrl(env, origin, { groupBind: token });
  await replyLineMessages(env, replyToken, [{
    type: 'text',
    text: `「${summary.groupName}」を招待してくれてありがとうございます。\n家族アルバムと権限を設定してください。\n${setupUrl}`,
  }]);
}

async function getLineGroupSummary(env: Env, groupId: string): Promise<LineGroupSummary> {
  const res = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
    headers: { authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}` },
  });
  const data = await res.json().catch(() => null) as LineGroupSummary | null;
  if (!res.ok || !data?.groupName) throw new Error(`line_group_summary_failed:${res.status}`);
  return data;
}

async function loadActiveLineGroupBinding(env: Env, bindingId: string): Promise<ActiveLineGroupBinding | null> {
  return env.DB.prepare(
    `SELECT lgb.id, lgb.line_group_id, lgb.family_id, lgb.default_role,
            lgb.group_name, f.name AS family_name
       FROM line_group_bindings lgb
       JOIN families f ON f.id = lgb.family_id
      WHERE lgb.id = ? AND lgb.status = 'active'
      LIMIT 1`,
  ).bind(bindingId).first<ActiveLineGroupBinding>();
}

async function verifyLineGroupMember(env: Env, groupId: string, lineUserId: string): Promise<void> {
  const res = await fetch(
    `https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(lineUserId)}`,
    { headers: { authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}` } },
  );
  if (res.status === 404) throw new HttpError(403, 'line_group_membership_required');
  if (!res.ok) throw new HttpError(502, 'line_group_membership_check_failed');
}

function buildLiffUrl(env: Env, origin: string, params: Record<string, string>): string {
  const base = env.LINE_LIFF_ID
    ? `https://liff.line.me/${encodeURIComponent(env.LINE_LIFF_ID)}`
    : `${origin.replace(/\/$/, '')}/`;
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function handlePendingLineGroup(request: Request, env: Env, token: string): Promise<Response> {
  const user = await requireUser(request, env);
  const tokenHash = await hashSecretToken(token, env.SESSION_SECRET);
  const binding = await env.DB.prepare(
    `SELECT id, group_name, group_picture_url
       FROM line_group_bindings
      WHERE bind_token_hash = ? AND status = 'pending'
      LIMIT 1`,
  ).bind(tokenHash).first<{ id: string; group_name: string; group_picture_url: string | null }>();
  if (!binding) throw new HttpError(404, 'group_binding_not_found');

  const availableFamilies = user.families.filter((family) => family.role === 'owner' || family.role === 'admin');
  if (availableFamilies.length === 0) throw new HttpError(403, 'family_admin_required');
  return jsonResponse({
    group: { id: binding.id, name: binding.group_name, pictureUrl: binding.group_picture_url },
    families: availableFamilies,
  });
}

async function handleBindLineGroup(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as {
    token?: string;
    familyId?: string;
    role?: string;
    notificationsEnabled?: boolean;
  } | null;
  if (!body?.token || !body.familyId) throw new HttpError(400, 'group_binding_fields_required');
  if (body.role !== 'viewer' && body.role !== 'uploader') throw new HttpError(400, 'invalid_group_role');

  const user = await requireUser(request, env);
  const family = user.families.find((item) => item.id === body.familyId);
  if (!family || (family.role !== 'owner' && family.role !== 'admin')) {
    throw new HttpError(403, 'family_admin_required');
  }

  const tokenHash = await hashSecretToken(body.token, env.SESSION_SECRET);
  const binding = await env.DB.prepare(
    `SELECT id, line_group_id, group_name, group_picture_url, status
       FROM line_group_bindings
      WHERE bind_token_hash = ? AND status = 'pending'
      LIMIT 1`,
  ).bind(tokenHash).first<{
    id: string;
    line_group_id: string;
    group_name: string;
    group_picture_url: string | null;
    status: string;
  }>();
  if (!binding) throw new HttpError(404, 'group_binding_not_found');

  const lineIdentity = await env.DB.prepare(
    'SELECT line_user_id FROM users WHERE id = ? LIMIT 1',
  ).bind(user.id).first<{ line_user_id: string }>();
  if (!lineIdentity?.line_user_id) throw new HttpError(403, 'line_group_membership_required');
  await verifyLineGroupMember(env, binding.line_group_id, lineIdentity.line_user_id);

  const updatedAt = nowIso();
  const update = await env.DB.prepare(
    `UPDATE line_group_bindings
        SET family_id = ?, default_role = ?, notifications_enabled = ?,
            status = 'active', bind_token_hash = NULL, bound_by_user_id = ?,
            left_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'pending'`,
  ).bind(
    body.familyId,
    body.role,
    body.notificationsEnabled === false ? 0 : 1,
    user.id,
    updatedAt,
    binding.id,
  ).run();
  if ((update.meta.changes ?? 0) !== 1) throw new HttpError(409, 'group_binding_already_used');

  const origin = getOrigin(request, env.APP_ORIGIN);
  const groupUrl = buildLiffUrl(env, origin, { groupBinding: binding.id });
  let confirmationSent = true;
  try {
    await pushLineMessages(env, binding.line_group_id, [{
      type: 'text',
      text: `「${binding.group_name}」を家族アルバムに連携しました。\n権限: ${body.role === 'uploader' ? '閲覧・編集' : '閲覧のみ'}\n${groupUrl}`,
    }]);
  } catch (error) {
    confirmationSent = false;
    console.error('line group confirmation failed', error instanceof Error ? error.message : String(error));
  }

  return jsonResponse({
    ok: true,
    group: { id: binding.id, name: binding.group_name, role: body.role },
    groupUrl,
    confirmationSent,
  });
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

async function upsertLineUser(env: Env, profile: LineVerifyResponse): Promise<Omit<AuthedUser, 'families' | 'groupBindingId'>> {
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

async function listFamilies(env: Env, userId: string, groupBindingId?: string | null): Promise<FamilySummary[]> {
  const rows = await env.DB.prepare(
    `SELECT f.id, f.name, fm.role
       FROM family_members fm
       JOIN families f ON f.id = fm.family_id
      WHERE fm.user_id = ? AND fm.revoked_at IS NULL
      ORDER BY fm.joined_at ASC`,
  ).bind(userId).all<{ id: string; name: string; role: FamilySummary['role'] }>();
  const direct = (rows.results || []).map((row) => ({ id: row.id, name: row.name, role: row.role }));
  if (!groupBindingId) return direct;

  const binding = await loadActiveLineGroupBinding(env, groupBindingId);
  if (!binding) return direct;
  const directMatch = direct.find((family) => family.id === binding.family_id);
  const groupFamily: FamilySummary = {
    id: binding.family_id,
    name: binding.family_name,
    role: directMatch && roleRank(directMatch.role) > roleRank(binding.default_role)
      ? directMatch.role
      : binding.default_role,
  };
  return [groupFamily, ...direct.filter((family) => family.id !== binding.family_id)];
}

async function requireUser(request: Request, env: Env): Promise<AuthedUser> {
  const token = parseCookieHeader(request.headers.get('cookie'))[SESSION_COOKIE_NAME];
  if (!token) throw new HttpError(401, 'not_authenticated');
  const tokenHash = await hashSecretToken(token, env.SESSION_SECRET);
  const row = await env.DB.prepare(
    `SELECT u.id, u.display_name, u.picture_url, s.expires_at, s.line_group_binding_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1`,
  ).bind(tokenHash).first<{
    id: string;
    display_name: string | null;
    picture_url: string | null;
    expires_at: string;
    line_group_binding_id: string | null;
  }>();
  if (!row) throw new HttpError(401, 'not_authenticated');
  if (Date.parse(row.expires_at) < Date.now()) throw new HttpError(401, 'session_expired');
  return {
    id: row.id,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    groupBindingId: row.line_group_binding_id,
    families: await listFamilies(env, row.id, row.line_group_binding_id),
  };
}

function roleRank(role: FamilySummary['role']): number {
  return { viewer: 0, uploader: 1, admin: 2, owner: 3 }[role];
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

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new HttpError(401, 'invalid_nas_token');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function nasTokenSignature(encodedPayload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload)));
  return base64UrlEncode(signature);
}

async function signNasToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encodedPayload}.${await nasTokenSignature(encodedPayload, secret)}`;
}

async function verifyNasToken(token: string, secret: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 2) throw new HttpError(401, 'invalid_nas_token');
  const expected = await nasTokenSignature(parts[0], secret);
  if (!timingSafeEqual(expected, parts[1])) throw new HttpError(401, 'invalid_nas_token');
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'invalid_nas_token');
  }
  if (payload.v !== 1 || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, 'nas_token_expired');
  }
  return payload;
}

async function pushLineMessages(
  env: Env,
  recipientId: string,
  messages: Array<Record<string, unknown>>,
  retryKey = crypto.randomUUID(),
): Promise<void> {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
      'content-type': 'application/json',
      'x-line-retry-key': retryKey,
    },
    body: JSON.stringify({ to: recipientId, messages }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`line_push_failed:${res.status}`);
}

async function replyLineMessages(
  env: Env,
  replyToken: string,
  messages: Array<Record<string, unknown>>,
): Promise<void> {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) throw new Error(`line_reply_failed:${res.status}`);
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
