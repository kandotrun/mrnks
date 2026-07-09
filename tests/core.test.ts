import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildOriginalKey,
  createSessionCookie,
  parseCookieHeader,
  sanitizeFilename,
  sha256Hex,
  verifyLineSignature,
} from '../src/core';

describe('core utilities', () => {
  it('sanitizes filenames without losing recognizable names', () => {
    expect(sanitizeFilename('IMG 1234.HEIC')).toBe('IMG_1234.HEIC');
    expect(sanitizeFilename('../secret/IMG.png')).toBe('secret_IMG.png');
    expect(sanitizeFilename('家族 写真 01.heic')).toBe('家族_写真_01.heic');
  });

  it('builds stable private original object keys', () => {
    expect(buildOriginalKey('fam_abc', 'ast_123', '../IMG 1.HEIC')).toBe(
      'originals/fam_abc/ast_123/IMG_1.HEIC',
    );
  });

  it('computes SHA-256 as lowercase hex', async () => {
    expect(await sha256Hex(new TextEncoder().encode('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('verifies LINE webhook signatures without exposing secrets', async () => {
    const secret = 'test-secret';
    const body = JSON.stringify({ events: [] });
    const signature = createHmac('sha256', secret).update(body).digest('base64');

    await expect(verifyLineSignature(secret, body, signature)).resolves.toBe(true);
    await expect(verifyLineSignature(secret, body, 'invalid')).resolves.toBe(false);
  });

  it('parses and creates secure session cookies', () => {
    const cookie = createSessionCookie('token-123', 60 * 60);
    expect(cookie).toContain('mrnks_session=token-123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(parseCookieHeader('foo=bar; mrnks_session=token-123').mrnks_session).toBe('token-123');
  });
});
