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
│   │   ├── drawRepository.js      # Bảng drawings (PostgreSQL)
│   │   └── jobStore.js            # Bảng agent_jobs (PostgreSQL + JSON)
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

## Môi trường

- **Runtime**: Node.js, ES modules (`"type": "module"` trong `package.json`)
- **Database**: PostgreSQL (tùy chọn cho drawings API, bắt buộc cho email agent)
- **Lưu trữ**: `uploads/` cho PDF tạm (tự xóa), `agent_jobs.json` cho job state khi không có DB
- **ERP**: Bearer token auth; chế độ mock khi chưa có `ERP_BEARER_TOKEN`
