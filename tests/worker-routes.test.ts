import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/worker';

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: 'test',
    APP_ORIGIN: 'https://mrnks.2-38.com',
    LINE_LIFF_ID: 'test-liff-id',
    LINE_LOGIN_CHANNEL_ID: 'login-channel',
    LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
    LINE_MESSAGING_CHANNEL_ID: 'messaging-channel',
    LINE_MESSAGING_CHANNEL_SECRET: 'messaging-secret',
    LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: 'messaging-token',
    SESSION_SECRET: 'test-session-secret',
    DB: {} as D1Database,
    MEDIA_BUCKET: {} as R2Bucket,
    ...overrides,
  };
}

describe('public Worker routes', () => {
  it('serves health JSON', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/health'), fakeEnv());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, service: 'mrnks' });
  });

  it('serves safe client config without secret values', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/api/config'), fakeEnv());
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json).toMatchObject({ appName: 'まるのこし', liffId: 'test-liff-id' });
    expect(JSON.stringify(json)).not.toContain('secret');
    expect(JSON.stringify(json)).not.toContain('messaging-token');
  });

  it('serves LIFF upload UI with original-quality copy', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('まるのこし');
    expect(html).toContain('原本');
    expect(html).toContain('type="file"');
  });
});
