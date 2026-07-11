# まるのこし プロダクト・システム設計

最終更新: 2026-07-11

## 1. コンセプト

**まるのこし** は、家族の写真・動画を LINE からかんたんに共有しながら、原本を劣化させずに保存する家族アルバムです。

タグライン:

> 思い出を、画質ごと残す。

### 価値の中心

既存の家族アルバムアプリは「見せる」「共有する」体験が強い一方で、アップロード後の画質、動画の圧縮、原本ダウンロード、EXIF保持が不安になりやすい。

まるのこしは、以下を明確な価値にする。

- 写真・動画の原本を保存する
- サムネイルやプレビューは派生物として別管理する
- 家族には LINE で自然に届く
- 将来のバックアップ資産として信頼できる

## 2. 初期ユーザー

### 2.1 親 / 管理者

- 子どもや家族の写真・動画を日々アップロードする
- 原本が落ちないこと、あとから取り出せることを重視する
- 家族を招待・削除できる
- アップロードされたものの公開範囲を管理する

### 2.2 家族 / 閲覧者

- LINEの通知から写真を見る
- アプリを新規インストールせずに使いたい
- 高齢の家族でも迷わず見られることが重要
- 必要に応じて原本をダウンロードできる

### 2.3 将来の共同アップロード者

- 祖父母、配偶者、親戚など
- 見るだけでなく自分も追加できる
- 家族グループごとに権限を分けられる

## 3. MVPスコープ

### 3.1 やる

- LINE公式アカウントから LIFF アプリを開く
- LINEログインでユーザーを識別する
- 家族グループを作成する
- 招待リンクで家族を追加する
- 写真・動画を LIFF 画面からアップロードする
- 原本ファイルを R2 に保存する
- 原本のハッシュ、サイズ、MIME、撮影日時候補を DB に記録する
- サムネイル・プレビューを別ファイルとして生成する
- 月別タイムラインで閲覧する
- 原本を期限付きURLでダウンロードする
- 新規追加時に LINE 通知する

### 3.2 やらない

- LINEトークへ画像を送信して保存する方式
- 投稿写真の自動AI分類
- コメント、スタンプ、リアクション
- 製本、プリント注文
- きめ細かいアルバム編集
- 公開SNS的な拡散機能
- 最初から LINEミニアプリ正式審査に出すこと

## 4. 重要な設計原則

### 4.1 原本は絶対に加工しない

原本はアップロードされたバイト列をそのまま保存する。表示用サムネイル、WebP、動画プレビュー、低解像度プレビューなどはすべて derivative として別オブジェクトにする。

必ず記録する検証情報:

- `original_sha256`
- `original_size_bytes`
- `original_mime_type`
- `original_filename`
- `uploaded_at`
- `captured_at` 候補
- `client_reported_last_modified`
- `storage_key`

原本保存後は、ダウンロード時に再度ハッシュ検証できる構造にする。

### 4.2 LINEは入口であって、保存経路ではない

LINEのトークに写真を送らせると、LINE側で圧縮・変換される可能性がある。MVPでは LINE Messaging API の画像受信を原本保存の主経路にしない。

採用する経路:

1. LINE公式アカウントのリッチメニューまたはメッセージから LIFF を開く
2. LIFF Web UI の `<input type="file" multiple>` で端末内ファイルを選択
3. ブラウザからアプリのアップロードAPIへ送信
4. サーバーが R2 に原本保存する

### 4.3 表示体験は軽く、保存体験は堅く

家族が見る画面は軽くする。表示にはサムネイルとプレビューを使う。原本は必要時だけ期限付きURLで取得する。

### 4.4 最初は自分たち用でよい

多家族SaaSとしての課金、規約、サポート設計は後でよい。最初は単一または少数家族で確実に使えることを優先する。

## 5. システム構成

```text
LINE Official Account
  ├─ Rich Menu / Push Message
  ▼
LIFF Web App
  ├─ Login / Family selection
  ├─ Upload UI
  ├─ Timeline UI
  └─ Original download UI
  ▼
Cloudflare Worker API (Hono)
  ├─ Auth/session API
  ├─ Family/member API
  ├─ Upload session API
  ├─ Media listing API
  ├─ Download URL API
  ├─ LINE webhook
  └─ Notification API
  ▼
Cloudflare R2
  ├─ originals/{familyId}/{assetId}/{filename}
  └─ derivatives/{familyId}/{assetId}/...

Cloudflare D1 / Postgres
  ├─ users
  ├─ families
  ├─ family_members
  ├─ media_assets
  ├─ media_derivatives
  ├─ upload_sessions
  └─ notification_events

Background Worker / Queue
  ├─ EXIF extraction
  ├─ Thumbnail generation
  ├─ Video poster generation
  └─ Hash verification
```

## 6. 技術スタック案

### 6.1 Frontend

候補:

- React + Vite
- または Next.js App Router

MVPでは React + Vite で十分。Cloudflare Workers + Assets に載せやすく、LIFF画面の責務も小さい。

必要ライブラリ:

- `@line/liff`
- `react`
- `react-router` 相当
- アップロード進捗表示用の軽量状態管理

### 6.2 API

- Cloudflare Workers
- Hono
- Zod などでリクエスト検証
- JWT または署名付きセッションCookie

### 6.3 Storage

- Cloudflare R2
- 原本バケットと派生物バケットは分けてもよい
- MVPでは1バケット内で prefix 分離でもよい

推奨 prefix:

```text
originals/{familyId}/{assetId}/{safeOriginalFilename}
derivatives/{familyId}/{assetId}/thumb_512.webp
derivatives/{familyId}/{assetId}/thumb_1280.webp
derivatives/{familyId}/{assetId}/poster.jpg
```

### 6.4 DB

MVPでは Cloudflare D1 で開始する。将来的に大きなクエリ、全文検索、課金、多家族運用が必要になったら Postgres に移行する。

### 6.5 Background processing

Cloudflare Worker 単体では HEIC 変換や動画処理が重い可能性がある。以下の二段構えにする。

- MVP: 原本保存とメタデータ記録を先に完了。サムネイル未生成でも一覧に placeholder を表示
- 次段: Cloudflare Queues + 外部変換ワーカーで `sharp/libvips`、`ffmpeg` を使う

## 7. データモデル

### 7.1 users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  picture_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 7.2 families

```sql
CREATE TABLE families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 7.3 family_members

```sql
CREATE TABLE family_members (
  family_id TEXT NOT NULL REFERENCES families(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'uploader', 'viewer')),
  joined_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (family_id, user_id)
);
```

### 7.4 media_assets

```sql
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  uploader_user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'other')),
  original_filename TEXT NOT NULL,
  original_mime_type TEXT NOT NULL,
  original_size_bytes INTEGER NOT NULL,
  original_sha256 TEXT NOT NULL,
  original_storage_key TEXT NOT NULL UNIQUE,
  captured_at TEXT,
  client_last_modified_at TEXT,
  uploaded_at TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'owner_only'))
);
```

### 7.5 media_derivatives

```sql
CREATE TABLE media_derivatives (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
```

### 7.6 upload_sessions

```sql
CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  uploader_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('created', 'uploading', 'completed', 'failed', 'expired')),
  expected_files_count INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

### 7.7 notification_events

```sql
CREATE TABLE notification_events (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  media_asset_id TEXT REFERENCES media_assets(id),
  kind TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT
);
```

### 7.8 LINE group bindings

LINEグループは家族アルバムへ紐づけ、グループ由来では `viewer` または `uploader` だけを付与する。`owner` / `admin` は既存の `family_members` を権威とし、LINEグループから昇格させない。

- 招待時: `join` webhookでgroup ID・名称・ハッシュ化した一回限り設定トークンを保存
- 設定時: 既存familyのowner/adminかつ対象LINEグループの現メンバーであることを検証
- 利用時: LINE group member profile APIで在籍確認し、group binding付き1時間sessionを発行
- 通知時: `(media_asset_id, line_group_binding_id)` を一意にclaimして二重送信を防ぐ
- 画像: 原本とは別の1MB以下JPEG/PNGだけを、推測困難なURLからLINEへ配信

### 7.9 notification deliveries

`line_notification_deliveries` は `pending` / `sent` / `failed`、LINE retry key、エラー概要を保持する。原本URLやsession tokenは保存しない。

## 8. API設計

### 8.1 Auth

#### `GET /api/auth/session`

現在のLINEログイン状態と、所属する家族一覧を返す。

Response:

```json
{
  "user": {
    "id": "usr_...",
    "displayName": "Kan"
  },
  "families": [
    {
      "id": "fam_...",
      "name": "二宮家",
      "role": "owner"
    }
  ]
}
```

### 8.2 Family

#### `POST /api/families`

家族グループを作成する。

#### `POST /api/families/:familyId/invitations`

招待リンクを作る。期限付き・回数制限ありにする。

#### `POST /api/invitations/:token/accept`

招待を受ける。

### 8.3 Upload

#### `POST /api/upload-sessions`

アップロードセッションを作る。

Request:

```json
{
  "familyId": "fam_...",
  "files": [
    {
      "filename": "IMG_1234.HEIC",
      "mimeType": "image/heic",
      "sizeBytes": 3421123,
      "lastModifiedAt": "2026-07-09T10:00:00.000Z"
    }
  ]
}
```

Response:

```json
{
  "uploadSessionId": "ups_...",
  "items": [
    {
      "clientFileIndex": 0,
      "assetId": "ast_...",
      "uploadMode": "single",
      "uploadUrl": "/api/uploads/ups_.../items/ast_.../body"
    }
  ]
}
```

#### `PUT /api/uploads/:uploadSessionId/items/:assetId/body`

小さめの画像・短い動画用。Worker経由でR2へ保存する。MVPではまずこの経路を作る。

制限を超える動画は後続の multipart API に回す。

#### `POST /api/uploads/:uploadSessionId/items/:assetId/multipart/start`

大きな動画用。R2/S3互換の multipart upload を開始し、part upload URL を返す。

#### `POST /api/uploads/:uploadSessionId/items/:assetId/multipart/complete`

multipart upload を完了し、ハッシュとサイズを確定する。

### 8.4 Media

#### `GET /api/families/:familyId/media?month=YYYY-MM`

月別タイムライン用にメディア一覧を返す。

#### `GET /api/media/:assetId`

メディア詳細を返す。

#### `POST /api/media/:assetId/download-url`

原本ダウンロード用の期限付きURLを発行する。

### 8.5 LINE

#### `POST /webhook/line`

LINE Messaging API webhook。MVPでは主に以下を扱う。

- 友だち追加
- メニュー導線
- 招待リンククリック後の識別補助

写真メッセージ受信は、原本保存の主経路にはしない。必要なら「原本保存はLIFFからお願いします」と案内する。

## 9. UI設計

### 9.1 主要画面

#### ホーム

- 家族名
- 最新の写真・動画
- 「写真・動画を追加」ボタン
- 「招待」ボタン

#### アップロード

- 複数ファイル選択
- 選択ファイル一覧
- 各ファイルのサイズ・種類表示
- アップロード進捗
- 完了後にタイムラインへ戻る

重要表示:

- 「原本を保存します」
- 「LINEトーク送信ではなく、この画面から選んでください」

#### タイムライン

- 月別グルーピング
- 撮影日時順
- サムネイル表示
- 動画は再生アイコン
- 変換待ちは placeholder

#### メディア詳細

- プレビュー表示
- 撮影日時
- アップロード者
- 原本サイズ
- 原本ダウンロードボタン

#### 家族管理

- メンバー一覧
- 役割表示
- 招待リンク作成
- メンバー削除

### 9.2 LINE導線

- リッチメニュー: 「写真追加」「アルバムを見る」「家族を招待」
- 新規追加通知: 「3件の写真がまるのこしに追加されました」
- 通知ボタン: LIFF の該当月/該当投稿へ遷移

## 10. 画質保持の検証設計

MVPで最初に検証すべきことは機能数ではなく、端末から原本が本当に残るかです。

### 10.1 検証ケース

- iPhoneで撮ったHEIC写真
- iPhoneで撮ったLive Photos相当の写真
- iPhone 4K動画
- Android JPEG写真
- Android HEIC/HEIF写真
- Android 4K動画
- LINE内ブラウザで複数選択した写真
- Safari/Chromeから同じ写真をアップロードした場合との差分

### 10.2 検証項目

- アップロード前後のファイルサイズ一致
- SHA-256一致
- MIME type
- EXIFの有無
- 撮影日時の取得可否
- ファイル名の扱い
- iOSがアップロード時にJPEG変換していないか
- 動画のduration/codec変化がないか

### 10.3 合格条件

- 原本保存経路では、サーバー保存後のSHA-256がクライアント計算値と一致する
- 原本ダウンロード後のSHA-256が保存時と一致する
- サムネイル生成に失敗しても原本は残る
- 変換処理が原本キーを上書きできない

## 11. セキュリティ設計

### 11.1 認証

- LINE Login / LIFF の ID token を検証する
- `line_user_id` を内部 `users.id` に紐づける
- APIセッションは署名付きCookieまたは短命JWTで扱う

### 11.2 認可

すべての media API は以下を検証する。

1. 認証済みユーザーである
2. 該当 `family_id` の有効メンバーである
3. 必要な role を持つ
4. `revoked_at IS NULL`

### 11.3 Storage

- R2オブジェクトは公開しない
- 原本は直接公開URLを持たせない
- ダウンロードURLは短命にする
- derivative も原則 private にする。必要なら CDN キャッシュは署名付きで制御する

### 11.4 招待リンク

- token は十分長くランダム
- 有効期限を持たせる
- 使用回数制限を持たせる
- owner/admin が取り消せる

### 11.5 ログ

ログに残してよいもの:

- asset id
- family id
- user id
- MIME
- size
- processing status

ログに残さないもの:

- LINE access token
- ID token
- 署名付きダウンロードURL全文
- 個人の住所や推測される位置情報

EXIF GPS を扱う場合は、MVPでは表示しない。保存する場合も将来設定で削除可能にする。

## 12. 通知設計

### 12.1 通知タイミング

- アップロード完了後、まとめて1通知
- 1ファイルごとに通知しない
- 失敗時は uploader のみに通知

### 12.2 通知文例

```text
まるのこしに新しい写真・動画が3件追加されました。
見る: {LIFF_URL}
```

### 12.3 通知抑制

- 同じアップロードセッション内では1通知
- 深夜通知抑制は後回し
- MVPでは家族単位で通知ON/OFFを持つ程度でよい

## 13. 運用・環境

### 13.1 環境分離

- develop と production は分ける
- LINE channel / LIFF ID / R2 / D1 / Worker / domain を分離する
- production に develop の LINE credentials を入れない

### 13.2 必要な秘密情報

- `LINE_CHANNEL_ID`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LIFF_ID`
- `SESSION_SECRET`
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` が必要な構成ならそれ
- 管理者用 `ADMIN_API_KEY` が必要ならそれ

### 13.3 ドメイン案

未定。MVPでは workers.dev でもよい。家族利用を始める段階で独自ドメインを付ける。

## 14. 将来拡張

- アルバム単位の整理
- 子どもごとのタグ
- コメント・リアクション
- 年/月の自動まとめ
- 祖父母向けの超シンプル閲覧モード
- NASへの二重バックアップ
- S3互換ストレージの切り替え
- ローカルバックアップエクスポート
- 写真プリント/製本連携
- 有料プラン化

## 15. 未決定事項

- LIFF内ブラウザで iPhone HEIC がそのまま渡るか
- 4K動画の現実的なアップロード上限
- Cloudflare Worker経由アップロードで足りるか、最初から multipart direct upload にするか
- D1で十分か、最初から Postgres にするか
- サムネイル生成基盤を Cloudflare 内で完結させるか、外部ワーカーにするか
- NAS二重保存を最初から入れるか

## 16. 最初の判断

最初の実装は以下に絞る。

1. LINE公式アカウント + LIFF でログイン
2. 画像1枚アップロード
3. R2へ原本保存
4. SHA-256とファイルサイズを記録
5. 原本ダウンロードして一致検証
6. 複数画像、動画、通知、サムネイルへ広げる

これが通るまで、コメント機能や凝ったUIには進まない。
