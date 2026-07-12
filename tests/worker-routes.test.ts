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
    expect(html).toContain('.arw,.ARW');
  });

  it('serves a gallery-first mobile layout with auth gate, user avatar, FAB, and upload sheet', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();

    expect(html).toContain('id="authGate"');
    expect(html).toContain('id="appShell" hidden');
    expect(html).toContain('id="userMenuButton"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('id="addMediaButton"');
    expect(html).toContain('class="fab"');
    expect(html).toContain('class="fab-icon"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('x1="12" y1="5" x2="12" y2="19"');
    expect(html).toContain('x1="5" y1="12" x2="19" y2="12"');
    expect(html).not.toContain('hidden>＋</button>');
    expect(html).toContain('id="uploadDrawer"');
    expect(html).toContain('class="upload-sheet"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("$('uploadDrawer').addEventListener('close'");
    expect(html).toContain("$('addMediaButton').focus()");
    expect(html).toContain('env(safe-area-inset-bottom)');
    expect(html).not.toContain('<h2>1. LINEログイン</h2>');
    expect(html).not.toContain('class="hero-unit"');
    expect(html).not.toContain('class="row-fluid setup-grid"');
    expect(html).not.toContain('class="well status-well"');
  });

  it('switches between the login gate and authenticated gallery shell', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();

    expect(html).toContain('function showAuthenticatedUi');
    expect(html).toContain("$('authGate').hidden = true");
    expect(html).toContain("$('appShell').hidden = false");
    expect(html).toContain("$('addMediaButton').hidden = !canUpload");
    expect(html).toContain('function openUploadDrawer');
    expect(html).toContain("api('/api/auth/logout', { method: 'POST' })");
  });

  it('serves a syntactically valid inline module', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();
    const inlineModule = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];

    expect(inlineModule).toBeTruthy();
    expect(() => new Function(inlineModule!)).not.toThrow();
  });

  it('uploads originals directly to the NAS gateway in resumable chunks and sends only the receipt/preview to the Worker', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();

    expect(html).toContain('async function uploadFileToNas');
    expect(html).toContain("+ '/uploads', {");
    expect(html).toContain("+ '/parts/' + partIndex");
    expect(html).toContain('uploadedParts');
    expect(html).toContain("+ '/complete'");
    expect(html).toContain("completionForm.append('receipt'");
    expect(html).toContain("completionForm.append('notificationPreview'");
    const uploader = html.match(/async function uploadFileToNas[\s\S]*?async function uploadFiles/)?.[0] || '';
    expect(uploader).not.toContain("form.append('file', file)");
  });

  it('keeps the app login gate visible until the user chooses LINE Login', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();

    expect(html).toContain('await window.liff.init({ liffId: state.config.liffId });');
    expect(html).not.toContain('withLoginOnExternalBrowser: true');
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
    expect(galleryRenderer).toContain("item.type === 'image' || isRaw(item)");
    expect(galleryRenderer).not.toContain("document.createElement('video')");
  });

  it('shows indefinite trash and restore controls only to editors', async () => {
    const res = await worker.fetch(new Request('https://mrnks.2-38.com/'), fakeEnv());
    const html = await res.text();

    expect(html).toContain('id="galleryDeleteButton"');
    expect(html).toContain('id="deleteMediaDialog"');
    expect(html).toContain('id="deleteMediaConfirmButton"');
    expect(html).toContain('id="trashButton"');
    expect(html).toContain('id="trashDialog"');
    expect(html).toContain('id="trashList"');
    expect(html).toContain('期限なく保持');
    expect(html).toContain('ゴミ箱へ移動');
    expect(html).toContain('復元');
    expect(html).not.toContain('元に戻せません');
    expect(html).not.toContain('完全に削除');
    expect(html).toContain("$('galleryDeleteButton').hidden = !state.canUpload");
    expect(html).toContain("$('trashButton').hidden = !canUpload");
    expect(html).toContain("method: 'DELETE'");
    expect(html).toContain("method: 'POST'");
    expect(html).toContain("+ '/restore'");
    expect(html).toContain('async function trashActiveMedia');
    expect(html).toContain('async function restoreTrashItem');
    expect(html).toContain("openDialog($('deleteMediaDialog'))");
    expect(html).toContain("$('deleteMediaCancelButton').focus()");
    expect(html).not.toContain("$('deleteMediaConfirmButton').focus()");
    expect(html).toContain("$('deleteMediaCancelButton').disabled = busy");
    expect(html).toContain("if (state.deleteInProgress) event.preventDefault()");
    expect(html).toContain('button.dataset.assetId = item.id');
    expect(html).toContain('focusAfterMediaDelete(nextFocusAssetId)');
    expect(html).toContain('id="albumTitle" class="visually-hidden" tabindex="-1"');
    expect(html).toContain('id="albumCount"');
  });
});
