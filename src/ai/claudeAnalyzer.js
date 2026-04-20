import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { aiCfg } from "../libs/config.js";
import {
  getPrompt,
  getKnowledgeBlock,
  getKnowledgeTable,
  renderKnowledgeTable,
} from "../prompts/promptStore.js";

const client = new Anthropic({ apiKey: aiCfg.anthropicKey });

// ─── CORE: gui PDF + resolved system prompt cho Claude ────────────────────

/**
 * Core analysis: send PDF + resolved system prompt to Claude, return structured result.
 * Used by both analyzDrawing (saves to DB) and debugDrawingClaude (returns raw result).
 *
 * @param {Buffer} pdfBuffer — PDF file as Buffer
 * @param {string} resolvedSystem — system prompt with knowledge blocks already injected
 * @param {string} pdfBasename — file name for debug logs
 * @returns {object} { success, data, raw, usage, request_payload }
 */
async function _analyzeDrawingCore(pdfBuffer, resolvedSystem, pdfBasename) {
  const pdfBase64 = pdfBuffer.toString("base64");

  // Instruction text is embedded in the system prompt by the caller (from DB).
  // Only the PDF document is sent as user content.
  const requestPayload = {
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
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
        ],
      },
    ],
  };

  const response = await client.messages.create(requestPayload);

  const debugPayload = {
    ...requestPayload,
    messages: requestPayload.messages.map((msg) => ({
      ...msg,
      content: msg.content.map((c) => {
        if (c.type === "document") {
          return {
            ...c,
            source: { ...c.source, data: `[FILE: ${pdfBasename}]` },
          };
        }
        return c;
      }),
    })),
  };

  const raw = response.content[0].text;
  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const u = response.usage;

  console.log(
    `  tokens — input: ${u.input_tokens} | output: ${u.output_tokens}`
  );

  try {
    const data = JSON.parse(cleaned);
    return {
      success: true,
      data,
      raw,
      usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens },
      request_payload: debugPayload,
    };
  } catch {
    return {
      success: false,
      error: "Parse JSON loi: " + cleaned.slice(0, 200),
      raw,
      request_payload: debugPayload,
    };
  }
}

/**
 * Doc ban ve PDF = Claude Sonnet 4.6 (save to DB).
 * @param {string} pdfPath — duong dan file PDF
 * @returns {object} { success, data, raw, usage, request_payload }
 */
export async function analyzDrawing(pdfPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);

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
    ? renderKnowledgeTable(
        "BANG HINH DANG & KIEU PHOI",
        hinhTbl.headers,
        hinhTbl.rows
      )
    : "";

  const resolvedSystem = systemText
    .replaceAll("{{MATERIAL}}", matText)
    .replaceAll("{{HEAT_TREAT}}", nhietText)
    .replaceAll("{{SURFACE}}", bmText)
    .replaceAll("{{SHAPE}}", hinhText);

  return await _analyzeDrawingCore(
    pdfBuffer,
    resolvedSystem,
    path.basename(pdfPath)
  );
}

/**
 * Debug: phan tich PDF cho admin prompts (khong luu vao DB).
 * @param {string} pdfPath — duong dan file PDF
 * @returns {object} { success, data, raw, usage, request_payload }
 */
export async function debugDrawingClaude(pdfPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);

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
    ? renderKnowledgeTable(
        "BANG HINH DANG & KIEU PHOI",
        hinhTbl.headers,
        hinhTbl.rows
      )
    : "";

  const resolvedSystem = systemText
    .replaceAll("{{MATERIAL}}", matText)
    .replaceAll("{{HEAT_TREAT}}", nhietText)
    .replaceAll("{{SURFACE}}", bmText)
    .replaceAll("{{SHAPE}}", hinhText);

  return await _analyzeDrawingCore(
    pdfBuffer,
    resolvedSystem,
    path.basename(pdfPath)
  );
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
 * @returns {object} { success, data, usage, request_payload }
 */
export async function correctDrawing(currentData, userMessage) {
  const correctPrompt = await getPrompt("drawing-correction", {});

  const instructionText = `Ket qua AI hien tai:
${JSON.stringify(currentData, null, 2)}

Yeu cau sua cua ky su: "${userMessage}"

Tra ve JSON da cap nhat, giu nguyen toan bo cau truc.`;

  const requestPayload = {
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
        content: instructionText,
      },
    ],
  };

  const response = await client.messages.create(requestPayload);

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
      request_payload: requestPayload,
    };
  } catch {
    return {
      success: false,
      error: "Parse JSON loi",
      raw,
      request_payload: requestPayload,
    };
  }
}

function _classifySize(dim) {
  if (!dim) return null;
  if (dim < 50) return "Nho (<50mm)";
  if (dim < 200) return "Trung binh (50-200mm)";
  return "Lon (>200mm)";
}

/**
 * Debug prompt: send pre-rendered system prompt + user message to Claude and return response.
 * Used by admin prompt debug panel.
 *
 * @param {string} systemPrompt — already-rendered system prompt (with knowledge blocks)
 * @param {string} userMessage — raw user input text
 * @param {string} schema — optional JSON schema for structured output
 * @returns {object} { success, data, raw, usage, request_payload }
 */
export async function debugPromptClaude(
  systemPrompt,
  userMessage,
  schema = ""
) {
  const instruction = schema
    ? `Phan tich yeu cau ben duoi va tra ve JSON theo schema:\n${schema}\n\nLuu y: Tra ve JSON thuan tuy, khong markdown, khong giai thich.`
    : "";

  const userContent = schema ? `${userMessage}\n\n${instruction}` : userMessage;

  const requestPayload = {
    model: aiCfg.anthropicModel,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  };

  try {
    const response = await client.messages.create(requestPayload);
    const raw = response.content[0].text;
    const u = response.usage;

    let data;
    try {
      const cleaned = raw
        .replace(/^```json\s*/m, "")
        .replace(/```\s*$/m, "")
        .trim();
      data = JSON.parse(cleaned);
    } catch {
      data = raw;
    }

    return {
      success: true,
      data,
      raw,
      usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens },
      request_payload: requestPayload,
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      request_payload: requestPayload,
    };
  }
}
