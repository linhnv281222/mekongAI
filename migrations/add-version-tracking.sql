-- ============================================================
-- Phase 1: Version Tracking & Field History
-- Mục tiêu: Tách ai_extracted / edited / approved
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════
-- 1. DRAWING ITEM VERSIONS — Lịch sử từng drawing
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mekongai.drawing_item_versions (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER NOT NULL,
  drawing_index       INTEGER NOT NULL,
  version_no          INTEGER NOT NULL DEFAULT 1,
  version_type        TEXT NOT NULL CHECK (version_type IN ('ai_extracted', 'user_draft', 'approved', 'erp_confirmed')),
  
  -- Dữ liệu drawing (JSONB chứa tất cả field)
  data                JSONB NOT NULL,
  
  -- Metadata
  source              TEXT, -- 'ai', 'user', 'rule', 'erp'
  source_model        TEXT, -- 'gemini-2.5-flash', 'claude-sonnet-4-6'
  prompt_version      TEXT,
  docling_version     TEXT,
  
  -- Audit
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  change_reason       TEXT,
  
  -- Constraint: unique per job + drawing_index + version_no
  CONSTRAINT uk_drawing_version UNIQUE (job_id, drawing_index, version_no)
);

CREATE INDEX idx_drawing_versions_job ON mekongai.drawing_item_versions(job_id);
CREATE INDEX idx_drawing_versions_type ON mekongai.drawing_item_versions(version_type);
CREATE INDEX idx_drawing_versions_created ON mekongai.drawing_item_versions(created_at DESC);

COMMENT ON TABLE mekongai.drawing_item_versions IS 'Lưu lịch sử version từng drawing: ai_extracted → user_draft → approved → erp_confirmed';
COMMENT ON COLUMN mekongai.drawing_item_versions.version_type IS 'ai_extracted: AI tạo | user_draft: đang sửa | approved: đã duyệt | erp_confirmed: ERP xác nhận';
COMMENT ON COLUMN mekongai.drawing_item_versions.data IS 'JSONB chứa toàn bộ field: ma_ban_ve, vat_lieu, so_luong, hinh_dang, kich_thuoc...';

-- ══════════════════════════════════════════════════════════
-- 2. FIELD EVIDENCE — Truy ngược field → PDF page/region
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mekongai.field_evidence (
  id                          SERIAL PRIMARY KEY,
  drawing_item_version_id     INTEGER NOT NULL REFERENCES mekongai.drawing_item_versions(id) ON DELETE CASCADE,
  field_name                  TEXT NOT NULL,
  field_value                 TEXT,
  
  -- PDF location
  page_number                 INTEGER,
  bbox                        JSONB, -- [x, y, width, height]
  evidence_text               TEXT,
  
  -- Source
  source_type                 TEXT CHECK (source_type IN ('docling_text', 'ocr', 'vision', 'rule', 'erp', 'user')),
  confidence                  NUMERIC(3, 2), -- 0.00 - 1.00
  
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_field_evidence_version ON mekongai.field_evidence(drawing_item_version_id);
CREATE INDEX idx_field_evidence_field ON mekongai.field_evidence(field_name);

COMMENT ON TABLE mekongai.field_evidence IS 'Evidence: field → vị trí trong PDF (page, bbox, text)';
COMMENT ON COLUMN mekongai.field_evidence.bbox IS 'Bounding box: [x, y, width, height] hoặc null';
COMMENT ON COLUMN mekongai.field_evidence.source_type IS 'docling_text: Docling parse | ocr: OCR | vision: Gemini Vision | rule: Rule-based | erp: ERP lookup | user: User input';

-- ══════════════════════════════════════════════════════════
-- 3. FEEDBACK EVENTS — Log mỗi lần user sửa field
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mekongai.feedback_events (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER NOT NULL,
  drawing_index       INTEGER NOT NULL,
  field_name          TEXT NOT NULL,
  
  -- Old vs new
  old_value           TEXT,
  new_value           TEXT,
  
  -- Metadata
  reason              TEXT, -- 'mapping_material', 'fix_quantity', 'user_correction'
  actor               TEXT, -- username or email
  approved            BOOLEAN DEFAULT FALSE,
  erp_result          TEXT, -- 'accepted', 'rejected', 'pending'
  
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_job ON mekongai.feedback_events(job_id);
CREATE INDEX idx_feedback_field ON mekongai.feedback_events(field_name);
CREATE INDEX idx_feedback_created ON mekongai.feedback_events(created_at DESC);

COMMENT ON TABLE mekongai.feedback_events IS 'Log mỗi lần user sửa field → dùng cho learning';
COMMENT ON COLUMN mekongai.feedback_events.reason IS 'Lý do sửa: mapping_material, fix_quantity, user_correction...';
COMMENT ON COLUMN mekongai.feedback_events.erp_result IS 'Kết quả ERP: accepted (ERP chấp nhận) | rejected (ERP từ chối) | pending';

-- ══════════════════════════════════════════════════════════
-- 4. Thêm cột vào agent_jobs cho version tracking
-- ══════════════════════════════════════════════════════════

ALTER TABLE mekongai.agent_jobs
  ADD COLUMN IF NOT EXISTS approved_by        TEXT,
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_validated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_version    INTEGER DEFAULT 1;

COMMENT ON COLUMN mekongai.agent_jobs.approved_by IS 'User đã duyệt job (email hoặc username)';
COMMENT ON COLUMN mekongai.agent_jobs.approved_at IS 'Thời gian duyệt job';
COMMENT ON COLUMN mekongai.agent_jobs.current_version IS 'Version hiện tại của job';

-- ══════════════════════════════════════════════════════════
-- 5. Migration: Copy drawings hiện tại → drawing_item_versions
-- ══════════════════════════════════════════════════════════

-- Migrate drawings từ agent_jobs.drawings (JSONB array) sang drawing_item_versions
-- Mỗi drawing → 1 version 'ai_extracted'

INSERT INTO mekongai.drawing_item_versions (
  job_id, 
  drawing_index, 
  version_no, 
  version_type, 
  data, 
  source, 
  source_model,
  created_at,
  change_reason
)
SELECT 
  aj.id AS job_id,
  (row_number() OVER (PARTITION BY aj.id ORDER BY (drawing->>'page')::int, drawing->>'fileIndex')) - 1 AS drawing_index,
  1 AS version_no,
  'ai_extracted' AS version_type,
  drawing AS data,
  'ai' AS source,
  COALESCE(
    drawing_ai_payload->0->>'model',
    classify_ai_payload->>'model',
    'unknown'
  ) AS source_model,
  aj.created_at,
  'Migrated from existing drawings' AS change_reason
FROM mekongai.agent_jobs aj
CROSS JOIN LATERAL jsonb_array_elements(aj.drawings) AS drawing
WHERE aj.drawings IS NOT NULL 
  AND jsonb_array_length(aj.drawings) > 0
ON CONFLICT (job_id, drawing_index, version_no) DO NOTHING;

COMMIT;

-- ══════════════════════════════════════════════════════════
-- Verification queries
-- ══════════════════════════════════════════════════════════

-- Check migrated count
-- SELECT COUNT(*) FROM mekongai.drawing_item_versions WHERE version_type = 'ai_extracted';

-- Check jobs with versions
-- SELECT 
--   aj.id, 
--   aj.gmail_id, 
--   COUNT(div.id) as version_count
-- FROM mekongai.agent_jobs aj
-- LEFT JOIN mekongai.drawing_item_versions div ON div.job_id = aj.id
-- GROUP BY aj.id
-- ORDER BY aj.created_at DESC
-- LIMIT 10;
