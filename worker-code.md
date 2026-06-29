# Worker code

Cloudflare Worker側で反映するコードです。

このリポジトリにはWorker本体が見当たらなかったため、差し替え・追加する関数をこのファイルに記載しています。

## 追加するヘルパー

```js
function normalizeAssignmentDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const normalized = raw
    .replace("T", " ")
    .replace(/\.\d+Z?$/, "")
    .replace(/Z$/, "");

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    throw httpError(400, "公開期間の日付形式が正しくありません");
  }

  return normalized.length === 16 ? `${normalized}:00` : normalized;
}
```

## 公開期間条件

```sql
(available_from IS NULL OR available_from <= CURRENT_TIMESTAMP)
AND (available_until IS NULL OR available_until >= CURRENT_TIMESTAMP)
```

## 2FAセットアップ

```js
async function handleTwoFactorSetup(request, env, auth) {
  const user = await getUserById(env, auth.userId);
  if (!user) throw httpError(404, "User not found");

  const secret = generateTotpSecret();
  const issuer = String(env.TOTP_ISSUER || "Zerqour LMS");
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
    otpauthUrl: url,
    message: "認証アプリにセットアップキーを登録してください"
  });
}
```

## 2FA確認

```js
async function handleTwoFactorConfirm(request, env, auth) {
  const body = await readJson(request);
  const user = await getUserById(env, auth.userId);
  if (!user) throw httpError(404, "User not found");
  if (!user.two_factor_secret) throw httpError(400, "Authenticator setup has not started");

  const verified = await verifyTotpCode(user.two_factor_secret, body.code);
  if (!verified) throw httpError(401, "Invalid authentication code");

  await env.DB.prepare(
    "UPDATE app_users SET two_factor_enabled = 1, two_factor_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(auth.userId).run();

  return json(request, env, { ok: true });
}
```

## ログイン2FA確認

```js
async function handleLoginTwoFactor(request, env) {
  const body = await readJson(request);
  const challengeToken = String(body.challengeToken || "");
  const code = String(body.code || "");

  const payload = await verifyJwt(challengeToken, env.JWT_SECRET);
  if (payload.purpose !== "2fa_challenge") throw httpError(401, "Invalid 2FA challenge");

  const user = await getUserById(env, payload.sub);
  if (!user || user.is_active !== 1) throw httpError(401, "User not found or inactive");
  if (user.two_factor_enabled !== 1) throw httpError(400, "2FA is not enabled");
  if (!user.two_factor_secret) throw httpError(400, "Authenticator setup is missing");

  const verified = await verifyTotpCode(user.two_factor_secret, code);
  if (!verified) throw httpError(401, "Invalid authentication code");

  const roles = await getUserRoles(env, user.id);
  const token = await signJwt({
    sub: user.id,
    username: user.username,
    roles,
    role: roles[0] || "student",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  }, env.JWT_SECRET);

  return json(request, env, {
    token,
    username: user.username,
    displayName: user.display_name,
    organizationId: user.organization_id,
    organizationName: user.organization_name,
    roles,
    twoFactorEnabled: true
  });
}
```

## D1

先に `migration_totp_publish_period.sql` を実行してください。
