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

  it('serves a Bootstrap 2-inspired layout with responsive local styles', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();

    expect(html).toContain('class="navbar navbar-static-top"');
    expect(html).toContain('class="container"');
    expect(html).toContain('class="hero-unit"');
    expect(html).toContain('class="row-fluid setup-grid"');
    expect(html).toContain('class="span6"');
    expect(html).toContain('class="well status-well"');
    expect(html).toContain('class="btn btn-primary"');
    expect(html).toContain('class="label label-success"');
    expect(html).toContain('@media (max-width: 767px)');
    expect(html).not.toContain('bootstrap.min.css');
  });

  it('serves a syntactically valid inline module', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();
    const inlineModule = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];

    expect(inlineModule).toBeTruthy();
    expect(() => new Function(inlineModule!)).not.toThrow();
  });

  it('automatically starts LINE Login when LIFF opens in an external browser', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();

    expect(html).toContain('withLoginOnExternalBrowser: true');
  });

  it('serves a date-grouped family gallery with an accessible lightbox', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();

    expect(html).toContain('id="galleryDays"');
    expect(html).toContain('id="galleryDialog"');
    expect(html).toContain('id="loadMoreMediaButton"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('groupAssetsByDay');
    expect(html).toContain('openGalleryItem');
    expect(html).toContain('アルバム');
    expect(html).toContain('env(safe-area-inset-bottom)');
    expect(html).toContain('event.target instanceof HTMLMediaElement');

    const galleryRenderer = html.match(/function renderGallery\([\s\S]*?async function downloadOriginal/)?.[0] || '';
    expect(galleryRenderer).toContain("item.type === 'image' || isDng(item)");
    expect(galleryRenderer).not.toContain("document.createElement('video')");
  });
});
