-- ============================================================
-- MekongAI — Database Setup
-- Database: mechanical_ai (postgresql)
-- Schema:  mekongai
-- Usage:
--   psql -U postgres -d mechanical_ai -f setup-db.sql
-- ============================================================

BEGIN;

-- ── 0. Create schema ─────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS mekongai;

-- ── 1. Drop existing tables (fresh start) ─────────────────────
DROP TABLE IF EXISTS mekongai.agent_jobs CASCADE;
DROP TABLE IF EXISTS mekongai.prompt_versions CASCADE;
DROP TABLE IF EXISTS mekongai.prompt_templates CASCADE;
DROP TABLE IF EXISTS mekongai.knowledge_blocks CASCADE;
DROP TABLE IF EXISTS mekongai.drawings CASCADE;

-- ── 2. Drawings ────────────────────────────────────────────────
CREATE TABLE mekongai.drawings (
  id           SERIAL PRIMARY KEY,
  filename     TEXT NOT NULL,
  ma_ban_ve    TEXT,
  ten_chi_tiet TEXT,
  vat_lieu     TEXT,
  so_luong     INTEGER,
  hinh_dang    TEXT,
  kich_thuoc   JSONB,
  full_data    JSONB NOT NULL,
  status       TEXT DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  notes        TEXT
);
CREATE INDEX idx_drawings_ma ON mekongai.drawings(ma_ban_ve);
CREATE INDEX idx_drawings_status ON mekongai.drawings(status);
CREATE INDEX idx_drawings_vat_lieu ON mekongai.drawings(vat_lieu);

-- ── 3. Prompt Templates ─────────────────────────────────────────
CREATE TABLE mekongai.prompt_templates (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Prompt Versions ──────────────────────────────────────────
CREATE TABLE mekongai.prompt_versions (
  id           SERIAL PRIMARY KEY,
  template_id  INT REFERENCES mekongai.prompt_templates(id) ON DELETE CASCADE,
  version      INT NOT NULL,
  content      TEXT NOT NULL,
  variables    JSONB DEFAULT '[]',
  is_active    BOOLEAN DEFAULT false,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  note         TEXT
);

-- ── 5. Knowledge Blocks ────────────────────────────────────────
CREATE TABLE mekongai.knowledge_blocks (
  id             SERIAL PRIMARY KEY,
  key            TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  content        TEXT NOT NULL,
  format         TEXT DEFAULT 'text'
                  CONSTRAINT mekongai_knowledge_blocks_format_check
                  CHECK (format IN ('text', 'table')),
  headers        JSONB DEFAULT '["Mã gốc", "Mã VNT"]',
  kb_rows        JSONB DEFAULT '[]',
  knowledge_key   TEXT,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_knowledge_blocks_key ON mekongai.knowledge_blocks(key);

-- ── 6. Agent Jobs (Email) ───────────────────────────────────────
CREATE TABLE mekongai.agent_jobs (
  id             SERIAL PRIMARY KEY,
  gmail_id       TEXT UNIQUE,
  subject        TEXT,
  sender_email   TEXT,
  sender_name    TEXT,
  sender_company TEXT,
  classify       TEXT,
  ngon_ngu      TEXT,
  status         TEXT DEFAULT 'new',
  erp_quote_id   TEXT,
  lines_count    INT DEFAULT 0,
  error          TEXT,
  raw_email      JSONB,
  extracted      JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. Schema Migrations ────────────────────────────────────────

COMMIT;

-- ============================================================
-- Seed Data — Prompt Templates
-- ============================================================
BEGIN;

INSERT INTO mekongai.prompt_templates (key, name, description) VALUES
  ('drawing-system', 'Drawing Analysis — System Prompt', 'Primary system prompt for Claude Sonnet 4 drawing analysis'),
  ('email-classify', 'Email Classification Prompt', 'Prompt for classifying incoming emails'),
  ('gemini-drawing', 'Drawing Analysis — Gemini Prompt', 'Prompt for backup drawing analysis using Gemini 2.5');

-- v1 of each is active
INSERT INTO mekongai.prompt_versions (template_id, version, content, variables, is_active, created_by, note)
SELECT id, 1,
  'You are an expert mechanical engineer analyzing technical drawings...',
  '["MATERIAL","HEAT_TREAT","SURFACE","SHAPE"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'drawing-system';

INSERT INTO mekongai.prompt_versions (template_id, version, content, variables, is_active, created_by, note)
SELECT id, 1,
  'Classify this incoming email...',
  '["emailFrom","emailSubject","emailAttachments","emailBody"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'email-classify';

INSERT INTO mekongai.prompt_versions (template_id, version, content, variables, is_active, created_by, note)
SELECT id, 1,
  'Analyze this technical drawing...',
  '["VNT_KNOWLEDGE"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'gemini-drawing';

COMMIT;

ALTER TABLE mekongai.agent_jobs
  ADD COLUMN IF NOT EXISTS attachments    JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ten_cong_ty     TEXT,
  ADD COLUMN IF NOT EXISTS han_giao       TEXT,
  ADD COLUMN IF NOT EXISTS hinh_thuc_giao TEXT,
  ADD COLUMN IF NOT EXISTS xu_ly_be_mat   BOOLEAN,
  ADD COLUMN IF NOT EXISTS vat_lieu_chung_nhan TEXT,
  ADD COLUMN IF NOT EXISTS drawings        JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS classify_output JSONB,
  ADD COLUMN IF NOT EXISTS classify_ai_payload JSONB,
  ADD COLUMN IF NOT EXISTS drawing_ai_payload JSONB,
  ADD COLUMN IF NOT EXISTS ghi_chu        TEXT,
  ADD COLUMN IF NOT EXISTS pushed_at      TIMESTAMPTZ;

-- Chi so cho query thuong
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON mekongai.agent_jobs(status);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_created ON mekongai.agent_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_gmail ON mekongai.agent_jobs(gmail_id) WHERE gmail_id IS NOT NULL;