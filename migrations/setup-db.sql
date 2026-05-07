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
  $$
From: {{emailFrom}}
Subject: {{emailSubject}}
Attachments: {{emailAttachments}}
Body (first 500 chars):
{{emailBody}}
$$,
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

=== THÔNG TIN TỪ EMAIL/CHAT KHÁCH HÀNG ===
{{EMAIL_CONTEXT}}
=== KẾT THÚC THÔNG TIN EMAIL/CHAT ===

Nếu phần trên có ghi số lượng (ví dụ "100 pcs", "添付図 100個", "各100個") → DÙNG số đó cho TẤT CẢ các bản vẽ, BỎ QUA số lượng trên bản vẽ.
Vật liệu / xử lý bề mặt / xử lý nhiệt: TƯƠNG TỰ — ưu tiên thông tin từ phần trên.

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

## QUY TẮC TRÍCH XUẤT TÊN KHÁCH HÀNG
Khi người dùng nhắc đến khách hàng, hãy trích xuất TÊN ĐẦY ĐỦ:

- "khách hàng [TÊN]" → tên khách hàng là "[TÊN]"
- "customer [TÊN]" → tên khách hàng là "[TÊN]"
- "dành cho [TÊN]" → tên khách hàng là "[TÊN]"
- "attn [TÊN]" → tên người liên hệ là "[TÊN]"
- "quote for [COMPANY NAME]" → tên khách hàng là "[COMPANY NAME]"
- "báo giá cho [TÊN CÔNG TY]" → tên khách hàng là "[TÊN CÔNG TY]"
- "株式会社 [TÊN]" hoặc "[TÊN]株式会社" → tên công ty là "[TÊN]"

QUAN TRỌNG:
- Tên khách hàng có thể là bất kỳ từ/cụm từ nào, KHÔNG giới hạn.
- "VNT", "Agent", "Việt Nhật Tân" — đây là CÔNG TY CỦA NGƯỜI DÙNG, không phải khách hàng.
- Nếu tên sau từ khóa là "VNT" → trích xuất chính xác là "VNT".
- Nếu có chữ ký email/chat ở cuối (có thể chứa tên công ty, người liên hệ, email) → trích xuất thông tin đó.
- Không bịa đặt hay bổ sung thông tin không có trong tin nhắn.
- Nếu không rõ tên khách hàng → trả "unknown".

## Quy tắc trích xuất SỐ LƯỢNG:
1. Nếu email/chat có ghi rõ số lượng cho một mã cụ thể (VD "BA2-6002: 100 pcs") → ghi vào `so_luong` dạng "BA2-6002: 100 pcs".
2. Nếu email/chat chỉ ghi chung chung "100 pcs/loại" hoặc "各１００個" hoặc "添付図 100個" → ghi vào `so_luong` dạng "100 (áp dụng cho tất cả)".
3. Nếu email/chat ghi nhiều mã khác nhau (VD "ABC111: 100 pcs, acb11: 2 pcs") → ghi đầy đủ vào `so_luong`.
4. Nếu không có thông tin số lượng → `so_luong` = "unknown".

## Các trường cần trích xuất:
- ten_cong_ty: tên công ty khách hàng (hoặc "unknown")
- ten_nguoi_lien_he: tên người liên hệ (nếu có, hoặc "unknown")
- email_khach_hang: email khách hàng (nếu có, hoặc "unknown")
- so_luong: số lượng đặt hàng. Ghi rõ số, VD: "100" hoặc "100 (áp dụng cho tất cả)" hoặc "BA2-6002: 100 pcs" (không ghi "unknown" nếu có thể trích xuất được)
- ngon_ngu: vi | en | ja (ngôn ngữ chính của tin nhắn)
  - vi: có dấu tiếng Việt (ă, â, đ, ê, ô, ơ, ư) HOẶC các từ như "báo giá", "khách hàng", "số lượng"
  - ja: có chữ Hán tự tiếng Nhật (會、社、株、丸、形、様、致、す) HOẶC katakana/hiragana
  - en: không phải viết tiếng Việt, không phải tiếng Nhật → en
  - CHỮ KÝ Ở CUỐI EMAIL (sau dòng gạch ngang "---") KHÔNG ẢNH HƯỞNG ngon_ngu
- thi_truong: VN | JP | US | EU (thị trường khách hàng, tham khảo MARKET block)
- co_yeu_cau_bao_gia: true | false (có phải yêu cầu báo giá không)
- loi_nhan: tóm tắt nội dung chính (tối đa 200 ký tự, bằng TIẾNG VIỆT)
- chat_luu_y: ghi chú cho bước phân tích bản vẽ tiếp theo.
  - Nếu có số lượng chung (rule 2) → ghi: "Số lượng từ chat: N pcs — áp dụng cho TẤT CẢ các bản vẽ"
  - Nếu có số lượng cho mã cụ thể (rule 1/3) → ghi rõ mã nào: bao nhiêu
  - Nếu không có lưu ý đặc biệt → "Không có"

## Ví dụ:
Input: "添付図１００個 でお見積もりお願いします"
Output:
{
  "ten_cong_ty": "株式会社　弘盛",
  "ten_nguoi_lien_he": "植木　弘貴",
  "email_khach_hang": "h-ueki@hiro-mori.co.jp",
  "so_luong": "100 (áp dụng cho tất cả)",
  "ngon_ngu": "ja",
  "thi_truong": "JP",
  "co_yeu_cau_bao_gia": true,
  "chat_luu_y": "Số lượng từ chat: 100 pcs — áp dụng cho TẤT CẢ các bản vẽ (email ghi chung '添付図１００個', không ghi mã cụ thể)",
  "loi_nhan": "Yêu cầu báo giá cho công ty 株式会社　弘盛, 100 cái/loại"
}

Input: "Báo giá cho khách hàng VNT nhé. Số lượng 100 chiếc, không xử lý bề mặt"
Output:
{
  "ten_cong_ty": "VNT",
  "ten_nguoi_lien_he": "unknown",
  "email_khach_hang": "unknown",
  "so_luong": "100 (áp dụng cho tất cả)",
  "ngon_ngu": "vi",
  "thi_truong": "VN",
  "co_yeu_cau_bao_gia": true,
  "chat_luu_y": "Số lượng từ chat: 100 pcs — áp dụng cho TẤT CẢ các bản vẽ",
  "loi_nhan": "Yêu cầu báo giá cho khách hàng VNT, 100 chiếc, không xử lý bề mặt"
}

Input: "Chào bạn, tôi muốn hỏi về giá gia công CNC"
Output:
{
  "ten_cong_ty": "unknown",
  "ten_nguoi_lien_he": "unknown",
  "email_khach_hang": "unknown",
  "so_luong": "unknown",
  "ngon_ngu": "vi",
  "thi_truong": "VN",
  "co_yeu_cau_bao_gia": false,
  "chat_luu_y": "Không có",
  "loi_nhan": "Hỏi về giá gia công CNC"
}

Trả về CHỈ JSON, không giải thích thêm:
  $$,
  '["chatMessage","MATERIAL","HEAT_TREAT","SURFACE","MARKET"]'::jsonb,
  true, 'seed', 'Initial version'
FROM mekongai.prompt_templates WHERE key = 'chat-classify';

-- ============================================================
-- Seed Data — Knowledge Blocks (5 blocks cho gemini-drawing)
-- ============================================================

-- vnt-materials: Bang quy doi vat lieu VNT
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format", headers, kb_rows) VALUES (
  'vnt-materials',
  'Nguyên vật liệu',
  'Bang quy doi vat lieu VNT',
  $$
[BANG QUY DOI VAT LIEU]
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

[BANG LUONG RIENG]
A2017=2.8 | A2024=2.78 | A5052=2.68 | A6061=2.7 | A7075=2.81
SS400=7.85 | S45C=7.85 | S50C=7.85 | SCM415=7.85 | SCM440=7.85
SKD11=7.7 | SKD61=7.8
SUS303=8.0 | SUS304=7.93 | SUS316=8.0
C1100=8.9 | C3604=8.5
POM=1.41 | PTFE=2.2
$$,
  'text',
  '["Nhóm vật liệu","Mã gốc (quốc tế)","Mã VNT","Ghi chú"]'::jsonb,
  '[{"group":"Nhôm","from":"AlCu4MgSi","to":"A2017","note":"EN AW-2017 — Nhôm hợp kim"},{"group":"Nhôm","from":"EN AW-2017","to":"A2017","note":"EN AW-2017 — Nhôm hợp kim"},{"group":"Nhôm","from":"A2024","to":"A2024","note":"Nhôm hợp kim A2024"},{"group":"Nhôm","from":"A5052","to":"A5052","note":"Nhôm hợp kim A5052"},{"group":"Nhôm","from":"AL6061","to":"A6061","note":"EN AW-6061 — Nhôm hợp kim"},{"group":"Nhôm","from":"A6061","to":"A6061","note":"EN AW-6061 — Nhôm hợp kim"},{"group":"Nhôm","from":"A7075","to":"A7075","note":"Nhôm hợp kim A7075"},{"group":"Thép carbon","from":"S45C","to":"S45C","note":"AISI 1045 — Thép carbon trung bình"},{"group":"Thép carbon","from":"S50C","to":"S50C","note":"Thép carbon trung bình"},{"group":"Thép hợp kim","from":"SCM415","to":"SCM415","note":"AISI 4115 — Thép hợp kim thấp"},{"group":"Thép hợp kim","from":"SCM440","to":"SCM440","note":"AISI 4140 — Thép hợp kim cao"},{"group":"Thép công cụ","from":"SKD11","to":"SKD11","note":"AISI D2 — Thép dụng cụ dập nguội"},{"group":"Thép công cụ","from":"SKD61","to":"SKD61","note":"Thép dụng cụ dập nóng"},{"group":"Thép không gỉ","from":"SUS303","to":"SUS303","note":"Thép không gỉ austenitic 303"},{"group":"Thép không gỉ","from":"SUS304","to":"SUS304","note":"AISI 304 — Thép không gỉ 304"},{"group":"Thép không gỉ","from":"AISI 304","to":"SUS304","note":"Thép không gỉ 304"},{"group":"Thép không gỉ","from":"SUS316","to":"SUS316","note":"AISI 316 — Thép không gỉ 316"},{"group":"Thép không gỉ","from":"AISI 316","to":"SUS316","note":"Thép không gỉ 316"},{"group":"Thép cấu trúc","from":"SS400","to":"SS400","note":"Thép cacbon SS400"},{"group":"Đồng","from":"C1100","to":"C1100","note":"Copper 110 — Đồng nguyên chất"},{"group":"Đồng","from":"Copper 110","to":"C1100","note":"Đồng nguyên chất 99.9%"},{"group":"Đồng thau","from":"C3604","to":"C3604","note":"Free-cutting brass — Đồng thau"},{"group":"Đồng thau","from":"Laiton","to":"C3604","note":"Đồng thau dễ gia công"},{"group":"Nhựa kỹ thuật","from":"POM","to":"POM","note":"Acetal — Nhựa kỹ thuật POM"},{"group":"Nhựa kỹ thuật","from":"PTFE","to":"PTFE","note":"Teflon — Nhựa kỹ thuật PTFE"}]'::jsonb
);

-- vnt-heat-treat: Xu ly nhiet
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format", headers, kb_rows) VALUES (
  'vnt-heat-treat',
  'Xử lý nhiệt',
  'Bang ma xu ly nhiet VNT',
  $$
[BANG XU LY NHET]
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

[TIEU CHUAN HRC VNT]
Thép S45C: HRC 55-60 (tôi cứng)
Thép SCM415/440: HRC 58-62 (tôi cứng bề mặt)
Thép SKD11: HRC 58-62 (tôi cứng)
Thép SUJ2: HRC 62-66 (tôi cứng)
$$,
  'text',
  '["Nhóm xử lý","Ký hiệu gốc","Kết quả VNT","Ghi chú"]'::jsonb,
  '[{"group":"Nhiệt luyện toàn phần","from":"焼入れ焼戻し","to":"Nhiệt luyện toàn phần","note":"Yakiire YakiModoshi — Tôi + Ram"},{"group":"Nhiệt luyện toàn phần","from":"Yakiire YakiModoshi","to":"Nhiệt luyện toàn phần","note":"Tiếng Anh: Quench & Tempering"},{"group":"Tôi cứng bề mặt","from":"浸炭焼入れ","to":"Tôi cứng bề mặt","note":"Shinsan Yakiire — Carburizing"},{"group":"Tôi cứng bề mặt","from":"Shinsan Yakiire","to":"Tôi cứng bề mặt","note":"Thấm carbon + Tôi cứng"},{"group":"Tôi cứng thể tích","from":"Induction Hardening","to":"Tôi cứng induction","note":"Tôi cứng bằng cảm ứng"},{"group":"Ủ","from":"焼なまし","to":"Ủ","note":"YakiNaoshi — Annealing"},{"group":"Ủ","from":"YakiNaoshi","to":"Ủ","note":"Ủ mềm — Làm mềm thép"},{"group":"Ram","from":"焼戾し","to":"Ram","note":"YakiModoshi — Tempering"},{"group":"Ram","from":"YakiModoshi","to":"Ram","note":"Ram — Giảm giòn sau tôi"}]'::jsonb
);

-- vnt-surface: Xu ly be mat
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format", headers, kb_rows) VALUES (
  'vnt-surface',
  'Xử lý bề mặt',
  'Bang ma xu ly be mat VNT',
  $$
[BANG XU LY BE MAT]
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

[TIEU CHUAN DO DAY ANOD VNT]
Anod trắng/đen: 5-15μm
Anod cứng (Hard): 25-50μm
$$,
  'text',
  '["Nhóm xử lý","Ký hiệu gốc","Kết quả VNT","Ghi chú"]'::jsonb,
  '[{"group":"Anod nhôm","from":"白アルマイト","to":"Anod trắng","note":"Shiro Arumaito — Anod hóa trắng"},{"group":"Anod nhôm","from":"Kuro Arumaito","to":"Anod đen","note":"Anod hóa đen"},{"group":"Anod nhôm","from":"黒アルマイト","to":"Anod đen","note":"Kuro Arumaito — Anod hóa đen"},{"group":"Anod nhôm","from":"Hard Anodize","to":"Anod cứng","note":"Hard anodizing — độ cứng cao"},{"group":"Anod nhôm","from":"発色アルマイト","to":"Anod màu","note":"Color anodizing"},{"group":"Mạ kim loại","from":"electroless nickel","to":"Mạ niken không điện","note":"EN — Electroless nickel"},{"group":"Mạ kim loại","from":"三価クロム","to":"Mạ crom 3","note":"Sanka Kuromu — Trivalent chrome"},{"group":"Mạ kim loại","from":"硫酸皮膜","to":"Anod hóa bề mặt","note":"Sulfuric acid anodizing"},{"group":"Đánh bóng","from":"黒染め","to":"Nhuộm đen","note":"Kurozome — Black oxide"},{"group":"Đánh bóng","from":"研磨","to":"Mài bóng","note":"Kenma — Polishing"},{"group":"Đánh bóng","from":"バレル研磨","to":"Đánh bóng thùng","note":"Barrel Kenma — Barrel polishing"}]'::jsonb
);

-- vnt-shapes: Phan loai hinh dang
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format", headers, kb_rows) VALUES (
  'vnt-shapes',
  'Phân loại hình dạng',
  'Bang hinh dang va phuong an gia cong VNT',
  $$
[BANG PHAN LOAI HINH DANG]
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

[QUY UOC GIA CONG]
- Đơn vị kích thước: mm
- Kích thước nhỏ (<50mm): QT2xx — Phay nhỏ
- Kích thước trung bình (50-200mm): QT6xx — Phay trung bình
- Kích thước lớn (>200mm): QT4xx — Phay lớn
$$,
  'text',
  '["Loại phôi","Đặc điểm","Phương án gia công","Ghi chú"]'::jsonb,
  '[{"group":"Tròn đặc","from":"Đường kính ngoài","to":"Tiện CNC ngoài","note":"Tiện CNC — Dao tiện ngoài"},{"group":"Tròn đặc","from":"Đường kính trong","to":"Tiện CNC trong","note":"Tiện CNC — Tiện lỗ"},{"group":"Tròn đặc","from":"Ren","to":"Tiện ren","note":"Tiện CNC — Dao tiện ren"},{"group":"Tròn đặc","from":"Rãnh then","to":"Tiện rãnh / Phay rãnh","note":"Tiện hoặc phay tùy chiều rộng"},{"group":"Tròn đặc","from":"Lỗ xuyên tâm","to":"Khoan / Khoét","note":"Khoan qua hoặc khoét mở rộng"},{"group":"Tròn rỗng","from":"Đường kính ngoài","to":"Tiện CNC ngoài","note":"Tiện CNC — Phôi ống/lồng"},{"group":"Tròn rỗng","from":"Đường kính trong","to":"Tiện CNC trong","note":"Tiện CNC — Gia công thành ống"},{"group":"Tròn rỗng","from":"Mặt đầu","to":"Tiện CNC mặt","note":"Tiện CNC — Mặt đầu ống"},{"group":"Vuông cạnh","from":"Mặt phẳng","to":"Phay CNC mặt","note":"Phay CNC — Dao phay mặt"},{"group":"Vuông cạnh","from":"Profile bất kỳ","to":"Phay contour","note":"Phay CNC — Theo biên dạng"},{"group":"Vuông cạnh","from":"Lỗ","to":"Khoan / Khoét / Tarô","note":"Phay CNC — Gia công lỗ"},{"group":"Vuông cạnh","from":"Rãnh","to":"Phay rãnh","note":"Phay CNC — Dao phay rãnh"},{"group":"Vuông cạnh","from":"Lỗ ren","to":"Tarô ren","note":"Tarô ren — ren trong lỗ"},{"group":"Hình tam","from":"3 cạnh / góc","to":"Phay CNC","note":"Phay CNC — Contour 3 cạnh"},{"group":"Lục giác","from":"6 cạnh trong/lỗ","to":"Tiện CNC","note":"Tiện CNC — Lục giác trong"},{"group":"Lục giác","from":"6 cạnh ngoài","to":"Tiện CNC","note":"Tiện CNC — Lục giác ngoài"},{"group":"Hỗn hợp","from":"Tròn + Vuông","to":"Tiện + Phay CNC","note":"Kết hợp cả hai quy trình"}]'::jsonb
);

-- vnt-knowledge: Kien thuc noi bo VNT (luong rieng + ma qui trinh)
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format", headers, kb_rows) VALUES (
  'vnt-knowledge',
  'Kiến thức nội bộ VNT',
  'Bang luong rieng va ma qui trinh VNT',
  $$
[BANG LUONG RIENG VAT LIEU]
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

[MA QUI TRINH VNT]
|Nhóm xử lý | Ký hiệu gốc | Kết quả VNT              | Ghi chú           |
|------------|-------------|--------------------------|-------------------|
| Tiện CNC   | QT1xx       | Tiện CNC                 | Qui trình tiện    |
| Phay nhỏ   | QT2xx       | Phay nhỏ (<50mm)        | Kích thước nhỏ   |
| Phay trung bình | QT6xx  | Phay trung bình (50-200mm)| QT6xx + MI6     |
| Phay lớn   | QT4xx       | Phay lớn (>200mm)        | QT4xx + MI4       |

[QUY UOC VNT]
- Đơn vị kích thước: mm
- Mã bản vẽ: format VNT (VD: DV-XXXX)
- Số lượng: mặc định 1 nếu không ghi
- Trạng thái: pending → approved → pushed
$$,
  'text',
  '["Nhóm xử lý","Ký hiệu gốc","Kết quả VNT","Ghi chú"]'::jsonb,
  '[{"group":"Tiện CNC","from":"QT1xx","to":"Tiện CNC","note":"Qui trình tiện"},{"group":"Phay nhỏ","from":"QT2xx","to":"Phay nhỏ (<50mm)","note":"Kích thước nhỏ"},{"group":"Phay trung bình","from":"QT6xx","to":"Phay trung bình (50-200mm)","note":"QT6xx + MI6"},{"group":"Phay lớn","from":"QT4xx","to":"Phay lớn (>200mm)","note":"QT4xx + MI4"}]'::jsonb
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
  ADD COLUMN IF NOT EXISTS pushed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source         TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS thi_truong     TEXT,
  ADD COLUMN IF NOT EXISTS han_bao_gia    TEXT,
  ADD COLUMN IF NOT EXISTS email_body     TEXT;

-- Chi so cho query thuong
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON mekongai.agent_jobs(status);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_created ON mekongai.agent_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_gmail ON mekongai.agent_jobs(gmail_id) WHERE gmail_id IS NOT NULL;


-------------------Mới thêm-----------------

UPDATE mekongai.agent_jobs
SET source = CASE WHEN gmail_id IS NOT NULL AND gmail_id != '' THEN 'email' ELSE 'chat' END
WHERE source IS NULL;

-- ============================================================
-- 1. UPSERT vnt-markets knowledge block
-- ============================================================
INSERT INTO mekongai.knowledge_blocks (key, name, description, content, "format", headers, kb_rows) VALUES (
  'vnt-markets',
  'Thị trường',
  'Bang phan biet thi truong khach hang VN/JP/US/EU',
  $$
[BẢNG THỊ TRƯỜNG KHÁCH HÀNG]
Giới tiền: VIỆT NAM (VN)
- Email: .vn, .com.vn, viet nam, việt nam, vietnam
- Ngôn ngữ: Tiếng Việt có dấu (ă, â, đ, ê, ô, ơ, ư)
- Đơn vị tiền tệ: VND, đồng
- Địa chỉ: Vietnam, Viet Nam, Hà Nội, Hồ Chí Minh, Đà Nẵng
- Mã quốc gia: +84

Giới tiền: NHẬT BẢN (JP)
- Email: .jp, nhật bản, japan, 越南
- Ngôn ngữ: Tiếng Nhật (会、社、株、丸、形、様、致、す hoặc katakana/hiragana)
- Đơn vị tiền tệ: JPY, Yen, 円
- Địa chỉ: Japan, Nihon, 越南, 東京, 大阪
- Tên công ty thường gặp: 株式会社、有限会社、協同組合
- Mã quốc gia: +81

Giới tiền: MỸ (US)
- Email: .com, .net, .org (không .vn/.jp), my, mỹ, usa, united states, america
- Ngôn ngữ: Tiếng Anh thuần (không có dấu tiếng Việt, không có chữ Hán tự Nhật)
- Đơn vị tiền tệ: USD, Dollar, $
- Địa chỉ: USA, United States, America, California, New York, Texas
- Mã quốc gia: +1

Giới tiền: CHÂU ÂU (EU)
- Email: .co.uk, .de, .fr, .it, .eu, châu âu, europe, european
- Ngôn ngữ: Tiếng Anh, Đức, Pháp, Ý, Tây Ban Nha
- Đơn vị tiền tệ: EUR, Euro, £, CHF
- Địa chỉ: Germany, France, UK, Italy, Europe
- Mã quốc gia: +49, +44, +33, +39

QUY TẮC PHÂN BIỆT:
1. Ưu tiên email/tên công ty > ngôn ngữ > địa chỉ > mã quốc gia
2. Nếu thông tin trái ngược (VD: email .vn nhưng ngôn ngữ là tiếng Nhật) -> ưu tiên nội dung chính của email/chat
3. Nếu không có thông tin -> mặc định theo ngôn ngữ: tiếng Việt->VN, tiếng Nhật->JP, tiếng Anh thuần->US
$$
  'text',
  '["Thị trường","Tên","Khu vực","Email","Ngôn ngữ","Đơn vị tiền tệ"]'::jsonb,
  '[{"market":"VN","ten":"Việt Nam","gioi_tien":"VIỆT NAM","email":".vn, .com.vn","ngon_ngu":"Tiếng Việt có dấu","tien_te":"VND"},{"market":"JP","ten":"Nhật Bản","gioi_tien":"NHẬT BẢN","email":".jp, nhật bản, japan","ngon_ngu":"Tiếng Nhật (Hán tự, katakana/hiragana)","tien_te":"JPY"},{"market":"US","ten":"Mỹ (USA)","gioi_tien":"MỸ","email":".com, .net","ngon_ngu":"Tiếng Anh thuần","tien_te":"USD"},{"market":"EU","ten":"Châu Âu","gioi_tien":"CHÂU ÂU","email":".co.uk, .de, .fr, .eu","ngon_ngu":"Tiếng Anh, Đức, Pháp","tien_te":"EUR"}]'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content = EXCLUDED.content,
  "format" = EXCLUDED.format,
  headers = EXCLUDED.headers,
  kb_rows = EXCLUDED.kb_rows;

-- ============================================================
-- 2. THEM MARKET vao prompt_versions variables
--    Cho cac prompt: email-classify, chat-classify, gemini-drawing
-- ============================================================

-- email-classify: them MARKET
UPDATE mekongai.prompt_versions pv
SET variables = (
  SELECT DISTINCT jsonb_array_elements_text(
    COALESCE(
      (SELECT pv2.variables FROM mekongai.prompt_versions pv2
       JOIN mekongai.prompt_templates pt2 ON pt2.id = pv2.template_id
       WHERE pt2.key = 'email-classify' AND pv2.id = pv.id),
      '[]'::jsonb
    )
    || '["MARKET"]'::jsonb
  )
FROM mekongai.prompt_templates pt
WHERE pt.key = 'email-classify'
  AND pt.id = pv.template_id
  AND NOT (SELECT 'MARKET' = ANY(pv.variables));
-- Chi them neu chua co MARKET

-- chat-classify: them MARKET  
UPDATE mekongai.prompt_versions pv
SET variables = (
  SELECT DISTINCT jsonb_array_elements_text(
    COALESCE(
      (SELECT pv2.variables FROM mekongai.prompt_versions pv2
       JOIN mekongai.prompt_templates pt2 ON pt2.id = pv2.template_id
       WHERE pt2.key = 'chat-classify' AND pv2.id = pv.id),
      '[]'::jsonb
    )
    || '["MARKET"]'::jsonb
  )
FROM mekongai.prompt_templates pt
WHERE pt.key = 'chat-classify'
  AND pt.id = pv.template_id
  AND NOT (SELECT 'MARKET' = ANY(pv.variables));

-- gemini-drawing: them MARKET
UPDATE mekongai.prompt_versions pv
SET variables = (
  SELECT DISTINCT jsonb_array_elements_text(
    COALESCE(
      (SELECT pv2.variables FROM mekongai.prompt_versions pv2
       JOIN mekongai.prompt_templates pt2 ON pt2.id = pv2.template_id
       WHERE pt2.key = 'gemini-drawing' AND pv2.id = pv.id),
      '[]'::jsonb
    )
    || '["MARKET"]'::jsonb
  )
FROM mekongai.prompt_templates pt
WHERE pt.key = 'gemini-drawing'
  AND pt.id = pv.template_id
  AND NOT (SELECT 'MARKET' = ANY(pv.variables));

-- ============================================================
-- 3. THEM thi_truong vao agent_jobs (neu chua co column)
-- ============================================================
ALTER TABLE mekongai.agent_jobs
  ADD COLUMN IF NOT EXISTS thi_truong TEXT;

-- Update thi_truong cho jobs co email (VN/JP/US/EU theo email domain/ngon ngu)
UPDATE mekongai.agent_jobs
SET thi_truong = CASE
  WHEN email_from ~* '\.jp$' OR email_from ~* 'japan|nhat ban|nhật' THEN 'JP'
  WHEN email_from ~* '\.vn$|\.com\.vn$' OR email_from ~* 'vietnam|viet nam' THEN 'VN'
  WHEN email_from ~* '\.(com|net|org)$' AND email_from !~* '\.(vn|jp|co\.uk|de|fr|eu)$'
    AND (email_body ~* '[a-zA-Z]' AND email_body !~* '[ăâđêôơư]') THEN 'US'
  WHEN email_from ~* '\.(co\.uk|de|fr|eu|it)$' OR email_from ~* 'europe|châu âu' THEN 'EU'
  ELSE NULL
END
WHERE thi_truong IS NULL
  AND email_from IS NOT NULL
  AND email_from != '';