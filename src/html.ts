export function renderAppHtml(): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>まるのこし</title>
  <meta name="description" content="家族の写真と動画を、画質ごと残すLINEアルバム" />
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    :root { color-scheme: light; --green: #06c755; --ink: #152018; --muted: #647067; --bg: #f6fbf7; --card: #ffffff; --line: #dce7df; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: linear-gradient(180deg, #f6fbf7 0%, #fff 45%); color: var(--ink); }
    main { width: min(980px, 100%); margin: 0 auto; padding: 24px 16px 64px; }
    .hero { padding: 26px 20px; border: 1px solid var(--line); border-radius: 28px; background: rgba(255,255,255,.88); box-shadow: 0 18px 60px rgba(22, 65, 33, .08); }
    .badge { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 7px 12px; background: #e8f9ed; color: #087a33; font-weight: 700; font-size: 13px; }
    h1 { margin: 14px 0 8px; font-size: clamp(34px, 9vw, 68px); line-height: .98; letter-spacing: -.05em; }
    .lead { margin: 0; color: var(--muted); font-size: 17px; line-height: 1.75; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-top: 18px; }
    .card { border: 1px solid var(--line); border-radius: 22px; background: var(--card); padding: 18px; box-shadow: 0 8px 30px rgba(22, 65, 33, .05); }
    .card h2 { margin: 0 0 10px; font-size: 18px; }
    .muted { color: var(--muted); font-size: 13px; line-height: 1.55; }
    button, .button { border: 0; border-radius: 999px; background: var(--green); color: white; padding: 12px 16px; font-weight: 800; cursor: pointer; box-shadow: 0 8px 18px rgba(6,199,85,.24); }
    button.secondary { background: #eef5f0; color: var(--ink); box-shadow: none; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    input[type="file"] { display: block; width: 100%; padding: 18px; border: 1.5px dashed #9bd8ae; border-radius: 18px; background: #f8fffa; }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .status { white-space: pre-wrap; background: #101914; color: #d9ffe2; border-radius: 16px; padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; min-height: 44px; overflow: auto; }
    .media { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .asset { border: 1px solid var(--line); border-radius: 18px; padding: 12px; background: #fff; }
    .asset strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pill { display: inline-block; border-radius: 999px; padding: 4px 8px; background: #f0f5f1; color: var(--muted); font-size: 12px; }
    a { color: #087a33; }
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="badge">LINEで使う原本保存アルバム</div>
    <h1>まるのこし</h1>
    <p class="lead">家族の写真と動画を、画質ごと残す。LINEは入口、保存はこの画面から原本を直接アップロードします。</p>
  </section>

  <section class="grid">
    <div class="card">
      <h2>1. ログイン</h2>
      <p class="muted">LIFFでLINEログインし、家族アルバムに入ります。</p>
      <div class="row"><button id="loginButton">LINEで開始</button><button id="refreshButton" class="secondary">再読込</button></div>
      <p id="userText" class="muted">未ログイン</p>
    </div>

    <div class="card">
      <h2>2. 写真・動画を追加</h2>
      <p class="muted">LINEトーク送信ではなく、このファイル選択からアップロードしてください。サーバー側でSHA-256を記録します。</p>
      <input id="fileInput" type="file" multiple accept="image/*,video/*" />
      <div class="row" style="margin-top: 12px"><button id="uploadButton">原本をアップロード</button></div>
    </div>
  </section>

  <section class="card" style="margin-top: 16px">
    <h2>状態</h2>
    <div id="status" class="status">起動中...</div>
  </section>

  <section class="card" style="margin-top: 16px">
    <div class="row" style="justify-content: space-between">
      <h2>タイムライン</h2>
      <button id="loadMediaButton" class="secondary">一覧を更新</button>
    </div>
    <div id="mediaGrid" class="media"></div>
  </section>
</main>
<script type="module">
const state = { config: null, session: null, familyId: null };
const $ = (id) => document.getElementById(id);
const status = (message) => { $('status').textContent = message; };
const appendStatus = (message) => { $('status').textContent += '\n' + message; };

async function api(path, options = {}) {
  const res = await fetch(path, { credentials: 'include', ...options, headers: { ...(options.headers || {}) } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.message || res.statusText);
  return data;
}

async function boot() {
  state.config = await api('/api/config');
  status('設定読込OK: ' + state.config.appName);
  if (!state.config.liffId) {
    appendStatus('LIFF ID未設定です。Cloudflareデプロイ後にLINE DevelopersでLIFFを作成し、Worker secretへ設定します。');
    return;
  }
  if (!window.liff) {
    appendStatus('LIFF SDKを読み込めませんでした。');
    return;
  }
  await window.liff.init({ liffId: state.config.liffId });
  appendStatus('LIFF初期化OK');
  if (!window.liff.isLoggedIn()) {
    appendStatus('LINEログインが必要です。');
    return;
  }
  await loginWithLiff();
}

async function loginWithLiff() {
  if (!window.liff?.isLoggedIn()) {
    window.liff.login();
    return;
  }
  const idToken = window.liff.getIDToken();
  if (!idToken) throw new Error('ID tokenを取得できませんでした。');
  state.session = await api('/api/auth/line', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  state.familyId = state.session.families?.[0]?.id || null;
  $('userText').textContent = state.session.user?.displayName || 'LINE user';
  status('ログインOK: ' + $('userText').textContent);
  await loadMedia();
}

async function ensureSession() {
  if (state.session && state.familyId) return;
  try {
    state.session = await api('/api/auth/session');
    state.familyId = state.session.families?.[0]?.id || null;
  } catch {
    await loginWithLiff();
  }
}

async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function uploadFiles() {
  await ensureSession();
  if (!state.familyId) throw new Error('家族グループがありません。');
  const files = [...$('fileInput').files];
  if (files.length === 0) throw new Error('ファイルを選んでください。');
  status(files.length + '件アップロードします...');
  for (const file of files) {
    appendStatus('hash計算中: ' + file.name);
    const hash = await sha256Hex(file);
    appendStatus('送信中: ' + file.name + ' (' + Math.round(file.size / 1024) + 'KB)');
    const result = await api('/api/families/' + encodeURIComponent(state.familyId) + '/media', {
      method: 'PUT',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name),
        'x-client-sha256': hash,
        'x-client-last-modified': new Date(file.lastModified).toISOString(),
      },
      body: file,
    });
    appendStatus('保存OK: ' + result.asset.originalFilename + ' sha256=' + result.asset.sha256.slice(0, 12) + '...');
  }
  $('fileInput').value = '';
  await loadMedia();
}

async function loadMedia() {
  await ensureSession();
  if (!state.familyId) return;
  const data = await api('/api/families/' + encodeURIComponent(state.familyId) + '/media');
  const grid = $('mediaGrid');
  grid.innerHTML = '';
  for (const item of data.assets || []) {
    const div = document.createElement('div');
    div.className = 'asset';
    div.innerHTML = '<strong></strong><p class="muted"></p><span class="pill"></span><div class="row" style="margin-top:10px"><button class="secondary">原本DL</button></div>';
    div.querySelector('strong').textContent = item.originalFilename;
    div.querySelector('p').textContent = new Date(item.uploadedAt).toLocaleString('ja-JP') + ' / ' + Math.round(item.sizeBytes / 1024) + 'KB';
    div.querySelector('.pill').textContent = item.mimeType;
    div.querySelector('button').addEventListener('click', async () => {
      const url = await api('/api/media/' + encodeURIComponent(item.id) + '/download-url', { method: 'POST' });
      window.open(url.downloadUrl, '_blank', 'noopener');
    });
    grid.appendChild(div);
  }
  if (!data.assets?.length) grid.innerHTML = '<p class="muted">まだ写真・動画がありません。</p>';
}

$('loginButton').addEventListener('click', () => loginWithLiff().catch((e) => status('ERROR: ' + e.message)));
$('refreshButton').addEventListener('click', () => boot().catch((e) => status('ERROR: ' + e.message)));
$('uploadButton').addEventListener('click', () => uploadFiles().catch((e) => status('ERROR: ' + e.message)));
$('loadMediaButton').addEventListener('click', () => loadMedia().catch((e) => status('ERROR: ' + e.message)));
boot().catch((e) => status('ERROR: ' + e.message));
</script>
</body>
</html>`;
}
