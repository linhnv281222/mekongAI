import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aiCfg } from "../libs/config.js";
import { getKnowledgeBlock, getPrompt } from "../prompts/promptStore.js";
import { loadAiConfig } from "./aiConfig.js";
import { callClaudeWithRetry } from "./claudeRetry.js";

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

function anthropicModel() {
  const { model } = loadAiConfig();
  if (model && model.trim()) return model.trim();
  return process.env.ANTHROPIC_MODEL || aiCfg.anthropicModel || "claude-sonnet-4-6";
}

function anthropicKey() {
  return aiCfg.anthropicKey;
}

/**
 * Đọc bản vẽ PDF = Claude Sonnet/Opus.
 */
export async function analyzeDrawingClaude(pdfPath, emailContext = null) {
  if (!anthropicKey()) {
    return { success: false, error: "ANTHROPIC_API_KEY not set" };
  }

  const modelName = anthropicModel();

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

  let base64 = null;
  let filename = "corrected";
  if (pdfPath) {
    const pdfBuffer = fs.readFileSync(pdfPath);
    base64 = pdfBuffer.toString("base64");
    filename = path.basename(pdfPath);
  }

  const requestPayload = {
    model: modelName,
    max_tokens: 4096,
    temperature: 0,
    system: [{ type: "text", text: promptText }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: "Phân tích bản vẽ PDF trên và trả về kết quả.",
          },
        ],
      },
    ],
  };

  const debugPayload = {
    ...requestPayload,
    messages: requestPayload.messages.map((m) => ({
      ...m,
      content: m.content.map((c) =>
        c.type === "document"
          ? { ...c, source: { ...c.source, data: `[FILE: ${filename}]` } }
          : c
      ),
    })),
  };

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey(),
      "anthropic-version": "2023-06-01",
    },
    body: requestPayload,
    logTag: "analyzeDrawing",
  });

  if (!res.ok) {
    return {
      success: false,
      error: `Anthropic API: ${res.error}`,
      raw: "",
      request_payload: debugPayload,
    };
  }

  const data = res.data;
  const raw = data.content?.[0]?.text || "";
  const parsed = extractJson(raw);

  return {
    success: true,
    data: parsed,
    raw,
    usage: data.usage ?? {},
    request_payload: debugPayload,
  };
}

/**
 * Correct drawing data via Claude.
 */
export async function correctDrawingClaude(currentData, userMessage, emailContext = null) {
  return analyzeDrawingClaude(null, emailContext);
}

/**
 * Debug prompt: send system prompt + user message to Claude.
 */
export async function debugPromptClaude(systemPrompt, userMessage, schema = "") {
  if (!anthropicKey()) {
    return { success: false, error: "ANTHROPIC_API_KEY not set" };
  }

  const instruction = schema
    ? `Phân tích yêu cầu bên dưới và trả về JSON theo schema:\n${schema}\n\nLưu ý: Trả về JSON thuần túy, không markdown, không giải thích.`
    : "";

  const userContent = schema ? `${userMessage}\n\n${instruction}` : userMessage;

  const requestPayload = {
    model: anthropicModel(),
    max_tokens: 4096,
    temperature: 0,
    system: [{ type: "text", text: systemPrompt }],
    messages: [{ role: "user", content: userContent }],
  };

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey(),
      "anthropic-version": "2023-06-01",
    },
    body: requestPayload,
    logTag: "debugPrompt",
  });

  if (!res.ok) {
    return {
      success: false,
      error: `Claude API: ${res.error}`,
      raw: "",
      request_payload: null,
    };
  }

  const raw = res.data.content?.[0]?.text || "";
  let parsed;
  try {
    parsed = extractJson(raw);
  } catch {
    parsed = raw;
  }

  return {
    success: true,
    data: parsed,
    raw,
    usage: res.data.usage ?? {},
    request_payload: requestPayload,
  };
}
