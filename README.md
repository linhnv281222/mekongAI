# Mekong AI — AI Đọc Bản Vẽ & Agent Báo Giá

**Mekong AI** là hệ thống AI cho Công ty Việt Nhật Tân (VNT), chuyên gia CNC gia công chính xác. Hệ thống đọc bản vẽ kỹ thuật (PDF/STEP), trích xuất dữ liệu có cấu trúc, và tích hợp ERP để tạo báo giá.

## Cài đặt

```bash
npm install
cp .env.example .env
# Điền thông tin vào .env (API keys, database, Gmail, ERP…)
```

## Chạy hệ thống

```bash
npm start        # Server chính (port 3000)
npm run dev      # Server + auto-reload khi sửa code
npm run agent    # Email Agent (quét Gmail liên tục)
npm run oauth    # Cài Gmail OAuth (chạy 1 lần duy nhất)
```

Với PM2 (production):

```bash
pm2 start src/server/serverMain.js --name ai-banve
pm2 start src/agents/emailAgent.js --name mekong-agent
```

## Cấu trúc thư mục

```
mekongAI/
├── src/
│   ├── server/                    # HTTP server
│   │   ├── serverMain.js         # Entry point (port 3000)
│   │   ├── drawController.js     # /drawings API
│   │   ├── jobController.js       # /jobs API
│   │   └── promptController.js    # /admin/prompts API
│   │
│   ├── agents/                    # Tiến trình tự động
│   │   ├── emailAgent.js          # Gmail → phân loại → PDF → AI → ERP
│   │   └── gmailOAuthSetup.js     # Cài OAuth Gmail (1 lần)
│   │
│   ├── ai/                        # Wrapper AI models
│   │   ├── claudeAnalyzer.js      # Claude Sonnet 4.6 — đọc bản vẽ
│   │   ├── geminiAnalyzer.js      # Gemini 2.5 — đọc bản vẽ dự phòng
│   │   └── emailClassifier.js     # Claude Haiku — phân loại email
│   │
│   ├── processors/                # Nghiệp vụ
│   │   ├── processRouter.js       # Tính KL (F7), chọn QT (F8), độ phức tạp (F9)
│   │   ├── stepParser.js          # Parse file STEP 3D
│   │   └── pdfSplitter.js         # Tách trang PDF
│   │
│   ├── data/                      # Lưu trữ
│   │   ├── drawRepository.js  # Bảng drawings (PostgreSQL)
│   │   ├── jobStore.js        # Bảng agent_jobs (PostgreSQL + JSON)
│   │   └── referenceData.js   # Bảng tra từ DB (materials, operations...
│   │
│   ├── prompts/                   # Prompt & kiến thức
│   │   ├── promptStore.js         # CRUD prompt + knowledge blocks
│   │   └── defaults/              # File prompt mặc định
│   │
│   ├── libs/                      # Tiện ích dùng chung
│   │   ├── config.js              # Đọc & kiểm tra .env
│   │   ├── gmailClient.js         # Gmail OAuth2 client
│   │   └── erpClient.js           # ERP FaceNet API client
│   │
│   └── web/                       # Giao diện frontend
│       ├── index.html             # Upload bản vẽ đơn lẻ
│       ├── demo.html               # Demo pipeline realtime
│       ├── demoV3.html            # Demo 3 cột (inbox + KH + ERP)
│       ├── sheetBaoGia.html       # Xem phiếu báo giá
│       ├── admin-prompts.html     # Quản trị prompt & kiến thức
│       ├── css/                   # Styles (1 file .css / page)
│       └── js/                    # Scripts  (1 file .js  / page)
│
├── uploads/                       # File PDF tạm (gitignored)
├── package.json
└── .env.example
```

## Truy cập giao diện

| Địa chỉ                                          | Mục đích                      |
| ------------------------------------------------ | ----------------------------- |
| http://localhost:3000/src/web/index.html         | Upload & đọc bản vẽ đơn lẻ    |
| http://localhost:3000/src/web/demo.html          | Demo pipeline realtime        |
| http://localhost:3000/src/web/demoV3.html        | Demo 3 cột (inbox + KH + ERP) |
| http://localhost:3000/src/web/admin-prompts.html | Quản trị prompt & kiến thức   |
| http://localhost:3000/src/web/sheetBaoGia.html   | Xem phiếu báo giá             |

## Luồng hoạt động

```
Gmail (mỗi 30 giây)
    → Phân loại email (Haiku vi/en/ja)
    → Nếu là RFQ: Tách trang PDF
    → AI đọc từng trang bản vẽ (Sonnet)
    → Tính KL (F7), chọn QT (F8), độ phức tạp (F9)
    → Tạo phiếu báo giá trên ERP
    → Push từng dòng mã hàng vào ERP
    → Đánh dấu email đã xử lý
```

## API Endpoints chính

```
POST /drawings                  — Upload 1 PDF, trả JSON phân tích
POST /drawings/batch            — Upload PDF nhiều trang
POST /drawings/:id/correct      — Chỉnh sửa kết quả qua chat
GET  /drawings                  — Liệt kê bản vẽ đã lưu
GET  /jobs                      — Liệt kê job của email agent
POST /jobs/:id/push-erp         — Push job lên ERP
GET  /admin/prompts             — Liệt kê mẫu prompt
POST /admin/prompts/:key/versions       — Lưu phiên bản mới
DELETE /admin/prompts/:key/versions/:v  — Xóa phiên bản
GET  /admin/prompts/knowledge/list      — Liệt kê knowledge blocks
PUT  /admin/prompts/knowledge/:key      — Cập nhật knowledge block
POST /admin/prompts/test        — Thử render prompt với biến mẫu
GET  /health                    — Health check
```

## AI Models

| Model             | Mục đích               | Module                      |
| ----------------- | ---------------------- | --------------------------- |
| Claude Sonnet 4.6 | Đọc & chỉnh sửa bản vẽ | `src/ai/claudeAnalyzer.js`  |
| Claude Haiku 4    | Phân loại email        | `src/ai/emailClassifier.js` |
| Gemini 2.5        | Đọc bản vẽ dự phòng    | `src/ai/geminiAnalyzer.js`  |

## Kiến thức miền (VNT)

- **kieu_phoi**: `"Phi tron dac"`, `"Phi tron ong"`, `"Hinh tam"`, `"Luc giac"`, `"Hon hop"`
- **Mã QT** trong `src/processors/processRouter.js`:
  - QT1xx = tiện
  - QT2xx / QT4xx / QT6xx = phay (theo kích thước)
  - Quyết định bởi hình dạng, kích thước, số mặt gia công
- **F7** = tính khối lượng, **F8** = chọn mã quy trình, **F9** = độ phức tạp

## Nghiệp vụ 2 lớp map dữ liệu

Hệ thống có **2 lớp map** để chuẩn hóa dữ liệu từ bản vẽ về định dạng nội bộ VNT.

### Tổng quan luồng dữ liệu

```
Bản vẽ (PDF)
    │
    ▼
┌──────────────────────────────┐
│  Lớp 1: AI + Knowledge Block │  ← sửa ở Admin Prompts UI
│  (claudeAnalyzer.js)         │
│  AI tự map theo bảng tra    │
│  trong prompt                │
└──────────┬───────────────────┘
           │ AI trả JSON đã chuẩn hóa
           ▼
┌──────────────────────────────┐
│  Lớp 2: Backend Code        │  ← sửa ở processRouter.js
│  (processRouter.js)          │
│  Code tự tính theo lookup    │
│  table cố định              │
└──────────┬───────────────────┘
           │ JSON đầy đủ (F7+F8+F9)
           ▼
          ERP
```

### Lớp 1: AI map bằng Knowledge Block (Prompt)

**Vấn đề:** Mỗi bản vẽ ghi vật liệu theo tiêu chuẩn khác nhau (AISI, DIN, JIS, EN...). Cần chuẩn hóa về mã nội bộ VNT.

**Cách hoạt động:**

1. `claudeAnalyzer.js` đọc 4 knowledge block từ `promptStore`
2. Thay thế vào prompt dưới dạng biến `{{VNT_MAT}}`, `{{VNT_NHIET}}`, `{{VNT_BM}}`, `{{VNT_HINH}}`
3. AI nhận prompt kèm bảng tra → tự suy luận → trả JSON đã chuẩn hóa

```javascript
// src/ai/claudeAnalyzer.js — dòng 41–53
const [systemText, mat, nhiet, bm, hinh] = await Promise.all([
  getKnowledgeBlock("vnt-materials"),
  getKnowledgeBlock("vnt-heat-treat"),
  getKnowledgeBlock("vnt-surface"),
  getKnowledgeBlock("vnt-shapes"),
]);
const resolvedSystem = systemText
  .replaceAll("{{VNT_MAT}}", mat ?? "")
  .replaceAll("{{VNT_NHIET}}", nhiet ?? "")
  .replaceAll("{{VNT_BM}}", bm ?? "")
  .replaceAll("{{VNT_HINH}}", hinh ?? "");
```

**4 Knowledge block:**

| Key trong Admin | Biến trong Prompt | Bảng tra | AI đọc được | Map thành |
|---|---|---|---|---|
| `vnt-materials` | `{{VNT_MAT}}` | Mã quốc tế → mã VNT | `AISI 1045`, `EN AW-6061`, `X5CrNi18-10` | `S45C`, `A6061`, `SUS304` |
| `vnt-heat-treat` | `{{VNT_NHIET}}` | Ký hiệu nhiệt luyện | `Hardening`, `HRC58~60`, `焼入れ焼戻し` | `Nhiệt toàn phần [HRC...]` |
| `vnt-surface` | `{{VNT_BM}}` | Ký hiệu bề mặt | `白アルマイト`, `Hard Anodize`, `無電解ニッケル` | `Anod trang`, `Hard Anodize`, `Ma Niken` |
| `vnt-shapes` | `{{VNT_HINH}}` | Hình dạng → phương án gia công | `trục trơn`, `bạc đạn`, `ống` | `Tien CNC, phoi thanh tron` |

**Ví dụ `vnt-materials.txt`:**

```
THEP: Fe430B/St37-2/S235JR/SS41→SS400 | C45E/AISI 1045/1.0503→S45C | C50E/AISI 1050→S50C
INOX: X5CrNi18-10/AISI 304/1.4301→SUS304 | X5CrNiMo17-12-2/AISI 316/1.4401→SUS316
NHOM: AlCu4MgSi/EN AW-2017→A2017 | AlMg1SiCu/EN AW-6061/AL6061/A6061→A6061
```

**Cách sửa:** Vào Admin Prompts (`/admin-prompts.html`) → chọn knowledge block → sửa bảng map → Lưu. Không cần sửa code.

**Hạn chế:** AI có thể suy luận sai (~85–95% chính xác).

---

### Lớp 2: Backend map bằng Code (processRouter.js)

**Sau khi AI trả JSON**, backend tính thêm 3 trường bổ sung. Bước này **hoàn toàn do code tự tính**, không qua AI.

```javascript
// src/processors/processRouter.js
export async function enrichWithF7F8(aiData) {
  // F7: Tính khối lượng
  const kl = await tinhKhoiLuong(kieu_phoi, kich_thuoc, ma_vl);
  //   -> getMaterialDensity("S45C") = 7.85 g/cm3

  // F8: Chọn mã quy trình gia công
  const qt = await chonQuyTrinh(kieu_phoi, loai_vl, kichThuocMax, soMat, soLoRen);
  //   -> getProcessOperations("QT612") => ["MAL","MI6","MC11","MC12","XLN","QC","DGTP","NK"]

  // F9: Tính hệ số phức tạp
  const pt = phanTichDoPhucTap(aiData);
  //   -> lookupSizeCoeff(), lookupWeightCoeff(), getMaterialCoeffData()...
}
```

**Nguồn dữ liệu tham chiếu:** 4 bảng trong database + fallback hardcoded trong code.

**Bảng tra trong database (`src/data/referenceData.js` → DB):**

| Bảng | Mục đích | DB Table |
|---|---|---|
| `materials` | Trọng lượng riêng từng vật liệu (g/cm³) | `mekongai.materials` |
| `process_templates` | Mã QT → danh sách nguyên công chi tiết | `mekongai.process_templates` |
| `operations` | Đơn giá & thời gian từng nguyên công | `mekongai.operations` |
| `coefficient_tables` | Bảng hệ số (size, weight, material, weld, tolerance, difficulty, quantity) | `mekongai.coefficient_tables` |

**Cách sửa:** Chạy migration + seed SQL trong `migrations/`, sau đó UPDATE trực tiếp vào database. Không cần deploy lại code.

**Chạy migration:**
```bash
psql -U postgres -d mechanical_ai -f migrations/002-reference-data.sql
psql -U postgres -d mechanical_ai -f migrations/002-seed-reference-data.sql
```

**Fallback:** Nếu DB chưa migrate hoặc không kết nối được, `referenceData.js` tự động dùng fallback data (giữ nguyên logic cũ) — đảm bảo hệ thống vẫn hoạt động.

---

### Ví dụ thực tế một bản vẽ đi qua 2 lớp

```
Bản vẽ ghi: "Material: AISI 1045, Ø35×74.5, Surface: Ra 1.6"
```

**Lớp 1 — AI + Knowledge:**

```
AI đọc: "AISI 1045" + bảng tra {{VNT_MAT}} trong prompt
  → map: AISI 1045 → S45C  ✓
AI đọc: "Ra 1.6" → không có bảng tra cụ thể → giữ nguyên

AI trả JSON:
{
  "vat_lieu": "S45C",        ✓ nhờ knowledge
  "hinh_dang": "Tròn xoay",  ✓ AI nhận diện
  "kich_thuoc": "Ø35×74.5", ✓
}
```

**Lớp 2 — Backend code:**

```
enrichWithF7F8() nhận JSON:
{
  "vat_lieu": { "ma": "S45C" },
  "hinh_dang": { "loai": "Tròn xoay" },
  "kich_thuoc_bao": { "phi_lon": 35, "dai": 74.5 }
}

F7 — Khối lượng:
  tra KL_RIENG["S45C"] = 7.85 g/cm³
  V = π × (35/2)² × 74.5 / 1000 = 71.6 cm³
  KL = 71.6 × 7.85 / 1000 = 0.562 kg  ✓

F8 — Mã quy trình:
  hinh_dang = "Tròn xoay" → nhom = "1"
  kichThuocMax = 74.5mm → 50–300mm → nhom = "6"
  soMat = 1 → ma = "QT611"

F9 — Hệ số phức tạp:
  tra BANG_KICH_THUOC: 74.5mm → "TB 1", heso=1.0
  tra HE_SO_VL: S45C → "Thep Carbon", heso=1.0
  → nhân hệ số → hesoTong = 1.0
```

---

### So sánh 2 lớp

| | Lớp 1: Knowledge Block | Lớp 2: Backend Code |
|---|---|---|
| **Ai làm** | AI tự map theo bảng tra | Code JS tự tính |
| **Sửa ở đâu** | Admin Prompts UI | Sửa code `processRouter.js` |
| **Cần sửa khi** | AI sai mã vật liệu, sai tên nhiệt luyện | Thêm vật liệu mới, thêm mã QT mới, điều chỉnh hệ số |
| **Độ chính xác** | ~85–95% (AI có thể sai) | 100% (lookup table) |
| **Ví dụ** | `AISI 1045 → S45C` | `S45C → KL_RIENG = 7.85 g/cm³` |

---

### Cách thêm bảng map mới

**Thêm vào Lớp 1 (Knowledge Block):**

1. Tạo file mới trong `src/prompts/defaults/`, ví dụ `vnt-my-data.txt`
2. Thêm vào `promptStore.js` để đăng ký key mới
3. Trong `claudeAnalyzer.js`, thêm `getKnowledgeBlock("vnt-my-data")` và `replaceAll("{{VNT_MY_DATA}}", data)`
4. Trong `gemini-drawing.txt`, thêm biến `{{VNT_MY_DATA}}` vào vị trí cần
5. Quản lý qua Admin Prompts UI

**Thêm vào Lớp 2 (Backend Code):**

1. Mở `src/processors/processRouter.js`
2. Thêm vào bảng tra tương ứng (ví dụ `KL_RIENG` cho trọng lượng riêng)
3. Nếu cần logic mới, thêm hàm xử lý
4. Không cần Admin UI — sửa code trực tiếp

## Môi trường

- **Runtime**: Node.js, ES modules (`"type": "module"` trong `package.json`)
- **Database**: PostgreSQL (tùy chọn cho drawings API, bắt buộc cho email agent)
- **Lưu trữ**: `uploads/` cho PDF tạm (tự xóa), `agent_jobs.json` cho job state khi không có DB
- **ERP**: Bearer token auth; chế độ mock khi chưa có `ERP_BEARER_TOKEN`
