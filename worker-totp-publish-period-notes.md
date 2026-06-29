# Worker側の反映メモ：Google Authenticator + 問題集公開期間

このリポジトリの現在のルートには `worker-single.js` が見当たらなかったため、Cloudflare Worker側で必要な変更点をここにまとめています。

## 必須変更

### 1. メール2FAを廃止してTOTPを使う

既存コードに残っている以下のTOTP関数を利用します。

- `generateTotpSecret()`
- `verifyTotpCode(secret, code)`
- `otpauthUrl({ issuer, accountName, secret })`

`/api/me/2fa/setup` ではメール送信せず、以下を行います。

```js
const secret = generateTotpSecret();
const issuer = String(env.TOTP_ISSUER || "CCT Quiz");
const accountName = user.username;
const url = otpauthUrl({ issuer, accountName, secret });

await env.DB.prepare(
  "UPDATE app_users SET two_factor_enabled = 0, two_factor_secret = ?, two_factor_confirmed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
).bind(secret, auth.userId).run();

return json(request, env, {
  ok: true,
  delivery: "totp",
  issuer,
  accountName,
  secret,
  otpauthUrl: url
});
```

`/api/me/2fa/confirm` では、メールコードではなくTOTPコードを検証します。

```js
const verified = await verifyTotpCode(user.two_factor_secret, body.code);
if (!verified) throw httpError(401, "Invalid authentication code");

await env.DB.prepare(
  "UPDATE app_users SET two_factor_enabled = 1, two_factor_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
).bind(auth.userId).run();
```

`/api/login/2fa` でもTOTPコードを検証します。

```js
const verified = await verifyTotpCode(user.two_factor_secret, code);
if (!verified) throw httpError(401, "Invalid authentication code");
```

### 2. 問題集公開期間をAPIで判定する

D1で `migration_totp_publish_period.sql` を実行後、割り当てテーブルに以下の列が追加されます。

- `app_org_question_sets.available_from`
- `app_org_question_sets.available_until`
- `app_user_question_sets.available_from`
- `app_user_question_sets.available_until`

問題集一覧と出題APIでは、以下条件を必ず入れてください。

```sql
(available_from IS NULL OR available_from <= CURRENT_TIMESTAMP)
AND (available_until IS NULL OR available_until >= CURRENT_TIMESTAMP)
```

### 3. 割り当てAPIで公開期間を保存する

`/api/admin/assignments` で `availableFrom` と `availableUntil` を受け取り、組織・個人の割り当てテーブルへ保存します。

```js
const availableFrom = normalizeAssignmentDate(body.availableFrom);
const availableUntil = normalizeAssignmentDate(body.availableUntil);
```

組織割り当て：

```js
INSERT OR IGNORE INTO app_org_question_sets
  (organization_id, question_set_id, assigned_by, available_from, available_until)
VALUES (?, ?, ?, ?, ?)
```

個人割り当て：

```js
INSERT OR IGNORE INTO app_user_question_sets
  (user_id, question_set_id, assigned_by, available_from, available_until)
VALUES (?, ?, ?, ?, ?)
```

## フロント側の反映済みファイル

- `index.html`
- `cct-ui-patch.css`
- `cct-totp-publish-period-frontend-patch.js`
- `migration_totp_publish_period.sql`
- `migration_sync_mastered.sql`

## 注意

フロント側だけ反映しても、Worker側がTOTPと公開期間に対応していない場合は、2FA設定や公開期間保存は動作しません。Cloudflare Workerのコードにも上記変更を反映してください。
