# 受講者画面 MathJax 表示修正版 v20260705-13

## 修正内容

受講者用画面で、数式が以下のようにそのまま表示される問題を改善しました。

```text
¥(¥arg¥max_{¥theta} P(X ¥mid X)¥)
```

原因は、画面描画時点で MathJax の読み込みがまだ完了しておらず、
`typesetPromise()` が実行されない場合があったためです。

v20260705-13 では、MathJaxの読み込み完了まで数式レンダリングを待機・再実行するようにしました。

## 置き換えるファイル

```text
app.js
styles.css
vendor/mathjax-config.js
```

## index.html

```html
<script src="vendor/mathjax-config.js?v=20260705-13"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-13"></script>

<link rel="stylesheet" href="styles.css?v=20260705-13">
<script src="app.js?v=20260705-13"></script>
```

## 重要：CSP

MathJaxは内部で数式表示用のstyleを追加します。
そのため、index.html の CSP は以下にしてください。

```text
style-src 'self' 'unsafe-inline'
```

例:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src https://cct-english-api.tkm12325.workers.dev; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests">
```

## 確認方法

コンソールに以下が出れば最新版です。

```text
Zerquor LMS: student MathJax render fix v20260705-13 loaded
```

受講者画面では、以下のような文字列がそのまま表示されず、

```text
¥(¥arg¥max_{¥theta} P(X ¥mid ¥theta)¥)
```

数式として表示されればOKです。

## SQL / Worker

変更不要です。
