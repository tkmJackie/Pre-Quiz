# Markdown + LaTeX 日本語Windows ¥ 修正版 v20260705-12

## 修正内容

日本語Windows環境や一部フォントでは、LaTeXの `\` が `¥` のように見える・入力されることがあります。

v20260705-12 では、数式部分だけ以下を自動変換します。

```text
¥frac → \frac
￥frac → \frac
¥theta → \theta
￥theta → \theta
¥( ... ¥) → \( ... \)
￥( ... ￥) → \( ... \)
```

これにより、以下のような表示崩れを減らします。

```text
¥(¥arg¥max_{¥theta} P(X ¥mid ¥theta)¥)
```

## 置き換えるファイル

```text
app.js
styles.css
```

## index.html

```html
<script src="vendor/mathjax-config.js?v=20260705-11"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-11"></script>

<link rel="stylesheet" href="styles.css?v=20260705-12">
<script src="app.js?v=20260705-12"></script>
```

`vendor/mathjax-config.js` は v20260705-11 のままで大丈夫です。

## ChatGPTへの指示

今後、問題作成を依頼するときは以下の一文を入れるのがおすすめです。

```text
LaTeXのコマンドは ¥ ではなく、必ず半角バックスラッシュ \ を使ってください。
インライン数式は $...$、ブロック数式は $$...$$ で書いてください。
```

## 例

```md
- [x] $\arg\max_{\theta} P(X \mid \theta)$
```

または、Windows上で `¥` になってしまっても、v20260705-12 では数式として表示できるようにしています。

## SQL / Worker

変更不要です。
