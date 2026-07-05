# Markdown + LaTeX 数式対応 修正版 v20260705-11

## 今回の修正

v20260705-10 で問題作成・問題一覧系の関数が一部欠けていたため、選択中の問題一覧が出ない問題を修正しました。

```text
ReferenceError: setQuestionCreatorNumberCacheFromQuestions is not defined
```

このエラーが出ないように修正済みです。

## 置き換えるファイル

```text
app.js
styles.css
vendor/mathjax-config.js
```

## index.html

```html
<script src="vendor/mathjax-config.js?v=20260705-11"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-11"></script>

<link rel="stylesheet" href="styles.css?v=20260705-11">
<script src="app.js?v=20260705-11"></script>
```

## CSPについて

MathJaxは内部で数式表示用の style を追加するため、厳格なCSPでは以下の警告が出ることがあります。

```text
Applying inline style violates the following Content Security Policy directive 'style-src 'self''
```

数式表示を優先する場合は、index.html の CSP を以下のようにしてください。

```text
style-src 'self' 'unsafe-inline'
```

例:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src https://cct-english-api.tkm12325.workers.dev; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests">
```

## MathJaxの警告について

v20260705-10 では以下の警告が出ることがありました。

```text
Package 'mathtools' not found.
Package 'boldsymbol' not found.
```

v20260705-11 では設定から削除しています。

## SQL / Worker

変更不要です。
