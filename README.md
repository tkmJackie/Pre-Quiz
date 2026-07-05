# Markdown + LaTeX 数式対応版 v20260705-10

## 置き換えるファイル

```text
app.js
styles.css
```

## 追加するファイル

```text
vendor/mathjax-config.js
```

## 別途配置が必要なファイル

MathJax本体を以下に配置してください。

```text
vendor/mathjax/tex-svg.js
```

MathJaxはローカル配置推奨です。CDNを使う場合はCSP変更が必要になります。

## index.html に追加するコード

`app.js` より前に、以下を追加してください。

```html
<script src="vendor/mathjax-config.js?v=20260705-10"></script>
<script defer src="vendor/mathjax/tex-svg.js?v=20260705-10"></script>
```

既存の読み込みは以下のようにしてください。

```html
<link rel="stylesheet" href="styles.css?v=20260705-10">
<script src="app.js?v=20260705-10"></script>
```

## 使える記法

### インライン数式

```md
重みは $w$ とし、学習率は $\eta$ とする。
```

または、

```md
重みは \(w\) とし、学習率は \(\eta\) とする。
```

### ブロック数式

```md
$$
L(w) = \frac{1}{n}\sum_{i=1}^{n}(y_i - wx_i)^2
$$
```

または、

```md
\[
P(A|B) = \frac{P(B|A)P(A)}{P(B)}
\]
```

## 対応場所

```text
・問題文
・選択肢
・解答解説
・HTMLプレビュー
・受講者の問題表示画面
・回答結果画面
```

## 対応できる例

```md
$$
A =
\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix}
$$
```

```md
$$
\nabla_w L(w) =
-\frac{2}{n}\sum_{i=1}^{n}x_i(y_i - wx_i)
$$
```

## 注意

MathJax本体が未配置の場合でも、LaTeX記法は画面に表示されます。
ただし、きれいな数式レンダリングには `vendor/mathjax/tex-svg.js` が必要です。

## SQL / Worker

変更不要です。
