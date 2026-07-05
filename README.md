# 問題作成画面 軽量化版 v20260705-04

## 置き換えるファイル

```text
app.js
styles.css
worker-single.js
```

## 修正内容

問題作成画面を開くときに、対象問題集の全問題を読み込まないようにしました。

## ナンバリングについて

ナンバリングは維持します。

```text
・Worker側で次の番号だけ取得
・全問題の本文・選択肢・解説は読み込まない
・保存後は現在の番号 + 1 に進む
・MD一括登録後も次の番号を保持
```

## 追加API

```text
GET /api/admin/question-sets/{questionSetId}/summary
```

返却内容です。

```json
{
  "questionCount": 267,
  "maxNumber": 267,
  "nextNumber": 268,
  "lastCategory": "CySA+ (CS0-003)"
}
```

## 反映後の確認

問題作成画面の問題入力欄の右側に以下が出れば最新版です。

```text
左画面 / 軽量版 v20260705-04
```

## 変更不要

```text
SQL
```

## 注意

worker-single.js も変更しています。
Cloudflare Worker 側にも必ず反映してください。
