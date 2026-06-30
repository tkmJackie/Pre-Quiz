# 優先度「高」未解決リスク対応版

## 置き換えるファイル

```text
index.html
app.js
worker-single.js
README.md
```

## 対応した未解決リスク

### 1. localStorageからJWTを撤去

JWTを `localStorage` / `sessionStorage` に保存しないようにしました。

```text
変更前: localStorageにセッション情報を保存
変更後: JWTはメモリ上だけで保持
```

ページを再読み込みした場合は再ログインが必要です。

### 2. 2FA省略トークンをHttpOnly Cookie化

1週間2FA省略用のトークンは、JavaScriptから読めない `HttpOnly Cookie` で保持します。

```text
Cookie名: __Host-ZerquorLMSTrustedDevice
属性: HttpOnly; Secure; SameSite=None; Path=/
```

D1には引き続きSHA-256ハッシュだけを保存します。

### 3. inline onclick / onchange を削除

HTML文字列内の `onclick` / `onchange` を `data-action` / `data-change` に変更しました。

CSPでインラインJavaScriptを禁止しやすくするためです。

### 4. CSPを追加

`index.html` にContent Security Policyを追加しました。

主な制限:

```text
script-src 'self' https://cdn.jsdelivr.net
object-src 'none'
frame-ancestors 'none'
base-uri 'self'
```

### 5. パスワード変更時にTrusted Deviceを失効

パスワード変更時に、そのユーザーの2FA省略デバイスを全て失効します。

## 注意

この修正は、前回の優先度高対応版が前提です。
D1の以下テーブルが必要です。

```text
app_rate_limits
app_trusted_devices
```

まだ作成していない場合は、先に `migration_high_security.sql` を実行してください。

## ブラウザ挙動について

JWTを永続保存しないため、ページ再読み込み後はログイン画面に戻ります。
ただし、同じデバイスで1週間2FA省略を有効にしている場合、ログイン時の2FA入力は省略されます。
