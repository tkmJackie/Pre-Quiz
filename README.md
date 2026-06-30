# Pre-Quiz Release

今回の修正版ファイル一式です。

## 反映内容

- Google Authenticator方式の2FAへ移行
- メール送信による2FAを廃止
- 問題集の公開開始日時 / 公開終了日時を設定可能
- 組織単位・個人単位の公開期間設定に対応
- 公開期間外の問題集は受講者に表示されず、API側でもアクセス不可
- 出題順は完全ランダム
- 3回連続正解済みの問題は出題対象から除外
- 不正解時は連続正解数を0に戻す
- 回答後、正解の選択肢は緑、不正解の選択肢は赤で表示
- カード表示は1列

## 含まれるファイル

```text
index.html
styles.css
app.js
worker-single.js
migration_totp_publish_period.sql
migration_sync_mastered.sql
README.md
```

## 反映手順

1. GitHub Pages側は `index.html`、`styles.css`、`app.js` を置き換えてください。
2. Cloudflare Worker側は `worker-single.js` の内容で置き換えてください。
3. Cloudflare D1で `migration_totp_publish_period.sql` を実行してください。
4. 必要に応じて `migration_sync_mastered.sql` を実行してください。
5. 既存ユーザーはGoogle Authenticatorを再設定してください。

## 注意

`migration_totp_publish_period.sql` は、既存のメール2FAユーザーを再設定対象にします。
Workerを反映する前にD1マイグレーションを実行してください。
