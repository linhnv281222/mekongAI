-- ============================================================
-- MekongAI — Daily Review Agent Migration
-- Database: mechanical_ai (postgresql)
-- Schema:  mekongai
-- Usage:
--   psql -U postgres -d mechanical_ai -f migrations/add-daily-review.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1. BANG daily_review_logs — Lưu log mỗi lần agent refine prompt
-- ============================================================
CREATE TABLE IF NOT EXISTS mekongai.daily_review_logs (
  id               SERIAL PRIMARY KEY,
  review_date      DATE NOT NULL,
  prompt_key       TEXT NOT NULL,
  job_ids          JSONB DEFAULT '[]',
  ghi_chu_summary TEXT,
  refined_content  TEXT,
  diff_summary     TEXT,
  ai_model         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE mekongai.daily_review_logs IS 'Log mỗi lần daily-review-agent chạy. Ghi lại ghi_chu, prompt đã sửa, và diff.';

-- Chi so cho query
CREATE INDEX IF NOT EXISTS idx_drl_review_date ON mekongai.daily_review_logs(review_date DESC);
CREATE INDEX IF NOT EXISTS idx_drl_prompt_key  ON mekongai.daily_review_logs(prompt_key);

-- ============================================================
-- 2. PROMPT TEMPLATE: daily-review (để admin tạo content qua UI)
-- ============================================================
INSERT INTO mekongai.prompt_templates (key, name, description) VALUES
  ('daily-review', 'Daily Review Agent — Prompt Refine', 'Prompt cho AI refine prompt hàng ngày dựa trên ghi chú người dùng')
ON CONFLICT (key) DO NOTHING;

-- NOTE: Không tạo version mặc định. Admin tự tạo content qua UI.
-- dailyReviewAgent sẽ dùng getPromptRawContent('daily-review') để lấy content.
-- Nếu chưa có content → bỏ qua prompt đó.

ALTER TABLE mekongai.agent_jobs ADD COLUMN IF NOT EXISTS email_body TEXT;
