import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const state = JSON.parse(await readFile(process.env.SMOKE_STATE || '/tmp/mrnks-existing-assets-smoke.json', 'utf8'));
const appOrigin = process.env.APP_ORIGIN || 'https://mrnks.2-38.com';
const cookie = `mrnks_session=${state.sessionToken}`;
const results = [];

async function readJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('cookie', cookie);
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${response.status} ${typeof body === 'string' ? body : body?.error || response.statusText}`);
  return body;
}

for (const asset of state.assets) {
  const range = await fetch(`${appOrigin}/api/media/${asset.id}/content`, {
    headers: { cookie, range: 'bytes=0-31' },
  });
  if (range.status !== 206 || (await range.arrayBuffer()).byteLength !== 32) {
    throw new Error(`${asset.id}: Range read failed with ${range.status}`);
  }

  const firstPreview = await fetch(`${appOrigin}/api/media/${asset.id}/preview`, { headers: { cookie } });
  if (firstPreview.status !== 200) throw new Error(`${asset.id}: preview failed with ${firstPreview.status}`);
  const firstPreviewBytes = Buffer.from(await firstPreview.arrayBuffer());
  if (firstPreviewBytes.length < 4 || firstPreviewBytes[0] !== 0xff || firstPreviewBytes[1] !== 0xd8) {
    throw new Error(`${asset.id}: preview is not JPEG`);
  }

  const secondPreview = await fetch(`${appOrigin}/api/media/${asset.id}/preview`, { headers: { cookie } });
  if (secondPreview.status !== 200) throw new Error(`${asset.id}: second preview failed with ${secondPreview.status}`);
  await secondPreview.arrayBuffer();
  const secondPreviewSource = secondPreview.headers.get('x-mrnks-preview-source');
  if (secondPreviewSource !== 'r2-preview') {
    throw new Error(`${asset.id}: preview was not served from R2 after warmup (${secondPreviewSource})`);
  }

  const download = await readJson(`${appOrigin}/api/media/${asset.id}/download-url`, { method: 'POST' });
  const response = await fetch(download.downloadUrl);
  if (response.status !== 200) throw new Error(`${asset.id}: download failed with ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(body).digest('hex');
  if (body.byteLength !== asset.sizeBytes || sha256 !== asset.sha256) {
    throw new Error(`${asset.id}: full download verification mismatch`);
  }

  results.push({
    id: asset.id,
    filename: asset.filename,
    sizeBytes: body.byteLength,
    sha256,
    firstPreviewSource: firstPreview.headers.get('x-mrnks-preview-source'),
    secondPreviewSource,
  });
}

const unauthenticated = await fetch(`${appOrigin}/api/media/${state.assets[0].id}/content`);
if (unauthenticated.status !== 401) throw new Error(`unauthenticated content returned ${unauthenticated.status}`);

console.log(JSON.stringify({ ok: true, assets: results }, null, 2));
