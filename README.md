# 2FA確認処理の修正版

## 置き換えるファイル

```text
app.js
```

## 修正内容

Google Authenticator方式では `codeId` は不要です。

古いメール2FA用の確認処理が残っていたため、以下のアラートが表示されていました。

```text
確認コードの送信情報がありません。もう一度コードを送信してください。
```

今回の修正版では、認証アプリに表示された6桁コードだけを `/api/me/2fa/confirm` に送信します。

## 変更不要

```text
index.html
styles.css
worker-single.js
SQL
```
