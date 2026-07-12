import { createHmac, timingSafeEqual } from 'node:crypto';

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest();
}

export async function signToken(payload, secret) {
  if (!secret) throw new Error('token secret is required');
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${signature(encodedPayload, secret).toString('base64url')}`;
}

export async function verifyToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string') throw Object.assign(new Error('invalid_token'), { status: 401 });
  const parts = token.split('.');
  if (parts.length !== 2) throw Object.assign(new Error('invalid_token'), { status: 401 });
  const expected = signature(parts[0], secret);
  let supplied;
  try {
    supplied = Buffer.from(parts[1], 'base64url');
  } catch {
    throw Object.assign(new Error('invalid_token'), { status: 401 });
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw Object.assign(new Error('invalid_token'), { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid_token'), { status: 401 });
  }
  if (!payload || payload.v !== 1 || !Number.isFinite(payload.exp) || payload.exp < nowSeconds) {
    throw Object.assign(new Error('token_expired'), { status: 401 });
  }
  return payload;
}
