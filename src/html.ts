export function renderAppHtml(): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>まるのこし</title>
  <meta name="description" content="家族の写真と動画を、画質ごと残すLINEアルバム" />
  <meta name="theme-color" content="#f7f8f6" />
  <link rel="stylesheet" href="/vendor/photoswipe/photoswipe.css" />
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
    .visually-hidden {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      margin: -1px !important;
      padding: 0 !important;
      overflow: hidden !important;
      border: 0 !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }
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
    button, input, select { font: inherit; }
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
    .group-setup { background-color: var(--surface); }
    .form-row { margin-bottom: 12px; }
    .form-row label {
      display: block;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .form-control {
      display: block;
      width: 100%;
      min-height: 34px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: #333333;
      background: #ffffff;
    }
    .checkbox-row {
      display: flex;
      margin-bottom: 14px;
      align-items: center;
      gap: 7px;
    }
    .checkbox-row input { margin: 0; }
    .group-setup-result { margin: 10px 0 0; }
    .user-state { margin: 12px 0 0; }
    .status-well, .gallery-well { background-color: var(--surface); }
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
    .album-heading-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .album-count {
      min-width: 24px;
      padding: 2px 8px;
      border-radius: 10px;
      color: #ffffff;
      background: #666666;
      font-size: 12px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
    }
    .gallery-days { display: grid; gap: 24px; }
    .gallery-more { margin-top: 18px; text-align: center; }
    .gallery-more .btn[hidden] { display: none; }
    .gallery-day-heading {
      display: flex;
      margin: 0 0 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e5e5;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .gallery-day-heading h3 {
      margin: 0;
      color: #444444;
      font-size: 16px;
      line-height: 22px;
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
    }
    .gallery-item {
      position: relative;
      display: block;
      width: 100%;
      padding: 0;
      overflow: hidden;
      aspect-ratio: 1;
      border: 1px solid #d8d8d8;
      border-radius: 3px;
      color: #ffffff;
      background: #e9ecef;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .08);
    }
    .gallery-item:hover, .gallery-item:focus { border-color: #0088cc; }
    .gallery-item:focus-visible { outline: 3px solid rgba(0, 136, 204, .45); outline-offset: 2px; }
    .gallery-thumb {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #e9ecef;
    }
    .gallery-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4f5962;
      background: #e9ecef;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .04em;
    }
    .gallery-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 1;
      padding: 1px 5px;
      border-radius: 3px;
      color: #ffffff;
      background: rgba(0, 0, 0, .72);
      box-shadow: 0 1px 2px rgba(0, 0, 0, .25);
      font-size: 10px;
      font-weight: 700;
      line-height: 16px;
    }
    .gallery-video-badge {
      top: auto;
      right: 6px;
      bottom: 6px;
      left: auto;
      font-size: 15px;
    }
    .gallery-dialog {
      width: min(960px, calc(100vw - 24px));
      max-width: none;
      height: min(820px, calc(100vh - 24px));
      height: min(820px, calc(100dvh - 24px));
      max-height: none;
      padding: 0;
      overflow: hidden;
      border: 0;
      border-radius: 6px;
      color: #ffffff;
      background: #171717;
      box-shadow: 0 18px 60px rgba(0, 0, 0, .45);
    }
    .gallery-dialog::backdrop { background: rgba(0, 0, 0, .78); }
    .gallery-dialog-shell { display: flex; height: 100%; flex-direction: column; }
    .gallery-dialog-topbar {
      display: flex;
      min-height: 48px;
      padding: 8px 10px 8px 16px;
      border-bottom: 1px solid #333333;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .gallery-dialog-title {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gallery-dialog-close {
      min-width: 44px;
      min-height: 44px;
      padding: 4px 9px;
      border-color: #666666;
      color: #ffffff;
      background: #333333;
      background-image: none;
      text-shadow: none;
    }
    .gallery-dialog-close:hover, .gallery-dialog-close:focus { color: #ffffff; background: #444444; }
    .gallery-stage {
      position: relative;
      display: flex;
      min-height: 0;
      flex: 1;
      align-items: center;
      justify-content: center;
      background: #0b0b0b;
    }
    .gallery-stage-media {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .gallery-stage-empty {
      padding: 24px;
      color: #bbbbbb;
      font-size: 14px;
      line-height: 22px;
      text-align: center;
    }
    .gallery-nav {
      position: absolute;
      top: 50%;
      z-index: 2;
      width: 42px;
      height: 54px;
      margin-top: -27px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      color: #ffffff;
      background: rgba(0, 0, 0, .48);
      cursor: pointer;
      font-size: 28px;
      line-height: 54px;
      text-align: center;
    }
    .gallery-nav:hover, .gallery-nav:focus { background: rgba(0, 0, 0, .7); }
    .gallery-nav:disabled { display: none; }
    .gallery-nav-prev { left: 10px; }
    .gallery-nav-next { right: 10px; }
    .gallery-dialog-footer {
      display: flex;
      min-height: 68px;
      padding: 10px 14px;
      border-top: 1px solid #333333;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .gallery-meta { min-width: 0; }
    .gallery-meta-primary {
      overflow: hidden;
      color: #ffffff;
      font-size: 13px;
      line-height: 19px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gallery-meta-secondary { color: #aaaaaa; font-size: 12px; line-height: 18px; }
    .gallery-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
    .gallery-download { flex: 0 0 auto; }
    .gallery-delete {
      border-color: #9d2d2d;
      color: #ffffff;
      background: #7e2525;
      background-image: none;
      text-shadow: none;
    }
    .gallery-delete:hover, .gallery-delete:focus { color: #ffffff; background: #9d2d2d; }
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
    @media (max-width: 979px) {
      .gallery-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
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
      .gallery-well { padding: 12px; }
      .section-heading { align-items: flex-start; }
      .gallery-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; }
      .gallery-days { gap: 20px; }
      .gallery-dialog {
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        max-width: none;
        max-height: none;
        border-radius: 0;
      }
      .gallery-dialog-topbar {
        padding-top: max(8px, env(safe-area-inset-top));
        padding-right: max(10px, env(safe-area-inset-right));
        padding-left: max(16px, env(safe-area-inset-left));
      }
      .gallery-dialog-footer {
        min-height: 76px;
        padding-top: 9px;
        padding-right: max(10px, env(safe-area-inset-right));
        padding-bottom: max(9px, env(safe-area-inset-bottom));
        padding-left: max(10px, env(safe-area-inset-left));
        gap: 8px;
      }
      .gallery-nav { width: 44px; height: 52px; margin-top: -26px; line-height: 52px; }
      .gallery-nav-prev { left: max(4px, env(safe-area-inset-left)); }
      .gallery-nav-next { right: max(4px, env(safe-area-inset-right)); }
    }
    /* Gallery-first application shell */
    [hidden] { display: none !important; }
    :root {
      --app-bg: #f7f8f6;
      --app-surface: #ffffff;
      --app-text: #18211b;
      --app-muted: #68716b;
      --app-line: #e4e8e4;
      --app-accent: #16834a;
      --app-accent-strong: #0e6b3b;
      --app-accent-soft: #e8f5ed;
      --app-shadow: 0 18px 50px rgba(24, 33, 27, .14);
    }
    body {
      min-height: 100vh;
      color: var(--app-text);
      background: var(--app-bg);
      font-family: "Avenir Next", Avenir, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    body:has(dialog[open]) { overflow: hidden; }
    button { -webkit-tap-highlight-color: transparent; }
    .auth-gate {
      min-height: 100vh;
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: max(32px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom));
      background:
        radial-gradient(circle at 50% 20%, rgba(22, 131, 74, .11), transparent 34%),
        var(--app-bg);
    }
    .auth-card {
      width: min(100%, 390px);
      text-align: center;
    }
    .auth-mark {
      display: grid;
      width: 64px;
      height: 64px;
      margin: 0 auto 22px;
      border: 1px solid rgba(22, 131, 74, .22);
      border-radius: 18px;
      place-items: center;
      color: #ffffff;
      background: var(--app-accent);
      box-shadow: 0 14px 30px rgba(22, 131, 74, .24);
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -.08em;
    }
    .auth-card h1 {
      margin: 0;
      font-size: clamp(30px, 8vw, 38px);
      font-weight: 750;
      line-height: 1.15;
      letter-spacing: -.04em;
    }
    .auth-lead {
      margin: 14px auto 28px;
      color: var(--app-muted);
      font-size: 15px;
      line-height: 1.8;
    }
    .primary-action, .secondary-action, .quiet-action, .danger-action {
      min-height: 46px;
      padding: 11px 18px;
      border: 0;
      border-radius: 12px;
      cursor: pointer;
      font-weight: 700;
      line-height: 1.3;
    }
    .primary-action {
      color: #ffffff;
      background: var(--app-accent);
      box-shadow: 0 8px 20px rgba(22, 131, 74, .2);
    }
    .primary-action:hover, .primary-action:focus-visible { background: var(--app-accent-strong); }
    .primary-action:disabled, .danger-action:disabled { opacity: .48; cursor: not-allowed; box-shadow: none; }
    .secondary-action { color: var(--app-text); background: #eef1ee; }
    .secondary-action:hover, .secondary-action:focus-visible { background: #e4e9e5; }
    .danger-action { color: #ffffff; background: #b52b2b; }
    .danger-action:hover, .danger-action:focus-visible { background: #902020; }
    .quiet-action {
      min-height: 40px;
      padding: 8px 12px;
      color: var(--app-muted);
      background: transparent;
    }
    .quiet-action:hover, .quiet-action:focus-visible { color: var(--app-text); background: #edf0ed; }
    .auth-login-button { width: 100%; }
    .auth-note { margin: 16px 0 0; color: #8a928d; font-size: 12px; line-height: 1.7; }
    .app-header {
      position: sticky;
      top: 0;
      z-index: 20;
      border-bottom: 1px solid rgba(228, 232, 228, .9);
      background: rgba(255, 255, 255, .9);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    .app-header-inner {
      display: flex;
      width: min(100%, 1240px);
      min-height: 64px;
      margin: 0 auto;
      padding: 0 20px;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .app-brand {
      color: var(--app-text);
      font-size: 19px;
      font-weight: 800;
      letter-spacing: -.03em;
    }
    .app-brand:hover, .app-brand:focus { color: var(--app-text); text-decoration: none; }
    .user-menu-wrap { position: relative; }
    .user-menu-button {
      display: grid;
      width: 44px;
      height: 44px;
      padding: 0;
      overflow: hidden;
      border: 1px solid #d9dfda;
      border-radius: 50%;
      place-items: center;
      color: var(--app-accent-strong);
      background: var(--app-accent-soft);
      cursor: pointer;
      font-weight: 800;
    }
    .user-menu-button:hover, .user-menu-button:focus-visible { border-color: var(--app-accent); }
    .user-avatar-image { width: 100%; height: 100%; object-fit: cover; }
    .user-menu-popover {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      z-index: 30;
      width: min(300px, calc(100vw - 32px));
      padding: 14px;
      border: 1px solid var(--app-line);
      border-radius: 16px;
      background: #ffffff;
      box-shadow: var(--app-shadow);
    }
    .user-menu-name { margin: 0; font-size: 15px; font-weight: 750; line-height: 1.5; }
    .user-menu-meta { margin: 3px 0 12px; color: var(--app-muted); font-size: 12px; line-height: 1.5; }
    .user-menu-actions { display: grid; gap: 8px; }
    .gallery-main {
      width: min(100%, 1240px);
      margin: 0 auto;
      padding: 28px 20px max(120px, calc(88px + env(safe-area-inset-bottom)));
    }
    .gallery-heading {
      display: flex;
      margin-bottom: 18px;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .gallery-heading h1 {
      margin: 0;
      font-size: clamp(24px, 4vw, 32px);
      font-weight: 760;
      line-height: 1.2;
      letter-spacing: -.04em;
    }
    .gallery-summary { margin: 0; color: var(--app-muted); font-size: 13px; }
    .gallery-summary:focus { outline: 2px solid var(--app-green); outline-offset: 4px; border-radius: 4px; }
    .album-count { color: inherit; background: transparent; padding: 0; font-size: inherit; font-weight: 700; }
    .gallery-days { display: grid; gap: 30px; }
    .gallery-day-heading {
      position: sticky;
      top: 64px;
      z-index: 5;
      margin: 0 0 10px;
      padding: 10px 0 8px;
      border: 0;
      background: rgba(247, 248, 246, .92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .gallery-day-heading h3 { color: var(--app-text); font-size: 14px; font-weight: 750; }
    .gallery-day-heading .muted { color: var(--app-muted); font-size: 12px; }
    .gallery-day-actions { display: flex; align-items: center; gap: 8px; }
    .day-message-button {
      min-height: 36px;
      padding: 7px 10px;
      border: 1px solid #d7ddd8;
      border-radius: 10px;
      color: var(--app-accent-strong);
      background: #ffffff;
      cursor: pointer;
      font-size: 12px;
      font-weight: 750;
      line-height: 1.2;
      white-space: nowrap;
    }
    .day-message-button:hover, .day-message-button:focus-visible { border-color: #9bc6ac; background: var(--app-accent-soft); }
    .gallery-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; }
    .gallery-item {
      border: 0;
      border-radius: 8px;
      background: #e6eae7;
      box-shadow: none;
    }
    .gallery-item:hover, .gallery-item:focus { border: 0; filter: brightness(.96); }
    .gallery-item:focus-visible { outline: 3px solid rgba(22, 131, 74, .45); outline-offset: 2px; }
    .gallery-placeholder { color: #657068; background: #e6eae7; font-size: 11px; }
    .gallery-badge { top: 7px; left: 7px; border-radius: 4px; box-shadow: none; }
    .gallery-more { margin-top: 28px; }
    .empty-gallery {
      min-height: 44vh;
      display: grid;
      padding: 42px 24px;
      border: 1px dashed #cfd6d0;
      border-radius: 18px;
      place-items: center;
      color: var(--app-muted);
      text-align: center;
    }
    .empty-gallery strong { display: block; margin-bottom: 7px; color: var(--app-text); font-size: 17px; }
    .footer-note { margin: 34px 0 0; color: #929a95; }
    .fab {
      position: fixed;
      right: max(22px, env(safe-area-inset-right));
      bottom: max(22px, calc(14px + env(safe-area-inset-bottom)));
      z-index: 24;
      display: grid;
      width: 60px;
      height: 60px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      place-items: center;
      color: #ffffff;
      background: var(--app-accent);
      box-shadow: 0 14px 30px rgba(22, 131, 74, .34);
      cursor: pointer;
    }
    .fab-icon {
      display: block;
      width: 32px;
      height: 32px;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      pointer-events: none;
    }
    .fab:hover, .fab:focus-visible { background: var(--app-accent-strong); transform: translateY(-2px); }
    .fab:active { transform: translateY(0); }
    .status-toast {
      position: fixed;
      top: calc(76px + env(safe-area-inset-top));
      left: 50%;
      z-index: 60;
      width: min(calc(100vw - 32px), 560px);
      min-height: 0;
      margin: 0;
      padding: 11px 14px;
      transform: translateX(-50%);
      overflow: visible;
      border: 1px solid #cfd8d1;
      border-radius: 12px;
      color: var(--app-text);
      background: rgba(255, 255, 255, .96);
      box-shadow: 0 10px 30px rgba(24, 33, 27, .16);
      font-family: inherit;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .status-toast[data-tone="error"] { border-color: #efb9b9; color: #8f2525; background: #fff6f6; }
    .upload-sheet, .settings-dialog {
      width: min(520px, calc(100vw - 24px));
      max-width: none;
      max-height: min(760px, calc(100dvh - 24px));
      padding: 0;
      overflow: hidden auto;
      border: 0;
      border-radius: 22px;
      color: var(--app-text);
      background: var(--app-surface);
      box-shadow: var(--app-shadow);
    }
    .upload-sheet::backdrop, .settings-dialog::backdrop { background: rgba(16, 23, 18, .48); backdrop-filter: blur(2px); }
    .confirm-dialog {
      width: min(420px, calc(100vw - 32px));
      max-width: none;
      padding: 0;
      overflow: hidden;
      border: 0;
      border-radius: 18px;
      color: var(--app-text);
      background: var(--app-surface);
      box-shadow: var(--app-shadow);
    }
    .confirm-dialog::backdrop { background: rgba(16, 23, 18, .64); backdrop-filter: blur(3px); }
    .confirm-body { padding: 24px; }
    .confirm-body h2 { margin: 0; font-size: 21px; line-height: 1.35; letter-spacing: -.03em; }
    .confirm-description { margin: 10px 0 0; color: var(--app-muted); font-size: 14px; line-height: 1.65; }
    .confirm-filename {
      margin: 18px 0 0;
      padding: 12px 14px;
      overflow: hidden;
      border-radius: 10px;
      background: #f1f3f1;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.5;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .confirm-actions { display: grid; grid-template-columns: 1fr 1fr; margin-top: 22px; gap: 10px; }
    .sheet-body { padding: 8px 24px max(24px, calc(18px + env(safe-area-inset-bottom))); }
    .sheet-handle { width: 42px; height: 5px; margin: 4px auto 18px; border-radius: 3px; background: #d8ddd9; }
    .sheet-header { display: flex; margin-bottom: 18px; align-items: flex-start; justify-content: space-between; gap: 14px; }
    .sheet-header h2 { margin: 0; font-size: 22px; line-height: 1.3; letter-spacing: -.03em; }
    .sheet-header p { margin: 5px 0 0; color: var(--app-muted); font-size: 13px; line-height: 1.6; }
    .sheet-close {
      flex: 0 0 auto;
      width: 42px;
      height: 42px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      color: var(--app-muted);
      background: #eef1ee;
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
    }
    .upload-sheet input[type="file"] {
      width: 100%;
      margin: 0 0 10px;
      padding: 16px;
      border: 1px dashed #b8c5bb;
      border-radius: 14px;
      background: #f7faf8;
      box-shadow: none;
    }
    .upload-sheet input[type="file"]::file-selector-button {
      margin-right: 12px;
      padding: 9px 12px;
      border: 0;
      border-radius: 9px;
      color: var(--app-text);
      background: #e8eeea;
      font-weight: 700;
    }
    .file-selection { min-height: 21px; margin: 0 0 18px; color: var(--app-muted); font-size: 12px; line-height: 1.6; }
    .sheet-actions { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
    .settings-dialog .sheet-body { padding-top: 18px; }
    .settings-dialog .form-control { min-height: 44px; border-color: #cfd6d0; border-radius: 10px; }
    .settings-dialog .checkbox-row { align-items: flex-start; line-height: 1.5; }
    .trash-note { margin: 0 0 16px; color: var(--app-muted); font-size: 13px; line-height: 1.65; }
    .trash-list { display: grid; gap: 10px; }
    .trash-more { margin-top: 14px; text-align: center; }
    .trash-empty { padding: 28px 16px; border: 1px dashed #cfd6d0; border-radius: 14px; color: var(--app-muted); text-align: center; }
    .trash-item {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr) auto;
      padding: 10px;
      align-items: center;
      gap: 12px;
      border: 1px solid var(--app-line);
      border-radius: 14px;
      background: #ffffff;
    }
    .trash-thumb-wrap { position: relative; width: 72px; height: 72px; overflow: hidden; border-radius: 10px; background: #e6eae7; }
    .trash-thumb { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .trash-placeholder { display: grid; width: 100%; height: 100%; place-items: center; color: #657068; font-size: 10px; font-weight: 800; }
    .trash-copy { min-width: 0; }
    .trash-name { overflow: hidden; margin: 0; font-size: 13px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
    .trash-meta { margin: 4px 0 0; color: var(--app-muted); font-size: 11px; line-height: 1.45; }
    .trash-restore { white-space: nowrap; }
    .message-dialog { overflow: hidden; }
    .message-dialog .sheet-body {
      display: flex;
      min-height: min(620px, calc(100dvh - 48px));
      max-height: min(760px, calc(100dvh - 24px));
      flex-direction: column;
    }
    .message-context {
      margin: -10px 0 14px;
      padding: 10px 12px;
      overflow: hidden;
      border-radius: 10px;
      color: var(--app-muted);
      background: #f3f5f3;
      font-size: 12px;
      line-height: 1.5;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .message-list {
      display: grid;
      min-height: 0;
      padding: 2px 2px 16px;
      overflow-y: auto;
      align-content: start;
      flex: 1;
      gap: 12px;
      overscroll-behavior: contain;
    }
    .message-empty {
      display: grid;
      min-height: 180px;
      padding: 28px 16px;
      border: 1px dashed #cfd6d0;
      border-radius: 14px;
      place-items: center;
      color: var(--app-muted);
      font-size: 13px;
      line-height: 1.7;
      text-align: center;
    }
    .message-item { display: grid; grid-template-columns: 36px minmax(0, 1fr); align-items: start; gap: 10px; }
    .message-avatar {
      display: grid;
      width: 36px;
      height: 36px;
      overflow: hidden;
      border-radius: 50%;
      place-items: center;
      color: var(--app-accent-strong);
      background: var(--app-accent-soft);
      font-size: 13px;
      font-weight: 800;
    }
    .message-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .message-copy { min-width: 0; }
    .message-meta { display: flex; margin-bottom: 4px; align-items: baseline; gap: 7px; }
    .message-author { margin: 0; overflow: hidden; font-size: 12px; font-weight: 780; text-overflow: ellipsis; white-space: nowrap; }
    .message-time { color: var(--app-muted); font-size: 10px; white-space: nowrap; }
    .message-body {
      margin: 0;
      padding: 10px 12px;
      border-radius: 4px 14px 14px 14px;
      color: var(--app-text);
      background: #f0f3f0;
      font-size: 14px;
      line-height: 1.65;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .message-item[data-mine="true"] .message-body { background: var(--app-accent-soft); }
    .message-form { padding-top: 14px; border-top: 1px solid var(--app-line); }
    .message-input {
      display: block;
      width: 100%;
      min-height: 84px;
      padding: 12px 13px;
      resize: vertical;
      border: 1px solid #cbd3cc;
      border-radius: 13px;
      color: var(--app-text);
      background: #ffffff;
      font: inherit;
      line-height: 1.55;
    }
    .message-input:focus { border-color: var(--app-accent); outline: 3px solid rgba(22, 131, 74, .14); }
    .message-form-footer { display: flex; margin-top: 9px; align-items: center; justify-content: space-between; gap: 12px; }
    .message-character-count { color: var(--app-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
    .message-submit { min-width: 96px; }
    .pswp {
      --pswp-bg: #070907;
      --pswp-placeholder-bg: #151815;
      --pswp-icon-color: #ffffff;
      --pswp-icon-color-secondary: #101310;
      --pswp-icon-stroke-color: rgba(0, 0, 0, .64);
      --pswp-icon-stroke-width: 1.5px;
      font-family: "Avenir Next", Avenir, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif;
    }
    .pswp__top-bar {
      height: calc(58px + env(safe-area-inset-top));
      padding-top: env(safe-area-inset-top);
      padding-right: max(4px, env(safe-area-inset-right));
      padding-left: max(4px, env(safe-area-inset-left));
      background: linear-gradient(to bottom, rgba(0, 0, 0, .72), rgba(0, 0, 0, 0));
    }
    .pswp__button {
      width: 48px;
      height: 52px;
      border-radius: 50%;
    }
    .pswp__button:focus-visible {
      outline: 2px solid #8ed4ae;
      outline-offset: -4px;
    }
    .pswp__button .pswp__icn { top: 10px; left: 8px; }
    .pswp__counter {
      height: 32px;
      margin-top: 10px;
      margin-right: auto;
      margin-left: 14px;
      padding: 0 10px;
      border-radius: 16px;
      color: #ffffff;
      background: rgba(0, 0, 0, .28);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      line-height: 32px;
      text-shadow: none;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .pswp__button--trash-media { color: #ffd9d9; }
    .pswp__button--trash-media .pswp__icn { fill: #ffd9d9; }
    .pswp__gallery-caption {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 10;
      display: flex;
      min-height: 116px;
      padding: 58px max(22px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(22px, env(safe-area-inset-left));
      align-items: flex-end;
      color: #ffffff;
      background: linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, .78));
      pointer-events: none;
    }
    .viewer-caption-inner { min-width: 0; max-width: min(760px, calc(100vw - 44px)); }
    .viewer-caption-name {
      overflow: hidden;
      margin: 0;
      font-size: 14px;
      font-weight: 750;
      line-height: 1.45;
      text-overflow: ellipsis;
      text-shadow: 0 1px 5px rgba(0, 0, 0, .75);
      white-space: nowrap;
    }
    .viewer-caption-meta {
      margin: 4px 0 0;
      color: rgba(255, 255, 255, .76);
      font-size: 12px;
      line-height: 1.45;
      text-shadow: 0 1px 4px rgba(0, 0, 0, .8);
    }
    .pswp-video-shell {
      display: grid;
      width: 100%;
      height: 100%;
      place-items: center;
      background: #070907;
    }
    .pswp-video {
      display: block;
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      background: #000000;
    }
    @media (max-width: 979px) {
      .gallery-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    @media (max-width: 767px) {
      .app-header-inner { min-height: 58px; padding-right: 14px; padding-left: 16px; }
      .gallery-main { padding: 16px 0 max(112px, calc(82px + env(safe-area-inset-bottom))); }
      .gallery-heading { margin-bottom: 12px; padding: 0 16px; align-items: center; }
      .gallery-heading .quiet-action { display: none; }
      .gallery-days { gap: 22px; }
      .gallery-day-heading { top: 58px; margin-bottom: 3px; padding: 9px 16px 7px; }
      .gallery-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; }
      .gallery-item { border-radius: 2px; }
      .gallery-more, .footer-note { padding-right: 16px; padding-left: 16px; }
      .empty-gallery { margin: 0 16px; min-height: 52vh; }
      .upload-sheet, .settings-dialog {
        width: 100%;
        max-height: calc(100dvh - 20px);
        margin: auto 0 0;
        border-radius: 22px 22px 0 0;
      }
      .sheet-body { padding-right: 18px; padding-left: 18px; }
      .message-dialog .sheet-body { min-height: calc(100dvh - 20px); max-height: calc(100dvh - 20px); }
      .message-list { padding-bottom: 12px; }
      .fab { right: max(18px, env(safe-area-inset-right)); }
      .trash-item { grid-template-columns: 58px minmax(0, 1fr); }
      .trash-thumb-wrap { width: 58px; height: 58px; }
      .trash-restore { grid-column: 1 / -1; width: 100%; }
      .pswp__top-bar { height: calc(54px + env(safe-area-inset-top)); }
      .pswp__button { width: 46px; height: 48px; }
      .pswp__button .pswp__icn { top: 8px; left: 7px; }
      .pswp__counter { margin-top: 8px; margin-left: 8px; }
      .pswp__gallery-caption {
        min-height: 104px;
        padding-top: 48px;
        padding-right: max(16px, env(safe-area-inset-right));
        padding-bottom: max(16px, env(safe-area-inset-bottom));
        padding-left: max(16px, env(safe-area-inset-left));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
    }
  </style>
</head>
<body>
<section id="authGate" class="auth-gate" aria-labelledby="authTitle">
  <div class="auth-card">
    <div class="auth-mark" aria-hidden="true">ま</div>
    <h1 id="authTitle">まるのこし</h1>
    <p class="auth-lead">家族の写真と動画を、画質ごと残すアルバムです。<br />LINEで本人確認して開きます。</p>
    <button id="loginButton" class="primary-action auth-login-button" type="button" disabled>LINEでアルバムを開く</button>
    <p class="auth-note">原本は再圧縮せず、家族専用の保存領域に保管します。</p>
  </div>
</section>

<div id="appShell" hidden>
  <header class="app-header">
    <div class="app-header-inner">
      <a class="app-brand" href="/">まるのこし</a>
      <div class="user-menu-wrap">
        <button id="userMenuButton" class="user-menu-button" type="button" aria-label="アカウントメニューを開く" aria-haspopup="menu" aria-expanded="false">
          <img id="userAvatarImage" class="user-avatar-image" alt="" hidden />
          <span id="userAvatarFallback" aria-hidden="true">ま</span>
        </button>
        <div id="userMenuPopover" class="user-menu-popover" role="menu" hidden>
          <p id="userText" class="user-menu-name">LINE user</p>
          <p id="userMeta" class="user-menu-meta">家族アルバム</p>
          <div class="user-menu-actions">
            <button id="trashButton" class="secondary-action" type="button" role="menuitem" hidden>ゴミ箱</button>
            <button id="logoutButton" class="secondary-action" type="button" role="menuitem">ログアウト</button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <main class="gallery-main">
    <section id="album" aria-labelledby="albumTitle">
      <div class="gallery-heading">
        <div>
          <h1 id="albumTitle" class="visually-hidden" tabindex="-1">家族アルバム</h1>
          <p id="albumSummary" class="gallery-summary" tabindex="-1"><span id="albumCount" class="album-count" role="status" aria-live="polite" aria-label="表示件数 0件">0件</span>を保存しています</p>
        </div>
        <button id="loadMediaButton" class="quiet-action" type="button">一覧を更新</button>
      </div>
      <div id="galleryDays" class="gallery-days"></div>
      <div class="gallery-more">
        <button id="loadMoreMediaButton" class="secondary-action" type="button" hidden>さらに読み込む</button>
      </div>
    </section>
    <p class="footer-note">写真・動画の原本をそのまま保存しています。</p>
  </main>

  <button id="addMediaButton" class="fab" type="button" aria-label="写真・動画を追加" hidden>
    <svg class="fab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  </button>
</div>

<div id="status" class="status-toast" role="status" aria-live="polite" hidden>起動中...</div>

<dialog id="uploadDrawer" class="upload-sheet" aria-modal="true" aria-labelledby="uploadTitle">
  <div class="sheet-body">
    <div class="sheet-handle" aria-hidden="true"></div>
    <header class="sheet-header">
      <div>
        <h2 id="uploadTitle">写真・動画を追加</h2>
        <p>LINEトークではなく、ここから選ぶと原本画質で保存されます。</p>
      </div>
      <button id="uploadDrawerCloseButton" class="sheet-close" type="button" aria-label="追加画面を閉じる">×</button>
    </header>
    <input id="fileInput" type="file" multiple accept="image/*,video/*,.dng,.DNG,.arw,.ARW" aria-label="保存する写真・動画を選択" />
    <p id="fileSelectionText" class="file-selection">ファイルを選択してください</p>
    <div class="sheet-actions">
      <button id="uploadCancelButton" class="secondary-action" type="button">キャンセル</button>
      <button id="uploadButton" class="primary-action" type="button" disabled>原本をアップロード</button>
    </div>
  </div>
</dialog>

<dialog id="groupSetupPanel" class="settings-dialog" aria-modal="true" aria-labelledby="groupSetupTitle">
  <div class="sheet-body">
    <header class="sheet-header">
      <div>
        <h2 id="groupSetupTitle">LINEグループを連携</h2>
        <p id="groupSetupDescription">グループを家族アルバムへ紐づけます。</p>
      </div>
      <button id="groupSetupCloseButton" class="sheet-close" type="button" aria-label="グループ設定を閉じる">×</button>
    </header>
    <div class="form-row">
      <label for="groupFamilySelect">連携するアルバム</label>
      <select id="groupFamilySelect" class="form-control"></select>
    </div>
    <div class="form-row">
      <label for="groupRoleSelect">グループメンバーの権限</label>
      <select id="groupRoleSelect" class="form-control">
        <option value="viewer">閲覧のみ</option>
        <option value="uploader">閲覧・編集</option>
      </select>
    </div>
    <label class="checkbox-row" for="groupNotificationsEnabled">
      <input id="groupNotificationsEnabled" type="checkbox" checked />
      新しいアップロードを写真と投稿者名つきで通知する
    </label>
    <button id="groupBindButton" class="primary-action" type="button">この設定で連携</button>
    <p id="groupSetupResult" class="group-setup-result muted"></p>
  </div>
</dialog>

<dialog id="trashDialog" class="settings-dialog" aria-modal="true" aria-labelledby="trashTitle">
  <div class="sheet-body">
    <header class="sheet-header">
      <div>
        <h2 id="trashTitle">ゴミ箱</h2>
        <p>アルバムから外した写真・動画を復元できます。</p>
      </div>
      <button id="trashCloseButton" class="sheet-close" type="button" aria-label="ゴミ箱を閉じる">×</button>
    </header>
    <p class="trash-note">ゴミ箱の原本とプレビューは期限なく保持され、自動で完全削除されません。</p>
    <div id="trashList" class="trash-list" aria-live="polite"></div>
    <div class="trash-more"><button id="trashLoadMoreButton" class="secondary-action" type="button" hidden>さらに読み込む</button></div>
  </div>
</dialog>

<dialog id="messageDialog" class="settings-dialog message-dialog" aria-modal="true" aria-labelledby="messageTitle" aria-describedby="messageContext">
  <div class="sheet-body">
    <header class="sheet-header">
      <div>
        <h2 id="messageTitle">メッセージ</h2>
        <p>家族だけで共有されます。</p>
      </div>
      <button id="messageCloseButton" class="sheet-close" type="button" aria-label="メッセージを閉じる">×</button>
    </header>
    <p id="messageContext" class="message-context"></p>
    <div id="messageList" class="message-list" aria-live="polite" aria-busy="false"></div>
    <form id="messageForm" class="message-form">
      <label class="visually-hidden" for="messageBody">メッセージ本文</label>
      <textarea id="messageBody" class="message-input" rows="3" maxlength="500" placeholder="この思い出についてメッセージを残す"></textarea>
      <div class="message-form-footer">
        <span id="messageCharacterCount" class="message-character-count">0 / 500</span>
        <button id="messageSubmitButton" class="primary-action message-submit" type="submit" disabled>送信</button>
      </div>
    </form>
  </div>
</dialog>

<dialog id="galleryDialog" class="gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="galleryTitle">
  <div class="gallery-dialog-shell">
    <header class="gallery-dialog-topbar">
      <h2 id="galleryTitle" class="gallery-dialog-title">プレビュー</h2>
      <button id="galleryCloseButton" class="btn gallery-dialog-close" type="button" aria-label="プレビューを閉じる">閉じる</button>
    </header>
    <div id="galleryStage" class="gallery-stage">
      <button id="galleryPrevButton" class="gallery-nav gallery-nav-prev" type="button" aria-label="前の写真">‹</button>
      <button id="galleryNextButton" class="gallery-nav gallery-nav-next" type="button" aria-label="次の写真">›</button>
    </div>
    <footer class="gallery-dialog-footer">
      <div class="gallery-meta">
        <div id="galleryMetaPrimary" class="gallery-meta-primary"></div>
        <div id="galleryMetaSecondary" class="gallery-meta-secondary"></div>
      </div>
      <div class="gallery-actions">
        <button id="galleryMessageButton" class="btn" type="button">メッセージ</button>
        <button id="galleryDeleteButton" class="btn gallery-delete" type="button" hidden>ゴミ箱へ</button>
        <button id="galleryDownloadButton" class="btn btn-primary gallery-download" type="button">原本DL</button>
      </div>
    </footer>
  </div>
</dialog>

<dialog id="deleteMediaDialog" class="confirm-dialog" aria-modal="true" aria-labelledby="deleteMediaTitle" aria-describedby="deleteMediaDescription deleteMediaName">
  <div class="confirm-body">
    <h2 id="deleteMediaTitle">ゴミ箱へ移動しますか？</h2>
    <p id="deleteMediaDescription" class="confirm-description">原本とプレビューは期限なく保持され、いつでも復元できます。</p>
    <p id="deleteMediaName" class="confirm-filename"></p>
    <div class="confirm-actions">
      <button id="deleteMediaCancelButton" class="secondary-action" type="button">キャンセル</button>
      <button id="deleteMediaConfirmButton" class="danger-action" type="button">ゴミ箱へ移動</button>
    </div>
  </div>
</dialog>
<script type="module">
function getAppSearchParams() {
  const params = new URLSearchParams(window.location.search);
  const liffState = params.get('liff.state');
  if (!liffState) return params;
  const queryStart = liffState.indexOf('?');
  const nestedQuery = queryStart >= 0
    ? liffState.slice(queryStart + 1)
    : (liffState.charAt(0) === '?' ? liffState.slice(1) : liffState);
  const nested = new URLSearchParams(nestedQuery);
  for (const [key, value] of nested.entries()) {
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

const appParams = getAppSearchParams();
const state = {
  config: null,
  session: null,
  familyId: null,
  liffReady: false,
  canUpload: false,
  groupBindToken: appParams.get('groupBind'),
  groupBindingId: appParams.get('groupBinding'),
  pendingGroup: null,
  assets: [],
  trashAssets: [],
  trashLoading: false,
  trashOffset: 0,
  trashHasMore: false,
  activeAssetId: null,
  deleteInProgress: false,
  mediaOffset: 0,
  totalCount: 0,
  mediaHasMore: false,
  messageTarget: null,
  messages: [],
  messageLoading: false,
  messageSubmitting: false,
  messageReturnFocus: null,
  messageRequestSequence: 0,
  messageViewer: null,
  reopenViewerAfterMessageDialogId: null,
};
const $ = (id) => document.getElementById(id);
const previewDimensions = new Map();
let mediaViewer = null;
let mediaViewerPromise = null;
let viewerDeleteRequestId = null;
let reopenViewerAfterDeleteDialogId = null;
let statusTimer = null;
function setStatus(message, append = false) {
  const node = $('status');
  node.textContent = append && node.textContent ? node.textContent + '\\n' + message : message;
  node.dataset.tone = /ERROR|失敗|できません|未設定/.test(node.textContent) ? 'error' : 'normal';
  node.hidden = false;
  if (statusTimer) window.clearTimeout(statusTimer);
  if (node.dataset.tone !== 'error') {
    statusTimer = window.setTimeout(() => { node.hidden = true; }, 4200);
  }
}
const status = (message) => setStatus(message);
const appendStatus = (message) => setStatus(message, true);

async function api(path, options = {}) {
  const res = await fetch(path, { credentials: 'include', ...options, headers: { ...(options.headers || {}) } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.message || res.statusText);
  return data;
}

async function gatewayApi(path, options = {}) {
  const res = await fetch(path, { credentials: 'omit', ...options, headers: { ...(options.headers || {}) } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const error = new Error(data?.error || data?.message || res.statusText || 'NASへの保存に失敗しました');
    error.status = res.status;
    throw error;
  }
  return data;
}

function showAuthenticatedUi(canUpload) {
  $('authGate').hidden = true;
  $('appShell').hidden = false;
  $('addMediaButton').hidden = !canUpload;
}

function showLoginUi() {
  $('authGate').hidden = false;
  $('appShell').hidden = true;
  $('addMediaButton').hidden = true;
}

function openDialog(dialog) {
  if (!dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
}

function closeDialog(dialog) {
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

async function finishLogin() {
  if (state.groupBindToken) {
    await loadPendingGroupSetup().catch((error) => {
      openDialog($('groupSetupPanel'));
      $('groupSetupResult').textContent = '設定を読み込めません: ' + error.message;
    });
  }
  await loadMedia();
}

async function boot() {
  showLoginUi();
  state.config = await api('/api/config');

  try {
    const session = await api('/api/auth/session');
    if (!state.groupBindingId || session.groupBindingId === state.groupBindingId) {
      applySession(session);
      await finishLogin();
      return;
    }
  } catch {
    // No browser session yet. Continue with LINE Login.
  }

  if (!state.config.liffId) {
    status('LIFF IDが未設定です。管理者へ連絡してください。');
    return;
  }
  if (!window.liff) {
    status('LIFF SDKを読み込めませんでした。');
    return;
  }
  await window.liff.init({ liffId: state.config.liffId });
  state.liffReady = true;
  $('loginButton').disabled = false;
  if (!window.liff.isLoggedIn()) return;
  await loginWithLiff();
}

function applySession(session) {
  state.session = session;
  state.familyId = session.families?.[0]?.id || null;
  const family = session.families?.find((item) => item.id === state.familyId) || null;
  const roleLabels = { owner: '管理者', admin: '管理者', uploader: '閲覧・編集', viewer: '閲覧のみ' };
  const displayName = session.user?.displayName || 'LINE user';
  const roleLabel = family ? (roleLabels[family.role] || family.role) : '';
  const canUpload = Boolean(family && ['owner', 'admin', 'uploader'].includes(family.role));
  state.canUpload = canUpload;

  $('userText').textContent = displayName;
  $('userMeta').textContent = family ? family.name + ' ・ ' + roleLabel : '家族アルバム';
  $('albumTitle').textContent = family?.name || '家族アルバム';
  $('uploadButton').disabled = !canUpload || !$('fileInput').files?.length;
  $('trashButton').hidden = !canUpload;

  const avatarImage = $('userAvatarImage');
  const avatarFallback = $('userAvatarFallback');
  if (session.user?.pictureUrl) {
    avatarImage.src = session.user.pictureUrl;
    avatarImage.hidden = false;
    avatarFallback.hidden = true;
  } else {
    avatarImage.removeAttribute('src');
    avatarImage.hidden = true;
    avatarFallback.hidden = false;
    avatarFallback.textContent = displayName.trim().charAt(0) || 'ま';
  }
  $('userMenuButton').setAttribute('aria-label', displayName + 'のアカウントメニューを開く');
  showAuthenticatedUi(canUpload);
}

async function loginWithLiff() {
  if (!window.liff) throw new Error('LIFF SDKを読み込めませんでした。');
  if (!state.liffReady) {
    await window.liff.init({ liffId: state.config.liffId });
    state.liffReady = true;
  }
  if (!window.liff.isLoggedIn()) {
    window.liff.login();
    return;
  }
  const idToken = window.liff.getIDToken();
  if (!idToken) throw new Error('ID tokenを取得できませんでした。');
  const session = await api('/api/auth/line', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      idToken,
      groupBindingId: state.groupBindingId || undefined,
    }),
  });
  applySession(session);
  await finishLogin();
  status('アルバムを開きました');
}

async function ensureSession() {
  if (state.session && state.familyId) return;
  try {
    const session = await api('/api/auth/session');
    if (state.groupBindingId && session.groupBindingId !== state.groupBindingId) {
      await loginWithLiff();
      return;
    }
    applySession(session);
  } catch {
    await loginWithLiff();
  }
}

async function loadPendingGroupSetup() {
  const data = await api('/api/line-groups/pending/' + encodeURIComponent(state.groupBindToken));
  state.pendingGroup = data.group;
  openDialog($('groupSetupPanel'));
  $('groupSetupDescription').textContent = '「' + data.group.name + '」を、どのアルバムへ連携するか選んでください。';
  const select = $('groupFamilySelect');
  select.innerHTML = '';
  for (const family of data.families || []) {
    const option = document.createElement('option');
    option.value = family.id;
    option.textContent = family.name;
    select.appendChild(option);
  }
  if (state.familyId && [...select.options].some((option) => option.value === state.familyId)) {
    select.value = state.familyId;
  }
}

async function bindPendingGroup() {
  if (!state.groupBindToken || !state.pendingGroup) throw new Error('グループ設定情報がありません。');
  const button = $('groupBindButton');
  button.disabled = true;
  $('groupSetupResult').textContent = '連携中...';
  try {
    const familyId = $('groupFamilySelect').value;
    const result = await api('/api/line-groups/bind', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: state.groupBindToken,
        familyId,
        role: $('groupRoleSelect').value,
        notificationsEnabled: $('groupNotificationsEnabled').checked,
      }),
    });
    state.groupBindingId = result.group.id;
    state.familyId = familyId;
    $('groupSetupResult').textContent = '連携しました。グループへ確認メッセージを送信済みです。';
    button.textContent = '連携済み';
    window.setTimeout(() => closeDialog($('groupSetupPanel')), 900);
  } catch (error) {
    button.disabled = false;
    $('groupSetupResult').textContent = 'ERROR: ' + error.message;
    throw error;
  }
}

async function decodeImageFile(file) {
  if (typeof window.createImageBitmap === 'function') {
    try {
      const bitmap = await window.createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Safari can still decode formats such as HEIC through an <img> element.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function isRawFilename(filename) {
  const lower = String(filename || '').toLowerCase();
  return lower.endsWith('.dng') || lower.endsWith('.arw');
}

async function createNotificationPreview(file) {
  if (!file.type.startsWith('image/') || isRawFilename(file.name)) return null;
  let decoded;
  try {
    decoded = await decodeImageFile(file);
  } catch {
    return null;
  }

  try {
    let maxDimension = 1280;
    let quality = 0.82;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.source, 0, 0, width, height);
      const blob = await canvasToJpeg(canvas, quality);
      if (blob && blob.size <= 1000000) return blob;
      maxDimension = Math.max(480, Math.round(maxDimension * 0.78));
      quality = Math.max(0.5, quality - 0.1);
    }
    return null;
  } finally {
    decoded.cleanup();
  }
}

function updateFileSelection() {
  const files = [...$('fileInput').files];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  $('fileSelectionText').textContent = files.length
    ? files.length + '件 ・ ' + formatBytes(totalBytes)
    : 'ファイルを選択してください';
  $('uploadButton').disabled = !state.canUpload || files.length === 0;
}

function openUploadDrawer() {
  if (!state.canUpload) return;
  openDialog($('uploadDrawer'));
  window.setTimeout(() => $('fileInput').focus(), 0);
}

function closeUploadDrawer(clearSelection = false) {
  closeDialog($('uploadDrawer'));
  if (clearSelection) {
    $('fileInput').value = '';
    updateFileSelection();
  }
}

function toggleUserMenu(force) {
  const popover = $('userMenuPopover');
  const wasOpen = !popover.hidden;
  const isOpen = force ?? !wasOpen;
  popover.hidden = !isOpen;
  $('userMenuButton').setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    window.requestAnimationFrame(() => $('logoutButton').focus());
  } else if (wasOpen && popover.contains(document.activeElement)) {
    $('userMenuButton').focus();
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  if (window.liff && state.config?.liffId) {
    try {
      if (!state.liffReady) {
        await window.liff.init({ liffId: state.config.liffId });
        state.liffReady = true;
      }
      if (window.liff.isLoggedIn()) window.liff.logout();
    } catch {
      // The server session is already cleared; keep the login gate usable.
    }
  }
  state.session = null;
  state.familyId = null;
  state.canUpload = false;
  state.assets = [];
  state.trashAssets = [];
  state.trashOffset = 0;
  state.trashHasMore = false;
  state.messageTarget = null;
  state.messages = [];
  state.messageRequestSequence += 1;
  state.messageReturnFocus = null;
  if (state.messageViewer?.options) state.messageViewer.options.trapFocus = true;
  state.messageViewer = null;
  state.reopenViewerAfterMessageDialogId = null;
  toggleUserMenu(false);
  closeDialog($('messageDialog'));
  closeDialog($('trashDialog'));
  closeUploadDrawer(true);
  $('loginButton').disabled = !window.liff || !state.config?.liffId;
  showLoginUi();
  status('ログアウトしました');
}

function uploadResumeKey(file) {
  return 'mrnks-upload:' + JSON.stringify([
    state.familyId,
    file.name,
    file.size,
    file.lastModified,
  ]);
}

function readSavedUpload(key) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!saved?.uploadToken || Date.parse(saved.expiresAt) <= Date.now() + 30_000) return null;
    return saved;
  } catch {
    return null;
  }
}

function saveUpload(key, upload) {
  try { sessionStorage.setItem(key, JSON.stringify(upload)); } catch { /* resume remains best-effort */ }
}

function clearSavedUpload(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore storage restrictions */ }
}

async function createNasUpload(file) {
  return api('/api/families/' + encodeURIComponent(state.familyId) + '/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      clientLastModifiedAt: new Date(file.lastModified).toISOString(),
    }),
  });
}

async function putNasPart(upload, file, partIndex) {
  const start = partIndex * upload.chunkSizeBytes;
  const end = Math.min(file.size, start + upload.chunkSizeBytes);
  const part = file.slice(start, end);
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await gatewayApi(
        upload.gatewayOrigin + '/v1/uploads/' + encodeURIComponent(upload.assetId) + '/parts/' + partIndex,
        {
          method: 'PUT',
          headers: {
            authorization: 'Bearer ' + upload.uploadToken,
            'content-type': 'application/octet-stream',
          },
          body: part,
        },
      );
    } catch (error) {
      lastError = error;
      if (error.status && error.status < 500) throw error;
      if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

async function uploadFileToNas(file) {
  const resumeKey = uploadResumeKey(file);
  let upload = readSavedUpload(resumeKey);
  if (!upload) {
    upload = await createNasUpload(file);
    saveUpload(resumeKey, upload);
  }

  if (!upload.receipt) {
    let progress;
    try {
      progress = await gatewayApi(
        upload.gatewayOrigin + '/v1/uploads/' + encodeURIComponent(upload.assetId),
        { headers: { authorization: 'Bearer ' + upload.uploadToken } },
      );
    } catch (error) {
      if (![401, 403, 404].includes(error.status)) throw error;
      clearSavedUpload(resumeKey);
      upload = await createNasUpload(file);
      saveUpload(resumeKey, upload);
      progress = { uploadedParts: [] };
    }

    const uploadedParts = new Set(progress.uploadedParts || []);
    for (let partIndex = 0; partIndex < upload.totalParts; partIndex += 1) {
      if (!uploadedParts.has(partIndex)) await putNasPart(upload, file, partIndex);
      const percent = Math.round(((partIndex + 1) / upload.totalParts) * 100);
      appendStatus('送信中: ' + file.name + ' ' + percent + '%');
    }

    const completed = await gatewayApi(
      upload.gatewayOrigin + '/v1/uploads/' + encodeURIComponent(upload.assetId) + '/complete',
      {
        method: 'POST',
        headers: { authorization: 'Bearer ' + upload.uploadToken },
      },
    );
    upload.receipt = completed.receipt;
    saveUpload(resumeKey, upload);
  }

  const completionForm = new FormData();
  completionForm.append('receipt', upload.receipt);
  const notificationPreview = await createNotificationPreview(file);
  if (notificationPreview) completionForm.append('notificationPreview', notificationPreview, 'preview.jpg');
  const result = await api('/api/uploads/' + encodeURIComponent(upload.uploadId) + '/complete', {
    method: 'POST',
    body: completionForm,
  });
  clearSavedUpload(resumeKey);
  return result;
}

async function uploadFiles() {
  await ensureSession();
  if (!state.familyId) throw new Error('家族グループがありません。');
  const files = [...$('fileInput').files];
  if (files.length === 0) throw new Error('ファイルを選んでください。');
  const button = $('uploadButton');
  button.disabled = true;
  button.textContent = '保存中...';
  status(files.length + '件の保存を開始します');
  try {
    for (const file of files) {
      appendStatus('準備中: ' + file.name);
      await uploadFileToNas(file);
    }
    $('fileInput').value = '';
    updateFileSelection();
    await loadMedia();
    closeUploadDrawer();
    status(files.length + '件を保存しました');
  } finally {
    button.textContent = '原本をアップロード';
    button.disabled = !state.canUpload || !$('fileInput').files?.length;
  }
}

function assetDate(item) {
  const raw = item.capturedAt || item.clientLastModifiedAt || item.uploadedAt;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date(item.uploadedAt) : date;
}

function dayKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function groupAssetsByDay(assets) {
  const groups = [];
  const byKey = new Map();
  for (const item of assets) {
    const date = assetDate(item);
    const key = dayKey(date);
    let group = byKey.get(key);
    if (!group) {
      group = { key, date, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

function formatGalleryDay(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + 'KB';
  return bytes + 'B';
}

function isRaw(item) {
  return item.mimeType === 'image/x-adobe-dng'
    || item.mimeType === 'image/x-sony-arw'
    || isRawFilename(item.originalFilename);
}

function messageTargetKey(target) {
  if (!target) return '';
  return target.targetType === 'media' ? 'media:' + target.mediaId : 'day:' + target.day;
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function renderMessages() {
  const root = $('messageList');
  root.replaceChildren();
  root.setAttribute('aria-busy', String(state.messageLoading));
  if (state.messageLoading) {
    const loading = document.createElement('div');
    loading.className = 'message-empty';
    loading.textContent = 'メッセージを読み込んでいます...';
    root.appendChild(loading);
    return;
  }
  if (!state.messages.length) {
    const empty = document.createElement('div');
    empty.className = 'message-empty';
    empty.textContent = 'まだメッセージはありません。最初のひとことを残せます。';
    root.appendChild(empty);
    return;
  }

  for (const message of state.messages) {
    const article = document.createElement('article');
    article.className = 'message-item';
    article.dataset.mine = String(Boolean(message.isMine));

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    const displayName = message.author?.displayName || '家族';
    if (message.author?.pictureUrl) {
      const image = document.createElement('img');
      image.src = message.author.pictureUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        avatar.replaceChildren();
        avatar.textContent = displayName.trim().charAt(0) || '家';
      }, { once: true });
      avatar.appendChild(image);
    } else {
      avatar.textContent = displayName.trim().charAt(0) || '家';
    }

    const copy = document.createElement('div');
    copy.className = 'message-copy';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const author = document.createElement('p');
    author.className = 'message-author';
    author.textContent = message.author?.displayName || '家族';
    const time = document.createElement('time');
    time.className = 'message-time';
    time.dateTime = message.createdAt;
    time.textContent = formatMessageTime(message.createdAt);
    meta.append(author, time);
    const body = document.createElement('p');
    body.className = 'message-body';
    body.textContent = message.body;
    copy.append(meta, body);
    article.append(avatar, copy);
    root.appendChild(article);
  }
  window.requestAnimationFrame(() => { root.scrollTop = root.scrollHeight; });
}

function updateMessageComposer() {
  const value = $('messageBody').value;
  const length = Array.from(value).length;
  $('messageCharacterCount').textContent = length + ' / 500';
  $('messageSubmitButton').disabled = state.messageSubmitting || !value.trim() || length > 500;
}

function setMessageSubmitting(submitting) {
  state.messageSubmitting = submitting;
  $('messageDialog').setAttribute('aria-busy', String(submitting));
  $('messageCloseButton').disabled = submitting;
  $('messageBody').disabled = submitting;
  $('messageSubmitButton').textContent = submitting ? '送信中...' : '送信';
  updateMessageComposer();
}

function messageSearchParams(target) {
  const params = new URLSearchParams({ targetType: target.targetType });
  if (target.targetType === 'media') params.set('mediaId', target.mediaId);
  else params.set('day', target.day);
  return params;
}

async function loadMessages(target) {
  const requestSequence = ++state.messageRequestSequence;
  state.messageLoading = true;
  renderMessages();
  const path = '/api/families/' + encodeURIComponent(state.familyId) + '/messages?'
    + messageSearchParams(target).toString();
  try {
    const data = await api(path);
    if (requestSequence !== state.messageRequestSequence || messageTargetKey(state.messageTarget) !== messageTargetKey(target)) return;
    state.messages = data.messages || [];
  } finally {
    if (requestSequence === state.messageRequestSequence && messageTargetKey(state.messageTarget) === messageTargetKey(target)) {
      state.messageLoading = false;
      renderMessages();
    }
  }
}

async function showMessageDialog(target, context, trigger) {
  state.messageTarget = target;
  state.messages = [];
  state.messageReturnFocus = trigger instanceof HTMLElement ? trigger : null;
  state.messageLoading = true;
  $('messageTitle').textContent = target.targetType === 'media' ? '写真・動画へのメッセージ' : 'この日のメッセージ';
  $('messageContext').textContent = context;
  $('messageBody').value = '';
  setMessageSubmitting(false);
  renderMessages();
  openDialog($('messageDialog'));
  window.setTimeout(() => $('messageBody').focus(), 0);
  await loadMessages(target);
}

async function openDayMessages(group, messageButton) {
  await showMessageDialog(
    { targetType: 'day', day: group.key },
    formatGalleryDay(group.date),
    messageButton,
  );
}

async function openMediaMessages(item, element) {
  if (mediaViewer?.pswp) {
    state.messageViewer = mediaViewer.pswp;
    state.messageViewer.options.trapFocus = false;
    await showMessageDialog(
      { targetType: 'media', mediaId: item.id },
      item.originalFilename,
      element,
    );
    return;
  }
  if ($('galleryDialog').open) {
    state.reopenViewerAfterMessageDialogId = item.id;
    closeGallery();
    await showMessageDialog(
      { targetType: 'media', mediaId: item.id },
      item.originalFilename,
      null,
    );
    return;
  }
  await showMessageDialog(
    { targetType: 'media', mediaId: item.id },
    item.originalFilename,
    element,
  );
}

function closeMessageDialog() {
  if (state.messageSubmitting) return;
  closeDialog($('messageDialog'));
}

async function submitMessage(event) {
  event.preventDefault();
  const target = state.messageTarget;
  if (!target || !state.familyId || state.messageSubmitting) return;
  const body = $('messageBody').value.normalize('NFC').trim();
  if (!body || Array.from(body).length > 500) return;
  setMessageSubmitting(true);
  try {
    const data = await api('/api/families/' + encodeURIComponent(state.familyId) + '/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetType: target.targetType,
        mediaId: target.targetType === 'media' ? target.mediaId : undefined,
        day: target.targetType === 'day' ? target.day : undefined,
        body,
      }),
    });
    if (messageTargetKey(state.messageTarget) === messageTargetKey(target)) {
      state.messages.push(data.message);
      $('messageBody').value = '';
      renderMessages();
      status('メッセージを残しました');
    }
  } finally {
    setMessageSubmitting(false);
    if ($('messageDialog').open) $('messageBody').focus();
  }
}

function renderGallery(assets) {
  const root = $('galleryDays');
  root.innerHTML = '';
  const countBadge = $('albumCount');
  const totalCount = Math.max(assets.length, Number(state.totalCount) || 0);
  countBadge.textContent = totalCount + '件';
  countBadge.setAttribute(
    'aria-label',
    '保存件数 ' + totalCount + '件' + (assets.length < totalCount ? '、' + assets.length + '件を表示中' : ''),
  );
  if (!assets.length) {
    const emptyMessage = state.canUpload
      ? '右下の＋から、最初の原本を追加できます。'
      : '写真や動画が追加されると、ここに表示されます。';
    root.innerHTML = '<div class="empty-gallery"><div><strong>まだ写真・動画がありません</strong>' + emptyMessage + '</div></div>';
    return;
  }

  for (const group of groupAssetsByDay(assets)) {
    const section = document.createElement('section');
    section.className = 'gallery-day';
    const heading = document.createElement('div');
    heading.className = 'gallery-day-heading';
    const title = document.createElement('h3');
    title.textContent = formatGalleryDay(group.date);
    const count = document.createElement('span');
    count.className = 'muted';
    count.textContent = group.items.length + '件';
    const messageButton = document.createElement('button');
    messageButton.className = 'day-message-button';
    messageButton.type = 'button';
    messageButton.textContent = 'この日にメッセージ';
    messageButton.setAttribute('aria-label', formatGalleryDay(group.date) + 'のメッセージを開く');
    messageButton.addEventListener('click', () => {
      openDayMessages(group, messageButton).catch((error) => status('ERROR: ' + error.message));
    });
    const headingActions = document.createElement('div');
    headingActions.className = 'gallery-day-actions';
    headingActions.append(count, messageButton);
    heading.append(title, headingActions);

    const grid = document.createElement('div');
    grid.className = 'gallery-grid';
    for (const item of group.items) {
      const button = document.createElement('button');
      button.className = 'gallery-item';
      button.type = 'button';
      button.dataset.assetId = item.id;
      button.title = item.originalFilename;
      button.setAttribute('aria-label', item.originalFilename + 'を開く');

      const placeholder = document.createElement('span');
      placeholder.className = 'gallery-placeholder';
      placeholder.textContent = item.type === 'video' ? 'VIDEO' : isRaw(item) ? 'RAW' : 'IMAGE';
      button.appendChild(placeholder);

      let media = null;
      if (item.type === 'image' || isRaw(item)) {
        media = document.createElement('img');
        media.src = item.previewUrl;
        media.alt = '';
        media.loading = 'lazy';
        media.decoding = 'async';
      }
      if (media) {
        media.className = 'gallery-thumb';
        media.addEventListener('load', () => rememberPreviewDimensions(item, media), { once: true });
        media.addEventListener('error', () => media.remove(), { once: true });
        if (media.complete) rememberPreviewDimensions(item, media);
        button.appendChild(media);
      }

      if (isRaw(item)) {
        const rawBadge = document.createElement('span');
        rawBadge.className = 'gallery-badge';
        rawBadge.textContent = 'RAW';
        button.appendChild(rawBadge);
      }
      if (item.type === 'video') {
        const videoBadge = document.createElement('span');
        videoBadge.className = 'gallery-badge gallery-video-badge';
        videoBadge.textContent = '▶';
        button.appendChild(videoBadge);
      }
      button.addEventListener('click', () => openGalleryItem(item.id));
      grid.appendChild(button);
    }

    section.append(heading, grid);
    root.appendChild(section);
  }
}

async function downloadOriginal(item) {
  const popup = window.open('about:blank', '_blank');
  if (popup) popup.opener = null;
  try {
    const result = await api('/api/media/' + encodeURIComponent(item.id) + '/download-url', { method: 'POST' });
    if (popup) popup.location.replace(result.downloadUrl);
    else window.location.assign(result.downloadUrl);
  } catch (error) {
    popup?.close();
    throw error;
  }
}

function renderTrash(items) {
  const root = $('trashList');
  root.innerHTML = '';
  if (state.trashLoading) {
    root.innerHTML = '<div class="trash-empty">ゴミ箱を読み込んでいます...</div>';
    return;
  }
  if (!items.length) {
    root.innerHTML = '<div class="trash-empty">ゴミ箱は空です</div>';
    return;
  }

  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'trash-item';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'trash-thumb-wrap';
    const placeholder = document.createElement('span');
    placeholder.className = 'trash-placeholder';
    placeholder.textContent = item.type === 'video' ? 'VIDEO' : isRaw(item) ? 'RAW' : 'IMAGE';
    thumbWrap.appendChild(placeholder);
    if (item.previewUrl) {
      const image = document.createElement('img');
      image.className = 'trash-thumb';
      image.src = item.previewUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => image.remove(), { once: true });
      thumbWrap.appendChild(image);
    }

    const copy = document.createElement('div');
    copy.className = 'trash-copy';
    const name = document.createElement('p');
    name.className = 'trash-name';
    name.textContent = item.originalFilename;
    const meta = document.createElement('p');
    meta.className = 'trash-meta';
    const trashedAt = new Date(item.trashedAt);
    const trashedLabel = Number.isNaN(trashedAt.getTime())
      ? 'ゴミ箱へ移動済み'
      : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(trashedAt) + 'に移動';
    meta.textContent = trashedLabel + ' ・ ' + formatBytes(item.sizeBytes);
    copy.append(name, meta);

    const restore = document.createElement('button');
    restore.className = 'secondary-action trash-restore';
    restore.type = 'button';
    restore.textContent = '復元';
    restore.setAttribute('aria-label', item.originalFilename + 'を復元');
    restore.addEventListener('click', () => restoreTrashItem(item, restore).catch((error) => status('ERROR: ' + error.message)));

    row.append(thumbWrap, copy, restore);
    root.appendChild(row);
  }
}

async function loadTrash(reset = true) {
  if (!state.canUpload || !state.familyId) return;
  const loadMoreButton = $('trashLoadMoreButton');
  state.trashLoading = true;
  loadMoreButton.disabled = true;
  renderTrash(state.trashAssets);
  try {
    const offset = reset ? 0 : state.trashOffset;
    const data = await api(
      '/api/families/' + encodeURIComponent(state.familyId) + '/trash?offset=' + encodeURIComponent(offset),
    );
    const incoming = data.assets || [];
    if (reset) {
      state.trashAssets = incoming;
    } else {
      const existingIds = new Set(state.trashAssets.map((asset) => asset.id));
      state.trashAssets = state.trashAssets.concat(incoming.filter((asset) => !existingIds.has(asset.id)));
    }
    state.trashOffset = Number.isInteger(data.nextOffset) ? data.nextOffset : state.trashAssets.length;
    state.trashHasMore = Boolean(data.hasMore);
  } finally {
    state.trashLoading = false;
    renderTrash(state.trashAssets);
    loadMoreButton.hidden = !state.trashHasMore;
    loadMoreButton.disabled = false;
  }
}

async function openTrashDialog() {
  if (!state.canUpload) return;
  toggleUserMenu(false);
  openDialog($('trashDialog'));
  await loadTrash(true);
}

async function restoreTrashItem(item, button) {
  if (!state.canUpload) throw new Error('復元権限がありません。');
  button.disabled = true;
  button.textContent = '復元中...';
  try {
    await api('/api/media/' + encodeURIComponent(item.id) + '/restore', { method: 'POST' });
    state.trashAssets = state.trashAssets.filter((asset) => asset.id !== item.id);
    state.trashOffset = Math.max(0, state.trashOffset - 1);
    renderTrash(state.trashAssets);
    await loadMedia(true);
    status('「' + item.originalFilename + '」を復元しました');
  } catch (error) {
    button.disabled = false;
    button.textContent = '復元';
    throw error;
  }
}

function setDeleteBusy(busy) {
  state.deleteInProgress = busy;
  $('deleteMediaDialog').setAttribute('aria-busy', String(busy));
  $('deleteMediaCancelButton').disabled = busy;
  $('deleteMediaConfirmButton').disabled = busy;
  $('deleteMediaConfirmButton').textContent = busy ? '移動中...' : 'ゴミ箱へ移動';
}

function showDeleteMediaDialog() {
  if (!state.canUpload) return;
  const item = state.assets.find((asset) => asset.id === state.activeAssetId);
  if (!item) return;
  $('deleteMediaName').textContent = item.originalFilename;
  setDeleteBusy(false);
  openDialog($('deleteMediaDialog'));
  window.setTimeout(() => $('deleteMediaCancelButton').focus(), 0);
}

function openDeleteMediaDialog() {
  if (!state.canUpload) return;
  const item = state.assets.find((asset) => asset.id === state.activeAssetId);
  if (!item) return;
  if (mediaViewer?.pswp) {
    viewerDeleteRequestId = item.id;
    mediaViewer.pswp.close();
    return;
  }
  showDeleteMediaDialog();
}

function closeDeleteMediaDialog() {
  if (state.deleteInProgress) return;
  closeDialog($('deleteMediaDialog'));
}

function focusAfterMediaDelete(assetId) {
  window.requestAnimationFrame(() => {
    const target = assetId
      ? [...document.querySelectorAll('.gallery-item')].find((button) => button.dataset.assetId === assetId)
      : null;
    if (target instanceof HTMLElement) target.focus();
    else $('albumSummary').focus();
  });
}

async function trashActiveMedia() {
  if (!state.canUpload) throw new Error('ゴミ箱へ移動する権限がありません。');
  if (state.deleteInProgress) return;
  const itemIndex = state.assets.findIndex((asset) => asset.id === state.activeAssetId);
  const item = state.assets[itemIndex];
  if (!item) throw new Error('移動する写真・動画が見つかりません。');
  const nextFocusAssetId = state.assets[itemIndex + 1]?.id || state.assets[itemIndex - 1]?.id || null;

  setDeleteBusy(true);
  try {
    await api('/api/media/' + encodeURIComponent(item.id), { method: 'DELETE' });
    const previousTotal = Math.max(state.assets.length, Number(state.totalCount) || 0);
    state.assets = state.assets.filter((asset) => asset.id !== item.id);
    state.totalCount = Math.max(0, previousTotal - 1);
    state.mediaOffset = Math.max(0, state.mediaOffset - 1);
    state.mediaHasMore = state.assets.length < state.totalCount;
    renderGallery(state.assets);
    $('loadMoreMediaButton').hidden = !state.mediaHasMore;
    setDeleteBusy(false);
    reopenViewerAfterDeleteDialogId = null;
    closeDeleteMediaDialog();
    closeGallery();
    focusAfterMediaDelete(nextFocusAssetId);
    status('「' + item.originalFilename + '」をゴミ箱へ移動しました');
  } catch (error) {
    setDeleteBusy(false);
    throw error;
  }
}

function rememberPreviewDimensions(item, image) {
  const width = Number(image.naturalWidth);
  const height = Number(image.naturalHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const dimensions = { width, height };
  previewDimensions.set(item.id, dimensions);
  return dimensions;
}

function fallbackPreviewDimensions(item) {
  if (item.type === 'video') return { width: 1280, height: 720 };
  return { width: 1600, height: 1200 };
}

async function resolvePreviewDimensions(item) {
  const cached = previewDimensions.get(item.id);
  if (cached) return cached;
  if (item.type === 'video' || !item.previewUrl) return fallbackPreviewDimensions(item);

  return await new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => {
      resolve(rememberPreviewDimensions(item, image) || fallbackPreviewDimensions(item));
    }, { once: true });
    image.addEventListener('error', () => resolve(fallbackPreviewDimensions(item)), { once: true });
    image.src = item.previewUrl;
  });
}

function createViewerSlide(item) {
  if (item.type === 'video') {
    return {
      type: 'html',
      html: '<div class="pswp-video-shell"></div>',
      width: 1280,
      height: 720,
      asset: item,
    };
  }

  const dimensions = previewDimensions.get(item.id) || fallbackPreviewDimensions(item);
  return {
    src: item.previewUrl,
    msrc: item.previewUrl,
    width: dimensions.width,
    height: dimensions.height,
    alt: item.originalFilename,
    asset: item,
    dimensionsEstimated: !previewDimensions.has(item.id),
  };
}

function updateViewerCaption(element, pswp) {
  const item = pswp.currSlide?.data?.asset;
  element.replaceChildren();
  if (!item) return;

  state.activeAssetId = item.id;
  const inner = document.createElement('div');
  inner.className = 'viewer-caption-inner';
  const name = document.createElement('p');
  name.className = 'viewer-caption-name';
  name.textContent = item.originalFilename;
  const meta = document.createElement('p');
  meta.className = 'viewer-caption-meta';
  meta.textContent = formatGalleryDay(assetDate(item))
    + ' ・ ' + formatBytes(item.sizeBytes)
    + (isRaw(item) ? ' ・ RAWプレビュー' : item.type === 'video' ? ' ・ 動画' : '');
  inner.append(name, meta);
  element.appendChild(inner);
}

function configureMediaViewer(lightbox) {
  lightbox.on('uiRegister', () => {
    const pswp = lightbox.pswp;
    if (!pswp) return;

    pswp.ui.registerElement({
      name: 'gallery-caption',
      order: 30,
      isButton: false,
      appendTo: 'root',
      onInit: (element) => {
        const update = () => updateViewerCaption(element, pswp);
        pswp.on('change', update);
        pswp.on('afterInit', update);
      },
    });

    pswp.ui.registerElement({
      name: 'download-original',
      order: 8,
      isButton: true,
      title: '原本をダウンロード',
      ariaLabel: '原本をダウンロード',
      html: {
        isCustomSVG: true,
        size: 32,
        inner: '<path d="M15 5h2v12.2l4.1-4.1 1.4 1.4L16 21l-6.5-6.5 1.4-1.4 4.1 4.1V5Zm-6 19h14v2H9v-2Z"/>',
      },
      onClick: (_event, _element, instance) => {
        const item = instance.currSlide?.data?.asset;
        if (item) downloadOriginal(item).catch((error) => status('ERROR: ' + error.message));
      },
    });

    pswp.ui.registerElement({
      name: 'media-messages',
      order: 12,
      isButton: true,
      title: 'メッセージ',
      ariaLabel: 'この写真・動画のメッセージを開く',
      html: {
        isCustomSVG: true,
        size: 32,
        inner: '<path d="M7 7h18v14H14l-6 5v-5H7V7Zm2 2v10h1v2.7l3.3-2.7H23V9H9Z"/>',
      },
      onInit: (element, instance) => {
        element.addEventListener('click', () => {
          const item = instance.currSlide?.data?.asset;
          if (item) openMediaMessages(item, element).catch((error) => status('ERROR: ' + error.message));
        });
      },
    });

    pswp.ui.registerElement({
      name: 'trash-media',
      order: 15,
      isButton: true,
      title: 'ゴミ箱へ移動',
      ariaLabel: 'この写真・動画をゴミ箱へ移動',
      html: {
        isCustomSVG: true,
        size: 32,
        inner: '<path d="M12 7V5h8v2h5v2H7V7h5Zm-2 4h12l-1 15H11l-1-15Zm3 2 .6 11h4.8l.6-11h-6Z"/>',
      },
      onInit: (element) => { element.hidden = !state.canUpload; },
      onClick: (_event, _element, instance) => {
        const item = instance.currSlide?.data?.asset;
        if (!item) return;
        state.activeAssetId = item.id;
        openDeleteMediaDialog();
      },
    });
  });

  lightbox.on('contentAppend', ({ content }) => {
    if (content.data.asset?.type !== 'video' || !content.element) return;
    const shell = content.element.querySelector('.pswp-video-shell');
    if (!shell || shell.querySelector('video')) return;
    const video = document.createElement('video');
    video.className = 'pswp-video';
    video.src = content.data.asset.contentUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', content.data.asset.originalFilename);
    if (content.data.asset.previewUrl) video.poster = content.data.asset.previewUrl;
    shell.appendChild(video);
  });

  lightbox.on('contentActivate', ({ content }) => {
    const item = content.data.asset;
    if (item) state.activeAssetId = item.id;
    if (item?.type === 'video') {
      const video = content.element?.querySelector('video');
      if (video instanceof HTMLVideoElement) video.play().catch(() => {});
    }
  });

  lightbox.on('contentDeactivate', ({ content }) => {
    const video = content.element?.querySelector('video');
    if (video instanceof HTMLVideoElement) video.pause();
  });

  lightbox.on('contentDestroy', ({ content }) => {
    const video = content.element?.querySelector('video');
    if (video instanceof HTMLVideoElement) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  });

  lightbox.on('loadComplete', ({ content }) => {
    const item = content.data.asset;
    if (!item || item.type === 'video' || !content.data.dimensionsEstimated) return;
    if (!(content.element instanceof HTMLImageElement)) return;
    const dimensions = rememberPreviewDimensions(item, content.element);
    if (!dimensions) return;

    content.data.width = dimensions.width;
    content.data.height = dimensions.height;
    content.data.dimensionsEstimated = false;
    const pswp = lightbox.pswp;
    if (pswp) window.setTimeout(() => pswp.refreshSlideContent(content.index), 0);
  });

  lightbox.on('destroy', () => {
    if (viewerDeleteRequestId) {
      const assetId = viewerDeleteRequestId;
      viewerDeleteRequestId = null;
      state.activeAssetId = assetId;
      reopenViewerAfterDeleteDialogId = assetId;
      window.requestAnimationFrame(showDeleteMediaDialog);
    } else {
      state.activeAssetId = null;
    }
  });
}

async function ensureMediaViewer() {
  if (mediaViewer) return mediaViewer;
  if (!mediaViewerPromise) {
    mediaViewerPromise = import('/vendor/photoswipe/photoswipe-lightbox.esm.js')
      .then((module) => {
        const PhotoSwipeLightbox = module.default;
        const lightbox = new PhotoSwipeLightbox({
          dataSource: [],
          pswpModule: () => import('/vendor/photoswipe/photoswipe.esm.js'),
          bgOpacity: .96,
          spacing: .08,
          loop: true,
          wheelToZoom: true,
          pinchToClose: true,
          closeOnVerticalDrag: true,
          tapAction: 'toggle-controls',
          doubleTapAction: 'zoom',
          closeTitle: '閉じる',
          zoomTitle: '拡大・縮小',
          arrowPrevTitle: '前の写真・動画',
          arrowNextTitle: '次の写真・動画',
          imageClickAction: 'zoom-or-close',
          bgClickAction: 'close',
          showHideAnimationType: 'fade',
          showAnimationDuration: 180,
          hideAnimationDuration: 160,
          zoomAnimationDuration: 220,
          preloaderDelay: 350,
          indexIndicatorSep: ' / ',
          errorMsg: 'プレビューを表示できません。原本DLから保存できます。',
        });
        configureMediaViewer(lightbox);
        lightbox.init();
        mediaViewer = lightbox;
        return lightbox;
      })
      .catch((error) => {
        mediaViewerPromise = null;
        throw error;
      });
  }
  return await mediaViewerPromise;
}

async function openModernGalleryItem(item) {
  const index = state.assets.findIndex((asset) => asset.id === item.id);
  if (index < 0) return;
  if (item.type !== 'video') await resolvePreviewDimensions(item);

  const dataSource = state.assets.map(createViewerSlide);
  const viewer = await ensureMediaViewer();
  state.activeAssetId = item.id;
  const opened = viewer.loadAndOpen(index, dataSource);
  if (!opened) throw new Error('PhotoSwipeを開けませんでした');

  if (state.assets.length > 1) {
    const neighborIndexes = new Set([
      (index - 1 + state.assets.length) % state.assets.length,
      (index + 1) % state.assets.length,
    ]);
    for (const neighborIndex of neighborIndexes) {
      const neighbor = state.assets[neighborIndex];
      if (neighbor.type === 'video' || previewDimensions.has(neighbor.id)) continue;
      resolvePreviewDimensions(neighbor).then((dimensions) => {
        const slide = dataSource[neighborIndex];
        if (!slide || !slide.dimensionsEstimated) return;
        slide.width = dimensions.width;
        slide.height = dimensions.height;
        slide.dimensionsEstimated = false;
        const pswp = viewer.pswp;
        if (pswp && pswp.options.dataSource === dataSource) pswp.refreshSlideContent(neighborIndex);
      });
    }
  }
}

function clearGalleryStage() {
  const media = $('galleryStage').querySelector('.gallery-stage-media');
  if (media instanceof HTMLMediaElement) {
    media.pause();
    media.removeAttribute('src');
    media.load();
  }
  media?.remove();
}

function openLegacyGalleryItem(assetId) {
  const item = state.assets.find((asset) => asset.id === assetId);
  if (!item) return;
  state.activeAssetId = item.id;
  clearGalleryStage();

  let media;
  if (item.type === 'video') {
    media = document.createElement('video');
    media.src = item.contentUrl;
    media.controls = true;
    media.autoplay = true;
    media.playsInline = true;
    media.preload = 'metadata';
  } else {
    media = document.createElement('img');
    media.src = item.previewUrl;
    media.alt = item.originalFilename;
  }
  media.className = 'gallery-stage-media';
  media.addEventListener('error', () => {
    clearGalleryStage();
    const fallback = document.createElement('div');
    fallback.className = 'gallery-stage-media gallery-stage-empty';
    fallback.textContent = 'プレビューを表示できません。原本DLから保存できます。';
    $('galleryStage').insertBefore(fallback, $('galleryPrevButton'));
  }, { once: true });
  $('galleryStage').insertBefore(media, $('galleryPrevButton'));

  const index = state.assets.findIndex((asset) => asset.id === item.id);
  $('galleryTitle').textContent = (index + 1) + ' / ' + state.assets.length;
  $('galleryMetaPrimary').textContent = item.originalFilename;
  $('galleryMetaSecondary').textContent = formatGalleryDay(assetDate(item)) + ' ・ ' + formatBytes(item.sizeBytes) + (isRaw(item) ? ' ・ RAW' : '');
  $('galleryPrevButton').disabled = state.assets.length < 2;
  $('galleryNextButton').disabled = state.assets.length < 2;
  $('galleryDeleteButton').hidden = !state.canUpload;

  const dialog = $('galleryDialog');
  if (!dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
}

async function openGalleryItem(assetId) {
  const item = state.assets.find((asset) => asset.id === assetId);
  if (!item) return;
  try {
    await openModernGalleryItem(item);
  } catch (error) {
    console.warn('PhotoSwipe viewer unavailable', error);
    status('プレビューを読み込めなかったため、簡易表示に切り替えました');
    openLegacyGalleryItem(assetId);
  }
}

function showRelativeAsset(delta) {
  if (mediaViewer?.pswp) {
    if (delta < 0) mediaViewer.pswp.prev();
    else mediaViewer.pswp.next();
    return;
  }
  const current = state.assets.findIndex((asset) => asset.id === state.activeAssetId);
  if (current < 0 || state.assets.length < 2) return;
  const next = (current + delta + state.assets.length) % state.assets.length;
  openLegacyGalleryItem(state.assets[next].id);
}

function closeGallery() {
  if (mediaViewer?.pswp) mediaViewer.pswp.close();
  const dialog = $('galleryDialog');
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

async function loadMedia(reset = true) {
  await ensureSession();
  if (!state.familyId) return;
  const loadMoreButton = $('loadMoreMediaButton');
  loadMoreButton.disabled = true;
  try {
    const offset = reset ? 0 : state.mediaOffset;
    const data = await api(
      '/api/families/' + encodeURIComponent(state.familyId) + '/media?offset=' + encodeURIComponent(offset),
    );
    const incoming = data.assets || [];
    if (reset) {
      state.assets = incoming;
    } else {
      const existingIds = new Set(state.assets.map((asset) => asset.id));
      state.assets = state.assets.concat(incoming.filter((asset) => !existingIds.has(asset.id)));
    }
    state.assets.sort((a, b) => assetDate(b).getTime() - assetDate(a).getTime());
    state.mediaOffset = Number.isInteger(data.nextOffset) ? data.nextOffset : state.assets.length;
    state.totalCount = Number.isInteger(data.totalCount) ? data.totalCount : state.assets.length;
    state.mediaHasMore = Boolean(data.hasMore);
    renderGallery(state.assets);
    loadMoreButton.hidden = !state.mediaHasMore;
  } finally {
    loadMoreButton.disabled = false;
  }
}

$('loginButton').addEventListener('click', () => loginWithLiff().catch((e) => status('ERROR: ' + e.message)));
$('userMenuButton').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleUserMenu();
});
$('userMenuPopover').addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', () => toggleUserMenu(false));
$('trashButton').addEventListener('click', () => openTrashDialog().catch((e) => status('ERROR: ' + e.message)));
$('trashLoadMoreButton').addEventListener('click', () => loadTrash(false).catch((e) => status('ERROR: ' + e.message)));
$('trashCloseButton').addEventListener('click', () => closeDialog($('trashDialog')));
$('trashDialog').addEventListener('click', (event) => {
  if (event.target === $('trashDialog')) closeDialog($('trashDialog'));
});
$('logoutButton').addEventListener('click', () => logout().catch((e) => status('ERROR: ' + e.message)));
$('addMediaButton').addEventListener('click', openUploadDrawer);
$('uploadDrawerCloseButton').addEventListener('click', () => closeUploadDrawer(true));
$('uploadCancelButton').addEventListener('click', () => closeUploadDrawer(true));
$('fileInput').addEventListener('change', updateFileSelection);
$('uploadButton').addEventListener('click', () => uploadFiles().catch((e) => status('ERROR: ' + e.message)));
$('uploadDrawer').addEventListener('click', (event) => {
  if (event.target === $('uploadDrawer')) closeUploadDrawer(true);
});
$('uploadDrawer').addEventListener('close', () => {
  if (!$('addMediaButton').hidden) {
    window.requestAnimationFrame(() => $('addMediaButton').focus());
  }
});
$('groupBindButton').addEventListener('click', () => bindPendingGroup().catch((e) => appendStatus('グループ連携ERROR: ' + e.message)));
$('groupSetupCloseButton').addEventListener('click', () => closeDialog($('groupSetupPanel')));
$('groupSetupPanel').addEventListener('click', (event) => {
  if (event.target === $('groupSetupPanel')) closeDialog($('groupSetupPanel'));
});
$('loadMediaButton').addEventListener('click', () => loadMedia(true).catch((e) => status('ERROR: ' + e.message)));
$('loadMoreMediaButton').addEventListener('click', () => loadMedia(false).catch((e) => status('ERROR: ' + e.message)));
$('messageCloseButton').addEventListener('click', closeMessageDialog);
$('messageBody').addEventListener('input', updateMessageComposer);
$('messageBody').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    $('messageForm').requestSubmit();
  }
});
$('messageForm').addEventListener('submit', (event) => {
  submitMessage(event).catch((error) => status('ERROR: ' + error.message));
});
$('messageDialog').addEventListener('click', (event) => {
  if (event.target === $('messageDialog')) closeMessageDialog();
});
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !$('messageDialog').open) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeMessageDialog();
}, true);
$('messageDialog').addEventListener('cancel', (event) => {
  if (state.messageSubmitting) event.preventDefault();
});
$('messageDialog').addEventListener('close', () => {
  state.messageRequestSequence += 1;
  state.messageTarget = null;
  state.messages = [];
  state.messageLoading = false;
  $('messageBody').value = '';
  updateMessageComposer();
  if (state.messageViewer?.options) state.messageViewer.options.trapFocus = true;
  state.messageViewer = null;
  const reopenAssetId = state.reopenViewerAfterMessageDialogId;
  state.reopenViewerAfterMessageDialogId = null;
  if (reopenAssetId && state.assets.some((asset) => asset.id === reopenAssetId)) {
    state.messageReturnFocus = null;
    window.requestAnimationFrame(() => {
      openGalleryItem(reopenAssetId).catch((error) => status('ERROR: ' + error.message));
    });
    return;
  }
  window.requestAnimationFrame(() => {
    state.messageReturnFocus?.focus();
    state.messageReturnFocus = null;
  });
});
$('galleryCloseButton').addEventListener('click', closeGallery);
$('galleryPrevButton').addEventListener('click', () => showRelativeAsset(-1));
$('galleryNextButton').addEventListener('click', () => showRelativeAsset(1));
$('galleryMessageButton').addEventListener('click', () => {
  const item = state.assets.find((asset) => asset.id === state.activeAssetId);
  if (item) openMediaMessages(item, $('galleryMessageButton')).catch((error) => status('ERROR: ' + error.message));
});
$('galleryDeleteButton').addEventListener('click', openDeleteMediaDialog);
$('galleryDownloadButton').addEventListener('click', () => {
  const item = state.assets.find((asset) => asset.id === state.activeAssetId);
  if (item) downloadOriginal(item).catch((e) => status('ERROR: ' + e.message));
});
$('deleteMediaCancelButton').addEventListener('click', closeDeleteMediaDialog);
$('deleteMediaConfirmButton').addEventListener('click', () => trashActiveMedia().catch((e) => status('ERROR: ' + e.message)));
$('deleteMediaDialog').addEventListener('click', (event) => {
  if (event.target === $('deleteMediaDialog')) closeDeleteMediaDialog();
});
$('deleteMediaDialog').addEventListener('cancel', (event) => {
  if (state.deleteInProgress) event.preventDefault();
});
$('deleteMediaDialog').addEventListener('close', () => {
  $('deleteMediaName').textContent = '';
  const reopenAssetId = reopenViewerAfterDeleteDialogId;
  reopenViewerAfterDeleteDialogId = null;
  if (reopenAssetId && state.assets.some((asset) => asset.id === reopenAssetId)) {
    window.requestAnimationFrame(() => openGalleryItem(reopenAssetId));
    return;
  }
  window.requestAnimationFrame(() => {
    if ($('galleryDialog').open && !$('galleryDeleteButton').hidden) $('galleryDeleteButton').focus();
  });
});
$('galleryDialog').addEventListener('click', (event) => {
  if (event.target === $('galleryDialog')) closeGallery();
});
$('galleryDialog').addEventListener('close', () => {
  clearGalleryStage();
  state.activeAssetId = null;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('userMenuPopover').hidden) {
    event.preventDefault();
    toggleUserMenu(false);
    return;
  }
  if (!$('galleryDialog').open || event.target instanceof HTMLMediaElement) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showRelativeAsset(-1);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    showRelativeAsset(1);
  }
});
boot().catch((e) => status('ERROR: ' + e.message));
</script>
</body>
</html>`;
}
