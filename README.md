# Quiz Enterprise v2

企業別の問題集配信、企業担当者ロール、受講者進捗確認、回答履歴、お問い合わせチケット、Excelインポート/エクスポートに対応した版です。

## 今回反映した変更

### 1. 2FAをGoogle Authenticator方式へ移行

メール送信方式ではなく、Google AuthenticatorなどのTOTP対応アプリで6桁コードを生成する方式へ移行します。

フロント側は以下を反映済みです。

```text
index.html
cct-totp-publish-period-frontend-patch.js
```

Worker側もTOTP対応が必要です。詳細は以下を確認してください。

```text
worker-totp-publish-period-notes.md
```

### 2. 問題集の公開期間設定を追加

管理者の問題集割り当てで、組織・個人の両方に対して公開開始日時・公開終了日時を設定できます。

公開期間外の問題集は、受講者の問題集一覧に表示されず、API側でもアクセス不可にする想定です。

D1で以下を実行してください。

```text
migration_totp_publish_period.sql
```

### 3. 既存の学習仕様

```text
出題順：完全ランダム
除外条件：3回連続正解済みの問題は出題対象から除外
不正解時：連続正解数を0に戻す
回答後：正解は緑、不正解は赤で表示
カード表示：1列
```

## 追加・更新ファイル

```text
index.html
cct-ui-patch.css
cct-totp-publish-period-frontend-patch.js
migration_totp_publish_period.sql
migration_sync_mastered.sql
worker-totp-publish-period-notes.md
```

## 反映手順

1. GitHub Pages側は今回のコミットで反映済みです。
2. Cloudflare D1で `migration_totp_publish_period.sql` を実行してください。
3. Cloudflare Worker側に `worker-totp-publish-period-notes.md` の内容を反映してください。
4. Workerを再デプロイしてください。
5. 既存ユーザーは2FAを再設定してください。

## 注意

フロント側だけではGoogle Authenticator方式は完了しません。必ずWorker側にもTOTP検証処理と公開期間判定を反映してください。
