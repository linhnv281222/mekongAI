# MekongAI Workflow Review Analysis

## 1. Email Filtering (Lọc mail có đúng chưa)

### Current Implementation

**Location**: `src/libs/emailPreFilter.js` + `src/agents/emailAgent.js`

**Filtering Logic**:

1. **Spam/Auto-reply Detection** (lines 11-22, 70-84):
   - Filters: newsletter, no-reply, unsubscribe, advertisement, marketing, auto-reply, out-of-office, vacation
   - Pattern matching on subject and sender

2. **RFQ Keyword Detection** (lines 24-30):
   - Supports multiple languages: Vietnamese (báo giá, bao giá), Japanese (見積依頼, 見積, 加工依頼), English (quotation, quote, rfq)
   - ✅ **CONFIRMED**: Supports Vietnamese, Japanese, English as requested

3. **Reply Filtering** (lines 32-46, 106-142):
   - Detects replies using: "Re:", "Fw:", "Trả lời:", "答复:", "Fwd:"
   - Filters acknowledgment-only replies: "ok", "cảm ơn", "thank you", "了解", "承知", "ありがとう"
   - Strips quoted content and checks for meaningful new content

4. **PDF Attachment Check** (lines 145-168):
   - Requires PDF attachment for RFQ classification
   - Flags low-priority emails without PDF or RFQ keywords

5. **Language Detection** (lines 203-215):
   - Vietnamese: detects diacritics (ăâđêôơư)
   - Japanese: detects hiragana/katakana (あ-んア-ン) and kanji (會社會株丸形樣致す)
   - English: fallback default

**Classification Process** (`src/ai/emailClassifier.js`):
- Routes to Gemini or Claude based on config
- Body truncated to 500 chars for classification (line 46, emailClassifierGemini.js)
- Returns: loai (rfq/repeat_order/hoi_tham/khieu_nai/spam), ngon_ngu, thi_truong, ly_do

**Token Tracking**:
- Classify tokens: stored in `classify_tokens` field (line 228, emailAgent.js)
- Drawing tokens: accumulated from all drawing extractions (line 448-450)
- Total tokens: sum of classify + drawing tokens (line 452)
- Model names tracked separately: `classify_model`, `drawing_model`

### Assessment

✅ **CORRECT**: 
- RFQ prioritization works via keyword matching + PDF requirement
- Multi-language support (vi/ja/en) implemented correctly
- Pre-filtering reduces unnecessary AI calls

⚠️ **NEEDS REFINEMENT**:
- Body truncation at 500 chars may miss RFQ signals in longer emails
- No explicit priority scoring system (all RFQs treated equally)
- Market detection in prefilter is basic (domain-based only)

---

## 2. Email Sorting (Sắp xếp mail có đúng thứ tự không)

### Current Implementation

**Location**: `src/data/jobStore.js` line 288-298

```javascript
export async function getJobs() {
  const result = await pool.query(
    "SELECT * FROM mekongai.agent_jobs ORDER BY created_at DESC"
  );
  return result.rows.map(normalizeDbRow);
}
```

**Frontend Display**: `FE/src/app/pages/mekong-ai/demo-v3/`
- Emails displayed in flat list sorted by `created_at DESC`
- No tree view hierarchy implementation
- No grouping by customer code or date

### Assessment

❌ **MISSING**: Tree view organization (Year > Month > Customer Code)
- Current: Flat chronological list
- Requested: Hierarchical tree structure like user's image reference
- Customer code (`ma_khach_hang`) field exists in DB but not used for grouping
- No date-based hierarchy (year/month grouping)

**Required Implementation**:
1. Extract year/month from `created_at` timestamp
2. Group by `ma_khach_hang` (customer code)
3. Build tree data structure for sidebar
4. Add expand/collapse UI controls
5. Sort within groups by date

---

## 3. Email Content Accuracy (Nội dung mail màn 1 có chính xác lấy vào chưa)

### Current Implementation

**Email Parsing**: `src/libs/gmailClient.js` line 88-100
- Uses Gmail API full format to extract headers and body
- Strips quoted content and signatures (function `stripEmailThread` lines 8-36)
- Preserves attachments with metadata (name, attachmentId)

**Data Flow**:
1. Gmail API → parseGmailMsg() → emailData object
2. emailData → classifyEmail() → classify output
3. classify output + drawings → saveJob() → PostgreSQL
4. PostgreSQL → /jobs API → Angular frontend

**Fields Extracted**:
- Subject, sender (name + email)
- Body (cleaned of quoted threads)
- Attachments (PDF names + IDs)
- Classification results (loại, ngôn ngữ, thị trường, etc.)

### Assessment

✅ **APPEARS CORRECT**:
- Email body stored in `email_body` field
- Subject, sender extracted properly
- Thread cleaning removes forwarded/quoted content
- Attachments preserved with Gmail attachment IDs

⚠️ **VERIFICATION NEEDED**:
- No explicit validation against original Gmail content
- Body truncation during classify (500 chars) may lose context
- No error logging for parse failures in production

---

## 4. Drawing Import Verification (Số bản vẽ import vào chuẩn chưa)

### Current Implementation

**Drawing Extraction**: `src/agents/emailAgent.js` lines 240-438

**Process Flow**:
1. Download PDF attachments (line 240-250)
2. Split multi-page PDFs (line 257-275)
3. Triage pages to detect drawings vs text (line 278-291)
4. Extract drawing data via AI (line 294-438)
5. Validate minimal data requirements (line 412-421)
6. Rule-based enrichment for missing fields (line 374-402)

**Quality Checks**:
- Triage filters non-drawing pages (invoices, letters, etc.)
- `drawingHasMinimalData()` ensures ma_ban_ve + vat_lieu + kich_thuoc present
- Rule-based extraction fills gaps AI misses
- Cache successful extractions to avoid re-processing

**Validation Logic** (line 412-421):
```javascript
if (!drawingHasMinimalData(flat)) {
  console.warn(`[BV] Skip trang ${pg.page} — không đủ dữ liệu`);
  continue;
}
```

### Assessment

✅ **QUALITY CONTROLS IN PLACE**:
- Multi-stage validation (triage → AI → rules → minimal data check)
- Page-level logging shows what was extracted/skipped
- Cache prevents re-processing same files

❌ **MISSING**:
- No visual comparison tool for user to verify against original PDF
- No accuracy metrics (% of fields extracted correctly)
- No audit trail showing why a page was skipped vs accepted

**Required for Full Verification**:
1. Side-by-side PDF preview with extracted data overlay
2. Confidence scores per field
3. Manual correction interface (addressed in #5)
4. Success rate dashboard (pages imported vs skipped)

---

## 5. Field Validation & Human Correction (Ra soát nội dung cơ bản)

### Current Implementation

**ERP Master Data Integration**: `src/integrate/erpAPI.js`
- Maps materials, shapes, surface treatments to ERP codes
- Functions: `getMaterialTypeCode()`, `getProcessingRoute()`, `normalizeShape()`

**Version Tracking**: `src/data/jobVersionStore.js`
- Saves drawing versions with type: ai_extracted, user_draft, approved
- Tracks field changes in `changed_fields` JSONB column
- `saveFieldEvidence()` function records what changed and why

**Frontend Edit Support**: `FE/src/app/pages/mekong-ai/demo-v3/`
- User can edit all drawing fields inline (table inputs)
- `onDrawingFieldChange()` captures edits (line 377-405, demo-v3.component.ts)
- Auto-saves drafts after each field change (line 401-404)

**Draft Saving** (line 407-448):
```typescript
await this.versionSvc.saveDraft(
  this.activeEmail.id,
  rowIndex,
  data,
  changedFields  // Records old vs new value
);
```

### Assessment

✅ **FOUNDATION EXISTS**:
- Version control system tracks AI vs user edits
- ERP master data lookup for validation
- Field-level change tracking with oldValue/newValue

⚠️ **INCOMPLETE**:
- No explicit validation against ERP master data lists
- No visual indicator showing which fields match/don't match ERP data
- Changed fields stored but not used for AI learning yet
- No feedback loop from user corrections back to training data

**Required Implementation**:
1. **Validation UI**: 
   - Show dropdown of valid ERP values for material/shape/surface treatment
   - Highlight mismatches in red
   - Auto-suggest closest ERP match

2. **Learning System**:
   - Export user corrections to training dataset
   - Track correction patterns (what AI got wrong consistently)
   - Periodic retraining with corrected examples

3. **Audit Trail**:
   - Show who corrected what field and when
   - Display AI confidence scores per field
   - Allow users to mark corrections as "teach AI this pattern"

---

## Summary & Priority Actions

### ✅ Working Correctly:
1. Email filtering with RFQ prioritization (vi/ja/en support)
2. Token usage tracking (classify + drawing breakdown)
3. Drawing extraction with quality controls
4. Version control foundation for user edits

### ❌ Not Implemented:
1. **CRITICAL**: Tree view sidebar (Year > Month > Customer Code)
2. **CRITICAL**: ERP validation UI with master data dropdown
3. **HIGH**: AI learning from human corrections
4. Drawing accuracy verification dashboard

### 🔧 Next Steps (in order):

**Priority 1**: Tree View Sidebar
- Extract year/month from `created_at`
- Group by `ma_khach_hang` 
- Build PrimeNG Tree component
- Persist expand/collapse state

**Priority 2**: ERP Validation UI
- Fetch material/shape/treatment master lists
- Add dropdown with autocomplete
- Highlight invalid entries
- Show ERP code mapping

**Priority 3**: Human Correction Learning
- Mark draft versions for AI training
- Export correction dataset
- Track accuracy improvement over time

**Priority 4**: Verification Dashboard
- Import success rate metrics
- Field extraction accuracy by type
- Common failure patterns
