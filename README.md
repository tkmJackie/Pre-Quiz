# 問題集管理画面 レイアウト整理版 修正版 v20260708-03

## 修正内容

v20260708-02 で以下のエラーが出る問題を修正しました。

```text
Uncaught ReferenceError: async is not defined
```

原因は、`async` が単独行になっており、JavaScript上で通常の変数名として評価されていたためです。

```js
async
function renderAdmin() {
  ...
}
```

これを以下の形に修正しています。

```js
async function renderAdmin() {
  ...
}
```

## v20260708-02で検出した async 単独行

```text
[1112]
```

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
Zerquor LMS: question set import/export layout cleanup fix v20260708-03 loaded
```

## index.html

```html
<link rel="stylesheet" href="styles.css?v=20260708-03">
<script src="vendor/mathjax-config.js?v=20260705-13"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-13"></script>
<script defer src="app.js?v=20260708-03"></script>
```
