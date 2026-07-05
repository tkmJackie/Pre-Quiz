# CSP対応・保存して次へ Not Found 回避版 v20260705-07

## 置き換えるファイル

```text
app.js
styles.css
worker-single.js
```

## 修正内容

```text
・進捗バーの inline style を削除
・Content Security Policy の style-src 'self' でも進捗表示できるように変更
・native progress 要素で進捗率を表示
・保存して次へで /next が Not Found の場合、既存APIで次の問題を探す fallback を維持
```

## 反映確認

画面に以下が表示されれば最新版です。

```text
自動入力 / 一括登録 v20260705-07
編集 / 次へ対応 v20260705-07
```

ブラウザコンソールには以下が出ます。

```text
Zerquor LMS: csp-safe progress and next fallback v20260705-07 loaded
```

## index.html のキャッシュ対策

```html
<link rel="stylesheet" href="styles.css?v=20260705-07">
<script src="app.js?v=20260705-07"></script>
```

## Cloudflare Worker

worker-single.js も反映してください。
Worker側に反映すれば `/next` API が使われます。
反映前でも、フロント側のfallbackで動作します。

## SQL

変更不要です。
