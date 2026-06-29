-- =========================
-- CCT LMS Migration
-- Sync mastered flag from correct_streak
-- =========================

UPDATE app_progress
SET mastered = CASE
  WHEN COALESCE(correct_streak, 0) >= 3 THEN 1
  ELSE 0
END;

CREATE INDEX IF NOT EXISTS idx_app_progress_user_question
ON app_progress (user_id, question_id);
