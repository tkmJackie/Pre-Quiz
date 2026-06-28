# CCT English Multi User

複数人利用向けの CCT 英語4択クイズシステムです。

## 構成

- `frontend/`：GitHub Pagesなどに置く画面
- `worker/`：Cloudflare Workers API
- `worker/migrations/0001_init.sql`：Cloudflare D1用DBスキーマ
- `worker/src/seed-words.js`：初期300問データ

## 機能

- ログイン
- 管理者 / 受講生ロール分離
- 複数ロールを持つユーザーのロール選択
- 受講者ごとの進捗保存
- 3回連続正解で通常出題から除外
- CCT英文問題 → 日本語訳問題文 4択
- 英単語 → 日本語用語 4択
- 管理者による正答編集
- 管理者による受講生追加

## 初期構築の流れ

### 1. Worker用ディレクトリへ移動

```bash
cd worker
npm create cloudflare@latest
```

既存プロジェクトへ入れる場合は、この `worker/` の中身を使ってください。

### 2. D1データベース作成

```bash
npx wrangler d1 create cct_english_db
```

表示された `database_id` を `wrangler.jsonc` の `database_id` に入れます。

### 3. migration実行

```bash
npx wrangler d1 migrations apply cct_english_db --remote
```

### 4. Secret設定

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put SETUP_KEY
```

`JWT_SECRET` は長いランダム文字列にしてください。  
`SETUP_KEY` は初期管理者作成時に使います。

### 5. Workerをデプロイ

```bash
npx wrangler deploy
```

### 6. frontendを公開

`frontend/` をGitHub Pagesなどに配置します。  
画面の API URL 欄に Worker URL を入力します。

例：

```text
https://cct-english-api.xxxxx.workers.dev
```

### 7. 初期管理者作成

ログイン画面の「初期管理者を作成」を開き、SETUP_KEY・管理者ID・パスワードを入力します。  
作成された管理者は `admin` と `student` の両方のロールを持ちます。

## 注意

この版は、GitHub JSON保存ではなく、Cloudflare D1にユーザー・問題・進捗を保存します。複数人利用では、GitHub JSONを直接更新する方式よりDB方式の方が安全です。
