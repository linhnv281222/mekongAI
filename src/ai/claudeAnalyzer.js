import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import { aiCfg } from "../libs/config.js";
import {
  getPrompt,
  getKnowledgeBlock,
  getKnowledgeTable,
  renderKnowledgeTable,
} from "../prompts/promptStore.js";

const client = new Anthropic({ apiKey: aiCfg.anthropicKey });

// ─── SCHEMA mô tả đầu ra mong muốn ───────────────────────────────────────
// Schema phẳng — flat, không lồng nhau, đúng như prompt phân tích bản vẽ
const DRAWING_SCHEMA = `
{
  "ma_ban_ve": "string — mã số bản vẽ trong khung tên (VD: M1024, DW-2024-001)",
  "vat_lieu": "string — mã vật liệu ghi trên bản vẽ (VD: AL6061-T6, S45C, SUS304). Nếu không ghi → 'Không ghi trên bản vẽ'",
  "so_luong": "number — số lượng sản xuất (VD: 1, 5, 10)",
  "xu_ly_be_mat": "string — xử lý bề mặt ghi trên bản vẽ (VD: Ra 1.6, Ni 10um). Nếu không ghi → 'Không ghi trên bản vẽ'",
  "xu_ly_nhiet": "string — xử lý nhiệt luyện ghi trên bản vẽ (VD: T6, HRC 58-62). Nếu không ghi → 'Không ghi trên bản vẽ'",
  "dung_sai_chung": "string — tiêu chuẩn dung sai chung ghi trên khung tên (VD: JIS B 0405, ISO 2768-m). Nếu không ghi → 'Không ghi trên bản vẽ'",
  "hinh_dang": "string — phân loại hình dạng: 'Tròn xoay' | 'Hình tấm' | 'Khối phức tạp'",
  "kich_thuoc": "string — kích thước bao tổng thể (VD: Ø35×74.5, 80×50×10, 150×90×15 mm). Giữ nguyên đơn vị gốc",
  "so_be_mat_cnc": "number — số bề mặt CNC (số lần gá đặt). Quy tắc: x=1 nếu tất cả đặc điểm hoàn thành từ 1 hướng; x=2 chỉ khi có blind features ở 2 mặt đối diện. Hình tấm chỉ lỗ thông suốt + chamfer → x=1. Hình tấm mặc định x=2 (trên+dưới) trừ khi có yêu cầu đặc biệt mặt bên",
  "dung_sai_chat_nhat": "string — dung sai vị trí nhỏ nhất có trên bản vẽ (VD: ±0.02, 0.05, H7, js6). Nếu không ghi → 'Không ghi trên bản vẽ'",
  "co_gdt": "boolean — true nếu bản vẽ có ký hiệu GD&T (gd_t, true position, profile tolerance...)",
  "ma_quy_trinh": "string — mã quy trình gia công theo bảng tra ①②③④⑤: QTxxx (VD: QT111, QT612, QT213). VD: Hình tấm + thép + KT 50-300mm + x=2 → QT612",
  "ly_giai_qt": "string — giải thích ngắn gọn từng bước logic để ra mã QT (①②③④⑤), ví dụ: '① Hình tấm → bỏ qua ②③④ → ⑤ Thép + KT 50-300mm + x=2 → QT612'"
}`;

// Knowledge blocks are loaded from promptStore at call time (DB or file fallback).
// Prompt is loaded from DB via promptStore with variable substitution.

// ─── HAM CHINH: Doc ban ve PDF ───────────────────────────────────────────

/**
 * Doc ban ve PDF = Claude Sonnet 4.6.
 * @param {string} pdfPath — duong dan file PDF
 * @returns {object} { success, data, raw, usage }
 */
export async function analyzDrawing(pdfPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString("base64");

  const [systemText, matTbl, nhietTbl, bmTbl, hinhTbl] = await Promise.all([
    getPrompt("drawing-system", {}),
    getKnowledgeTable("vnt-materials"),
    getKnowledgeTable("vnt-heat-treat"),
    getKnowledgeTable("vnt-surface"),
    getKnowledgeTable("vnt-shapes"),
  ]);

  const matText = matTbl
    ? renderKnowledgeTable("BANG QUY DOI VAT LIEU", matTbl.headers, matTbl.rows)
    : "";
  const nhietText = nhietTbl
    ? renderKnowledgeTable("BANG XU LY NHIET", nhietTbl.headers, nhietTbl.rows)
    : "";
  const bmText = bmTbl
    ? renderKnowledgeTable("BANG XU LY BE MAT", bmTbl.headers, bmTbl.rows)
    : "";
  const hinhText = hinhTbl
    ? renderKnowledgeTable("BANG HINH DANG & KIEU PHOI", hinhTbl.headers, hinhTbl.rows)
    : "";

  const resolvedSystem = systemText
    .replaceAll("{{MATERIAL}}", matText)
    .replaceAll("{{HEAT_TREAT}}", nhietText)
    .replaceAll("{{SURFACE}}", bmText)
    .replaceAll("{{SHAPE}}", hinhText);

  const response = await client.messages.create({
    model: aiCfg.anthropicModel,
    max_tokens: 8192,

    system: [
      {
        type: "text",
        text: resolvedSystem,
        cache_control: { type: "ephemeral" },
      },
    ],

    messages: [
      {
        role: "user",
        content: [
          // PDF dat TRUOC instruction
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: `Phan tich ban ve ky thuat nay va tra ve JSON theo schema phang sau:\n${DRAWING_SCHEMA}\n\nLuu y:\n- Tra ve JSON thuan tuy, khong markdown, khong giai thich\n- "Khong ghi tren ban ve" khi thong tin khong co tren ban ve\n- Tu dinh nghia ma_quy_trinh + ly_giai_qt dua tren bieu mau ①②③④⑤\n- so_be_mat_cnc: chi dem so lan ga dat (setups), khong dem so lo/dien tich`,
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ],
  });

  const raw = response.content[0].text;

  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();

  const u = response.usage;
  const cacheHitRatio = u.cache_read_input_tokens
    ? (
        (u.cache_read_input_tokens /
          (u.input_tokens + u.cache_read_input_tokens)) *
        100
      ).toFixed(1)
    : "0";

  console.log(
    `  tokens — input: ${u.input_tokens} | cache_write: ${
      u.cache_creation_input_tokens ?? 0
    }` +
      ` | cache_hit: ${
        u.cache_read_input_tokens ?? 0
      } (${cacheHitRatio}%) | output: ${u.output_tokens}`
  );

  try {
    let parsed = JSON.parse(cleaned);
    // enrichWithF7F8 bo sung F7/F8 cho schema cu (nested). Schema moi (flat) da co
    // ma_quy_trinh tu AI roi, khong can go lai enrich.
    // if (parsed) {
    //   try { parsed = enrichWithF7F8(parsed); } catch(e) { console.warn("enrich:", e.message); }
    // }

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
  } catch (e) {
    console.error("[ClaudeAnalyzer] EXCEPTION:", e.message, e.stack?.split("\n")[1] ?? "");
    return {
      success: false,
      error: e.message,
      raw: "",
    };
  }
}

// ─── DOC FILE STEP 3D ─────────────────────────────────────────────────────

/**
 * Trich xuat kich thuoc chinh xac tu file STEP — khong to token AI.
 * @param {string} stepPath
 * @returns {object}
 */
export function analyzeStep(stepPath) {
  try {
    const result = parseStep(stepPath);
    const kt = result.kich_thuoc;
    const c = result.don_vi === "inch" ? 25.4 : 1;
    const r = (n) => (n ? Math.round(n * c * 10) / 10 : null);

    return {
      success: true,
      source: "STEP",
      ma_chi_tiet: result.ma_chi_tiet,
      don_vi_goc: result.don_vi,
      hinh_dang: result.hinh_dang,
      kich_thuoc_bao: {
        don_vi: "mm",
        dai: r(kt.chieu_dai_mm),
        phi_lon: r(kt.phi_lon_mm),
        phi_nho: r(kt.phi_nho_mm),
        rong: r(kt.chieu_rong_mm),
        cao: r(kt.chieu_cao_mm),
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

// ─── KET HOP PDF + STEP ───────────────────────────────────────────────────

/**
 * Doc PDF roi merge voi STEP (neu co).
 * Uu tien kich thuoc tu STEP (chinh xac hon AI doc).
 * @param {string} pdfPath
 * @param {string} stepPath
 * @returns {object}
 */
export async function analyzeDrawingWithStep(pdfPath, stepPath) {
  const pdfResult = await analyzDrawing(pdfPath);
  if (!pdfResult.success) return pdfResult;

// STEP analysis still works for dimension extraction; result is kept separate.
// STEP merge is disabled for flat schema (no kich_thuoc_bao wrapper).

  return pdfResult;
}

// ─── CORRECTION: Chat-based sua doi ───────────────────────────────────────

/**
 * Sua doi ket qua phan tich bang chat.
 * @param {object} currentData — ket qua hien tai
 * @param {string} userMessage — yeu cau sua cua ky su
 * @returns {object} { success, data, usage }
 */
export async function correctDrawing(currentData, userMessage) {
  const correctPrompt = await getPrompt("drawing-correction", {});

  const response = await client.messages.create({
    model: aiCfg.anthropicModel,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: correctPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Ket qua AI hien tai:
${JSON.stringify(currentData, null, 2)}

Yeu cau sua cua ky su: "${userMessage}"

Tra ve JSON da cap nhat, giu nguyen toan bo cau truc.`,
      },
    ],
  });

  const raw = response.content[0].text;
  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const u = response.usage;
  console.log(
    `  correction tokens — input: ${u.input_tokens} | output: ${u.output_tokens}`
  );

  try {
    return {
      success: true,
      data: JSON.parse(cleaned),
      raw,
      usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens },
    };
  } catch {
    return { success: false, error: "Parse JSON loi", raw };
  }
}

function _classifySize(dim) {
  if (!dim) return null;
  if (dim < 50) return "Nho (<50mm)";
  if (dim < 200) return "Trung binh (50-200mm)";
  return "Lon (>200mm)";
}
