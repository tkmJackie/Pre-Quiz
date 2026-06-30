# 全脆弱性対応版

このZIPは、直近の分析で挙げた脆弱性をまとめて修正した版です。

## 置き換えるファイル

```text
index.html
app.js
worker-single.js
styles.css
migration_complete_security.sql
```

## 修正内容

### 認証・2FA

- `2fa_challenge` JWTを通常APIでは拒否
- 2FA初期設定用JWTは `/api/me`、`/api/me/2fa/setup`、`/api/me/2fa/confirm` のみに制限
- JWTに `tokenVersion` を追加
- パスワード変更時に `token_version` を増やし、既存JWTを失効
- パスワード変更時にTrusted Deviceを全失効
- 2FA再設定時に、現在のパスワードまたは現在のTOTPコード確認を必須化
- 既存の平文TOTP secretは、認証成功時に自動で暗号化へ移行
- 新規TOTP secretはAES-GCMで暗号化保存

### XSS対策

- `localStorage` へのJWT保存なし
- 2FA省略トークンはHttpOnly Cookie
- `onclick` / `onchange` は撤去済み
- CSPを強化
- 外部CDN読み込みを削除
- `index.html` はローカルvendorファイルを参照
- 静的な `style=""` を削除

### API・運用

- `/api/setup` は `SETUP_DISABLED=true` で無効化可能
- 既存ユーザーがいる状態での `force` セットアップは `ALLOW_SETUP_FORCE=true` がない限り拒否
- 本番デフォルトCORSは `https://tkmjackie.github.io` のみに制限
- パスワードは12文字以上に強化
- 推測されやすいパスワードとメールアドレスに近いパスワードを拒否

## 反映手順

1. Cloudflare D1で `migration_complete_security.sql` を実行
2. Cloudflare Workerに以下の環境変数を設定

```text
TOTP_ENCRYPTION_KEY=32文字以上のランダム値
SETUP_DISABLED=true
CORS_ORIGIN=https://tkmjackie.github.io
```

3. `worker-single.js` をWorkerへ反映
4. GitHub Pages側で `index.html`、`app.js`、`styles.css` を置き換え
5. `vendor/` に以下の2ファイルを配置

```text
vendor/xlsx.full.min.js
vendor/qrcode.min.js
```

6. ブラウザを強制リロード

## 注意

`vendor/xlsx.full.min.js` と `vendor/qrcode.min.js` は、CDN依存をなくすためにローカル配置へ変更しています。
このZIPには第三者ライブラリ本体は同梱していません。
