# 修正優先度 高 対応版 v20260705-17

## 対応した内容

今回のZIPでは、セキュリティ修正の優先度が高い以下を反映しています。

```text
1. WorkerでURL tokenを明示的に拒否
2. 認証ロールをURLパラメータから受け取らない
3. CORSのデフォルト許可元を https://lms.zerquor.com に固定
4. Markdown画像で外部HTTPS画像を表示しない
```

---

## 置き換えるファイル

```text
index.html
app.js
worker-single.js
README.md
```

---

## 1. URL token の拒否

Workerの `requireAuth()` で、URLに `?token=` が付いていた場合は拒否します。

```js
const url = new URL(request.url);
if (url.searchParams.has("token")) {
  throw httpError(400, "URL token is not allowed");
}
```

認証トークンは、必ず以下のヘッダーだけで受け取ります。

```text
Authorization: Bearer <JWT>
```

---

## 2. 認証ロールはURLから受け取らない

選択中ロールは、従来通りヘッダーから受け取ります。

```text
X-CCT-Role: admin
X-CCT-Role: company_manager
X-CCT-Role: student
```

`?role=admin` のようなURL指定は認証ロールには使いません。

---

## 3. CORSの許可元を固定

WorkerのデフォルトCORS許可元を以下にしました。

```text
https://lms.zerquor.com
```

Cloudflare Workerの環境変数も、本番では以下にしてください。

```text
CORS_ORIGIN=https://lms.zerquor.com
```

`*` は使わないでください。今回のコードでは `*` は無視します。

---

## 4. Markdown画像の外部HTTPSを禁止

以下は許可します。

```text
data:image/png
data:image/jpeg
data:image/webp
data:image/gif
images/ 配下のローカル画像
```

以下は許可しません。

```text
https://example.com/image.png
```

受講者が問題を開いたときに外部サーバへアクセスログが残る可能性があるためです。

---

## index.html

```html
<link rel="stylesheet" href="styles.css?v=20260705-13">
<script src="vendor/mathjax-config.js?v=20260705-13"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-13"></script>
<script defer src="app.js?v=20260705-17"></script>
```

---

## 確認

ブラウザのコンソールに以下が出れば `app.js` は反映済みです。

```text
Zerquor LMS: security high priority fix v20260705-17 loaded
```

WorkerもCloudflare側に `worker-single.js` を反映してください。

---

## SQL

変更不要です。
