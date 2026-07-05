# 問題編集「次へ」高速化版 v20260705-09

## 置き換えるファイル

```text
app.js
styles.css
worker-single.js
```

## 修正内容

問題編集画面の「次の問題を修正」「保存して次の問題へ」を高速化しました。

## 何が速くなるか

```text
変更前:
  次へボタン
  ↓
  全問題一覧を取得
  ↓
  次の問題を探す
  ↓
  次の問題を再取得
  ↓
  表示

変更後:
  次へボタン
  ↓
  Worker側で次の1問だけ取得
  ↓
  取得済みの問題をそのまま表示
```

全問題一覧を読み込まないため、問題数が多くても次の画面に移動しやすくなります。

## 利用API

```text
POST /api/admin/questions/{questionId}/next
```

このAPIが必要なので、worker-single.js も必ずCloudflare Workerへ反映してください。

## 反映確認

問題編集画面で以下が表示されれば最新版です。

```text
編集 / 高速次へ v20260705-09
```

コンソールには以下が出ます。

```text
Zerquor LMS: fast next editor v20260705-09 loaded
```

## index.html のキャッシュ対策

```html
<link rel="stylesheet" href="styles.css?v=20260705-09">
<script src="app.js?v=20260705-09"></script>
```

## 重要

v20260705-08 は `/next` を使わずに既存APIで全問題一覧から次の問題を探すため、問題数が多いと遅くなります。

高速化するには、今回の worker-single.js をCloudflare Workerに反映して、v20260705-09 を使ってください。

## SQL

変更不要です。
