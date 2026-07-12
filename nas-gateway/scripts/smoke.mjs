import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { signToken, verifyToken } from '../lib/auth.mjs';

function readSecret() {
  const envFile = process.env.GATEWAY_ENV_FILE || '/home/kan/.config/mrnks-nas-gateway.env';
  return readFile(envFile, 'utf8').then((text) => {
    const line = text.split(/\r?\n/).find((entry) => entry.startsWith('NAS_STORAGE_SECRET='));
    if (!line) throw new Error('NAS_STORAGE_SECRET not found');
    return line.slice('NAS_STORAGE_SECRET='.length);
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${response.status} ${body?.error || text}`);
  return body;
}

const origin = process.env.GATEWAY_ORIGIN || 'https://mrnks-storage.pochimo.com';
const appOrigin = 'https://mrnks.2-38.com';
const sizeBytes = Number(process.env.SMOKE_BYTES || 105 * 1024 * 1024);
const chunkSizeBytes = 32 * 1024 * 1024;
const totalParts = Math.ceil(sizeBytes / chunkSizeBytes);
const assetId = `ast_smoke_${randomUUID().replaceAll('-', '')}`;
const uploadId = `upl_smoke_${randomUUID().replaceAll('-', '')}`;
const familyId = 'fam_smoke';
const key = `smoke/${assetId}/original.bin`;
const secret = await readSecret();
const exp = Math.floor(Date.now() / 1000) + 1800;
const uploadToken = await signToken({
  v: 1,
  action: 'upload',
  uploadId,
  assetId,
  familyId,
  key,
  sizeBytes,
  chunkSizeBytes,
  totalParts,
  origin: appOrigin,
  exp,
}, secret);
const uploadHeaders = { authorization: `Bearer ${uploadToken}`, origin: appOrigin };
const expectedHash = createHash('sha256');
let completed = false;

try {
  for (let index = 0; index < totalParts; index += 1) {
    const length = Math.min(chunkSizeBytes, sizeBytes - index * chunkSizeBytes);
    const part = Buffer.alloc(length, index % 251);
    expectedHash.update(part);
    await requestJson(`${origin}/v1/uploads/${assetId}/parts/${index}`, {
      method: 'PUT',
      headers: { ...uploadHeaders, 'content-type': 'application/octet-stream' },
      body: part,
    });
  }

  const progress = await requestJson(`${origin}/v1/uploads/${assetId}`, { headers: uploadHeaders });
  if (progress.uploadedParts.length !== totalParts) throw new Error('resume status did not report every part');

  const completion = await requestJson(`${origin}/v1/uploads/${assetId}/complete`, {
    method: 'POST',
    headers: uploadHeaders,
  });
  const receipt = await verifyToken(completion.receipt, secret);
  const expectedSha256 = expectedHash.digest('hex');
  if (receipt.sha256 !== expectedSha256 || receipt.sizeBytes !== sizeBytes) {
    throw new Error('completion receipt mismatch');
  }
  completed = true;

  const readToken = await signToken({
    v: 1,
    action: 'read',
    assetId,
    key,
    sizeBytes,
    mimeType: 'application/octet-stream',
    filename: 'original.bin',
    exp,
  }, secret);
  const rangeStart = chunkSizeBytes - 2;
  const rangeResponse = await fetch(`${origin}/v1/objects/${assetId}`, {
    headers: {
      authorization: `Bearer ${readToken}`,
      range: `bytes=${rangeStart}-${rangeStart + 7}`,
    },
  });
  if (rangeResponse.status !== 206) throw new Error(`range status ${rangeResponse.status}`);
  const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
  const expectedRange = Buffer.from([0, 0, 1, 1, 1, 1, 1, 1]);
  if (!rangeBytes.equals(expectedRange)) throw new Error('range bytes mismatch');

  console.log(JSON.stringify({ ok: true, sizeBytes, totalParts, sha256: expectedSha256 }));
} finally {
  if (completed) {
    const deleteToken = await signToken({ v: 1, action: 'delete', assetId, key, exp }, secret);
    await fetch(`${origin}/v1/objects/${assetId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${deleteToken}` },
    });
  }
}
