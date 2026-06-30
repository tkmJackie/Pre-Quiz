# リロード時ログイン維持 修正版

## 置き換えるファイル

```text
app.js
```

## 修正内容

ページをリロードしてもログイン画面に戻らないようにしました。

## 方式

JWTを `sessionStorage` に保存します。

```text
リロード: ログイン維持
同じタブでの画面更新: ログイン維持
タブを閉じる: ログアウト扱い
JWT期限切れ: ログイン画面へ戻る
```

`localStorage` ではなく `sessionStorage` を使うため、永続保存よりは安全寄りです。

## 変更不要

```text
worker-single.js
SQL
index.html
styles.css
```

## 注意

JWTの有効期限が切れた場合は再ログインが必要です。
