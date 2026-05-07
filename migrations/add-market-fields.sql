-- ============================================================
-- MekongAI — Incremental Migration
-- Chạy trên database đang có (không drop table)
-- ============================================================
-- Chạy: psql -U postgres -d mechanical_ai -f migrations/add-market-fields.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1. THEM 2 COLUMN MOI VAO agent_jobs
-- ============================================================
ALTER TABLE mekongai.agent_jobs
  ADD COLUMN IF NOT EXISTS source         TEXT,
  ADD COLUMN IF NOT EXISTS thi_truong     TEXT;

-- ============================================================
-- 2. UPDATE source CHO EXISTING JOBS
-- ============================================================
UPDATE mekongai.agent_jobs
SET source = CASE
  WHEN gmail_id IS NOT NULL AND gmail_id != '' THEN 'email'
  ELSE 'chat'
END
WHERE source IS NULL;

-- ============================================================
-- 3. FIX format COLUMN QUOTING trong knowledge_blocks INSERTs
-- ============================================================

-- vnt-materials
UPDATE mekongai.knowledge_blocks
SET "format" = 'text'
WHERE key = 'vnt-materials'
  AND "format" IS NULL;

-- vnt-heat-treat
UPDATE mekongai.knowledge_blocks
SET "format" = 'text'
WHERE key = 'vnt-heat-treat'
  AND "format" IS NULL;

-- vnt-surface
UPDATE mekongai.knowledge_blocks
SET "format" = 'text'
WHERE key = 'vnt-surface'
  AND "format" IS NULL;

-- vnt-shapes
UPDATE mekongai.knowledge_blocks
SET "format" = 'text'
WHERE key = 'vnt-shapes'
  AND "format" IS NULL;

-- vnt-knowledge
UPDATE mekongai.knowledge_blocks
SET "format" = 'text'
WHERE key = 'vnt-knowledge'
  AND "format" IS NULL;

-- ============================================================
-- 4. UPSERT vnt-markets KNOWLEDGE BLOCK
-- ============================================================
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format", headers, kb_rows) VALUES (
  'vnt-markets',
  'Thị trường',
  'Bảng phân biệt thị trường khách hàng VN/JP/US/EU',
  $mkt_content$
[BẢNG THỊ TRƯỜNG KHÁCH HÀNG]
Khu vực: VIỆT NAM (VN)
- Email: .vn, .com.vn, viet nam, việt nam, vietnam
- Ngôn ngữ: Tiếng Việt có dấu (ă, â, đ, ê, ô, ơ, ư)
- Đơn vị tiền tệ: VND, đồng
- Địa chỉ: Vietnam, Viet Nam, Hà Nội, Hồ Chí Minh, Đà Nẵng
- Mã quốc gia: +84

Khu vực: NHẬT BẢN (JP)
- Email: .jp, nhật bản, japan, 越南
- Ngôn ngữ: Tiếng Nhật (会、社、株、丸、形、様、致、す hoặc katakana/hiragana)
- Đơn vị tiền tệ: JPY, Yen, 円
- Địa chỉ: Japan, Nihon, 越南, 東京, 大阪
- Tên công ty thường gặp: 株式会社、有限会社、協同組合
- Mã quốc gia: +81

Khu vực: MỸ (US)
- Email: .com, .net, .org (không .vn/.jp), my, mỹ, usa, united states, america
- Ngôn ngữ: Tiếng Anh thuần (không có dấu tiếng Việt, không có chữ Hán tự Nhật)
- Đơn vị tiền tệ: USD, Dollar, $
- Địa chỉ: USA, United States, America, California, New York, Texas
- Mã quốc gia: +1

Khu vực: CHÂU ÂU (EU)
- Email: .co.uk, .de, .fr, .it, .eu, châu âu, europe, european
- Ngôn ngữ: Tiếng Anh, Đức, Pháp, Ý, Tây Ban Nha
- Đơn vị tiền tệ: EUR, Euro, £, CHF
- Địa chỉ: Germany, France, UK, Italy, Europe
- Mã quốc gia: +49, +44, +33, +39

QUY TẮC PHÂN BIỆT:
1. Ưu tiên email/tên công ty > ngôn ngữ > địa chỉ > mã quốc gia
2. Nếu thông tin trái ngược (VD: email .vn nhưng ngôn ngữ là tiếng Nhật) -> ưu tiên nội dung chính của email/chat
3. Nếu không có thông tin -> mặc định theo ngôn ngữ: tiếng Việt->VN, tiếng Nhật->JP, tiếng Anh thuần->US
$mkt_content$,
  'text',
  $mkt_headers$["Thị trường","Tên","Khu vực","Email","Ngôn ngữ","Đơn vị tiền tệ"]$mkt_headers$,
  $mkt_rows$[{"market":"VN","ten":"Việt Nam","gioi_tien":"VIỆT NAM","email":".vn, .com.vn","ngon_ngu":"Tiếng Việt có dấu","tien_te":"VND"},{"market":"JP","ten":"Nhật Bản","gioi_tien":"NHẬT BẢN","email":".jp, nhật bản, japan","ngon_ngu":"Tiếng Nhật (Hán tự, katakana/hiragana)","tien_te":"JPY"},{"market":"US","ten":"Mỹ (USA)","gioi_tien":"MỸ","email":".com, .net","ngon_ngu":"Tiếng Anh thuần","tien_te":"USD"},{"market":"EU","ten":"Châu Âu","gioi_tien":"CHÂU ÂU","email":".co.uk, .de, .fr, .eu","ngon_ngu":"Tiếng Anh, Đức, Pháp","tien_te":"EUR"}]$mkt_rows$
)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  content     = EXCLUDED.content,
  "format"   = EXCLUDED."format",
  headers     = EXCLUDED.headers,
  kb_rows     = EXCLUDED.kb_rows;

-- ============================================================
-- 5. THEM MARKET VAO PROMPT VERSIONS VARIABLES
-- ============================================================

-- gemini-drawing: them MARKET
UPDATE mekongai.prompt_versions
SET variables = '["MATERIAL","HEAT_TREAT","SURFACE","SHAPE","VNT_KNOWLEDGE","EMAIL_CONTEXT","MARKET"]'::jsonb
WHERE template_id = (SELECT id FROM mekongai.prompt_templates WHERE key = 'gemini-drawing')
  AND is_active = true
  AND NOT (variables @> '"MARKET"'::jsonb);

-- chat-classify: them MARKET vao content + variables
UPDATE mekongai.prompt_versions
SET variables = '["chatMessage","MATERIAL","HEAT_TREAT","SURFACE","MARKET"]'::jsonb
WHERE template_id = (SELECT id FROM mekongai.prompt_templates WHERE key = 'chat-classify')
  AND is_active = true
  AND NOT (variables @> '"MARKET"'::jsonb);

-- email-classify: them MARKET
UPDATE mekongai.prompt_versions
SET variables = '["emailFrom","emailSubject","emailAttachments","emailBody","MARKET"]'::jsonb
WHERE template_id = (SELECT id FROM mekongai.prompt_templates WHERE key = 'email-classify')
  AND is_active = true
  AND NOT (variables @> '"MARKET"'::jsonb);

-- ============================================================
-- 6. UPDATE thi_truong TU DONG (tham khao email domain)
--    Chi ap dung cho existing jobs co email
-- ============================================================
-- NOTE: Column trong bang la sender_email, khong phai email_from
UPDATE mekongai.agent_jobs
SET thi_truong = CASE
  WHEN sender_email ~* '\.jp$' THEN 'JP'
  WHEN sender_email ~* '\.vn$|\.com\.vn$' THEN 'VN'
  WHEN sender_email ~* '\.(co\.uk|de|fr|eu|it)$' THEN 'EU'
  WHEN sender_email ~* '\.(com|net|org)$'
    AND sender_email !~* '\.(vn|jp|co\.uk|de|fr|eu)$' THEN 'US'
  ELSE NULL
END
WHERE thi_truong IS NULL
  AND sender_email IS NOT NULL
  AND sender_email != '';

COMMIT;
