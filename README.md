# 問題集管理画面 レイアウト整理版 修正版 v20260708-02

## 修正内容

v20260708-01 で以下の構文エラーが出る問題を修正しました。

```text
Uncaught SyntaxError: await is only valid in async functions and the top level bodies of modules
```

原因は、`renderAdmin()` の中で `await fillAdminData()` を使っているのに、
関数定義が `async function renderAdmin()` ではなく `function renderAdmin()` になっていたためです。

## 置き換えるファイル

```text
index.html
app.js
README.md
```

`worker-single.js` は変更不要です。

## 確認

コンソールに以下が出れば反映済みです。

```text
Zerquor LMS: question set import/export layout cleanup fix v20260708-02 loaded
```

## index.html

```html
<link rel="stylesheet" href="styles.css?v=20260708-02">
<script src="vendor/mathjax-config.js?v=20260705-13"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-13"></script>
<script defer src="app.js?v=20260708-02"></script>
```
