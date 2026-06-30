# 変更が必要なファイルのみ

Google AuthenticatorのQRコード登録方式に変更するため、置き換えが必要なファイルだけを入れています。

## 置き換えるファイル

```text
index.html
app.js
styles.css
```

## 変更内容

- `index.html`
  - QRコード生成用の `qrcodejs` 読み込みを追加

- `app.js`
  - Google Authenticator登録用QRコードの表示処理を追加
  - QRコードが表示できない場合でもセットアップキーで登録可能

- `styles.css`
  - QRコード表示用のCSSを追加

## 変更不要なファイル

今回のQRコード表示対応だけであれば、以下は変更不要です。

```text
worker-single.js
migration_totp_publish_period.sql
migration_sync_mastered.sql
```

すでにGoogle Authenticator方式・公開期間設定をWorkerとD1に反映済みの場合、今回はフロント側3ファイルだけ置き換えてください。
