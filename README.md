# 問題エクスポート修正版 v20260705-15

## 原因

現在の app.js は、エクスポート時に以下のAPIだけを呼びます。

```js
/api/admin/question-sets/{setId}/export
```

Worker側に `export` アクションが入っていない、または古いWorkerがデプロイされている場合、
このAPIが 404 になり、Excelが出力されません。

## 修正内容

v20260705-15 では以下の2段構えにしました。

1. `/api/admin/question-sets/{setId}/export` を試す
2. 失敗した場合は `/api/admin/question-sets/{setId}/questions` から問題一覧を取得して、ブラウザ側でExcelを作る

そのため、Workerの反映が遅れてもエクスポートしやすくなります。

## 置き換えるファイル

```text
app.js
worker-single.js
```

## index.html

```html
<script src="vendor/mathjax-config.js?v=20260705-13"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-13"></script>

<link rel="stylesheet" href="styles.css?v=20260705-13">
<script defer src="app.js?v=20260705-15"></script>
```

## 重要

`worker-single.js` もCloudflare Workerへ反映してください。
ただし、v20260705-15 の app.js はフォールバックを持っているため、
Workerの `/export` が一時的に失敗しても `/questions` からExcelを作成します。

## 確認

コンソールに以下が出れば app.js は反映済みです。

```text
Zerquor LMS: export fix v20260705-15 loaded
```

## SQL

不要です。


## index.html も同梱

このZIPには `index.html` も含めています。

`index.html` は以下の状態です。

```html
<link rel="stylesheet" href="styles.css?v=20260705-13">
<script src="vendor/mathjax-config.js?v=20260705-13"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-13"></script>
<script defer src="app.js?v=20260705-15"></script>
```

CSPも MathJax 用に以下を含めています。

```text
worker-src 'self' blob:;
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
connect-src 'self' https://cct-english-api.tkm12325.workers.dev;
```
