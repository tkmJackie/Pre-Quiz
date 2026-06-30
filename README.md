# 今すぐ直すべき項目 対応版

## 置き換えるファイル

```text
index.html
app.js
worker-single.js
styles.css
migration_security_followup.sql
_headers
README.md
```

## 対応した項目

### 1. 管理者によるユーザーパスワード変更時の既存JWT失効

管理者がユーザーのパスワードを変更した場合も、以下を実行するようにしました。

```text
token_version = token_version + 1
Trusted Device 全失効
password_changed_at 更新
```

ユーザー削除時、2FAリセット時も既存JWTとTrusted Deviceを失効します。

### 2. createUser() のパスワード条件を12文字以上に統一

ユーザー作成時も、本人のパスワード変更時と同じポリシーに統一しました。

```text
12文字以上
推測されやすい文字列を拒否
メールアドレスに近いパスワードを拒否
```

### 3. HTTPセキュリティヘッダーを追加

Worker APIレスポンスに以下を追加しました。

```text
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'
Cache-Control: no-store
```

`index.html` には `referrer` metaも追加しています。

注意: `https://tkmjackie.github.io/Pre-Quiz/` はGitHub Pagesなので、リポジトリに `_headers` を置いてもHTTPヘッダーとしては反映されません。
`_headers` はCloudflare Pagesへ移行した場合に使えます。

### 4. tableHtml() のHTML許可方式を安全化

以前は `<button` や `<span` を含む文字列をHTMLとして許可していました。

今回から、HTMLとして許可するセルは `rawHtml()` で明示したものだけに変更しました。

### 5. 監査ログテーブルを追加

D1に `app_audit_logs` を追加します。

記録対象の例:

```text
ログイン失敗
ログイン成功
2FAチャレンジ発行
2FA成功/失敗
2FA設定/再設定
プロフィール変更
パスワード変更
ユーザー作成/更新/削除
組織作成
問題集作成
割当変更
初期管理者作成
```

## 反映手順

1. D1で `migration_security_followup.sql` を実行
2. Workerへ `worker-single.js` を反映
3. GitHub Pagesへ `index.html`、`app.js`、`styles.css` を反映
4. ブラウザで強制リロード

## 補足

前回の `migration_complete_security.sql` をまだ実行していない場合は、先にそちらを実行してください。
