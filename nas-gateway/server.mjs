import http from 'node:http';
import { pathToFileURL } from 'node:url';

import { signToken, verifyToken } from './lib/auth.mjs';
import { FileStore } from './lib/file-store.mjs';

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function json(response, status, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  response.end(body);
}

function bearerToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, 'authorization_required');
  return match[1];
}

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,HEAD,PUT,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,content-length,range',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function validateUploadClaims(claims, store) {
  if (claims.action !== 'upload') throw httpError(403, 'wrong_token_action');
  store.assertAssetId(claims.assetId);
  store.resolveKey(claims.key);
  for (const field of ['sizeBytes', 'chunkSizeBytes', 'totalParts']) {
    if (!Number.isSafeInteger(claims[field]) || claims[field] <= 0) throw httpError(400, 'invalid_upload_token');
  }
  if (claims.chunkSizeBytes > 64 * 1024 * 1024) throw httpError(400, 'invalid_upload_token');
  if (claims.totalParts !== Math.ceil(claims.sizeBytes / claims.chunkSizeBytes)) {
    throw httpError(400, 'invalid_upload_token');
  }
}

function parseRange(header, size) {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) throw httpError(416, 'range_not_satisfiable');
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw httpError(416, 'range_not_satisfiable');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    throw httpError(416, 'range_not_satisfiable');
  }
  return { start, end: Math.min(end, size - 1) };
}

export function createGateway({ secret, allowedOrigin, store }) {
  if (!secret || !allowedOrigin || !store) throw new Error('secret, allowedOrigin and store are required');

  return async function gatewayHandler(request, response) {
    const origin = request.headers.origin;
    if (request.method === 'OPTIONS') {
      if (origin !== allowedOrigin) return json(response, 403, { error: 'origin_forbidden' });
      response.writeHead(204, corsHeaders(origin));
      response.end();
      return;
    }

    try {
      const url = new URL(request.url, 'http://gateway.local');
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(response, 200, { ok: true, service: 'mrnks-nas-gateway' });
      }

      const uploadPartMatch = url.pathname.match(/^\/v1\/uploads\/([^/]+)\/parts\/(\d+)$/);
      const uploadStatusMatch = url.pathname.match(/^\/v1\/uploads\/([^/]+)$/);
      const uploadCompleteMatch = url.pathname.match(/^\/v1\/uploads\/([^/]+)\/complete$/);
      const objectMatch = url.pathname.match(/^\/v1\/objects\/([^/]+)$/);

      if (uploadPartMatch || uploadStatusMatch || uploadCompleteMatch) {
        if (origin !== allowedOrigin) throw httpError(403, 'origin_forbidden');
        const claims = await verifyToken(bearerToken(request), secret);
        validateUploadClaims(claims, store);
        const assetId = decodeURIComponent((uploadPartMatch || uploadStatusMatch || uploadCompleteMatch)[1]);
        if (assetId !== claims.assetId || claims.origin !== origin) throw httpError(403, 'token_scope_mismatch');
        const cors = corsHeaders(origin);

        if (uploadPartMatch && request.method === 'PUT') {
          const index = Number(uploadPartMatch[2]);
          if (!Number.isSafeInteger(index) || index < 0 || index >= claims.totalParts) throw httpError(400, 'invalid_part_index');
          const expectedSize = index === claims.totalParts - 1
            ? claims.sizeBytes - claims.chunkSizeBytes * (claims.totalParts - 1)
            : claims.chunkSizeBytes;
          const suppliedSize = Number(request.headers['content-length']);
          if (!Number.isSafeInteger(suppliedSize) || suppliedSize !== expectedSize) throw httpError(400, 'invalid_part_size');
          const result = await store.putPart(claims.assetId, index, request, expectedSize);
          return json(response, 201, { ok: true, part: index, ...result }, cors);
        }

        if (uploadStatusMatch && request.method === 'GET') {
          return json(response, 200, { uploadedParts: await store.uploadedParts(claims.assetId) }, cors);
        }

        if (uploadCompleteMatch && request.method === 'POST') {
          const completed = await store.completeUpload(claims);
          const receipt = await signToken({
            v: 1,
            action: 'complete',
            uploadId: claims.uploadId,
            assetId: claims.assetId,
            familyId: claims.familyId,
            key: claims.key,
            sizeBytes: completed.sizeBytes,
            sha256: completed.sha256,
            exp: Math.floor(Date.now() / 1000) + 600,
          }, secret);
          return json(response, 200, { ok: true, receipt, sha256: completed.sha256 }, cors);
        }
      }

      if (objectMatch) {
        const claims = await verifyToken(bearerToken(request), secret);
        const assetId = decodeURIComponent(objectMatch[1]);
        store.assertAssetId(assetId);
        store.resolveKey(claims.key);
        if (assetId !== claims.assetId) throw httpError(403, 'token_scope_mismatch');

        if ((request.method === 'GET' || request.method === 'HEAD') && claims.action === 'read') {
          const object = await store.statObject(claims.key);
          if (!object) throw httpError(404, 'object_not_found');
          if (Number.isSafeInteger(claims.sizeBytes) && object.size !== claims.sizeBytes) {
            throw httpError(409, 'object_size_mismatch');
          }
          let range;
          try {
            range = parseRange(request.headers.range, object.size);
          } catch (error) {
            if (error.status === 416) {
              response.writeHead(416, {
                'content-range': `bytes */${object.size}`,
                'accept-ranges': 'bytes',
                'cache-control': 'private, no-store',
              });
              response.end();
              return;
            }
            throw error;
          }
          const start = range?.start ?? 0;
          const end = range?.end ?? object.size - 1;
          const status = range ? 206 : 200;
          const headers = {
            'content-type': typeof claims.mimeType === 'string' ? claims.mimeType : 'application/octet-stream',
            'content-length': String(end - start + 1),
            'accept-ranges': 'bytes',
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff',
          };
          if (range) headers['content-range'] = `bytes ${start}-${end}/${object.size}`;
          response.writeHead(status, headers);
          if (request.method === 'HEAD') return response.end();
          const stream = store.createReadStream(claims.key, { start, end });
          stream.on('error', () => response.destroy());
          stream.pipe(response);
          return;
        }

        if (request.method === 'DELETE' && claims.action === 'delete') {
          await store.deleteObject(claims.key);
          response.writeHead(204, { 'cache-control': 'no-store' });
          response.end();
          return;
        }
        throw httpError(403, 'wrong_token_action');
      }

      throw httpError(404, 'not_found');
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status === 500) console.error('gateway request failed', error instanceof Error ? error.message : String(error));
      if (!response.headersSent) json(response, status, { error: status === 500 ? 'internal_error' : error.message });
      else response.destroy();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.NAS_STORAGE_SECRET;
  const allowedOrigin = process.env.APP_ORIGIN || 'https://mrnks.2-38.com';
  const storageRoot = process.env.STORAGE_ROOT;
  if (!secret || !storageRoot) {
    console.error('NAS_STORAGE_SECRET and STORAGE_ROOT are required');
    process.exit(1);
  }
  const server = http.createServer(createGateway({
    secret,
    allowedOrigin,
    store: new FileStore(storageRoot),
  }));
  server.requestTimeout = 10 * 60 * 1000;
  server.headersTimeout = 60 * 1000;
  server.listen(Number(process.env.PORT || 8898), process.env.HOST || '127.0.0.1', () => {
    console.log('mrnks NAS gateway ready');
  });
}
