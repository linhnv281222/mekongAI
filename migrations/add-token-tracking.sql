-- Migration: Add token usage tracking columns to agent_jobs
-- Run with: psql -U postgres -d mechanical_ai -f add-token-tracking.sql

BEGIN;

-- Add token tracking columns if they don't exist
ALTER TABLE mekongai.agent_jobs
  ADD COLUMN IF NOT EXISTS classify_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drawing_tokens  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classify_model  TEXT,
  ADD COLUMN IF NOT EXISTS drawing_model   TEXT;

-- Create index for faster token stats queries
CREATE INDEX IF NOT EXISTS idx_agent_jobs_tokens ON mekongai.agent_jobs(total_tokens) WHERE total_tokens > 0;
CREATE INDEX IF NOT EXISTS idx_agent_jobs_date_tokens ON mekongai.agent_jobs(created_at, total_tokens) WHERE total_tokens > 0;

-- Update existing jobs to calculate total_tokens from classify + drawing if not set
UPDATE mekongai.agent_jobs
SET total_tokens = COALESCE(classify_tokens, 0) + COALESCE(drawing_tokens, 0)
WHERE total_tokens = 0 AND (classify_tokens > 0 OR drawing_tokens > 0);

COMMIT;

-- Verification query
SELECT
  COUNT(*) as total_jobs,
  COUNT(*) FILTER (WHERE total_tokens > 0) as jobs_with_tokens,
  SUM(total_tokens) as total_tokens_sum
FROM mekongai.agent_jobs;
