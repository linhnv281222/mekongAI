import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { parseStep } from "./step_parser.js";
import { enrichWithF7F8, analyzePhanTichDocBiet } from "./process_router.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── SCHEMA mô tả đầu ra mong muốn ───────────────────────────────────────────
// Đây là phần quan trọng nhất — định nghĩa rõ thì LLM trả đúng
const DRAWING_SCHEMA = `
{
  "ban_ve": {
    "ma_ban_ve": "string",
    "ten_chi_tiet": "string",
    "revision": "string",
    "so_to": "string — ví dụ: 1 OF 3",
    "don_vi": "INCH | MM"
  },
  "vat_lieu": {
    "ma": "string — ví dụ: AL6061-T6, S45C, SUS304",
    "loai": "Nhôm | Thép | Inox | Khác",
    "nhiet_luyen": "string | null"
  },
  "san_xuat": {
    "so_luong": "number",
    "tieu_chuan": "string — ví dụ: ASME Y14.5-2009"
  },
  "xu_ly": {
    "be_mat": [
      {
        "buoc": "number",
        "ten": "string",
        "tieu_chuan": "string | null"
      }
    ],
    "nhiet": "string | null"
  },
  "hinh_dang": {
    "loai": "Tròn xoay | Vuông cạnh | Hỗn hợp",
    "kieu_phoi": "Phi tròn đặc | Phi tròn ống | Hình tấm | Lục giác | Khác",
    "phuong_an_gia_cong": "Tiện CNC | Phay CNC | Tiện + Phay | Khác",
    "mo_ta": ["string"]
  },
  "kich_thuoc_bao": {
    "don_vi": "inch | mm",
    "dai": "number | null — chiều dài tổng thể",
    "rong": "number | null — chiều rộng (chỉ dùng cho chi tiết vuông cạnh)",
    "cao_hoac_duong_kinh": "number | null — chiều cao hoặc đường kính ngoài lớn nhất",
    "phi_lon": "number | null — đường kính ngoài lớn nhất (CHỈ dùng cho chi tiết tròn xoay)",
    "phi_nho": "number | null — đường kính nhỏ nhất hoặc đường kính trong nếu là ống (CHỈ dùng cho chi tiết tròn xoay)",
    "phan_loai_do_lon": "Nhỏ (<50mm) | Trung bình (50-200mm) | Lớn (>200mm)"
  },
  "nguyen_cong_cnc": [
    {
      "stt": "number",
      "ten": "string",
      "may": "string",
      "ghi_chu": "string | null"
    }
  ],
  "be_mat_gia_cong": [
    {
      "be_mat": "string — tên mặt/vị trí",
      "loai": "Ren | Trơn | CSK | Chamfer | Bo góc | Cung | Rãnh | Khác",
      "quy_cach": "string — ví dụ: 4x 6-32 UNC-2B",
      "sau_hoac_kich_thuoc": "string | null",
      "dung_sai": "string | null",
      "critical": "boolean — true nếu có ký hiệu X hoặc AND/OR X trên bản vẽ",
      "ghi_chu": "string | null"
    }
  ],
  "quy_trinh_tong_the": ["string"]
}
`;


// ═══════════════════════════════════════════════════════════════
// KIẾN THỨC NỘI BỘ VIỆT NHẬT TÂN
// Nguồn: TONG_HOP.xlsx, TIÊU_CHUẨN_CHUYỂN_ĐỔI_VẬT_LIỆU.xlsx
// ═══════════════════════════════════════════════════════════════
const VNT_MAT = `
BẢNG CHUYỂN ĐỔI VẬT LIỆU (map về mã chuẩn JIS/VNT):
NHÔM: AlCu4MgSi/AlCuMg1/EN AW-2017→A2017 | AlCu4Mg1/EN AW-2024→A2024 | AlMg2,5/EN AW-5052→A5052 | AlMg5/EN AW-5056→A5056 | AlMg4,5Mn0,7/EN AW-5083→A5083 | AlMgSi/EN AW-6060→A6060 | AlMg1SiCu/EN AW-6061/AL6061/A6061→A6061 | AlMg0,7Si/EN AW-6063→A6063 | AlSi1MgMn/EN AW-6082→A6082 | AlZn5,5MgCu/EN AW-7075→A7075
THÉP: Fe430B/St37-2/S235JR/SS41→SS400 | C45E/AISI 1045/1.0503→S45C | C50E/AISI 1050→S50C | C55E/AISI 1055→S55C | 20CrMo5/AISI 5115→SCM415 | 34CrMo4/AISI 5135→SCM435 | 42CrMo4/AISI 4140/1.7225→SCM440 | X153CrMoV12/D2/AISI D2/1.2379/Z 155 CDV 12→SKD11 | X40CrMoV5-1/H13/AISI H13/1.2344→SKD61 | 90MnCrV8/O1/SK3→SKS3 | HR1/AISI 1008/StW2/DD11→SPHC | CR1/DC01/FeP01→SPCC
INOX: X10CrNiS18-9/AISI 303/1.4305→SUS303 | X5CrNi18-10/AISI 304/1.4301→SUS304 | X5CrNiMo17-12-2/AISI 316/1.4401→SUS316 | X2CrNiMo17-12-2/AISI 316L/1.4404/Inox A4→SUS316L | X20Cr13/AISI 420 thấp C/1.4021→SUS420J1 | X30Cr13/AISI 420 cao C/1.2083→SUS420J2 | X105CrMo17/AISI 440/1.4125→SUS440C
ĐỒNG: Cu-ETP/CW008A/Copper Alloy 110/C1020→C1100 | CuZn39Pb3/CW614N/Laiton/真鍮/BsBM→C3604
NHỰA: PMMA/Acrylic/MIKA→MICA | POM/Acetal/Polyacetal/BLACK DELRIN/POM黒→POM | PTFE/Téflon/テフロン→TEFLON
`;

const VNT_NHIET = `
BẢNG XỬ LÝ NHIỆT:
NHIỆT TOÀN PHẦN: 焼入れ焼戻し | 焼入れ・焼戻し | Trempe/Hardening | HRC58~60/HRC50-60/HRC45以上/HRC61±1 | 真空焼入し | traite(trempe+revenu) | Surface harden | Press Tempering → "Nhiệt toàn phần [HRC...]"
NHIỆT MỘT PHẦN: 高周波焼入れ | 図示部 高周波焼入れ | tôi cao tần → "Nhiệt một phần/cao tần [HRC...][sâu...]"
ĐIỀU CHẤT: 調質 | HRC22~30 | HRC22~25 | HRC27-35 | Pretraite Rm 1000-1200MPa → "Điều chất [HRC...]"
`;

const VNT_BM = `
BẢNG XỬ LÝ BỀ MẶT:
ANOD NHÔM: 白アルマイト/AA10/Anodize(clear)/Anodisation naturelle→"Anod trắng" | 黒アルマイト/Anodize(Black)→"Anod đen" | Hard Anodize→"Hard Anodize" | Sulphuric Anodize Type 2/MIL-A-8625→"Anodize Type 2 Clear"
MẠ: 無電解ニッケル/無電解Ni/Elp-Fe/Ni-P5→"Mạ Niken" | MFZN2-C/Zn12µm/Unichrome/三価ホワイト→"Mạ kẽm" | 黒染め/Black wash/SOB→"Nhuộm đen SOB" | Phosphat.manganese→"Mạ photphat" | Raydent/レイデント→"Raydent"
KHÔNG XỬ LÝ: As machined/Leave as machined/生地/無処理 → null
`;

const VNT_HINH = `
PHÂN LOẠI HÌNH DẠNG & KIỂU PHÔI:
Phi tròn đặc: tròn xoay đặc, trục bậc, bulông, chốt, bạc đặc → Tiện CNC, phôi thanh tròn
Phi tròn ống: tròn xoay có lỗ xuyên tâm lớn >30% ĐK ngoài, bạc rỗng, vòng → Tiện CNC, phôi ống
Hình tấm: khối hộp/tấm phẳng, cao <50% dài, đế/bích/block → Phay CNC, phôi tấm
Lục giác: phôi lục giác, đầu bulông lục giác → Tiện CNC
Hỗn hợp: vừa tròn xoay vừa mặt phẳng phức tạp → Tiện + Phay
`;


const SYSTEM_PROMPT = `Bạn là chuyên gia đọc bản vẽ kỹ thuật cơ khí của Công ty Việt Nhật Tân (VNT).
Nhiệm vụ: Phân tích bản vẽ kỹ thuật và trích xuất thông tin theo JSON schema.

Quy tắc bắt buộc:
1. Chỉ trả về JSON thuần túy, không markdown, không text giải thích
2. Nếu không có trên bản vẽ → null, không đoán mò
3. Kích thước: giữ nguyên đơn vị gốc (inch hoặc mm)
4. Lỗ ren: ghi đầy đủ — ví dụ "4x 6-32 UNC-2B depth .256"
5. Critical feature: đánh dấu true nếu có ký hiệu X hoặc ∧
6. Nguyên công: liệt kê theo thứ tự gia công thực tế
7. TRÒN XOAY: bắt buộc điền phi_lon + phi_nho (trục Ø20/Ø15 → phi_lon=20, phi_nho=15)
8. VUÔNG CẠNH: điền dai/rong/cao, phi_lon và phi_nho để null
9. kieu_phoi: "Phi tròn đặc"/"Phi tròn ống"/"Hình tấm"/"Lục giác"/"Hỗn hợp"
10. VẬT LIỆU: dùng bảng chuyển đổi dưới để map về mã JIS/VNT chuẩn
11. XỬ LÝ NHIỆT: nhận diện ký hiệu Nhật/Pháp/Anh, map về tên VNT
12. XỬ LÝ BỀ MẶT: nhận diện ký hiệu Nhật/tiếng Anh, map về tên VNT

\${VNT_MAT}
\${VNT_NHIET}
\${VNT_BM}
\${VNT_HINH}
`;

// ─── HÀM CHÍNH: Đọc bản vẽ PDF ──────────────────────────────────────────────
export async function analyzDrawing(pdfPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString("base64");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",  // Sonnet đọc bản vẽ kỹ thuật chính xác hơn Haiku nhiều
    max_tokens: 8192,

    // Cache system prompt — phần này lặp lại mọi request, tiết kiệm ~60% input tokens
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }, // cache 5 phút, đủ cho batch
      },
    ],

    messages: [
      {
        role: "user",
        content: [
          // PDF đặt TRƯỚC instruction — Claude đọc document trước rồi mới nhận câu hỏi
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          // Cache schema — cũng lặp lại mọi request
          {
            type: "text",
            text: `Phân tích bản vẽ kỹ thuật này và trả về JSON theo schema sau:\n${DRAWING_SCHEMA}\n\nLưu ý: Trả về JSON thuần túy, không markdown.`,
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ],
  });

  const raw = response.content[0].text;

  // Parse JSON — nếu LLM lỡ wrap trong markdown thì strip ra
  const cleaned = raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();

  // Log token usage để theo dõi cache hiệu quả
  const u = response.usage;
  const cacheHitRatio = u.cache_read_input_tokens
    ? ((u.cache_read_input_tokens / (u.input_tokens + u.cache_read_input_tokens)) * 100).toFixed(1)
    : "0";
  console.log(
    `  tokens — input: ${u.input_tokens} | cache_write: ${u.cache_creation_input_tokens ?? 0}` +
    ` | cache_hit: ${u.cache_read_input_tokens ?? 0} (${cacheHitRatio}%) | output: ${u.output_tokens}`
  );

  try {
    let parsed = JSON.parse(cleaned);
    // Bổ sung Field 7 (khối lượng) và Field 8 (mã quy trình)
    try { parsed = enrichWithF7F8(parsed); parsed.phan_tich_do_phuc_tap = analyzePhanTichDocBiet(parsed); } catch(e) { console.warn("enrich:", e.message); }
    return {
      success: true,
      data: parsed,
      raw,
      usage: {
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        cache_write_tokens: u.cache_creation_input_tokens ?? 0,
        cache_read_tokens: u.cache_read_input_tokens ?? 0,
        cache_hit_ratio_pct: parseFloat(cacheHitRatio),
      },
    };
  } catch {
    // LLM trả sai format — log lại để debug
    console.error("JSON parse failed. Raw output:", raw.substring(0, 500));
    return {
      success: false,
      error: "LLM trả về không đúng JSON format",
      raw,
    };
  }
}

// ─── HÀM ĐỌC FILE STEP 3D ────────────────────────────────────────────────────
// Trích xuất kích thước chính xác từ file .stp/.step — không tốn token AI
export function analyzeStep(stepPath) {
  try {
    const result = parseStep(stepPath);
    const kt = result.kich_thuoc;
    const c = result.don_vi === "inch" ? 25.4 : 1;
    const r = n => n ? Math.round(n * c * 10) / 10 : null;

    return {
      success: true,
      source: "STEP",
      ma_chi_tiet: result.ma_chi_tiet,
      don_vi_goc: result.don_vi,
      hinh_dang: result.hinh_dang,
      kich_thuoc_bao: {
        don_vi: "mm",
        chieu_dai: r(kt.chieu_dai_mm),
        phi_lon:   r(kt.phi_lon_mm),
        phi_nho:   r(kt.phi_nho_mm),
        chieu_rong: r(kt.chieu_rong_mm),
        chieu_cao:  r(kt.chieu_cao_mm),
      },
      lo_va_be_mat: result.lo_va_be_mat,
      bounding_box_mm: result.bounding_box
        ? {
            dai: result.bounding_box.dx,
            rong: result.bounding_box.dy,
            cao: result.bounding_box.dz,
          }
        : null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── HÀM KẾT HỢP: PDF + STEP (nếu có cả 2) ──────────────────────────────────
// Ưu tiên kích thước từ STEP (chính xác), metadata từ PDF (vật liệu, xử lý, nguyên công)
export async function analyzeDrawingWithStep(pdfPath, stepPath) {
  // 1. Phân tích PDF bằng AI
  const pdfResult = await analyzDrawing(pdfPath);
  if (!pdfResult.success) return pdfResult;

  // 2. Parse STEP nếu có
  if (stepPath && fs.existsSync(stepPath)) {
    const stepResult = analyzeStep(stepPath);
    if (stepResult.success) {
      console.log(`  STEP merge: phi_lon=${stepResult.kich_thuoc_bao.phi_lon}mm, dai=${stepResult.kich_thuoc_bao.chieu_dai}mm`);

      // Ghi đè kích thước bao bằng dữ liệu STEP (chính xác hơn PDF)
      const d = pdfResult.data;
      d.kich_thuoc_bao = {
        don_vi: "mm",
        dai: stepResult.kich_thuoc_bao.chieu_dai,
        rong: stepResult.kich_thuoc_bao.chieu_rong,
        cao_hoac_duong_kinh: stepResult.kich_thuoc_bao.phi_lon || stepResult.kich_thuoc_bao.chieu_cao,
        phi_lon: stepResult.kich_thuoc_bao.phi_lon,
        phi_nho: stepResult.kich_thuoc_bao.phi_nho,
        phan_loai_do_lon: classifySize(stepResult.kich_thuoc_bao.phi_lon || stepResult.kich_thuoc_bao.chieu_dai),
        _source: "STEP",
      };

      // Bổ sung lỗ từ STEP vào be_mat_gia_cong nếu AI bỏ sót
      d._step_data = {
        bounding_box: stepResult.bounding_box_mm,
        lo_va_be_mat_step: stepResult.lo_va_be_mat,
      };
    }
  }

  return pdfResult;
}

function classifySize(dim) {
  if (!dim) return null;
  if (dim < 50)  return "Nhỏ (<50mm)";
  if (dim < 200) return "Trung bình (50-200mm)";
  return "Lớn (>200mm)";
}

// ─── HÀM CORRECTION: Merge sửa đổi từ chat vào data cũ ──────────────────────
export async function correctDrawing(currentData, userMessage) {
  const CORRECT_PROMPT = `Bạn là chuyên gia đọc bản vẽ kỹ thuật cơ khí.
Nhiệm vụ: Cập nhật JSON kết quả phân tích bản vẽ dựa trên yêu cầu sửa đổi của kỹ sư.

Quy tắc:
1. Chỉ trả về JSON thuần túy — KHÔNG markdown, KHÔNG giải thích
2. Giữ nguyên toàn bộ cấu trúc và các field KHÔNG được đề cập
3. Chỉ sửa đúng phần kỹ sư yêu cầu
4. Nếu kỹ sư thêm lỗ/bề mặt mới, append vào mảng be_mat_gia_cong
5. Nếu kỹ sư xóa, filter ra khỏi mảng`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: [{ type: "text", text: CORRECT_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Kết quả AI hiện tại:
${JSON.stringify(currentData, null, 2)}

Yêu cầu sửa của kỹ sư: "${userMessage}"

Trả về JSON đã cập nhật, giữ nguyên toàn bộ cấu trúc.`,
      },
    ],
  });

  const raw = response.content[0].text;
  const cleaned = raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
  const u = response.usage;
  console.log(`  correction tokens — input: ${u.input_tokens} | output: ${u.output_tokens}`);

  try {
    return {
      success: true,
      data: JSON.parse(cleaned),
      usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens },
    };
  } catch {
    return { success: false, error: "Parse JSON lỗi", raw };
  }
}
