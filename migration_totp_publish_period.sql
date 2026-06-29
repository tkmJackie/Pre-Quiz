-- =========================
-- CCT LMS Migration
-- Google Authenticator + Publish Period
-- =========================

-- 既存のメール2FAユーザーは、Google Authenticator用のsecretがないため再設定させます。
-- すでに two_factor_secret が入っているユーザーは維持されます。
UPDATE app_users
SET
  two_factor_enabled = 0,
  two_factor_confirmed_at = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE two_factor_enabled = 1
  AND (two_factor_secret IS NULL OR TRIM(two_factor_secret) = '');

-- 組織別の問題集公開期間
ALTER TABLE app_org_question_sets ADD COLUMN available_from TEXT;
ALTER TABLE app_org_question_sets ADD COLUMN available_until TEXT;

-- 個人別の問題集公開期間
ALTER TABLE app_user_question_sets ADD COLUMN available_from TEXT;
ALTER TABLE app_user_question_sets ADD COLUMN available_until TEXT;

-- 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_org_question_sets_period
ON app_org_question_sets (organization_id, question_set_id, available_from, available_until);

CREATE INDEX IF NOT EXISTS idx_user_question_sets_period
ON app_user_question_sets (user_id, question_set_id, available_from, available_until);
