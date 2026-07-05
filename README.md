# 問題編集画面 次の問題ボタン Not Found 回避版 v20260705-06

## 置き換えるファイル

```text
app.js
styles.css
worker-single.js
```

## 修正内容

「保存して次の問題へ」を押したときに `Not Found` が出る問題を回避しました。

原因は、ブラウザ側は新しい `/next` API を呼んでいるのに、Cloudflare Worker 側にまだ新しいAPIが反映されていない場合があるためです。

## 今回の対策

```text
1. まず新API POST /api/admin/questions/{questionId}/next を呼ぶ
2. Not Found などで失敗した場合は、既存の問題一覧APIで次の問題を探す
3. 見つかった次の問題を編集画面に表示する
```

これにより、Worker反映が遅れていても「保存して次へ」が動きます。

## 反映後の確認

問題編集画面で以下が表示されれば最新版です。

```text
編集 / 次へ対応 v20260705-06
```

## 重要

worker-single.js も同梱しています。
Cloudflare Worker 側にも反映すると、新APIでより軽く動きます。

## index.html のキャッシュ対策

```html
<link rel="stylesheet" href="styles.css?v=20260705-06">
<script src="app.js?v=20260705-06"></script>
```

## 変更不要

```text
SQL
```
