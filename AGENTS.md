# AGENTS.md

このリポジトリは **まるのこし** の開発用です。

まるのこしは、LINE/LIFF から家族写真・動画を共有しつつ、原本を圧縮せず保存する家族アルバムです。

## 最重要方針

1. **原本を加工しない**
   原本ファイルはアップロードされたバイト列のまま R2 等に保存する。サムネイル・WebP・動画プレビューは必ず derivative として別保存する。

2. **LINEトーク受信を原本保存経路にしない**
   LINE側で圧縮・変換される可能性があるため、原本保存は LIFF Web UI のファイル選択・アップロード経路で行う。

3. **画質保持の検証をUIより優先する**
   実装初期は、iPhone/Android からアップロード → 保存 → ダウンロード → SHA-256一致を最優先で確認する。

4. **家族データはprivate前提**
   R2 object は公開しない。原本ダウンロードは認可後の短命URLまたはWorker proxyで行う。

5. **まずは LINE公式アカウント + LIFF**
   正式なLINEミニアプリ審査、課金、製本、コメント機能は後回し。

## ドキュメント

- `README.md`: プロジェクト概要
- `docs/DESIGN.md`: プロダクト・システム設計
- `docs/MVP_PLAN.md`: 実装計画

## 想定スタック

- Frontend: React/Vite + LINE LIFF SDK
- API: Cloudflare Workers + Hono
- Storage: Cloudflare R2
- DB: Cloudflare D1 initially; Postgres later if needed
- Background: Cloudflare Queues + external image/video processing worker if needed
- Notification: LINE Messaging API

## 実装時の注意

- `.env`, `.dev.vars`, `wrangler.toml` with real IDs, LINE secrets, Cloudflare tokens をコミットしない。
- `wrangler.example.toml` など placeholder だけをコミットする。
- 署名付きURL、LINE access token、ID token をログに出さない。
- EXIF GPS はMVPでは表示しない。保存する場合も後で削除/非表示にできる構造にする。
- 大容量動画は Worker のリクエストサイズ上限に当たる可能性がある。最初の実機検証で上限に当たったら multipart direct upload を優先する。

## 検証コマンド方針

実装後は最低限以下を通す。

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

Cloudflare Worker を追加したら dry-run も行う。

```bash
npx wrangler deploy --dry-run --config apps/api/wrangler.toml
```

## コミット方針

- 日本語で分かりやすく、Conventional Commits 形式を使う。
- 例: `docs: 初期設計を追加`
- 原本保存・認可・セキュリティに関わる変更は、テストか実機検証メモを必ず残す。
