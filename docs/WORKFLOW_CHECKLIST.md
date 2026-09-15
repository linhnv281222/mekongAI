# WORKFLOW QUALITY CHECKLIST — MekongAI Email Processing System

**Revision Date:** 2026-09-15  
**Purpose:** Tinh chỉnh chặt chẽ từng bước xử lý email báo giá (RFQ) và bản vẽ kỹ thuật

---

## 1. LỌC MAIL — Email Classification

### ✓ Tiêu chí phân loại
- **RFQ (Request for Quotation)** — Ưu tiên cao nhất
  - Chứa từ khóa: "báo giá", "quote", "quotation", "見積", "RFQ"
  - Có đính kèm bản vẽ (PDF, DWG, DXF)
  - Có thời hạn báo giá (deadline)
- **Ngôn ngữ hỗ trợ:** Tiếng Việt, Tiếng Anh, Tiếng Nhật
- **Loại khác:** repeat_order, hoi_tham, khieu_nai, spam

### 📋 Checklist
- [ ] AI phân loại đúng loại email (classify = "rfq" cho email báo giá)
- [ ] Trích xuất ngôn ngữ chính (vi/en/jp)
- [ ] Phát hiện tất cả file đính kèm (attachments array)
- [ ] Đánh dấu email không phải RFQ rõ ràng (hiển thị "Không phải RFQ — không tạo phiếu báo giá")

### 🔍 Validation Points
```javascript
// File: src/ai/emailClassifier.js
// Model: Gemini 3.8 Flash (classify) → Claude Sonnet 4 (fallback)
// Token budget: ~500-1000 tokens per email
```

**Expected Output:**
```json
{
  "classify": "rfq",
  "thi_truong": "JP",
  "han_bao_gia": "2026-09-20",
  "han_giao": "2026-10-15",
  "attachments": ["drawing_001.pdf", "spec_sheet.pdf"]
}
```

---

## 2. SẮP XẾP MAIL — Email Organization & Tree View

### ✓ Quy tắc sắp xếp
- **Ưu tiên 1:** RFQ mới nhất lên đầu
- **Ưu tiên 2:** Theo mã khách hàng (customer_code từ ERP)
- **Hiển thị:** Tree view với mã số khách hàng

### 📊 Tree Structure (Tham khảo ảnh 2)
```
📁 2026
  └─ 📁 Tháng 9
      ├─ ☑ AUS — Australian Customer Ltd
      ├─ ☑ AVV — AV Vietnam Co
      ├─ ☑ BAN — Bandai Namco
      ├─ ☑ CTI — CTI Engineering
      └─ ☑ FAS — Fastener Solutions
```

### 📋 Checklist
- [ ] Email được nhóm theo tháng/năm
- [ ] Mã khách hàng lấy từ ERP (knowledge block: vnt-customers)
- [ ] Hiển thị số lượng bản vẽ trong ngoặc
- [ ] Tìm kiếm theo mã khách hàng hoạt động
- [ ] Lọc theo trạng thái (pending/reviewed/exported)

### 🔍 Implementation Notes
```javascript
// File: FE/src/app/pages/mekong-ai/demo-v3/demo-v3.component.ts
// marketRows array từ knowledge block 'vnt-markets'
// Cần thêm customer_code mapping từ ERP master data
```

**Data Structure:**
```typescript
interface EmailRow {
  id: string;
  customer_code?: string; // Từ ERP
  customer_name?: string; // Từ ERP
  month: string;          // "2026-09"
  year: string;           // "2026"
}
```

---

## 3. NỘI DUNG MAIL — Email Content Extraction (Màn 1)

### ✓ Trường dữ liệu cần trích xuất
- **Thời điểm nhận yêu cầu** (date) — AI
- **Thời hạn báo giá** (han_bao_gia) — AI
- **Thời hạn giao hàng** (han_giao) — AI
- **Vận chuyển** (van_chuyen) — AI: "có"/"không"/"FOB"/"CIF"
- **Thị trường** (thi_truong) — AI: "JP"/"VN"/"US"/"EU"
- **Người gửi** (from, email) — Tự động
- **Nội dung email** (body) — Tự động

### 📋 Checklist
- [ ] Tất cả trường được fill đúng từ email
- [ ] Date format: DD/MM/YYYY
- [ ] Deadline parsing chính xác (cả tiếng Việt, Anh, Nhật)
- [ ] Market code mapping đúng với ERP
- [ ] Email body hiển thị đầy đủ (không bị cắt)

### 🔍 Validation
```javascript
// Prompt: email-classify
// Variables: emailFrom, emailSubject, emailBody, emailAttachments
// Model: Gemini 3.8 Flash
```

**Example:**
```
Email: "お見積りをお願いします。納期は10月15日まで。"
→ han_giao: "15/10/2026"
→ thi_truong: "JP"
```

---

## 4. IMPORT BẢN VẼ — Drawing Import & Analysis

### ✓ Quy trình import
1. **Tải file PDF** từ Gmail API
2. **Tách trang** nếu PDF nhiều trang (batch mode)
3. **Phân tích từng trang** bằng AI (Gemini 3.8 Flash)
4. **Lọc trang trống** (không có thông tin tối thiểu)
5. **Lưu vào database** (drawings table)

### 📋 Checklist
- [ ] Tất cả file PDF trong email được phát hiện
- [ ] Mỗi trang PDF được tách ra thành 1 drawing record
- [ ] Trang không có thông tin bị bỏ qua (drawingHasMinimalData)
- [ ] Tên file gốc được lưu lại
- [ ] Thumbnail/preview hiển thị đúng

### 🔍 Validation Points
```javascript
// File: src/server/drawController.js
// POST /api/drawings/batch
// Delay between pages: 800ms (tránh rate limit)
```

**Drawing Detection Rules:**
```javascript
function drawingHasMinimalData(flat) {
  // Phải có ít nhất:
  // - ma_ban_ve HOẶC
  // - vat_lieu HOẶC
  // - (hinh_dang VÀ kich_thuoc)
}
```

### 🎯 Chuẩn đầu ra
- Mỗi drawing có: `ma_ban_ve`, `vat_lieu`, `hinh_dang`, `so_luong`, `kich_thuoc`
- File PDF có thể xem lại (preview)
- Token usage được tracking (classify_tokens + drawing_tokens)

---

## 5. RÀ SOÁT NỘI DUNG — Field Validation & ERP Mapping

### ✓ Trường quan trọng cần kiểm tra

#### 5.1 Vật liệu (Material)
**ERP Master Data:** `vnt-materials`
- Các trường: `material_type_code`, `material_type_name`, `density`
- Ví dụ: "SUS304" → "SUS304", "SKD11" → "SKD11", "Nhôm 6061" → "AL6061"

📋 Checklist:
- [ ] AI đọc đúng mã vật liệu từ bản vẽ
- [ ] Material code match với ERP master data
- [ ] Nếu không match → highlight để người sửa
- [ ] Lưu lại correction vào `corrected_data` field

#### 5.2 Hình dạng (Shape)
**ERP Master Data:** `vnt-shapes`
- Các trường: `shape_name`, `formula`, `formula_note`
- Ví dụ: "Trục", "Bạc", "Vỏ hộp", "Tấm", "Que tròn"

📋 Checklist:
- [ ] AI phân loại đúng hình dạng
- [ ] Shape name match với danh sách VNT
- [ ] Formula tính toán khối lượng đúng
- [ ] Người có thể chọn shape khác từ dropdown

#### 5.3 Xử lý bề mặt (Surface Treatment)
**ERP Master Data:** `vnt-surface`
- Ví dụ: "Anodize", "Powder coating", "Nickel plating", "Hard chrome"

📋 Checklist:
- [ ] AI trích xuất đúng yêu cầu xử lý bề mặt
- [ ] Surface code match với ERP operations
- [ ] Multiple surface treatments được hỗ trợ

#### 5.4 Nhiệt luyện (Heat Treatment)
**ERP Master Data:** `vnt-heat-treat`
- Ví dụ: "Tôi đạt HRC 58-62", "Ủ stress relief", "Thấm than"

📋 Checklist:
- [ ] AI phát hiện yêu cầu nhiệt luyện
- [ ] Heat treatment code match với ERP
- [ ] Hardness specification được ghi nhận

#### 5.5 Số lượng & Kích thước
📋 Checklist:
- [ ] `so_luong` là số nguyên dương
- [ ] `kich_thuoc` có đơn vị (mm)
- [ ] Parsing được dimension phức tạp (VD: "50x30x20mm")

### 🔧 Sửa lỗi trực tiếp (Inline Editing)
**UI Flow:**
1. Người dùng click vào trường sai
2. Sửa trực tiếp trong input/dropdown
3. Giá trị mới được lưu vào `corrected_data`
4. System học từ correction → cải thiện AI prompt

**Popup Editing Alternative:**
- Click "Sửa" → mở modal
- Chỉnh sửa trong popup
- Save → lưu lại hệ thống

### 📚 Learning Loop
```javascript
// Mỗi lần người sửa → lưu vào correction_log
{
  field: "vat_lieu",
  ai_value: "SUS 304",
  human_value: "SUS304",
  timestamp: "2026-09-15T10:30:00Z",
  drawing_id: 123
}

// Sau 1 ngày → retrain prompt với examples mới
// Hoặc thêm vào knowledge block với "Frequently Corrected Values"
```

---

## 6. TOKEN TRACKING & COST MONITORING

### ✓ Token Display (Theo ảnh 1)
```
┌──────────────────────────────────────────────────────────┐
│  2.640          2.640         $0.0005       $4.9995      │
│  Lần trước     Tổng token    Tổng đã dùng  Còn lại      │
└──────────────────────────────────────────────────────────┘
```

### 📋 Implementation
- [x] Token usage component created (`TokenUsageComponent`)
- [x] Display: classify_tokens, drawing_tokens, total_tokens
- [x] Cost calculation based on model pricing
- [x] Integrated into demo-v3.component.html

### 💰 Pricing (Per 1M tokens)
| Model | Input | Output |
|-------|-------|--------|
| gemini-3.8-flash | $0.0375 | $0.15 |
| gemini-2.0-flash | $0.075 | $0.30 |
| claude-sonnet-4/5 | $3 | $15 |

### 🔍 Tracking Points
```sql
-- Database: mekongai.agent_jobs
SELECT 
  classify_tokens,
  drawing_tokens,
  total_tokens,
  classify_model,
  drawing_model,
  created_at
FROM agent_jobs
WHERE total_tokens > 0;
```

---

## 7. WORKFLOW SUMMARY

```
┌────────────────┐
│  Email Inbox   │ ← Gmail API polling (60s interval)
└────────┬───────┘
         ↓
┌────────────────┐
│  1. Classify   │ ← Gemini 3.8 Flash (email-classify prompt)
│     (RFQ?)     │   Token: ~500-1000
└────────┬───────┘
         ↓
     [RFQ?] ─No→ [Archive as hoi_tham/spam/etc.]
         ↓Yes
┌────────────────┐
│  2. Sort &     │ ← Group by customer_code + month
│     Display    │   Tree view với search
└────────┬───────┘
         ↓
┌────────────────┐
│  3. Extract    │ ← Parse date, deadline, market, shipping
│     Content    │   Fill form fields automatically
└────────┬───────┘
         ↓
┌────────────────┐
│  4. Import     │ ← POST /api/drawings/batch
│     Drawings   │   Gemini 3.8 Flash (gemini-drawing prompt)
│                │   Token: ~2000-5000 per page
└────────┬───────┘
         ↓
┌────────────────┐
│  5. Validate   │ ← Check against ERP master data
│     & Correct  │   - vnt-materials
│                │   - vnt-shapes
│                │   - vnt-surface
│                │   - vnt-heat-treat
└────────┬───────┘
         ↓
┌────────────────┐
│  Human Review  │ ← Inline editing + popup
│  & Correction  │   Save to corrected_data
└────────┬───────┘
         ↓
┌────────────────┐
│  Learning Loop │ ← Update prompts with corrections
│  (Daily)       │   Improve AI accuracy
└────────────────┘
```

---

## 8. TESTING CHECKLIST

### ✅ Email Classification
- [ ] RFQ tiếng Việt được detect đúng
- [ ] RFQ tiếng Nhật được detect đúng
- [ ] Email spam không tạo job
- [ ] Repeat order được phân loại riêng

### ✅ Drawing Import
- [ ] PDF đơn trang import thành công
- [ ] PDF nhiều trang được tách đúng
- [ ] Trang trống bị skip
- [ ] Preview PDF hoạt động
- [ ] Token usage hiển thị chính xác

### ✅ ERP Data Mapping
- [ ] Material code match với vnt-materials
- [ ] Shape classification match với vnt-shapes
- [ ] Surface treatment match với vnt-surface
- [ ] Heat treatment match với vnt-heat-treat

### ✅ Human Correction
- [ ] Inline editing lưu được
- [ ] Popup editing lưu được
- [ ] Correction được track trong DB
- [ ] AI học từ corrections (sau 1 ngày)

### ✅ Token Monitoring
- [ ] Token display hiển thị trên mỗi job
- [ ] Cost calculation chính xác
- [ ] Model name hiển thị đúng
- [ ] Admin token stats hoạt động

---

## 9. KNOWN ISSUES & IMPROVEMENTS

### 🐛 Issues
1. ~~Xiaomi model đã bị xóa~~ ✅ Fixed
2. ~~Token usage không hiển thị trên UI~~ ✅ Fixed (just now)
3. Customer code chưa có tree view → **TODO**
4. Learning loop chưa tự động → **TODO**

### 🚀 Improvements
- [ ] Add customer_code field to EmailRow model
- [ ] Implement tree view với mã khách hàng
- [ ] Add correction tracking table
- [ ] Daily job: update prompts from corrections
- [ ] Export to ERP button (tạo quote trong hệ thống ERP)
- [ ] Email template reply (gửi báo giá ngược lại khách)

---

**Document Maintained By:** Development Team  
**Last Updated:** 2026-09-15  
**Next Review:** 2026-09-22
