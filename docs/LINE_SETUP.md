# LINE設定メモ

このドキュメントは、まるのこしで使う LINE Login / Messaging API の設定手順です。

> 注意: このリポジトリは公開される可能性があるため、Channel secret、Channel access token、LIFF ID、callback URL の実値はコミットしません。実値はローカル `.dev.vars` または Cloudflare Worker secrets にだけ設定します。

## 使用するLINE機能

- LINE Login
  - LIFF起動時のユーザー識別
  - ID token 検証
  - family member と `line_user_id` の紐づけ
- Messaging API
  - 友だち追加イベント
  - グループ参加イベントとグループ単位の権限連携
  - アップロード完了通知（縮小プレビュー + 投稿者名）

## 必要な環境変数

ローカル開発では、リポジトリルートの `.dev.vars` に設定します。`.dev.vars` は `.gitignore` で除外済みです。

```dotenv
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_MESSAGING_CHANNEL_ID=
LINE_MESSAGING_CHANNEL_SECRET=
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=
LINE_LIFF_ID=
LIFF_ENDPOINT_URL=
SESSION_SECRET=
```

Cloudflare Workers にデプロイする場合は、値を `wrangler secret put` で設定します。値を `wrangler.toml` に直書きしません。

```bash
npx wrangler secret put LINE_LOGIN_CHANNEL_ID --config apps/api/wrangler.toml
npx wrangler secret put LINE_LOGIN_CHANNEL_SECRET --config apps/api/wrangler.toml
npx wrangler secret put LINE_MESSAGING_CHANNEL_ID --config apps/api/wrangler.toml
npx wrangler secret put LINE_MESSAGING_CHANNEL_SECRET --config apps/api/wrangler.toml
npx wrangler secret put LINE_MESSAGING_CHANNEL_ACCESS_TOKEN --config apps/api/wrangler.toml
npx wrangler secret put LINE_LIFF_ID --config apps/api/wrangler.toml
npx wrangler secret put LIFF_ENDPOINT_URL --config apps/api/wrangler.toml
npx wrangler secret put SESSION_SECRET --config apps/api/wrangler.toml
```

## LINE Developers 側の設定

本番URLが決まったら、LINE Developers Console で以下を設定します。

LINE Login channel と Messaging API channel は**同じProvider配下**に置きます。異なるProviderでは同一人物でもLINE user IDが一致せず、グループ在籍確認が成立しません。

### LINE Login channel

- Callback URL: MVPではLIFF endpoint と同じ `https://<app-domain>/` を設定する
- LIFF endpoint URL: `https://<app-domain>/`
- LIFF app type: Full / Tall は実機UXで決める
- Scope: `profile openid`
  - `liff.getIDToken()` をサーバー認証に使うため、`openid` は必須。未設定だとLINEログイン後もID tokenを取得できない

### Messaging API channel

- Webhook URL: `https://<api-domain>/webhook/line`
- Webhook usage: Enabled
- **Allow bot to join group chats: Enabled**
  - 家族・親戚のLINEグループへ公式アカウントを招待するために必須
  - この設定はMessaging APIでは変更できないため、LINE Developers Consoleで手動確認する
  - LINE仕様上、1つのグループに同時参加できるLINE公式アカウントは1つだけ
- Auto-reply / Greeting message: MVPでは必要最低限
- Rich menu: 使用しない
  - まるのこしは家族・親戚のグループ利用を基本とし、グループ内ではリッチメニューが導線にならないため
  - LIFFへの導線は、グループ参加時の設定メッセージとアップロード通知に集約する

## グループ連携の運用フロー

1. LINE Developers Consoleで `Allow bot to join group chats` を有効にする
2. 家族・親戚のLINEグループへ、まるのこし公式アカウントを招待する
3. 公式アカウントが返す一回限りの設定リンクを、既存アルバムのowner/adminが開く
4. 連携先アルバムとグループ権限を選ぶ
   - `viewer`: 閲覧のみ
   - `uploader`: 閲覧・投稿
   - グループ由来でowner/adminは付与しない
5. 通知を有効にすると、新規アップロード時に縮小プレビューと投稿者名をグループへpushする

グループリンクからLIFFを開いたユーザーは、Messaging APIのグループメンバーAPIで在籍確認後、1時間だけグループ由来の権限を得ます。原本は公開せず、LINEから取得可能なのは1MB以下の専用プレビューだけです。

## 実装時の注意

- LINEトークに送られた画像・動画を原本保存経路にしない。
- 原本保存は LIFF Web UI のファイル選択から行う。
- `liff.state` に元URLが包まれるケースを考慮し、直接 query と decoded state query をマージする。
- ID token / access token / signed URL をログに出さない。
- Messaging API token の疎通確認では、token値を標準出力に出さない。
- develop / production で LINE channel、LIFF ID、Webhook URL、R2/D1 を分離する。

## 最初の疎通確認

Messaging API token は、実装前でも Bot info API で読み取り確認できます。

```bash
python3 scripts/smoke_line_bot_info.py
```

まだスクリプトが無い場合は、一時スクリプトで `.dev.vars` を読み、`GET https://api.line.me/v2/bot/info` を呼びます。出力は HTTP status と bot名などに限定し、token値は出しません。

## 手動確認が必要なもの

- 本番 Callback URL が Console 側に反映されていること
- LINE Login channelとMessaging API channelが同じProvider配下であること
- Messaging API channel の `Allow bot to join group chats` がEnabledであること
- 公式アカウントをテストグループへ招待し、設定リンク→権限選択→写真通知を実機確認すること

## productionで設定済みのもの

- LIFF endpoint URL: `https://mrnks.2-38.com/`
- Messaging API webhook URL: `https://mrnks.2-38.com/webhook/line`
- Messaging API webhook usage: Enabled、接続テスト `200 OK`
- Messaging API `Allow bot to join group chats`: Consoleで手動確認が必要
- Messaging APIデフォルトリッチメニュー: 未設定（グループ利用を基本とするため意図的に無効化）

LIFF IDの実値は設定済みですが、公開repoのドキュメントには直書きしません。
