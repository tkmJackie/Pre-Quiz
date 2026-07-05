# PDF一括MDインポート対応版

## 置き換えるファイル

```text
app.js
styles.css
```

## 追加内容

PDFから作成したMarkdownファイルを、問題作成画面から一度に全問登録できるようにしました。

## 使い方

```text
1. 管理者でログイン
2. 問題集管理で対象の問題集を選択
3. 問題作成画面を開く
4. MD一括入力欄に CS0-003_bulk_import_with_explanations.md を貼り付け
   または「MDファイルを読み込む」からファイルを選択
5. 「MDを全問一括保存」を押す
```

## 区切り記号

```text
---END-QUESTION---
```

## 変更不要

```text
worker-single.js
SQL
index.html
```

既存の `/api/admin/question-sets/{id}/import` APIを使用します。
