# まるのこし MVP実装計画

> **For Hermes:** 実装時は `subagent-driven-development` skill を使い、タスク単位で実装・検証する。

**Goal:** LINE/LIFF から家族写真・動画を原本品質で保存し、家族だけが閲覧・原本ダウンロードできる MVP を作る。

**Architecture:** LIFF Web UI からアップロードし、Cloudflare Worker API が認証・認可・メタデータ管理を担当する。原本は R2 に private 保存し、D1 にハッシュ・サイズ・撮影日時候補などを記録する。サムネイルと動画プレビューは派生物として後段処理する。

**Tech Stack:** React/Vite, LINE LIFF SDK, Cloudflare Workers, Hono, D1, R2, Cloudflare Queues, LINE Messaging API.

---

## Phase 0: プロジェクト初期化

### Task 0.1: リポジトリの基本構成を作る

**Objective:** 実装を始められる最小構成を作る。

**Files:**

- Create: `apps/web/`
- Create: `apps/api/`
- Create: `packages/shared/`
- Create: `docs/`
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`

**Steps:**

1. pnpm workspace を作る
2. `apps/web` に LIFF UI を置く
3. `apps/api` に Worker API を置く
4. `packages/shared` に型定義・バリデーションを置く
5. `npm/pnpm` の check script を作る
6. `pnpm install` と `pnpm check` を通す

**Verification:**

```bash
pnpm install
pnpm check
```

Expected: workspace 全体の typecheck/lint が通る。

---

## Phase 1: 原本保存の最小検証

### Task 1.1: R2保存用のAPI骨格を作る

**Objective:** Worker API から R2 に private object を保存できるようにする。

**Files:**

- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/routes/uploads.ts`
- Create: `apps/api/src/storage/r2.ts`
- Create: `apps/api/wrangler.example.toml`
- Create: `apps/api/test/uploads.test.ts`

**Steps:**

1. Hono app を作る
2. `PUT /api/uploads/:assetId/body` を追加する
3. request body を R2 に保存する
4. 保存後に key, size, mime を返す
5. R2 はテストでは mock する

**Verification:**

```bash
pnpm --filter api test
pnpm --filter api typecheck
```

Expected: mock R2 に保存されるテストが通る。

### Task 1.2: SHA-256計算と保存メタデータを追加する

**Objective:** 保存された原本の検証情報を API レスポンスに含める。

**Files:**

- Modify: `apps/api/src/routes/uploads.ts`
- Create: `apps/api/src/lib/hash.ts`
- Modify: `apps/api/test/uploads.test.ts`

**Steps:**

1. request body から SHA-256 を計算する
2. `sizeBytes` を実測する
3. `mimeType` を header から読む
4. レスポンスに `sha256`, `sizeBytes`, `mimeType` を返す
5. テストで入力バイト列の SHA-256 と一致することを確認する

**Verification:**

```bash
pnpm --filter api test -- uploads
```

Expected: SHA-256 と size が一致する。

### Task 1.3: D1スキーマを作る

**Objective:** media metadata をDBに記録できるようにする。

**Files:**

- Create: `apps/api/migrations/0001_initial.sql`
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/client.ts`
- Modify: `apps/api/src/routes/uploads.ts`

**Steps:**

1. `users`, `families`, `family_members`, `media_assets` を作る
2. アップロードAPIで `media_assets` に1行追加する
3. テストDBで insert を検証する

**Verification:**

```bash
pnpm --filter api test
pnpm --filter api db:migrate:local
```

Expected: upload 後に `media_assets` 行が作られる。

---

## Phase 2: LIFF UI

### Task 2.1: LIFF起動とセッション確認画面を作る

**Objective:** LINE内ブラウザで LIFF 初期化し、APIセッションを取得する。

**Files:**

- Create: `apps/web/src/liff.ts`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/pages/HomePage.tsx`
- Create: `apps/web/src/App.tsx`

**Steps:**

1. `@line/liff` を導入する
2. `liff.init({ liffId })` を呼ぶ
3. 未ログインなら `liff.login()` へ送る
4. ID token を API へ渡し、session を作る
5. family が無い場合は作成導線を表示する

**Verification:**

```bash
pnpm --filter web typecheck
pnpm --filter web build
```

Expected: build が通り、LIFF ID 未設定時は画面に設定不足が表示される。

### Task 2.2: ファイル選択UIを作る

**Objective:** LINE内ブラウザから画像・動画を選べるUIを作る。

**Files:**

- Create: `apps/web/src/pages/UploadPage.tsx`
- Create: `apps/web/src/components/FilePicker.tsx`
- Create: `apps/web/src/components/UploadQueue.tsx`

**Steps:**

1. `<input type="file" multiple accept="image/*,video/*">` を置く
2. 選択ファイル名、size、type、lastModified を表示する
3. 「この画面から選ぶと原本保存します」と説明する
4. ファイルごとにアップロード待ち/中/完了/失敗を表示する

**Verification:**

```bash
pnpm --filter web test
pnpm --filter web build
```

Expected: 複数ファイル選択後、一覧表示される。

### Task 2.3: アップロード実行をつなぐ

**Objective:** 選択したファイルを API にアップロードする。

**Files:**

- Modify: `apps/web/src/pages/UploadPage.tsx`
- Modify: `apps/web/src/api/client.ts`

**Steps:**

1. `PUT /api/uploads/:assetId/body` に file body を送る
2. 進捗表示を追加する
3. 成功時に API から返った size/hash を表示する
4. 失敗時に retry ボタンを出す

**Verification:**

```bash
pnpm --filter web test
pnpm --filter web build
```

Expected: mock API でアップロード成功/失敗のUIテストが通る。

---

## Phase 3: 家族・認可

### Task 3.1: LINE ID token 検証を追加する

**Objective:** APIがLINEログイン済みユーザーを安全に識別できるようにする。

**Files:**

- Create: `apps/api/src/auth/line.ts`
- Create: `apps/api/src/auth/session.ts`
- Create: `apps/api/src/routes/auth.ts`
- Create: `apps/api/test/auth.test.ts`

**Steps:**

1. LINE ID token verify endpoint または署名検証を実装する
2. `line_user_id` から `users` を upsert する
3. session cookie/JWT を発行する
4. `/api/auth/session` を追加する

**Verification:**

```bash
pnpm --filter api test -- auth
```

Expected: 有効tokenなら user/session が作られ、無効tokenは401。

### Task 3.2: family/member認可を追加する

**Objective:** 家族メンバーだけが media API を使えるようにする。

**Files:**

- Create: `apps/api/src/auth/authorize.ts`
- Create: `apps/api/src/routes/families.ts`
- Modify: `apps/api/src/routes/uploads.ts`
- Create: `apps/api/test/authorization.test.ts`

**Steps:**

1. family 作成 API を作る
2. owner を `family_members` に追加する
3. upload API に familyId を必須化する
4. member でない user は403にする

**Verification:**

```bash
pnpm --filter api test -- authorization
```

Expected: member は upload でき、非memberは403。

---

## Phase 4: タイムライン・ダウンロード

### Task 4.1: media一覧APIを作る

**Objective:** 月別タイムラインに必要な一覧を返す。

**Files:**

- Create: `apps/api/src/routes/media.ts`
- Create: `apps/api/test/media-list.test.ts`

**Steps:**

1. `GET /api/families/:familyId/media?month=YYYY-MM` を作る
2. `captured_at` または `uploaded_at` で並べる
3. derivative が無い場合も asset を返す
4. member 認可を必ず通す

**Verification:**

```bash
pnpm --filter api test -- media-list
```

Expected: 月別・家族別に絞り込まれる。

### Task 4.2: タイムライン画面を作る

**Objective:** 家族がLINE内で写真一覧を見られるようにする。

**Files:**

- Create: `apps/web/src/pages/TimelinePage.tsx`
- Create: `apps/web/src/components/MediaGrid.tsx`
- Create: `apps/web/src/components/MediaCard.tsx`

**Steps:**

1. media一覧APIを呼ぶ
2. 月別のグリッドを表示する
3. derivative が無い場合は placeholder を表示する
4. 動画は再生アイコンを出す

**Verification:**

```bash
pnpm --filter web test
pnpm --filter web build
```

Expected: mock media list が表示される。

### Task 4.3: 原本ダウンロードURLを作る

**Objective:** member だけが短命URLで原本を取得できるようにする。

**Files:**

- Modify: `apps/api/src/routes/media.ts`
- Create: `apps/api/test/download-url.test.ts`

**Steps:**

1. `POST /api/media/:assetId/download-url` を追加する
2. family membership を確認する
3. R2 signed URL または Worker proxy URL を返す
4. URLの期限を短くする

**Verification:**

```bash
pnpm --filter api test -- download-url
```

Expected: member はURL取得、非memberは403、期限が設定される。

---

## Phase 5: サムネイル・通知

### Task 5.1: derivative placeholder設計を入れる

**Objective:** サムネイル生成が未完了でもUXが破綻しないようにする。

**Files:**

- Modify: `apps/api/src/routes/media.ts`
- Modify: `apps/web/src/components/MediaCard.tsx`

**Steps:**

1. `processing_status` を API response に含める
2. `pending/processing/failed` に応じて表示を変える
3. 原本ダウンロードはサムネイル失敗時も可能にする

**Verification:**

```bash
pnpm test
pnpm build
```

Expected: derivative 無しでも一覧と詳細が表示できる。

### Task 5.2: LINE通知を追加する

**Objective:** アップロード完了後、家族にまとめて通知する。

**Files:**

- Create: `apps/api/src/line/messaging.ts`
- Create: `apps/api/src/notifications/uploadComplete.ts`
- Create: `apps/api/test/notifications.test.ts`

**Steps:**

1. LINE push message client を作る
2. upload session 完了時に1通知だけ作る
3. 通知済みイベントを DB に記録する
4. 失敗時はログと `notification_events` に残す

**Verification:**

```bash
pnpm --filter api test -- notifications
```

Expected: 3ファイルアップロードでも通知は1件。

---

## Phase 6: 実機検証

### Task 6.1: iPhone HEIC検証

**Objective:** LINE内LIFFからアップロードしたHEICが原本のまま保存されるか確認する。

**Steps:**

1. iPhoneでHEIC写真を撮る
2. LIFFからアップロードする
3. API response の size/hash を保存する
4. 原本ダウンロードする
5. ローカルで hash を比較する

**Verification:**

```bash
sha256sum downloaded-original.heic
```

Expected: クライアント計算値、保存時DB値、ダウンロード後値が一致する。

### Task 6.2: 4K動画検証

**Objective:** 大きい動画で upload limit とUXを確認する。

**Steps:**

1. 短い4K動画を撮る
2. LIFFからアップロードする
3. Worker経由で上限に当たるか確認する
4. 上限に当たる場合は multipart upload を優先実装に切り替える

**Verification:**

- 保存成功時: hash/size 一致
- 失敗時: エラーがユーザーに分かる形で表示される

---

## 最初のリリース判定

MVPとして使い始めてよい条件:

- iPhone写真の原本保存・DL・hash一致が確認済み
- Android写真の原本保存・DL・hash一致が確認済み
- 少なくとも短い動画で保存・DL・hash一致が確認済み
- 家族メンバーでないユーザーが media API にアクセスできない
- 原本R2オブジェクトが公開URLで読めない
- LINE通知が1アップロードセッション1通知にまとまる

## 後回しにする改善

- 正式な multipart upload 全面対応
- HEICからWebP/JPEGへのサーバー変換
- 動画HLS変換
- コメント/リアクション
- アルバム編集
- 課金
- 製本/プリント連携
