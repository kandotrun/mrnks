# まるのこし

> 思い出を、画質ごと残す。

**まるのこし** は、家族の写真・動画を LINE からかんたんに共有しつつ、原本を圧縮せずに保存するための家族アルバムです。

Live: https://mrnks.2-38.com/

「みてね」のような家族導線は保ちつつ、価値の中心は **見ること** よりも **残すこと** に置きます。

## いま決めていること

- プロダクト名: **まるのこし**
- 入口: LINE公式アカウント + LIFF
- 最重要価値: 写真・動画の原本を劣化させずに保存する
- 初期ターゲット: 家族内共有。まずは自分たち用に確実に使えること
- 初期スコープ: アップロード、日付別ギャラリー閲覧、原本ダウンロード、家族通知

## ドキュメント

- [プロダクト・システム設計](docs/DESIGN.md)
- [MVP実装計画](docs/MVP_PLAN.md)
- [LINE設定メモ](docs/LINE_SETUP.md)
- [デプロイ手順](docs/DEPLOYMENT.md)

## MVP実装状況

現在のMVP実装:

- Cloudflare Worker で LIFF UI と API を配信
- `GET /health`, `GET /api/config`
- LINE ID token によるログインAPI
- D1 session / family / media metadata
- R2 への原本保存
- SHA-256照合
- 日付ごとのサムネイルギャラリー、追加読み込み、拡大表示
- DNG内の埋め込みJPEGを使ったRAWプレビュー（プレビュー非搭載DNGも原本は無変換で保持）
- 短命URLによる原本ダウンロード
- LINE webhook 署名検証、グループ招待時の一回限り設定リンク、案内返信
- LINEグループ単位の `viewer` / `uploader` 権限（在籍確認つき1時間セッション）
- 新規アップロード時のLINE通知（1MB以下の限定プレビュー + 投稿者名、二重送信防止）
- LINE公式アカウントのデフォルトリッチメニューからLIFFを起動

## MVPの成功条件

1. iPhone/Android から LIFF 画面で写真・動画を選択できる
2. 原本ファイルがサーバー側で再圧縮されずに保存される
3. 撮影日時・ファイルサイズ・MIME・ハッシュなどの検証情報を記録できる
4. 家族だけがタイムラインを閲覧できる
5. 原本を期限付きURLでダウンロードできる
6. 新規追加時に LINE 通知できる

## やらないこと、まだやらないこと

- LINEトークに写真を送らせて保存する方式は採用しない
  LINE側で圧縮・変換される可能性があるため。
- 最初から正式な LINEミニアプリ審査を目指さない
  まずは LINE公式アカウント + LIFF で検証する。
- コメント、スタンプ、製本、SNS的フィードは MVP では後回し。
- 原本を公開URLで直置きしない。

## 推奨スタック案

- Frontend: React / Vite または Next.js の LIFF Web UI
- API: Cloudflare Workers + Hono
- Storage: Cloudflare R2
- DB: Cloudflare D1 から開始。必要なら Postgres に移行
- Background jobs: Cloudflare Queues + 画像/動画変換ワーカー
- Notifications: LINE Messaging API

## 開発方針

小さく作って、実機で画質保持を先に検証します。
UIや機能追加よりも先に、**原本が本当に劣化せず保存・復元できること**を確認します。
