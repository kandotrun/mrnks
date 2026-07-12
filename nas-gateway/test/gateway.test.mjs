import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createGateway } from '../server.mjs';
import { signToken, verifyToken } from '../lib/auth.mjs';
import { FileStore } from '../lib/file-store.mjs';

const secret = 'gateway-test-secret';
const appOrigin = 'https://mrnks.2-38.com';

async function startGateway() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mrnks-gateway-'));
  const store = new FileStore(root);
  const server = http.createServer(createGateway({ secret, allowedOrigin: appOrigin, store }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  return {
    root,
    store,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(root, { recursive: true, force: true });
    },
  };
}

function uploadClaims(overrides = {}) {
  return {
    v: 1,
    action: 'upload',
    uploadId: 'upl_test',
    assetId: 'ast_test',
    familyId: 'fam_test',
    key: 'originals/fam_test/ast_test/original.bin',
    sizeBytes: 11,
    chunkSizeBytes: 6,
    totalParts: 2,
    origin: appOrigin,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  };
}

async function uploadPart(baseUrl, token, index, bytes, origin = appOrigin) {
  return fetch(`${baseUrl}/v1/uploads/ast_test/parts/${index}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      origin,
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
    },
    body: bytes,
  });
}

test('spec: uploads resumable parts and returns a signed SHA-256 completion receipt', async () => {
  const gateway = await startGateway();
  try {
    const claims = uploadClaims();
    const token = await signToken(claims, secret);

    assert.equal((await uploadPart(gateway.baseUrl, token, 0, Buffer.from('hello '))).status, 201);
    assert.equal((await uploadPart(gateway.baseUrl, token, 1, Buffer.from('world'))).status, 201);

    const statusResponse = await fetch(`${gateway.baseUrl}/v1/uploads/ast_test`, {
      headers: { authorization: `Bearer ${token}`, origin: appOrigin },
    });
    assert.equal(statusResponse.status, 200);
    assert.deepEqual((await statusResponse.json()).uploadedParts, [0, 1]);

    const completeResponse = await fetch(`${gateway.baseUrl}/v1/uploads/ast_test/complete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, origin: appOrigin },
    });
    assert.equal(completeResponse.status, 200);
    const complete = await completeResponse.json();
    const receipt = await verifyToken(complete.receipt, secret);
    assert.equal(receipt.action, 'complete');
    assert.equal(receipt.assetId, claims.assetId);
    assert.equal(receipt.key, claims.key);
    assert.equal(receipt.sizeBytes, 11);
    assert.equal(receipt.sha256, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');

    assert.equal(await readFile(path.join(gateway.root, claims.key), 'utf8'), 'hello world');
  } finally {
    await gateway.close();
  }
});

test('spec: rejects wrong origins, expired tokens, traversal keys, and malformed part sizes', async () => {
  const gateway = await startGateway();
  try {
    const valid = await signToken(uploadClaims(), secret);
    assert.equal((await uploadPart(gateway.baseUrl, valid, 0, Buffer.from('hello '), 'https://evil.example')).status, 403);

    const expired = await signToken(uploadClaims({ exp: Math.floor(Date.now() / 1000) - 1 }), secret);
    assert.equal((await uploadPart(gateway.baseUrl, expired, 0, Buffer.from('hello '))).status, 401);

    const traversal = await signToken(uploadClaims({ key: '../outside' }), secret);
    assert.equal((await uploadPart(gateway.baseUrl, traversal, 0, Buffer.from('hello '))).status, 400);

    assert.equal((await uploadPart(gateway.baseUrl, valid, 0, Buffer.from('short'))).status, 400);
  } finally {
    await gateway.close();
  }
});

test('spec: serves authenticated byte ranges and deletes only the signed object', async () => {
  const gateway = await startGateway();
  try {
    const claims = uploadClaims();
    const uploadToken = await signToken(claims, secret);
    await uploadPart(gateway.baseUrl, uploadToken, 0, Buffer.from('hello '));
    await uploadPart(gateway.baseUrl, uploadToken, 1, Buffer.from('world'));
    const completion = await fetch(`${gateway.baseUrl}/v1/uploads/ast_test/complete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uploadToken}`, origin: appOrigin },
    });
    assert.equal(completion.status, 200);

    const readToken = await signToken({
      v: 1,
      action: 'read',
      assetId: claims.assetId,
      key: claims.key,
      sizeBytes: claims.sizeBytes,
      mimeType: 'application/octet-stream',
      filename: 'original.bin',
      exp: Math.floor(Date.now() / 1000) + 300,
    }, secret);
    const rangeResponse = await fetch(`${gateway.baseUrl}/v1/objects/ast_test`, {
      headers: { authorization: `Bearer ${readToken}`, range: 'bytes=6-10' },
    });
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get('content-range'), 'bytes 6-10/11');
    assert.equal(await rangeResponse.text(), 'world');

    const deleteToken = await signToken({
      v: 1,
      action: 'delete',
      assetId: claims.assetId,
      key: claims.key,
      exp: Math.floor(Date.now() / 1000) + 300,
    }, secret);
    const deleteResponse = await fetch(`${gateway.baseUrl}/v1/objects/ast_test`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${deleteToken}` },
    });
    assert.equal(deleteResponse.status, 204);

    const missingResponse = await fetch(`${gateway.baseUrl}/v1/objects/ast_test`, {
      headers: { authorization: `Bearer ${readToken}` },
    });
    assert.equal(missingResponse.status, 404);
  } finally {
    await gateway.close();
  }
});

test('spec: health is public but reveals no storage path or secret', async () => {
  const gateway = await startGateway();
  try {
    const response = await fetch(`${gateway.baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'mrnks-nas-gateway' });
  } finally {
    await gateway.close();
  }
});
