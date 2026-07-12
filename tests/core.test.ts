import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildOriginalKey,
  createSessionCookie,
  findCompleteJpegLength,
  normalizeMediaMimeType,
  parseCookieHeader,
  parseSingleByteRange,
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

  it('normalizes missing browser MIME types from known media extensions', () => {
    expect(normalizeMediaMimeType('L1002970.DNG', '')).toBe('image/x-adobe-dng');
    expect(normalizeMediaMimeType('_DSC9863.ARW', 'application/octet-stream')).toBe('image/x-sony-arw');
    expect(normalizeMediaMimeType('IMG_1234.HEIC', 'application/octet-stream')).toBe('image/heic');
    expect(normalizeMediaMimeType('clip.MOV', 'application/octet-stream')).toBe('video/quicktime');
    expect(normalizeMediaMimeType('photo.jpg', 'image/jpeg; charset=binary')).toBe('image/jpeg');
  });

  it('parses one satisfiable HTTP bytes range and rejects malformed or multiple ranges', () => {
    expect(parseSingleByteRange(null, 100)).toEqual({ kind: 'full' });
    expect(parseSingleByteRange('bytes=10-19', 100)).toEqual({ kind: 'partial', offset: 10, length: 10 });
    expect(parseSingleByteRange('bytes=90-', 100)).toEqual({ kind: 'partial', offset: 90, length: 10 });
    expect(parseSingleByteRange('bytes=-12', 100)).toEqual({ kind: 'partial', offset: 88, length: 12 });
    expect(parseSingleByteRange('bytes=-999', 100)).toEqual({ kind: 'partial', offset: 0, length: 100 });
    expect(parseSingleByteRange('bytes=99-999', 100)).toEqual({ kind: 'partial', offset: 99, length: 1 });
    expect(parseSingleByteRange('bytes=100-', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseSingleByteRange('bytes=20-10', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseSingleByteRange('bytes=abc-def', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseSingleByteRange('bytes=0-0,2-3', 100)).toEqual({ kind: 'unsatisfiable' });
  });

  it('finds the real JPEG end through entropy bytes and ignores declared trailing bytes', () => {
    const jpegWithTrailingBytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x00, 0x01, 0x00, 0x01, 0x03,
      0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
      0xff, 0xda, 0x00, 0x0c, 0x03,
      0x01, 0x00, 0x02, 0x11, 0x03, 0x11,
      0x00, 0x3f, 0x00,
      0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33,
      0xff, 0xd9,
      0x76, 0x97,
    ]);

    const frameOnly = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x00, 0x01, 0x00, 0x01, 0x03,
      0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
      0xff, 0xd9,
    ]);

    expect(findCompleteJpegLength(jpegWithTrailingBytes)).toBe(jpegWithTrailingBytes.byteLength - 2);
    expect(findCompleteJpegLength(jpegWithTrailingBytes.subarray(0, -4))).toBeNull();
    expect(findCompleteJpegLength(frameOnly)).toBeNull();
    expect(findCompleteJpegLength(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
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
