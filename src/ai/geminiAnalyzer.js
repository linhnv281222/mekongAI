import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aiCfg } from "../libs/config.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";
import { getKnowledgeBlock, getPrompt } from "../prompts/promptStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CONFIG_FILE = path.join(__dirname, "../../data/ai-model-config.json");

/** Extract JSON — thử parse trực tiếp, thất bại thì tìm balanced { ... } trong text */
function extractJson(text) {
  const cleaned = String(text || "").replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = findBalancedBraces(cleaned, '{', '}');
  if (objMatch) {
    try { return JSON.parse(objMatch); } catch {}
  }
  const arrMatch = findBalancedBraces(cleaned, '[', ']');
  if (arrMatch) {
    try { return JSON.parse(arrMatch); } catch {}
  }
  throw new Error("Không thể extract JSON from response");
}

/** Tìm text con bắt đầu bởi openChar và kết thúc bởi closeChar (đã cân bằng) */
function findBalancedBraces(text, openChar, closeChar) {
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === openChar) { start = i; break; }
  }
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"' || ch === "'") { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

const geminiAi = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

function loadAiConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf8"));
      return { provider: raw?.provider || "gemini", model: raw?.model || null };
    }
  } catch {}
  return { provider: "gemini", model: null };
}

function geminiModel() {
  const { model } = loadAiConfig();
  if (model && model.trim()) return model.trim();
  return aiCfg.geminiModel || "gemini-3.1-pro-preview";
}

/**
 * Đọc bản vẽ PDF = Gemini (SDK mới @google/genai).
 * @param {string} pdfPath
 * @param {string} model — 'gemini-3-flash-preview' hoặc 'gemini-3.5-flash-preview'
 * @param {string|null} emailContext — nội dung email/chat để ưu tiên đúng nguồn
 * @returns {object} { success, data, raw, usage, request_payload }
 */
export async function analyzeDrawingGemini(pdfPath, model = null, emailContext = null) {
  if (!aiCfg.geminiKey) {
    return { success: false, error: "GEMINI_API_KEY not set" };
  }

  const modelName = model || geminiModel();
  console.log('[GeminiAnalyzer] START model=' + modelName + ' pdf=' + pdfPath + ' memMB=' + Math.round(process.memoryUsage().heapUsed / 1024 / 1024));

  let debugPayload = null;

  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64 = pdfBuffer.toString("base64");
    console.log('[GeminiAnalyzer] PDF loaded size=' + pdfBuffer.length + ' memMB=' + Math.round(process.memoryUsage().heapUsed / 1024 / 1024));

    const [vntKnowledge, materials, heatTreat, surface, shapes] =
      await Promise.all([
        getKnowledgeBlock("vnt-knowledge"),
        getKnowledgeBlock("vnt-materials"),
        getKnowledgeBlock("vnt-heat-treat"),
        getKnowledgeBlock("vnt-surface"),
        getKnowledgeBlock("vnt-shapes"),
      ]);

    const promptText = await getPrompt("gemini-drawing", {
      VNT_KNOWLEDGE: vntKnowledge ?? "",
      MATERIAL: materials ?? "",
      HEAT_TREAT: heatTreat ?? "",
      SURFACE: surface ?? "",
      SHAPE: shapes ?? "",
      EMAIL_CONTEXT: emailContext ?? "",
    });

    const requestPayload = {
      model: modelName,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64,
              },
            },
            { text: promptText },
          ],
        },
      ],
    };

    // Debug payload: thay base64 bằng tên file để hiển thị (không ảnh hưởng request thật)
    debugPayload = {
      ...requestPayload,
      contents: requestPayload.contents.map((c) => ({
        ...c,
        parts: c.parts.map((p) => {
          if (p.inlineData) {
            return {
              ...p,
              inlineData: {
                ...p.inlineData,
                data: `[FILE: ${
                  pdfPath ? path.basename(pdfPath) : "corrected"
                }]`,
              },
            };
          }
          return p;
        }),
      })),
    };

    console.log('[GeminiAnalyzer] Calling Gemini API... memMB=' + Math.round(process.memoryUsage().heapUsed / 1024 / 1024));
    const response = await generateContentWithRetry(
      geminiAi,
      requestPayload,
      "GeminiAnalyzer"
    );
    console.log('[GeminiAnalyzer] API done memMB=' + Math.round(process.memoryUsage().heapUsed / 1024 / 1024));

    const raw = response.text ?? "";
    const parsed = extractJson(raw);

    return {
      success: true,
      data: parsed,
      raw,
      usage: {},
      request_payload: debugPayload,
    };
  } catch (e) {
    console.error('[GeminiAnalyzer] EXCEPTION:', e.message, e.stack?.split('\n')[1] ?? '');
    return {
      success: false,
      error: e.message,
      raw: "",
      request_payload: debugPayload,
    };
  }
}

/**
 * Gemini backup khi correction that bai.
 */
export async function correctDrawingGemini(currentData, userMessage, emailContext = null) {
  return analyzeDrawingGemini(null, geminiModel(), emailContext);
}

/**
 * Debug prompt: send pre-rendered system prompt + user message to Gemini and return response.
 * Used by admin prompt debug panel.
 *
 * @param {string} systemPrompt — already-rendered system prompt (with knowledge blocks)
 * @param {string} userMessage — raw user input text
 * @param {string} schema — optional JSON schema for structured output
 * @returns {object} { success, data, raw, usage, request_payload }
 */
export async function debugPromptGemini(
  systemPrompt,
  userMessage,
  schema = ""
) {
  if (!aiCfg.geminiKey) {
    return { success: false, error: "GEMINI_API_KEY not set" };
  }

  const modelName = geminiModel();

  const instruction = schema
    ? `Phân tích yêu cầu bên dưới và trả về JSON theo schema:\n${schema}\n\nLưu ý: Trả về JSON thuần túy, không markdown, không giải thích.`
    : "";

  const fullUserMessage = schema
    ? `${userMessage}\n\n${instruction}`
    : userMessage;

  const requestPayload = {
    model: modelName,
    contents: [{ parts: [{ text: fullUserMessage }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  try {
    const response = await generateContentWithRetry(
      geminiAi,
      requestPayload,
      "debugPromptGemini"
    );
    const raw = response.text ?? "";

    let data;
    try {
      data = extractJson(raw);
    } catch {
      data = raw;
    }

    return {
      success: true,
      data,
      raw,
      usage: {},
      request_payload: requestPayload,
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      raw: "",
      request_payload: requestPayload,
    };
  }
}
