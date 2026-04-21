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
  ('email-classify', 'Email Classification Prompt', 'Prompt for classifying incoming emails'),
  ('gemini-drawing', 'Drawing Analysis — Gemini Prompt', 'Prompt for backup drawing analysis using Gemini 2.5'),
  ('chat-classify', 'Chat Classification — AI Extraction', 'AI prompt to extract structured info from chat messages');

-- v1 of each is active
INSERT INTO mekongai.prompt_versions (template_id, version, content, variables, is_active, created_by, note)
SELECT id, 1,
  'Classify this incoming email...',
  '["emailFrom","emailSubject","emailAttachments","emailBody"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'email-classify';

INSERT INTO mekongai.prompt_versions (template_id, version, content, variables, is_active, created_by, note)
SELECT id, 1,
  $$
Bạn là chuyên gia đọc bản vẽ kỹ thuật cho Công ty Việt Nhật Tân (VNT).
{{MATERIAL}}
{{HEAT_TREAT}}
{{SURFACE}}
{{SHAPE}}
{{VNT_KNOWLEDGE}}
Tròn xoay: điền phi_lon + phi_nho. Vuông cạnh: điền dài/rộng/cao.
Trả về JSON thuần túy, không markdown:
{
  "ban_ve": {"ma_ban_ve":"", "ten_chi_tiet":"", "revision":"", "so_to":"", "don_vi":"MM"},
  "vat_lieu": {"ma":"", "loai":"", "nhiet_luuyen":""},
  "san_xuat": {"so_luong":1, "tieu_chuan":""},
  "xu_ly": {"be_mat":[], "nhiet":""},
  "hinh_dang": {"loai":"", "kieu_phoi":"", "phuong_an_gia_cong":"", "mo_ta":[]},
  "kich_thuoc_bao": {"don_vi":"mm","dai":null,"rong":null,"cao_hoac_duong_kinh":null,"phi_lon":null,"phi_nho":null,"phan_loai_do_lon":""},
  "nguyen_cong_cnc":[],
  "be_mat_gia_cong":[],
  "quy_trinh_tong_the":[]
}
$$,
  '["MATERIAL","HEAT_TREAT","SURFACE","SHAPE","VNT_KNOWLEDGE"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'gemini-drawing';

INSERT INTO mekongai.prompt_versions (template_id, version, content, variables, is_active, created_by, note)
SELECT id, 1,
  'Phân loại tin nhắn chat...',
  '["chatMessage"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'chat-classify';

-- ============================================================
-- Seed Data — Knowledge Blocks (5 blocks cho gemini-drawing)
-- ============================================================

-- vnt-materials: Bang luong rieng + Ma vat lieu VNT
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, format, headers, kb_rows) VALUES (
  'vnt-materials',
  'Nguyên vật liệu',
  'Bang luong rieng va ma vat lieu VNT',
  $$[BANG LƯỢNG RIÊNG]
A2017=2.8 | A2024=2.78 | A5052=2.68 | A6061=2.7 | A7075=2.81
SS400=7.85 | S45C=7.85 | S50C=7.85 | SCM415=7.85 | SCM440=7.85
SKD11=7.7 | SKD61=7.8
SUS303=8.0 | SUS304=7.93 | SUS316=8.0
C1100=8.9 | C3604=8.5
POM=1.41 | PTFE=2.2

[MA VAT LIEU]
AlCu4MgSi/EN AW-2017 → A2017
AL6061/A6061 → A6061
S45C/AISI 1045 → S45C
SCM440/AISI 4140 → SCM440
SUS304/AISI 304 → SUS304
SUS316/AISI 316 → SUS316
SKD11/D2 → SKD11
C1100/Copper 110 → C1100
C3604/Laiton → C3604
POM/Acetal → POM$$,
  'text',
  '["Mã gốc","Mã VNT","Ghi chú"]'::jsonb,
  '[{"from":"AlCu4MgSi","to":"A2017","note":"Nhôm A2017"},{"from":"EN AW-2017","to":"A2017","note":"Nhôm A2017"},{"from":"AL6061","to":"A6061","note":"Nhôm A6061"},{"from":"A6061","to":"A6061","note":"Nhôm A6061"},{"from":"S45C","to":"S45C","note":"Thép carbon S45C"},{"from":"AISI 1045","to":"S45C","note":"Thép carbon S45C"},{"from":"SCM440","to":"SCM440","note":"Thép hợp kim SCM440"},{"from":"AISI 4140","to":"SCM440","note":"Thép hợp kim SCM440"},{"from":"SUS304","to":"SUS304","note":"Thép không gỉ 304"},{"from":"AISI 304","to":"SUS304","note":"Thép không gỉ 304"},{"from":"SUS316","to":"SUS316","note":"Thép không gỉ 316"},{"from":"AISI 316","to":"SUS316","note":"Thép không gỉ 316"},{"from":"SKD11","to":"SKD11","note":"Thép dụng cụ SKD11"},{"from":"D2","to":"SKD11","note":"Thép dụng cụ D2"},{"from":"C1100","to":"C1100","note":"Đồng nguyên chất"},{"from":"Copper 110","to":"C1100","note":"Đồng nguyên chất"},{"from":"C3604","to":"C3604","note":"Đồng thau C3604"},{"from":"Laiton","to":"C3604","note":"Đồng thau"},{"from":"POM","to":"POM","note":"Nhựa kỹ thuật POM"},{"from":"Acetal","to":"POM","note":"Nhựa kỹ thuật POM"}]'::jsonb
);

-- vnt-heat-treat: Xu ly nhiet
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, format, headers, kb_rows) VALUES (
  'vnt-heat-treat',
  'Xử lý nhiệt',
  'Bang ma xu ly nhiet VNT',
  $$[BANG XU LY NHET]
Nhiệt luyện toàn phần: 焼入れ焼戻し (Yakiire YakiModoshi)
  → Nhiệt luyện toàn phần [HRC...]

Tôi cứng: 浸炭焼入れ (Shinsan Yakiire)
  → Tôi cứng bề mặt [HRC...]

Tôi thể tích: Induction Hardening
  → Tôi cứng induction [HRC...]

Ủ: 焼なまし (YakiNaoshi)
  → Ủ (annealing)

Ram: 焼戾し (YakiModoshi)
  → Ram (tempering)

Tiêu chuẩn HRC VNT:
  Thép S45C: HRC 55-60 (tôi cứng)
  Thép SCM415/440: HRC 58-62 (tôi cứng bề mặt)
  Thép SKD11: HRC 58-62 (tôi cứng)
  Thép SUJ2: HRC 62-66 (tôi cứng)$$,
  'text',
  '["Ký hiệu Nhật","Tên tiếng Việt","Mô tả"]'::jsonb,
  '[{"from":"焼入れ焼戻し","to":"Nhiệt luyện toàn phần","note":"Yakiire YakiModoshi"},{"from":"Yakiire YakiModoshi","to":"Nhiệt luyện toàn phần","note":"Tôi + Ram"},{"from":"浸炭焼入れ","to":"Tôi cứng bề mặt","note":"Shinsan Yakiire - Carburizing"},{"from":"Shinsan Yakiire","to":"Tôi cứng bề mặt","note":"Carbon penetration"},{"from":"Induction Hardening","to":"Tôi cứng induction","note":"Tôi cứng bằng cảm ứng"},{"from":"焼なまし","to":"Ủ","note":"YakiNaoshi - Annealing"},{"from":"YakiNaoshi","to":"Ủ","note":"Ủ mềm"},{"from":"焼戾し","to":"Ram","note":"YakiModoshi - Tempering"}]'::jsonb
);

-- vnt-surface: Xu ly be mat
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, format, headers, kb_rows) VALUES (
  'vnt-surface',
  'Xử lý bề mặt',
  'Bang ma xu ly be mat VNT',
  $$[BANG XU LY BE MAT]
白アルマイト (Shiro Arumaito) → Anod trắng
黒アルマイト (Kuro Arumaito) → Anod đen
Hard Anodize → Anod cứng
electroless nickel → Mạ niken không điện (EN)
三価クロム (Sanka Kuromu) → Mạ crom 3 (Trivalent Chrome)
硫酸皮膜 (Ryusan Himoaku) → Anod hóa bề mặt (Sulfuric acid anodizing)
黒染め (Kurozome) → Nhuộm đen (Black oxide)
研磨 (Kenma) → Mài bóng (Polishing)
バレル研磨 (Barrel Kenma) → Đánh bóng thùng (Barrel polishing)
発色アルマイト → Anod màu (Color anodizing)

Tiêu chuẩn độ dày Anod VNT:
  Anod trắng/đen: 5-15μm
  Anod cứng (Hard): 25-50μm$$,
  'text',
  '["Ký hiệu Nhật","Tên tiếng Việt","Ghi chú"]'::jsonb,
  '[{"from":"白アルマイト","to":"Anod trắng","note":"Shiro Arumaito"},{"from":"Shiro Arumaito","to":"Anod trắng","note":"Anod hóa trắng"},{"from":"黒アルマイト","to":"Anod đen","note":"Kuro Arumaito"},{"from":"Kuro Arumaito","to":"Anod đen","note":"Anod hóa đen"},{"from":"Hard Anodize","to":"Anod cứng","note":"Hard anodizing - độ cứng cao"},{"from":"electroless nickel","to":"Mạ niken không điện","note":"EN - Electroless nickel"},{"from":"三価クロム","to":"Mạ crom 3","note":"Sanka Kuromu - Trivalent chrome"},{"from":"硫酸皮膜","to":"Anod hóa bề mặt","note":"Sulfuric acid anodizing"},{"from":"黒染め","to":"Nhuộm đen","note":"Kurozome - Black oxide"},{"from":"研磨","to":"Mài bóng","note":"Kenma - Polishing"},{"from":"バレル研磨","to":"Đánh bóng thùng","note":"Barrel Kenma"},{"from":"発色アルマイト","to":"Anod màu","note":"Color anodizing"}]'::jsonb
);

-- vnt-shapes: Phan loai hinh dang
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, format, headers, kb_rows) VALUES (
  'vnt-shapes',
  'Phân loại hình dạng',
  'Bang hinh dang va phuong an gia cong VNT',
  $$[BANG HINH DANG → PHUONG AN GIA CONG]
Phi trondac → TienCNC
Phitronong → TienCNC
Hinhtam → PhayCNC
Luclgiac → TienCNC
Honhop → Tien+Phay

Chi tiet tron xoay (tròn xoay):
  - Đường kính ngoài: Tiện CNC ngoài
  - Đường kính trong (lỗ): Tiện CNC trong
  - Ren: Tiện ren
  - Rãnh then: Tiện rãnh / Phay rãnh
  - Lỗ xuyên tâm: Khoan / Khoét

Chi tiet hop (vuông cạnh):
  - Mat phẳng: Phay CNC mặt
  - Profile bat ky: Phay contour
  - Lỗ: Khoan / Khoét / Tarô
  - Rãnh: Phay rãnh

Chi tiet hon hop:
  - Co ban la tròn xoay + mat phang → TienCNC + PhayCNC$$,
  'text',
  '["Mã hình dạng","Phương án gia công","Chi tiết"]'::jsonb,
  '[{"from":"Phi trondac","to":"TienCNC","note":"Phôi tròn đặc - tiện ngoài"},{"from":"Phitronong","to":"TienCNC","note":"Phôi tròn rỗng - tiện trong"},{"from":"Hinhtam","to":"PhayCNC","note":"Hình tam - phay CNC"},{"from":"Luclgiac","to":"TienCNC","note":"Lục giác - tiện CNC"},{"from":"Honhop","to":"Tien+Phay","note":"Hỗn hợp tròn + vuông"}]'::jsonb
);

-- vnt-knowledge: Kien thuc noi bo VNT (luong rieng + ma qui trinh)
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, format, headers, kb_rows) VALUES (
  'vnt-knowledge',
  'Kiến thức nội bộ VNT',
  'Bang luong rieng va ma qui trinh VNT',
  $$[BANG LƯỢNG RIÊNG]
A2017=2.8 | A2024=2.78 | A5052=2.68 | A6061=2.7 | A7075=2.81
SS400=7.85 | S45C=7.85 | S50C=7.85 | SCM415=7.85 | SCM440=7.85
SKD11=7.7 | SKD61=7.8
SUS303=8.0 | SUS304=7.93 | SUS316=8.0
C1100=8.9 | C3604=8.5
POM=1.41 | PTFE=2.2

[MA QUI TRINH VNT]
QT1xx → Tiện CNC
QT2xx → Phay nhỏ (<50mm)
QT4xx → Phay lớn (>200mm) + MI4
QT6xx → Phay trung bình (50-200mm) + MI6

[QUY UOC]
- Đơn vị kích thước: mm
- Mã bản vẽ: theo format VNT (VD: DV-XXXX)
- Số lượng: mặc định 1 nếu không ghi
- Trạng thái: pending → approved → pushed$$,
  'text',
  '["Mã","Giá trị","Ghi chú"]'::jsonb,
  '[{"from":"QT1xx","to":"Tiện CNC","note":"Qui trình tiện"},{"from":"QT2xx","to":"Phay nhỏ","note":"<50mm"},{"from":"QT4xx","to":"Phay lớn","note":">200mm + MI4"},{"from":"QT6xx","to":"Phay trung bình","note":"50-200mm + MI6"}]'::jsonb
);

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