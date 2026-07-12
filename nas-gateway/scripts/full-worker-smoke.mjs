import { readFile } from 'node:fs/promises';

import { signToken } from '../lib/auth.mjs';

const state = JSON.parse(await readFile(process.env.SMOKE_STATE || '/tmp/mrnks-full-smoke-state.json', 'utf8'));
const gatewayEnv = await readFile(process.env.GATEWAY_ENV_FILE || '/home/kan/.config/mrnks-nas-gateway.env', 'utf8');
const gatewaySecret = gatewayEnv.split(/\r?\n/).find((line) => line.startsWith('NAS_STORAGE_SECRET='))?.split('=', 2)[1];
if (!gatewaySecret) throw new Error('gateway secret unavailable');

const appOrigin = process.env.APP_ORIGIN || 'https://mrnks.2-38.com';
const cookie = `mrnks_session=${state.sessionToken}`;
const original = Buffer.alloc(1024 * 1024, 0x5a);
const preview = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
let upload;
let committed = false;

async function jsonRequest(url, options = {}, authenticated = false) {
  const headers = new Headers(options.headers || {});
  if (authenticated) headers.set('cookie', cookie);
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${response.status} ${typeof body === 'string' ? body : body?.error || response.statusText}`);
  return { response, body };
}

try {
  ({ body: upload } = await jsonRequest(`${appOrigin}/api/families/${state.familyId}/uploads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: 'smoke.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: original.byteLength,
      clientLastModifiedAt: new Date().toISOString(),
    }),
  }, true));

  await jsonRequest(`${upload.gatewayOrigin}/v1/uploads/${upload.assetId}/parts/0`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${upload.uploadToken}`,
      origin: appOrigin,
      'content-type': 'application/octet-stream',
    },
    body: original,
  });
  const { body: gatewayCompletion } = await jsonRequest(
    `${upload.gatewayOrigin}/v1/uploads/${upload.assetId}/complete`,
    { method: 'POST', headers: { authorization: `Bearer ${upload.uploadToken}`, origin: appOrigin } },
  );

  const completionForm = new FormData();
  completionForm.append('receipt', gatewayCompletion.receipt);
  completionForm.append('notificationPreview', new Blob([preview], { type: 'image/jpeg' }), 'preview.jpg');
  const { body: completion } = await jsonRequest(`${appOrigin}/api/uploads/${upload.uploadId}/complete`, {
    method: 'POST',
    body: completionForm,
  }, true);
  if (completion.asset.id !== upload.assetId || completion.asset.storageBackend !== 'nas') {
    throw new Error('Worker completion did not commit NAS storage');
  }
  committed = true;

  const { body: list } = await jsonRequest(`${appOrigin}/api/families/${state.familyId}/media`, {}, true);
  if (!list.assets.some((asset) => asset.id === upload.assetId)) throw new Error('committed asset missing from family list');

  const previewResponse = await fetch(`${appOrigin}/api/media/${upload.assetId}/preview`, { headers: { cookie } });
  if (previewResponse.status !== 200 || !Buffer.from(await previewResponse.arrayBuffer()).equals(preview)) {
    throw new Error('R2 preview verification failed');
  }

  const contentResponse = await fetch(`${appOrigin}/api/media/${upload.assetId}/content`, {
    headers: { cookie, range: 'bytes=1048570-1048575' },
  });
  if (contentResponse.status !== 206) throw new Error(`content range status ${contentResponse.status}`);
  const contentBytes = Buffer.from(await contentResponse.arrayBuffer());
  if (!contentBytes.equals(Buffer.alloc(6, 0x5a))) throw new Error('NAS range bytes mismatch');

  const { body: download } = await jsonRequest(`${appOrigin}/api/media/${upload.assetId}/download-url`, {
    method: 'POST',
  }, true);
  const downloadResponse = await fetch(download.downloadUrl);
  if (downloadResponse.status !== 200 || Number(downloadResponse.headers.get('content-length')) !== original.byteLength) {
    throw new Error('NAS download verification failed');
  }
  await downloadResponse.arrayBuffer();

  await jsonRequest(`${appOrigin}/api/media/${upload.assetId}`, { method: 'DELETE' }, true);
  committed = false;
  const deletedResponse = await fetch(`${appOrigin}/api/media/${upload.assetId}/content`, { headers: { cookie } });
  if (deletedResponse.status !== 404) throw new Error(`deleted asset remained visible: ${deletedResponse.status}`);

  console.log(JSON.stringify({ ok: true, assetId: upload.assetId, storageBackend: 'nas', preview: 'r2', range: 'verified' }));
} finally {
  if (committed && upload?.assetId) {
    await fetch(`${appOrigin}/api/media/${upload.assetId}`, { method: 'DELETE', headers: { cookie } }).catch(() => undefined);
  } else if (upload?.assetId && upload?.assetId && upload?.gatewayOrigin) {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const token = await signToken({ v: 1, action: 'delete', assetId: upload.assetId, key: `originals/${state.familyId}/${upload.assetId}/original.jpg`, exp }, gatewaySecret);
    await fetch(`${upload.gatewayOrigin}/v1/objects/${upload.assetId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
}
