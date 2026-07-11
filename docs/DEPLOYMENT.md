# デプロイ手順

まるのこしは Cloudflare Worker + D1 + R2 で動かします。

## 公開URL

- Production: https://mrnks.2-38.com/
- Health: https://mrnks.2-38.com/health

## ローカルにだけ置く設定

実値入りの `wrangler.jsonc` と `.dev.vars` はコミットしません。

```bash
cp wrangler.example.jsonc wrangler.jsonc
# wrangler.jsonc の <D1_DATABASE_ID> を実環境のIDに置き換える
# .dev.vars に LINE / SESSION secrets を設定する
```

`wrangler.jsonc` には以下の production bindings を設定します。

- Worker name: `mrnks`
- Custom domain: `mrnks.2-38.com`
- D1: `mrnks-db`
- R2: `mrnks-media`
- R2 binding: `MEDIA_BUCKET`
- D1 binding: `DB`

## Cloudflare resources

```bash
npx wrangler d1 create mrnks-db
npx wrangler r2 bucket create mrnks-media
printf 'y\n' | npx wrangler d1 migrations apply mrnks-db --remote --config wrangler.jsonc
```

## Secrets

Secrets は `wrangler secret bulk` または `wrangler secret put` で設定します。値を標準出力やコミットに出さないこと。

必要な secret names:

- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`
- `LINE_MESSAGING_CHANNEL_ID`
- `LINE_MESSAGING_CHANNEL_SECRET`
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
- `LINE_LIFF_ID`
- `LIFF_ENDPOINT_URL`
- `SESSION_SECRET`

## 検証

```bash
npm run check
npm run deploy:dry-run
```

## デプロイ

```bash
npm run deploy
```

## 公開スモーク

```bash
curl -fsS https://mrnks.2-38.com/health
curl -fsS https://mrnks.2-38.com/api/config
```

原本保存の実動作は、短命の synthetic session を D1 に作成して以下を確認します。

1. `PUT /api/families/:familyId/media` で原本とLINE通知用プレビューをmultipart保存
2. R2保存後のSHA-256一致
3. `GET /api/families/:familyId/media` で一覧反映
4. `POST /api/media/:assetId/download-url` で短命URL発行
5. `GET /api/download/:token` でダウンロードした原本のSHA-256一致
6. LINE通知用URLが原本ではなく1MB以下の派生プレビューだけを返すこと
7. synthetic D1 rows と R2 object を削除

## LINE設定

`docs/LINE_SETUP.md` を参照。LIFF endpoint と Messaging API webhook は production URL に向けます。

注意: Messaging API の webhook endpoint はAPIで設定・テストできますが、LINE Developers Console 側の「Webhook usage」がOFFの場合は `active: false` のままになります。その場合は Console でONにする必要があります。
