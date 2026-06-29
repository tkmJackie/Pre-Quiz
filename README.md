# CCT Quiz Enterprise v2

企業別の問題集配信、企業担当者ロール、受講者進捗確認、回答履歴、お問い合わせチケット、Excelインポート/エクスポートに対応した版です。

## 含まれるファイル

```text
frontend/index.html
frontend/styles.css
frontend/app.js
cloudflare-dashboard/schema.sql
cloudflare-dashboard/worker-single.js
docs/excel-format.md
```

## 反映手順

### 1. D1 schemaを実行

Cloudflare D1 Consoleで以下を実行します。

```text
cloudflare-dashboard/schema.sql
```

既存の `users` や `words` とは別に、`app_` で始まるテーブルを作るため、旧版と衝突しにくい構成です。

### 2. Workerを差し替え

Cloudflare Workerのコード画面に以下を全文貼り付けます。

```text
cloudflare-dashboard/worker-single.js
```

設定は以下が必要です。

```text
D1 Binding name: DB
Secret: JWT_SECRET
Secret: SETUP_KEY
```

`JWT_SECRET` は8文字以上の長いランダム文字列にしてください。

### 3. GitHub Pagesを差し替え

以下の3ファイルをGitHub Pages側に配置します。

```text
frontend/index.html
frontend/styles.css
frontend/app.js
```

## ロール

```text
admin
company_manager
student
```

管理者は全権限を持ちます。企業担当者は自社受講者の進捗・回答履歴・チケットを確認できます。受講者は自分に割り当てられた問題集を解き、問い合わせチケットを起票できます。

## Excelインポート仕様

Sheet1の以下の列を読み取ります。

```text
番号バンゴウ
分類ブンルイ
問題文モンダイ
選択肢１センタク
選択肢２センタク
選択肢３センタク
選択肢４センタク
解答カイトウ
解説カイセテゥ
正答数セイト
```

`正答数セイト` が `1` の場合はラジオボタン、`2` 以上の場合はチェックボックスになります。

## 注意

現在は開発しやすさを優先し、フロントから `text/plain` でJSONを送信し、token/roleをURLクエリで渡す方式にしています。企業利用として本番化する場合は、最終的に `Authorization: Bearer` ヘッダー方式に戻すことを推奨します。


## v2-progress 追加内容

Excelインポート中に進捗バーを表示するようにしました。

```text
Excel読み込み
↓
解析完了
↓
25件ずつWorkerへ送信
↓
一覧更新
↓
完了表示
```

大量の問題を1回のAPIで送るのではなく、25件ずつ送るため、画面上で進捗が分かります。


## v2-progress-import-fix 追加内容

Excelの正解欄にカンマを含む選択肢が入っている場合、カンマで分割せず、選択肢との完全一致を優先するようにしました。

例:

```text
Corporate owned, personally enabled (COPE)
```

このような正解文字列を、複数正答の区切りとして誤判定しないようにしています。

なお、以下のようなExcel側の文字欠け・余計な文字は、Excel側の修正が必要です。

```text
ser accounts → User accounts
SplunkG120 → Splunk
```


## v2-no-setup-screen 追加内容

ログイン画面から「初期管理者作成」カードを削除しました。

```text
表示される画面:
ログインのみ
```

既存のWorker側 `/api/setup` は残しています。管理者を作り直す必要がある場合は、ブラウザConsoleやAPI経由で実行できます。


## v2-student-ui 追加内容

受講者画面を学習しやすい構成に変更しました。

```text
受講者トップ
  ↓
割り当てられている問題集一覧カード
  ↓
問題集を選択
  ↓
問題だけの画面へ遷移
```

受講者画面から以下のカードは削除しました。

```text
進捗
回答履歴
お問い合わせカード
```

お問い合わせはヘッダー内の「お問い合わせ」ボタンから専用フォームへ遷移します。

また、問題集内の `分類ブンルイ` を使って、分野別に出題できるようにしました。

```text
全分野
分類A
分類B
分類C
```

この機能のため、Worker側に以下を追加しています。

```text
GET /api/question-sets/:id/categories
GET /api/quiz?questionSetId=...&category=...
```


## v2-email-2fa 追加内容

ユーザーIDを原則メールアドレスに変更し、2要素認証を追加しました。

### 追加されたログインフロー

```text
メールアドレス + パスワード
↓
2FAが無効ならそのままログイン
↓
2FAが有効なら6桁コード入力
↓
ログイン完了
```

### 追加された画面

```text
ヘッダー
  ↓
2FA設定
  ↓
セットアップ開始
  ↓
認証アプリにシークレットキーを登録
  ↓
6桁コードで有効化
```

### 対応する認証アプリ

```text
Microsoft Authenticator
Google Authenticator
1Password
Bitwarden
Authy など
```

### D1に追加が必要なSQL

既存DBに適用する場合は、以下をD1 Consoleで実行してください。

```text
cloudflare-dashboard/migration-2fa.sql
```

新規DBの場合は、通常の `schema.sql` に2FAカラムが含まれています。

### 注意

既存の `admin` などメールアドレスではないユーザーは、ログイン自体は可能です。ただし、新規ユーザー作成はメールアドレス形式を必須にしています。


## v2-email-otp 追加内容

2要素認証を「認証アプリ方式」から「メール送信型6桁コード」に変更しました。

### 追加設定

Cloudflare WorkerのSecretsに以下を追加してください。

```text
RESEND_API_KEY
EMAIL_FROM
```

例:

```text
RESEND_API_KEY:
re_xxxxxxxxxxxxxxxxx

EMAIL_FROM:
CCT Quiz <no-reply@your-domain.com>
```

`EMAIL_FROM` のドメインは、Resend側で認証済みのドメインを使ってください。

### ログインフロー

```text
メールアドレス + パスワード
↓
2FAが有効な場合、登録メールアドレスへ6桁コード送信
↓
6桁コード入力
↓
ログイン完了
```

### D1に追加が必要なSQL

既存DBに適用する場合は、D1 Consoleで以下を実行してください。

```text
cloudflare-dashboard/migration-email-otp.sql
```

まだ2FAカラムを追加していない場合は、先に `migration-2fa.sql` も実行してください。


## v2-mandatory-2fa 追加内容

2要素認証を必須化しました。

```text
メールアドレス + パスワードでログイン
↓
2FA未設定の場合は、2FA設定画面へ強制遷移
↓
メールに届いた6桁コードで2FAを有効化
↓
アプリ利用開始
```

2FAを有効化するまで、問題集・進捗・管理画面などの保護されたAPIは利用できません。

利用者側から2FAを無効化する機能も停止しています。管理者が緊急対応で2FAをリセットした場合でも、そのユーザーは次回ログイン時に再度2FA設定を求められます。


## v2-user-search-delete 追加内容

以下を追加しました。

```text
2FA強制化は維持
企業担当者は自社内の受講者を削除可能
管理者は全企業のユーザーを削除可能
ユーザー削除は物理削除ではなく is_active=0 の論理削除
企業担当者・管理者はメールアドレス/表示名でユーザー検索可能
企業・ロール・状態でユーザー絞り込み可能
管理者は企業にユーザーが残っていても企業削除可能
進捗確認を企業単位・ユーザー単位・問題集単位・名前検索で絞り込み可能
回答履歴を企業単位・ユーザー単位・問題集単位・名前検索で絞り込み可能
```

企業担当者は自社以外のユーザーを削除できません。また、企業担当者は管理者ユーザーを削除できません。
