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
  - アップロード完了通知
  - リッチメニュー導線

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

### LINE Login channel

- Callback URL: `https://<app-domain>/auth/callback`
- LIFF endpoint URL: `https://<app-domain>/`
- LIFF app type: Full / Tall は実機UXで決める
- Scope: `profile openid`

### Messaging API channel

- Webhook URL: `https://<api-domain>/webhook/line`
- Webhook usage: Enabled
- Auto-reply / Greeting message: MVPでは必要最低限
- Rich menu:
  - 写真・動画を追加 → LIFF upload route
  - アルバムを見る → LIFF timeline route
  - 家族を招待 → LIFF invite route

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

## 未設定・手動確認が必要なもの

- LINE Developers Console 側の Messaging API `Webhook usage` がONになっていること
  - APIで webhook endpoint は設定・テスト可能
  - ただし `GET /v2/bot/channel/webhook/endpoint` の `active` が `false` の場合、Console側のON操作が必要
- 本番 Callback URL が Console 側に反映されていること

## productionで設定済みのもの

- LIFF endpoint URL: `https://mrnks.2-38.com/`
- Messaging API webhook URL: `https://mrnks.2-38.com/webhook/line`

LIFF ID の実値は client config と Worker secret に設定済みですが、公開repoのドキュメントには直書きしません。
