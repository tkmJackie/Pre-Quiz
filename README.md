# セキュリティ追加対策 1〜6 対応版 v20260705-18

## 対応内容

依頼された以下の1〜6をまとめて反映しています。

```text
1. Worker側の入力サイズ制限
2. 重要操作時の再認証
3. frame-ancestors / X-Frame-Options のヘッダー設定例
4. JSON / Markdown エクスポート追加
5. 管理者向け監査ログ画面
6. 論理削除・復元機能
```

---

## 含まれるファイル

```text
index.html
app.js
worker-single.js
_headers
cloudflare-security-headers.txt
README.md
```

---

## 反映先

GitHub側:

```text
index.html
app.js
_headers
cloudflare-security-headers.txt
```

Cloudflare Worker側:

```text
worker-single.js
```

SQL変更:

```text
不要
```

既存の `is_active` を使って論理削除します。

---

## 1. Worker側の入力サイズ制限

Workerで以下の制限を入れています。

```text
JSONリクエスト全体: 最大 5MB
問題文: 最大 100KB
解説: 最大 200KB
選択肢1つ: 最大 50KB
1問全体: 最大 300KB
一括インポート: 最大 500問
```

制限超過時は `413` で拒否します。

---

## 2. 重要操作時の再認証

以下の操作でTOTP再認証を求めます。

```text
ユーザー削除
ユーザー更新のうち、パスワード変更・ロール変更・2FAリセット・無効化
企業無効化
問題集削除
問題集復元
問題一括論理削除
問題削除
問題復元
```

フロント側では認証アプリの6桁コードを入力します。

Worker側では `reauth.totpCode` を検証します。
`reauth.password` による検証もWorker側では対応しています。

---

## 3. frame-ancestors / X-Frame-Options

API側のWorkerはすでに `X-Frame-Options: DENY` と `frame-ancestors 'none'` を返します。

静的フロント側については、CloudflareでHTTPレスポンスヘッダーを設定してください。
同梱の `_headers` はCloudflare Pages用です。
GitHub Pages + Cloudflareの場合は `cloudflare-security-headers.txt` の内容をCloudflare Rulesに設定してください。

---

## 4. JSON / Markdown エクスポート

問題集管理に以下を追加しています。

```text
JSONエクスポート
Markdownエクスポート
```

Excelと違い、画像の `data:image` も保持します。
完全バックアップ用途にはJSONまたはMarkdownを使ってください。

---

## 5. 管理者向け監査ログ画面

管理者画面に「監査ログ」カードを追加しています。

取得できる主なログ:

```text
再認証成功・失敗
ユーザー作成・削除・更新
問題集作成・更新・削除・復元
問題作成・更新・削除・復元
エクスポート
インポート
```

---

## 6. 論理削除・復元機能

物理削除ではなく、既存の `is_active = 0` を使った論理削除に変更しています。

対象:

```text
問題集削除
問題削除
インポート済み問題の削除
```

管理者画面に「削除済みデータ」カードを追加しています。
そこから問題集・問題を復元できます。

---

## index.html

```html
<link rel="stylesheet" href="styles.css?v=20260705-13">
<script src="vendor/mathjax-config.js?v=20260705-13"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-13"></script>
<script defer src="app.js?v=20260705-18"></script>
```

---

## 確認

ブラウザのコンソールに以下が出れば反映済みです。

```text
Zerquor LMS: security full fix v20260705-18 loaded
```

Worker側は以下で確認できます。

```text
/api/version
```

期待値:

```text
enterprise-v2-security-full-20260705-18
```
