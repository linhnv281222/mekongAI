import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import { aiCfg } from "../libs/config.js";
import { enrichWithF7F8 } from "../processors/processRouter.js";
import { parseStep } from "../processors/stepParser.js";
import { getPrompt, getKnowledgeBlock } from "../prompts/promptStore.js";

const client = new Anthropic({ apiKey: aiCfg.anthropicKey });

// ─── SCHEMA mo ta dau ra mong muon ───────────────────────────────────────
const DRAWING_SCHEMA = `
{
  "ban_ve": {
    "ma_ban_ve": "string",
    "ten_chi_tiet": "string",
    "revision": "string",
    "so_to": "string — vi du: 1 OF 3",
    "don_vi": "INCH | MM"
  },
  "vat_lieu": {
    "ma": "string — vi du: AL6061-T6, S45C, SUS304",
    "loai": "Nhom | Thep | Inox | Khac",
    "nhiet_luyen": "string | null"
  },
  "san_xuat": {
    "so_luong": "number",
    "tieu_chuan": "string — vi du: ASME Y14.5-2009"
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
    "loai": "Tron xoay | Vuong canh | Hon hop",
    "kieu_phoi": "Phi tron dac | Phi tron ong | Hinh tam | Luc giac | Khac",
    "phuong_an_gia_cong": "Tien CNC | Phay CNC | Tien + Phay | Khac",
    "mo_ta": ["string"]
  },
  "kich_thuoc_bao": {
    "don_vi": "inch | mm",
    "dai": "number | null — chieu dai tong the",
    "rong": "number | null — chieu rong (chi dung cho chi tiet vuong canh)",
    "cao_hoac_duong_kinh": "number | null — chieu cao hoac duong kinh ngoai lon nhat",
    "phi_lon": "number | null — duong kinh ngoai lon nhat (CHi dung cho chi tiet tron xoay)",
    "phi_nho": "number | null — duong kinh nho nhat hoac duong kinh trong neu la ong (CHi dung cho chi tiet tron xoay)",
    "phan_loai_do_lon": "Nho (<50mm) | Trung binh (50-200mm) | Lon (>200mm)"
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
      "be_mat": "string — ten mat/vi tri",
      "loai": "Ren | Tron | CSK | Chamfer | Bo goc | Cung | Ranh | Khac",
      "quy_cach": "string — vi du: 4x 6-32 UNC-2B",
      "sau_hoac_kich_thuoc": "string | null",
      "dung_sai": "string | null",
      "critical": "boolean — true neu co ky hieu X hoac AND/OR X tren ban ve",
      "ghi_chu": "string | null"
    }
  ],
  "quy_trinh_tong_the": ["string"]
}
`;

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

  const [systemText, mat, nhiet, bm, hinh] = await Promise.all([
    getPrompt("drawing-system", {}),
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
            text: `Phan tich ban ve ky thuat nay va tra ve JSON theo schema sau:\n${DRAWING_SCHEMA}\n\nLuu y: Tra ve JSON thuan tuy, khong markdown.`,
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
    try {
      parsed = enrichWithF7F8(parsed);
    } catch (e) {
      console.warn("enrich F7F8:", e.message);
    }

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
    console.error("JSON parse failed. Raw output:", raw.substring(0, 500));
    return {
      success: false,
      error: "LLM tra ve khong dung JSON format",
      raw,
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

  if (stepPath && fs.existsSync(stepPath)) {
    const stepResult = analyzeStep(stepPath);
    if (stepResult.success) {
      console.log(
        `  STEP merge: phi_lon=${stepResult.kich_thuoc_bao.phi_lon}mm, dai=${stepResult.kich_thuoc_bao.dai}mm`
      );

      const d = pdfResult.data;
      d.kich_thuoc_bao = {
        don_vi: "mm",
        dai: stepResult.kich_thuoc_bao.dai,
        rong: stepResult.kich_thuoc_bao.rong,
        cao_hoac_duong_kinh:
          stepResult.kich_thuoc_bao.phi_lon || stepResult.kich_thuoc_bao.cao,
        phi_lon: stepResult.kich_thuoc_bao.phi_lon,
        phi_nho: stepResult.kich_thuoc_bao.phi_nho,
        phan_loai_do_lon: _classifySize(
          stepResult.kich_thuoc_bao.phi_lon || stepResult.kich_thuoc_bao.dai
        ),
        _source: "STEP",
      };

      d._step_data = {
        bounding_box: stepResult.bounding_box_mm,
        lo_va_be_mat_step: stepResult.lo_va_be_mat,
      };
    }
  }

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
