# 一括インポート選択肢不足エラー修正版

## 置き換えるファイル

```text
app.js
styles.css
```

## 修正内容

MD一括インポート時に、PDFの図表問題などで選択肢が抽出できない問題があっても、全体の登録が止まらないようにしました。

また、今回のMDファイル側では、選択肢が空だった問題に以下のような補助選択肢を追加しています。

```text
- [x] 正答または図表確認問題
- [ ] 上記以外
```

## 取り込むファイル

```text
CS0-003_bulk_import_detailed_explanations_fixed.md
```

## 変更不要

```text
worker-single.js
SQL
index.html
```
