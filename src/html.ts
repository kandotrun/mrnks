export function renderAppHtml(): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>まるのこし</title>
  <meta name="description" content="家族の写真と動画を、画質ごと残すLINEアルバム" />
  <meta name="theme-color" content="#f5f5f5" />
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    :root {
      color-scheme: light;
      --body-bg: #f5f5f5;
      --surface: #ffffff;
      --well-bg: #f5f5f5;
      --text: #333333;
      --muted: #777777;
      --border: #cccccc;
      --soft-border: #e3e3e3;
      --link: #0088cc;
      --primary-top: #0088cc;
      --primary-bottom: #0044cc;
      --success-top: #62c462;
      --success-bottom: #51a351;
    }
    * { box-sizing: border-box; }
    html { background: var(--body-bg); }
    body {
      margin: 0;
      color: var(--text);
      background: var(--body-bg);
      font-family: "Helvetica Neue", Helvetica, Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
      font-size: 14px;
      line-height: 20px;
    }
    a { color: var(--link); text-decoration: none; }
    a:hover, a:focus { color: #005580; text-decoration: underline; }
    button, input { font: inherit; }
    .container {
      width: 940px;
      max-width: calc(100% - 32px);
      margin-right: auto;
      margin-left: auto;
    }
    .navbar {
      position: relative;
      z-index: 2;
      margin-bottom: 0;
      overflow: visible;
    }
    .navbar-inner {
      min-height: 40px;
      border: 1px solid #d4d4d4;
      border-width: 0 0 1px;
      background-color: #fafafa;
      background-image: linear-gradient(to bottom, #ffffff, #f2f2f2);
      box-shadow: 0 1px 4px rgba(0, 0, 0, .12);
    }
    .navbar-layout {
      display: flex;
      min-height: 40px;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: block;
      padding: 10px 0;
      color: #333333;
      font-size: 20px;
      font-weight: 200;
      line-height: 20px;
      text-shadow: 0 1px 0 #ffffff;
    }
    .brand:hover, .brand:focus { color: #111111; text-decoration: none; }
    .navbar-text {
      color: #777777;
      font-size: 12px;
      line-height: 20px;
      text-shadow: 0 1px 0 #ffffff;
    }
    .app-main { padding-top: 24px; padding-bottom: 48px; }
    .hero-unit {
      margin-bottom: 24px;
      padding: 42px 48px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background-color: #eeeeee;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .75), 0 1px 2px rgba(0, 0, 0, .08);
    }
    .hero-unit h1 {
      margin: 10px 0 8px;
      color: inherit;
      font-size: 46px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: -1px;
    }
    .hero-unit .lead {
      margin: 0;
      max-width: 720px;
      color: #555555;
      font-size: 18px;
      font-weight: 200;
      line-height: 28px;
    }
    .label {
      display: inline-block;
      padding: 2px 4px;
      border-radius: 3px;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      line-height: 14px;
      text-shadow: 0 -1px 0 rgba(0, 0, 0, .25);
      vertical-align: baseline;
      white-space: nowrap;
    }
    .label-success { background-color: #468847; }
    .label-info { background-color: #3a87ad; }
    .row-fluid {
      display: flex;
      width: 100%;
      margin-left: -2%;
      align-items: stretch;
      flex-wrap: wrap;
    }
    .row-fluid .span6 {
      width: 48%;
      margin-left: 2%;
    }
    .well {
      min-height: 20px;
      margin-bottom: 20px;
      padding: 19px;
      border: 1px solid var(--soft-border);
      border-radius: 4px;
      background-color: var(--well-bg);
      box-shadow: inset 0 1px 1px rgba(0, 0, 0, .05);
    }
    .setup-grid .well { height: calc(100% - 20px); }
    .well h2 {
      margin: 0 0 8px;
      color: #333333;
      font-size: 20px;
      font-weight: 600;
      line-height: 26px;
    }
    .help-block, .muted {
      color: var(--muted);
      font-size: 13px;
      line-height: 19px;
    }
    .help-block { display: block; margin: 0 0 14px; }
    .button-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-block;
      margin: 0;
      padding: 4px 12px;
      border: 1px solid #bbbbbb;
      border-bottom-color: #a2a2a2;
      border-radius: 4px;
      color: #333333;
      background-color: #f5f5f5;
      background-image: linear-gradient(to bottom, #ffffff, #e6e6e6);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2), 0 1px 2px rgba(0, 0, 0, .05);
      cursor: pointer;
      font-size: 14px;
      line-height: 20px;
      text-align: center;
      text-shadow: 0 1px 1px rgba(255, 255, 255, .75);
      vertical-align: middle;
    }
    .btn:hover, .btn:focus {
      color: #333333;
      background-color: #e6e6e6;
      background-position: 0 -15px;
      text-decoration: none;
    }
    .btn:focus-visible, input[type="file"]:focus-visible {
      outline: 2px solid #51a7e8;
      outline-offset: 2px;
    }
    .btn:active {
      background-image: none;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, .15), 0 1px 2px rgba(0, 0, 0, .05);
      transform: translateY(1px);
    }
    .btn-primary, .btn-success {
      color: #ffffff;
      text-shadow: 0 -1px 0 rgba(0, 0, 0, .25);
    }
    .btn-primary {
      border-color: #0044cc #0044cc #002a80;
      background-color: #006dcc;
      background-image: linear-gradient(to bottom, var(--primary-top), var(--primary-bottom));
    }
    .btn-success {
      border-color: #51a351 #51a351 #387038;
      background-color: #5bb75b;
      background-image: linear-gradient(to bottom, var(--success-top), var(--success-bottom));
    }
    .btn-primary:hover, .btn-primary:focus { color: #ffffff; background-color: #0044cc; }
    .btn-success:hover, .btn-success:focus { color: #ffffff; background-color: #51a351; }
    .btn-small { padding: 2px 10px; font-size: 12px; line-height: 18px; }
    .btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }
    input[type="file"] {
      display: block;
      width: 100%;
      margin: 0 0 12px;
      padding: 7px;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: #555555;
      background-color: var(--surface);
      box-shadow: inset 0 1px 1px rgba(0, 0, 0, .075);
    }
    input[type="file"]::file-selector-button {
      margin-right: 10px;
      padding: 3px 9px;
      border: 1px solid #bbbbbb;
      border-radius: 3px;
      color: #333333;
      background: linear-gradient(to bottom, #ffffff, #e6e6e6);
      cursor: pointer;
    }
    .user-state { margin: 12px 0 0; }
    .status-well, .timeline-well { background-color: var(--surface); }
    .status {
      min-height: 52px;
      margin-top: 10px;
      padding: 9px;
      overflow: auto;
      border: 1px solid #cccccc;
      border-radius: 3px;
      color: #333333;
      background-color: #f7f7f9;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, .06);
      font-family: Monaco, Menlo, Consolas, "Courier New", monospace;
      font-size: 12px;
      line-height: 18px;
      white-space: pre-wrap;
    }
    .section-heading {
      display: flex;
      margin-bottom: 12px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .section-heading h2 { margin-bottom: 0; }
    .media {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 12px;
    }
    .asset {
      padding: 12px;
      overflow: hidden;
      border: 1px solid #dddddd;
      border-radius: 4px;
      background-color: #ffffff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
    }
    .asset strong {
      display: block;
      margin-bottom: 4px;
      overflow: hidden;
      color: #333333;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .asset-actions { margin-top: 10px; }
    .alert {
      margin-bottom: 20px;
      padding: 8px 14px;
      border: 1px solid #fbeed5;
      border-radius: 4px;
      color: #c09853;
      background-color: #fcf8e3;
      text-shadow: 0 1px 0 rgba(255, 255, 255, .5);
    }
    .alert-info { border-color: #bce8f1; color: #3a87ad; background-color: #d9edf7; }
    .footer-note {
      margin-top: 4px;
      color: #999999;
      font-size: 12px;
      text-align: center;
    }
    @media (max-width: 767px) {
      .container { width: auto; max-width: none; margin: 0 16px; }
      .navbar-text { display: none; }
      .app-main { padding-top: 16px; padding-bottom: 32px; }
      .hero-unit { margin-bottom: 16px; padding: 24px 20px; }
      .hero-unit h1 { font-size: 36px; }
      .hero-unit .lead { font-size: 16px; line-height: 24px; }
      .row-fluid { display: block; width: auto; margin-left: 0; }
      .row-fluid .span6 { width: 100%; margin-left: 0; }
      .setup-grid .well { height: auto; }
      .well { padding: 15px; }
      .section-heading { align-items: flex-start; }
      .media { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
<header class="navbar navbar-static-top">
  <div class="navbar-inner">
    <div class="container">
      <div class="navbar-layout">
        <a class="brand" href="/">まるのこし</a>
        <span class="navbar-text">LINEで使う家族アルバム</span>
      </div>
    </div>
  </div>
</header>
<main class="container app-main">
  <section class="hero-unit">
    <span class="label label-success">原本保存モード</span>
    <h1>まるのこし</h1>
    <p class="lead">家族の写真と動画を、画質ごと残す。LINEは入口として使い、原本はこの画面から直接保存します。</p>
  </section>

  <section class="row-fluid setup-grid">
    <div class="span6">
      <section class="well">
        <h2>1. LINEログイン</h2>
        <p class="help-block">LIFFでLINEログインし、家族アルバムを開きます。</p>
        <div class="button-row">
          <button id="loginButton" class="btn btn-success" type="button">LINEで開始</button>
          <button id="refreshButton" class="btn" type="button">再読込</button>
        </div>
        <p id="userText" class="user-state muted">未ログイン</p>
      </section>
    </div>

    <div class="span6">
      <section class="well">
        <h2>2. 写真・動画を追加</h2>
        <p class="help-block">LINEトークではなく、ここから原本を選んでください。保存時にSHA-256を照合します。</p>
        <input id="fileInput" type="file" multiple accept="image/*,video/*" aria-label="保存する写真・動画を選択" />
        <div class="button-row">
          <button id="uploadButton" class="btn btn-primary" type="button">原本をアップロード</button>
        </div>
      </section>
    </div>
  </section>

  <section class="well status-well">
    <h2>状態</h2>
    <div id="status" class="status" role="status" aria-live="polite">起動中...</div>
  </section>

  <section class="well timeline-well">
    <div class="section-heading">
      <h2>タイムライン</h2>
      <button id="loadMediaButton" class="btn btn-small" type="button">一覧を更新</button>
    </div>
    <div id="mediaGrid" class="media"></div>
  </section>

  <p class="footer-note">原本ファイルは再圧縮せず、家族専用の保存領域に保管します。</p>
</main>
<script type="module">
const state = { config: null, session: null, familyId: null };
const $ = (id) => document.getElementById(id);
const status = (message) => { $('status').textContent = message; };
const appendStatus = (message) => { $('status').textContent += '\\n' + message; };

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
    div.innerHTML = '<strong></strong><p class="muted"></p><span class="label label-info"></span><div class="asset-actions"><button class="btn btn-small" type="button">原本DL</button></div>';
    div.querySelector('strong').textContent = item.originalFilename;
    div.querySelector('p').textContent = new Date(item.uploadedAt).toLocaleString('ja-JP') + ' / ' + Math.round(item.sizeBytes / 1024) + 'KB';
    div.querySelector('.label').textContent = item.mimeType;
    div.querySelector('button').addEventListener('click', async () => {
      const url = await api('/api/media/' + encodeURIComponent(item.id) + '/download-url', { method: 'POST' });
      window.open(url.downloadUrl, '_blank', 'noopener');
    });
    grid.appendChild(div);
  }
  if (!data.assets?.length) grid.innerHTML = '<div class="alert alert-info">まだ写真・動画がありません。最初の原本をアップロードしてください。</div>';
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
