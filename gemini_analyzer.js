/**
 * gemini_analyzer.js
 * Đọc bản vẽ kỹ thuật bằng Google Gemini API
 * Dùng cùng schema JSON với analyzer.js (Claude)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Import VNT knowledge và schema từ analyzer.js
// Dùng cùng DRAWING_SCHEMA để output nhất quán
const DRAWING_SCHEMA = `
{
  "ban_ve": {
    "ma_ban_ve": "string",
    "ten_chi_tiet": "string",
    "revision": "string",
    "so_to": "string",
    "don_vi": "INCH | MM"
  },
  "vat_lieu": {
    "ma": "string — mã chuẩn JIS/VNT: A6061, S45C, SUS304...",
    "loai": "Nhôm | Thép | Inox | Đồng | Nhựa | Khác",
    "nhiet_luyen": "string | null"
  },
  "san_xuat": {
    "so_luong": "number",
    "tieu_chuan": "string"
  },
  "xu_ly": {
    "be_mat": [{"buoc": "number", "ten": "string", "tieu_chuan": "string | null"}],
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
    "dai": "number | null",
    "rong": "number | null",
    "cao_hoac_duong_kinh": "number | null",
    "phi_lon": "number | null",
    "phi_nho": "number | null",
    "phan_loai_do_lon": "Nhỏ (<50mm) | Trung bình (50-200mm) | Lớn (>200mm)"
  },
  "nguyen_cong_cnc": [
    {"stt": "number", "ten": "string", "may": "string", "ghi_chu": "string | null"}
  ],
  "be_mat_gia_cong": [
    {
      "be_mat": "string",
      "loai": "Ren | Trơn | CSK | Chamfer | Bo góc | Cung | Rãnh | Khác",
      "quy_cach": "string",
      "sau_hoac_kich_thuoc": "string | null",
      "dung_sai": "string | null",
      "critical": "boolean",
      "ghi_chu": "string | null"
    }
  ],
  "quy_trinh_tong_the": ["string"]
}
`;

const VNT_MAT = `
BẢNG CHUYỂN ĐỔI VẬT LIỆU (map về mã chuẩn JIS/VNT):
NHÔM: AlCu4MgSi/AlCuMg1/EN AW-2017→A2017 | AlCu4Mg1/EN AW-2024→A2024 | AlMg2,5/EN AW-5052→A5052 | AlMg5/EN AW-5056→A5056 | AlMg4,5Mn0,7/EN AW-5083→A5083 | AlMgSi/EN AW-6060→A6060 | AlMg1SiCu/EN AW-6061/AL6061→A6061 | AlMg0,7Si/EN AW-6063→A6063 | AlSi1MgMn/EN AW-6082→A6082 | AlZn5,5MgCu/EN AW-7075→A7075
THÉP: Fe430B/St37-2/S235JR/SS41→SS400 | C45E/AISI 1045/1.0503→S45C | C50E/AISI 1050→S50C | C55E/AISI 1055→S55C | 20CrMo5/AISI 5115→SCM415 | 34CrMo4/AISI 5135→SCM435 | 42CrMo4/AISI 4140/1.7225→SCM440 | X153CrMoV12/D2/AISI D2/1.2379→SKD11 | X40CrMoV5-1/H13/AISI H13/1.2344→SKD61 | 90MnCrV8/O1/SK3→SKS3
INOX: X10CrNiS18-9/AISI 303/1.4305→SUS303 | X5CrNi18-10/AISI 304/1.4301→SUS304 | X5CrNiMo17-12-2/AISI 316/1.4401→SUS316 | X2CrNiMo17-12-2/AISI 316L/1.4404/Inox A4→SUS316L | X30Cr13/AISI 420/1.2083→SUS420J2 | X105CrMo17/AISI 440/1.4125→SUS440C
ĐỒNG: Cu-ETP/CW008A/Copper Alloy 110→C1100 | CuZn39Pb3/CW614N/Laiton/真鍮/BsBM→C3604
NHỰA: PMMA/Acrylic/MIKA→MICA | POM/Acetal/BLACK DELRIN/POM黒→POM | PTFE/Téflon/テフロン→TEFLON
`;

const VNT_NHIET = `
BẢNG XỬ LÝ NHIỆT:
NHIỆT TOÀN PHẦN: 焼入れ焼戻し|焼入れ・焼戻し|Trempe/Hardening|HRC58~60|真空焼入し|traite(trempe+revenu)|Surface harden → "Nhiệt toàn phần [HRC...]"
NHIỆT MỘT PHẦN: 高周波焼入れ|図示部 高周波焼入れ|tôi cao tần → "Nhiệt một phần/cao tần [HRC...][sâu...]"
ĐIỀU CHẤT: 調質|HRC22~30|HRC27-35|Pretraite Rm 1000-1200MPa → "Điều chất [HRC...]"
`;

const VNT_BM = `
BẢNG XỬ LÝ BỀ MẶT:
ANOD NHÔM: 白アルマイト/AA10/Anodize(clear)/Anodisation naturelle→"Anod trắng" | 黒アルマイト/Anodize(Black)→"Anod đen" | Hard Anodize→"Hard Anodize" | Sulphuric Anodize Type 2/MIL-A-8625→"Anodize Type 2 Clear"
MẠ: 無電解ニッケル/無電解Ni/Elp-Fe/Ni-P5→"Mạ Niken" | MFZN2-C/Zn12µm/Unichrome/三価ホワイト→"Mạ kẽm" | 黒染め/Black wash/SOB→"Nhuộm đen SOB" | Raydent/レイデント→"Raydent"
KHÔNG XỬ LÝ: As machined/Leave as machined/生地/無処理 → null
`;

const SYSTEM_PROMPT = `Bạn là chuyên gia đọc bản vẽ kỹ thuật cơ khí của Công ty Việt Nhật Tân (VNT).
Nhiệm vụ: Phân tích bản vẽ kỹ thuật và trích xuất thông tin theo JSON schema.

Quy tắc bắt buộc:
1. Chỉ trả về JSON thuần túy, không markdown, không text giải thích
2. Nếu không có trên bản vẽ → null
3. Kích thước: giữ nguyên đơn vị gốc (inch hoặc mm)
4. Lỗ ren: ghi đầy đủ — ví dụ "4x M6x1.0 depth 15"
5. Critical feature: đánh dấu true nếu có ký hiệu X hoặc ∧
6. TRÒN XOAY: bắt buộc điền phi_lon + phi_nho
7. VUÔNG CẠNH: điền dai/rong/cao, phi_lon và phi_nho để null
8. kieu_phoi: "Phi tròn đặc"/"Phi tròn ống"/"Hình tấm"/"Lục giác"/"Hỗn hợp"
9. Dùng bảng chuyển đổi để map vật liệu về mã JIS/VNT chuẩn
10. Nhận diện xử lý nhiệt và bề mặt theo bảng VNT

${VNT_MAT}
${VNT_NHIET}
${VNT_BM}`;

// ── HÀM CHÍNH: Đọc bản vẽ bằng Gemini ──────────────────────────────────────
export async function analyzDrawingGemini(pdfPath, modelName = "gemini-2.5-pro") {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString("base64");

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });

  const prompt = `Phân tích bản vẽ kỹ thuật này và trả về JSON theo schema sau:\n${DRAWING_SCHEMA}\n\nLưu ý: Trả về JSON thuần túy, không markdown.`;

  const result = await model.generateContent([
    { inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
    prompt,
  ]);

  const raw = result.response.text();
  const cleaned = raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();

  // Log usage
  const usage = result.response.usageMetadata;
  console.log(`  Gemini tokens — input: ${usage?.promptTokenCount ?? "?"} | output: ${usage?.candidatesTokenCount ?? "?"}`);

  try {
    return {
      success: true,
      model: modelName,
      data: JSON.parse(cleaned),
      raw,
      usage: {
        input_tokens: usage?.promptTokenCount ?? 0,
        output_tokens: usage?.candidatesTokenCount ?? 0,
      },
    };
  } catch {
    console.error("Gemini JSON parse failed:", raw.substring(0, 300));
    return { success: false, model: modelName, error: "JSON parse lỗi", raw };
  }
}

// ── CORRECTION bằng Gemini ───────────────────────────────────────────────────
export async function correctDrawingGemini(currentData, userMessage, modelName = "gemini-2.5-flash") {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: `Bạn là chuyên gia đọc bản vẽ kỹ thuật cơ khí VNT.
Nhiệm vụ: Cập nhật JSON dựa trên yêu cầu sửa của kỹ sư.
Quy tắc: Chỉ trả JSON thuần túy. Giữ nguyên phần không được đề cập. Chỉ sửa phần được yêu cầu.`,
  });

  const prompt = `Kết quả AI hiện tại:\n${JSON.stringify(currentData, null, 2)}\n\nYêu cầu sửa: "${userMessage}"\n\nTrả về JSON đã cập nhật.`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const cleaned = raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();

  try {
    return { success: true, data: JSON.parse(cleaned) };
  } catch {
    return { success: false, error: "JSON parse lỗi", raw };
  }
}
