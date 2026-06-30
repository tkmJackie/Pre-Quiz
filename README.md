# 優先度「高」脆弱性対応版

## 置き換えるファイル

```text
app.js
worker-single.js
migration_high_security.sql
```

## 対応した内容

### 1. JWTをURLクエリで送らない

変更前はAPI呼び出し時に以下のようにURLへトークンを付けていました。

```text
?token=...
```

変更後は以下のヘッダーで送信します。

```text
Authorization: Bearer <JWT>
X-CCT-Role: <role>
```

Worker側もURLクエリの `token` を受け付けないように変更しています。

### 2. ログイン・2FAのレート制限

D1に `app_rate_limits` テーブルを追加します。

制限内容:

```text
ログイン: 15分で10回まで
2FA: 10分で5回まで
超過時: 15分ロック
```

### 3. 2FA省略トークンをD1管理方式へ変更

変更前はJWTのみで1週間省略していました。

変更後は、ランダムトークンをブラウザに保存し、D1にはSHA-256ハッシュだけを保存します。

追加テーブル:

```text
app_trusted_devices
```

これにより、サーバー側で期限管理・失効管理ができます。

### 4. TOTPシークレットを暗号化保存

`two_factor_secret` をAES-GCMで暗号化してD1へ保存します。

Cloudflare Workerの環境変数に以下を追加してください。

```text
TOTP_ENCRYPTION_KEY
```

32文字以上のランダム値を設定してください。

例:

```bash
openssl rand -base64 32
```

既存の平文TOTPシークレットも読み取り互換を残しています。
ただし、新規セットアップ・再セットアップ時から暗号化保存されます。

## 反映手順

1. Cloudflare D1で `migration_high_security.sql` を実行
2. Cloudflare Workerに `TOTP_ENCRYPTION_KEY` を追加
3. `worker-single.js` を置き換えてデプロイ
4. GitHub Pages側の `app.js` を置き換え
5. ブラウザで強制リロード

## 注意

`migration_high_security.sql` を実行せずにWorkerを置き換えると、
ログイン時に `app_rate_limits` または `app_trusted_devices` が存在しないエラーになります。
