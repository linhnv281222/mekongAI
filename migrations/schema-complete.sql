-- ============================================================
-- MekongAI — Complete Database Schema
-- Database: mechanical_ai (postgresql)
-- Schema:  mekongai
-- Version: 2026-09-06 (Consolidated from all migrations)
-- Usage:
--   psql -U postgres -d mechanical_ai -f migrations/schema-complete.sql
-- ============================================================

BEGIN;

-- ── 0. Create schema ─────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS mekongai;

-- ── 1. Drop existing tables (fresh start) ─────────────────────
DROP TABLE IF EXISTS mekongai.feedback_events CASCADE;
DROP TABLE IF EXISTS mekongai.field_evidence CASCADE;
DROP TABLE IF EXISTS mekongai.drawing_item_versions CASCADE;
DROP TABLE IF EXISTS mekongai.daily_review_logs CASCADE;
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
  "format"       TEXT DEFAULT 'text'
                  CONSTRAINT mekongai_knowledge_blocks_format_check
                  CHECK ("format" IN ('text', 'table')),
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
  updated_at     TIMESTAMPTZ DEFAULT NOW(),

  -- Extended fields (added incrementally)
  attachments    JSONB DEFAULT '[]',
  ten_cong_ty     TEXT,
  han_giao       TEXT,
  hinh_thuc_giao TEXT,
  xu_ly_be_mat   BOOLEAN,
  vat_lieu_chung_nhan TEXT,
  drawings        JSONB DEFAULT '[]',
  classify_output JSONB,
  classify_ai_payload JSONB,
  drawing_ai_payload JSONB,
  ghi_chu        TEXT,
  pushed_at      TIMESTAMPTZ,
  source         TEXT DEFAULT NULL,
  thi_truong     TEXT,
  han_bao_gia    TEXT,
  email_body     TEXT,

  -- Token tracking (2026-09-06)
  classify_tokens INTEGER DEFAULT 0,
  drawing_tokens  INTEGER DEFAULT 0,
  total_tokens    INTEGER DEFAULT 0,
  classify_model  TEXT,
  drawing_model   TEXT
);

CREATE INDEX idx_agent_jobs_status ON mekongai.agent_jobs(status);
CREATE INDEX idx_agent_jobs_created ON mekongai.agent_jobs(created_at DESC);
CREATE INDEX idx_agent_jobs_gmail ON mekongai.agent_jobs(gmail_id) WHERE gmail_id IS NOT NULL;
CREATE INDEX idx_agent_jobs_tokens ON mekongai.agent_jobs(total_tokens) WHERE total_tokens > 0;
CREATE INDEX idx_agent_jobs_date_tokens ON mekongai.agent_jobs(created_at, total_tokens) WHERE total_tokens > 0;

-- ── 7. Daily Review Logs ────────────────────────────────────────
CREATE TABLE mekongai.daily_review_logs (
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

CREATE INDEX idx_drl_review_date ON mekongai.daily_review_logs(review_date DESC);
CREATE INDEX idx_drl_prompt_key  ON mekongai.daily_review_logs(prompt_key);

COMMENT ON TABLE mekongai.daily_review_logs IS 'Log mỗi lần daily-review-agent chạy. Ghi lại ghi_chu, prompt đã sửa, và diff.';

-- ── 8. Drawing Item Versions (Phase 1) ──────────────────────────
CREATE TABLE mekongai.drawing_item_versions (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER NOT NULL,
  drawing_index       INTEGER NOT NULL,
  version_no          INTEGER NOT NULL DEFAULT 1,
  version_type        TEXT NOT NULL CHECK (version_type IN ('ai_extracted', 'user_draft', 'approved', 'erp_confirmed')),

  data                JSONB NOT NULL,

  source              TEXT,
  source_model        TEXT,
  prompt_version      TEXT,
  docling_version     TEXT,

  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  change_reason       TEXT,

  CONSTRAINT uk_drawing_version UNIQUE (job_id, drawing_index, version_no)
);

CREATE INDEX idx_drawing_versions_job ON mekongai.drawing_item_versions(job_id);
CREATE INDEX idx_drawing_versions_type ON mekongai.drawing_item_versions(version_type);
CREATE INDEX idx_drawing_versions_created ON mekongai.drawing_item_versions(created_at DESC);

COMMENT ON TABLE mekongai.drawing_item_versions IS 'Lưu lịch sử version từng drawing: ai_extracted → user_draft → approved → erp_confirmed';
COMMENT ON COLUMN mekongai.drawing_item_versions.version_type IS 'ai_extracted: AI tạo | user_draft: đang sửa | approved: đã duyệt | erp_confirmed: ERP xác nhận';
COMMENT ON COLUMN mekongai.drawing_item_versions.data IS 'JSONB chứa toàn bộ field: ma_ban_ve, vat_lieu, so_luong, hinh_dang, kich_thuoc...';

-- ── 9. Field Evidence ───────────────────────────────────────────
CREATE TABLE mekongai.field_evidence (
  id                          SERIAL PRIMARY KEY,
  drawing_item_version_id     INTEGER NOT NULL REFERENCES mekongai.drawing_item_versions(id) ON DELETE CASCADE,
  field_name                  TEXT NOT NULL,
  field_value                 TEXT,

  page_number                 INTEGER,
  bbox                        JSONB,
  evidence_text               TEXT,

  source_type                 TEXT CHECK (source_type IN ('docling_text', 'ocr', 'vision', 'rule', 'erp', 'user')),
  confidence                  NUMERIC(3, 2),

  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_field_evidence_version ON mekongai.field_evidence(drawing_item_version_id);
CREATE INDEX idx_field_evidence_field ON mekongai.field_evidence(field_name);

COMMENT ON TABLE mekongai.field_evidence IS 'Evidence: field → vị trí trong PDF (page, bbox, text)';
COMMENT ON COLUMN mekongai.field_evidence.bbox IS 'Bounding box: [x, y, width, height] hoặc null';
COMMENT ON COLUMN mekongai.field_evidence.source_type IS 'docling_text: Docling parse | ocr: OCR | vision: Gemini Vision | rule: Rule-based | erp: ERP lookup | user: User input';

-- ── 10. Feedback Events ─────────────────────────────────────────
CREATE TABLE mekongai.feedback_events (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER NOT NULL,
  drawing_index       INTEGER NOT NULL,
  field_name          TEXT NOT NULL,

  old_value           TEXT,
  new_value           TEXT,

  reason              TEXT,
  actor               TEXT,
  approved            BOOLEAN DEFAULT FALSE,
  erp_result          TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_job ON mekongai.feedback_events(job_id);
CREATE INDEX idx_feedback_field ON mekongai.feedback_events(field_name);
CREATE INDEX idx_feedback_created ON mekongai.feedback_events(created_at DESC);

COMMENT ON TABLE mekongai.feedback_events IS 'Log mỗi lần user sửa field: old_value → new_value';

COMMIT;

-- ============================================================
-- Seed Data — Prompt Templates
-- ============================================================
BEGIN;

INSERT INTO mekongai.prompt_templates (key, name, description) VALUES
  ('email-classify', 'Email Classification Prompt', 'Prompt for classifying incoming emails'),
  ('gemini-drawing', 'Drawing Analysis — Gemini Prompt', 'Prompt for backup drawing analysis using Gemini 2.5'),
  ('chat-classify', 'Chat Classification — AI Extraction', 'AI prompt to extract structured info from chat messages'),
  ('daily-review', 'Daily Review Agent — Prompt Refine', 'Prompt cho AI refine prompt hàng ngày dựa trên ghi chú người dùng');

-- v1 of each is active
INSERT INTO mekongai.prompt_versions (template_id, version, content, variables, is_active, created_by, note)
SELECT id, 1,
  $$
From: {{emailFrom}}
Subject: {{emailSubject}}
Attachments: {{emailAttachments}}
Body (first 500 chars):
{{emailBody}}

{{MARKET}}
$$,
  '["emailFrom","emailSubject","emailAttachments","emailBody","MARKET"]'::jsonb,
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

=== THÔNG TIN TỪ EMAIL/CHAT KHÁCH HÀNG ===
{{EMAIL_CONTEXT}}
=== KẾT THÚC THÔNG TIN EMAIL/CHAT ===

Nếu phần trên có ghi số lượng (ví dụ "100 pcs", "添付図 100個", "各100個") → DÙNG số đó cho TẤT CẢ các bản vẽ, BỎ QUA số lượng trên bản vẽ.
Vật liệu / xử lý bề mặt / xử lý nhiệt: TƯƠNG TỰ — ưu tiên thông tin từ phần trên.

Tròn xoay: điền phi_lon + phi_nho. Vuông cạnh: điền dài/rộng/cao.
Trả về JSON thuần túy, không markdown:
{
  "ban_ve": {"ma_ban_ve":"", "ten_chi_tiet":"", "revision":"", "so_to":"", "don_vi":"MM"},
  "vat_lieu": {"ma":"", "loai":"", "nhiet_luyen":""},
  "san_xuat": {"so_luong":1, "tieu_chuan":""},
  "xu_ly": {"be_mat":[], "nhiet":""},
  "hinh_dang": {"loai":"", "kieu_phoi":"", "phuong_an_gia_cong":"", "mo_ta":[]},
  "kich_thuoc_bao": {"don_vi":"mm","dai":null,"rong":null,"cao_hoac_duong_kinh":null,"phi_lon":null,"phi_nho":null,"phan_loai_do_lon":""},
  "nguyen_cong_cnc":[],
  "be_mat_gia_cong":[],
  "quy_trinh_tong_the":[]
}
$$,
  '["MATERIAL","HEAT_TREAT","SURFACE","SHAPE","VNT_KNOWLEDGE","EMAIL_CONTEXT","MARKET"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'gemini-drawing';

INSERT INTO mekongai.prompt_versions (template_id, version, content, variables, is_active, created_by, note)
SELECT id, 1,
  $$
# Chat Message Classifier — Mekong AI

Bạn là trợ lý AI của hệ thống Mekong AI (công ty Việt Nhật Tân — VNT).
Nhiệm vụ: phân tích tin nhắn chat và trích xuất thông tin cấu trúc để tạo job báo giá.

## Kiến thức VNT — Nguyên vật liệu:
{{MATERIAL}}

## Kiến thức VNT — Xử lý nhiệt:
{{HEAT_TREAT}}

## Kiến thức VNT — Xử lý bề mặt:
{{SURFACE}}

## Kiến thức VNT — Thị trường:
{{MARKET}}

## Tin nhắn cần phân tích:
[NỘI DUNG CHAT TỪ KHÁCH HÀNG]
{{chatMessage}}

[... rest of chat-classify prompt content ...]

Trả về CHỈ JSON, không giải thích thêm:
  $$,
  '["chatMessage","MATERIAL","HEAT_TREAT","SURFACE","MARKET"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'chat-classify';

-- ============================================================
-- Seed Data — Knowledge Blocks (6 blocks)
-- ============================================================

-- vnt-materials: Bảng quy đổi vật liệu VNT
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format", headers, kb_rows) VALUES (
  'vnt-materials',
  'Nguyên vật liệu',
  'Bảng quy đổi vật liệu VNT',
  $$
[BẢNG QUY ĐỔI VẬT LIỆU]
|Nhóm vật liệu | Mã gốc (quốc tế) | Mã VNT | Ghi chú                            |
|---------------|-------------------|--------|-------------------------------------|
| Nhôm          | AlCu4MgSi         | A2017  | EN AW-2017 — Nhôm hợp kim         |
| Nhôm          | EN AW-2017        | A2017  | EN AW-2017 — Nhôm hợp kim         |
| Nhôm          | A2024             | A2024  | Nhôm hợp kim A2024                |
| Nhôm          | A5052             | A5052  | Nhôm hợp kim A5052                |
| Nhôm          | AL6061            | A6061  | EN AW-6061 — Nhôm hợp kim         |
| Nhôm          | A6061             | A6061  | EN AW-6061 — Nhôm hợp kim         |
| Nhôm          | A7075             | A7075  | Nhôm hợp kim A7075                |
| Thép carbon   | S45C              | S45C   | AISI 1045 — Thép carbon trung bình |
| Thép carbon   | S50C              | S50C   | Thép carbon trung bình            |
| Thép hợp kim  | SCM415            | SCM415 | AISI 4115 — Thép hợp kim thấp    |
| Thép hợp kim  | SCM440            | SCM440 | AISI 4140 — Thép hợp kim cao     |
| Thép công cụ  | SKD11             | SKD11  | AISI D2 — Thép dụng cụ dập nguội |
| Thép công cụ  | SKD61             | SKD61  | Thép dụng cụ dập nóng            |
| Thép không gỉ | SUS303            | SUS303 | Thép không gỉ austenitic 303      |
| Thép không gỉ | SUS304            | SUS304 | AISI 304 — Thép không gỉ 304      |
| Thép không gỉ | AISI 304          | SUS304 | Thép không gỉ 304                |
| Thép không gỉ | SUS316            | SUS316 | AISI 316 — Thép không gỉ 316     |
| Thép không gỉ | AISI 316          | SUS316 | Thép không gỉ 316                |
| Thép cấu trúc | SS400            | SS400  | Thép cacbon SS400                |
| Đồng          | C1100             | C1100  | Copper 110 — Đồng nguyên chất    |
| Đồng          | Copper 110        | C1100  | Đồng nguyên chất 99.9%          |
| Đồng thau     | C3604             | C3604  | Free-cutting brass — Đồng thau   |
| Đồng thau     | Laiton            | C3604  | Đồng thau dễ gia công           |
| Nhựa kỹ thuật | POM              | POM    | Acetal — Nhựa kỹ thuật POM      |
| Nhựa kỹ thuật | PTFE              | PTFE   | Teflon — Nhựa kỹ thuật PTFE     |

[BẢNG LƯỢNG RIÊNG]
A2017=2.8 | A2024=2.78 | A5052=2.68 | A6061=2.7 | A7075=2.81
SS400=7.85 | S45C=7.85 | S50C=7.85 | SCM415=7.85 | SCM440=7.85
SKD11=7.7 | SKD61=7.8
SUS303=8.0 | SUS304=7.93 | SUS316=8.0
C1100=8.9 | C3604=8.5
POM=1.41 | PTFE=2.2
$$,
  'text',
  '["Nhóm vật liệu","Mã gốc (quốc tế)","Mã VNT","Ghi chú"]'::jsonb,
  '[]'::jsonb
);

-- vnt-heat-treat: Xử lý nhiệt
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format") VALUES (
  'vnt-heat-treat',
  'Xử lý nhiệt',
  'Bảng mã xử lý nhiệt VNT',
  $$
[BẢNG XỬ LÝ NHIỆT]
|Nhóm xử lý | Ký hiệu gốc         | Kết quả VNT           | Ghi chú                              |
|------------|---------------------|-----------------------|--------------------------------------|
| Nhiệt luyện toàn phần | 焼入れ焼戻し     | Nhiệt luyện toàn phần | Yakiire YakiModoshi — Tôi + Ram    |
| Nhiệt luyện toàn phần | Yakiire YakiModoshi | Nhiệt luyện toàn phần | Tiếng Anh: Quench & Tempering        |
| Tôi cứng bề mặt | 浸炭焼入れ           | Tôi cứng bề mặt       | Shinsan Yakiire — Carburizing        |
| Tôi cứng bề mặt | Shinsan Yakiire     | Tôi cứng bề mặt       | Thấm carbon + Tôi cứng              |
| Tôi cứng thể tích | Induction Hardening | Tôi cứng induction     | Tôi cứng bằng cảm ứng              |
| Ủ             | 焼なまし                | Ủ                     | YakiNaoshi — Annealing              |
| Ủ             | YakiNaoshi             | Ủ                     | Ủ mềm — Làm mềm thép               |
| Ram           | 焼戾し                | Ram                   | YakiModoshi — Tempering            |
| Ram           | YakiModoshi            | Ram                   | Ram — Giảm giòn sau tôi            |

[TIÊU CHUẨN HRC VNT]
Thép S45C: HRC 55-60 (tôi cứng)
Thép SCM415/440: HRC 58-62 (tôi cứng bề mặt)
Thép SKD11: HRC 58-62 (tôi cứng)
Thép SUJ2: HRC 62-66 (tôi cứng)
$$,
  'text'
);

-- vnt-surface: Xử lý bề mặt
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format") VALUES (
  'vnt-surface',
  'Xử lý bề mặt',
  'Bảng mã xử lý bề mặt VNT',
  $$
[BẢNG XỬ LÝ BỀ MẶT]
|Nhóm xử lý | Ký hiệu gốc        | Kết quả VNT              | Ghi chú                            |
|------------|--------------------|--------------------------|------------------------------------|
| Anod nhôm  | 白アルマイト          | Anod trắng               | Shiro Arumaito — Anod hóa trắng   |
| Anod nhôm  | Kuro Arumaito       | Anod đen                 | Anod hóa đen                       |
| Anod nhôm  | 黒アルマイト          | Anod đen                 | Kuro Arumaito — Anod hóa đen      |
| Anod nhôm  | Hard Anodize        | Anod cứng                | Hard anodizing — độ cứng cao      |
| Anod nhôm  | 発色アルマイト        | Anod màu                 | Color anodizing                    |
| Mạ kim loại| electroless nickel  | Mạ niken không điện     | EN — Electroless nickel           |
| Mạ kim loại| 三価クロム            | Mạ crom 3                | Sanka Kuromu — Trivalent chrome   |
| Mạ kim loại|硫酸皮膜              | Anod hóa bề mặt          | Sulfuric acid anodizing           |
| Đánh bóng  | 黒染め               | Nhuộm đen                | Kurozome — Black oxide            |
| Đánh bóng  | 研磨                 | Mài bóng                 | Kenma — Polishing                  |
| Đánh bóng  | バレル研磨            | Đánh bóng thùng          | Barrel Kenma — Barrel polishing    |

[TIÊU CHUẨN ĐỘ DÀY ANOD VNT]
Anod trắng/đen: 5-15μm
Anod cứng (Hard): 25-50μm
$$,
  'text'
);

-- vnt-shapes: Phân loại hình dạng
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format") VALUES (
  'vnt-shapes',
  'Phân loại hình dạng',
  'Bảng hình dạng và phương án gia công VNT',
  $$
[BẢNG PHÂN LOẠI HÌNH DẠNG]
|Loại phôi  | Đặc điểm           | Phương án gia công | Ghi chú                        |
|------------|---------------------|---------------------|---------------------------------|
| Tròn đặc   | Đường kính ngoài    | Tiện CNC ngoài      | Tiện CNC — Dao tiện ngoài     |
| Tròn đặc   | Đường kính trong    | Tiện CNC trong      | Tiện CNC — Tiện lỗ             |
| Tròn đặc   | Ren                 | Tiện ren            | Tiện CNC — Dao tiện ren       |
| Tròn đặc   | Rãnh then           | Tiện rãnh / Phay rãnh | Tiện hoặc phay tùy chiều rộng |
| Tròn đặc   | Lỗ xuyên tâm        | Khoan / Khoét        | Khoan qua hoặc khoét mở rộng  |
| Tròn rỗng  | Đường kính ngoài    | Tiện CNC ngoài      | Tiện CNC — Phôi ống/lồng      |
| Tròn rỗng  | Đường kính trong    | Tiện CNC trong      | Tiện CNC — Gia công thành ống |
| Tròn rỗng  | Mặt đầu             | Tiện CNC mặt        | Tiện CNC — Mặt đầu ống       |
| Vuông cạnh | Mặt phẳng           | Phay CNC mặt         | Phay CNC — Dao phay mặt       |
| Vuông cạnh | Profile bất kỳ       | Phay contour          | Phay CNC — Theo biên dạng      |
| Vuông cạnh | Lỗ                  | Khoan / Khoét / Tarô | Phay CNC — Gia công lỗ        |
| Vuông cạnh | Rãnh                | Phay rãnh             | Phay CNC — Dao phay rãnh      |
| Vuông cạnh | Lỗ ren              | Tarô ren              | Tarô ren — ren trong lỗ        |
| Hình tam    | 3 cạnh / góc        | Phay CNC              | Phay CNC — Contour 3 cạnh     |
| Lục giác   | 6 cạnh trong/lỗ    | Tiện CNC              | Tiện CNC — Lục giác trong     |
| Lục giác   | 6 cạnh ngoài        | Tiện CNC              | Tiện CNC — Lục giác ngoài     |
| Hỗn hợp    | Tròn + Vuông         | Tiện + Phay CNC      | Kết hợp cả hai quy trình      |

[QUY ƯỚC GIA CÔNG]
- Đơn vị kích thước: mm
- Kích thước nhỏ (<50mm): QT2xx — Phay nhỏ
- Kích thước trung bình (50-200mm): QT6xx — Phay trung bình
- Kích thước lớn (>200mm): QT4xx — Phay lớn
$$,
  'text'
);

-- vnt-knowledge: Kiến thức nội bộ VNT (lượng riêng + mã qui trình)
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format") VALUES (
  'vnt-knowledge',
  'Kiến thức nội bộ VNT',
  'Bảng lượng riêng và mã qui trình VNT',
  $$
[BẢNG LƯỢNG RIÊNG VẬT LIỆU]
|Nhóm xử lý | Ký hiệu gốc | Kết quả VNT | Ghi chú                    |
|------------|-------------|-------------|----------------------------|
| Nhôm       | A2017       | 2.8 g/cm³   | Nhôm hợp kim EN AW-2017  |
| Nhôm       | A2024       | 2.78 g/cm³  | Nhôm hợp kim              |
| Nhôm       | A5052       | 2.68 g/cm³  | Nhôm hợp kim              |
| Nhôm       | A6061       | 2.7 g/cm³   | Nhôm hợp kim EN AW-6061  |
| Nhôm       | A7075       | 2.81 g/cm³  | Nhôm hợp kim              |
| Thép       | SS400       | 7.85 g/cm³  | Thép cacbon SS400         |
| Thép       | S45C        | 7.85 g/cm³  | Thép carbon trung bình    |
| Thép       | S50C        | 7.85 g/cm³  | Thép carbon               |
| Thép       | SCM415      | 7.85 g/cm³  | Thép hợp kim thấp        |
| Thép       | SCM440      | 7.85 g/cm³  | Thép hợp kim cao          |
| Thép       | SKD11       | 7.7 g/cm³   | Thép dụng cụ dập nguội   |
| Thép       | SKD61       | 7.8 g/cm³   | Thép dụng cụ dập nóng    |
| Thép không gỉ| SUS303     | 8.0 g/cm³   | Thép không gỉ austenitic  |
| Thép không gỉ| SUS304     | 7.93 g/cm³  | Thép không gỉ 304         |
| Thép không gỉ| SUS316     | 8.0 g/cm³   | Thép không gỉ 316         |
| Đồng       | C1100       | 8.9 g/cm³   | Đồng nguyên chất 99.9%   |
| Đồng thau  | C3604       | 8.5 g/cm³   | Đồng thau dễ gia công    |
| Nhựa       | POM         | 1.41 g/cm³  | Acetal — Nhựa kỹ thuật   |
| Nhựa       | PTFE        | 2.2 g/cm³   | Teflon — Nhựa kỹ thuật   |

[MÃ QUI TRÌNH VNT]
|Nhóm xử lý | Ký hiệu gốc | Kết quả VNT              | Ghi chú           |
|------------|-------------|--------------------------|-------------------|
| Tiện CNC   | QT1xx       | Tiện CNC                 | Qui trình tiện    |
| Phay nhỏ   | QT2xx       | Phay nhỏ (<50mm)        | Kích thước nhỏ   |
| Phay trung bình | QT6xx  | Phay trung bình (50-200mm)| QT6xx + MI6     |
| Phay lớn   | QT4xx       | Phay lớn (>200mm)        | QT4xx + MI4       |

[QUY ƯỚC VNT]
- Đơn vị kích thước: mm
- Mã bản vẽ: format VNT (VD: DV-XXXX)
- Số lượng: mặc định 1 nếu không ghi
- Trạng thái: pending → approved → pushed
$$,
  'text'
);

-- vnt-markets: Thị trường (thêm 2026-05-07)
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format") VALUES (
  'vnt-markets',
  'Thị trường',
  'Bảng phân biệt thị trường khách hàng VN/JP/US/EU',
  $$
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
$$,
  'text'
);

COMMIT;

-- ============================================================
-- Data Migrations
-- ============================================================
BEGIN;

-- Update source field for existing jobs
UPDATE mekongai.agent_jobs
SET source = CASE WHEN gmail_id IS NOT NULL AND gmail_id != '' THEN 'email' ELSE 'chat' END
WHERE source IS NULL;

-- Update thi_truong automatically based on email domain
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

-- Update total_tokens for existing jobs
UPDATE mekongai.agent_jobs
SET total_tokens = COALESCE(classify_tokens, 0) + COALESCE(drawing_tokens, 0)
WHERE total_tokens = 0 AND (classify_tokens > 0 OR drawing_tokens > 0);

COMMIT;

-- ============================================================
-- End of schema-complete.sql
-- ============================================================
