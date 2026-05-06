import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aiCfg } from "../libs/config.js";
import { getPrompt } from "../prompts/promptStore.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CONFIG_FILE = path.join(__dirname, "../../data/ai-model-config.json");

/** Extract JSON — thử parse trực tiếp, thất bại thì tìm balanced { ... } trong text */
function extractJson(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = findBalancedBraces(cleaned, '{', '}');
  if (objMatch) {
    try { return JSON.parse(objMatch); } catch {}
  }
  const arrMatch = findBalancedBraces(cleaned, '[', ']');
  if (arrMatch) {
    try { return JSON.parse(arrMatch); } catch {}
  }
  throw new Error("Khong the extract JSON from response");
}

/** Tim text con bat dau boi openChar va ket thuc boi closeChar (da can bang) */
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
  return aiCfg.geminiModel || "gemini-2.0-flash";
}

/**
 * Phan loai email = rfq / repeat_order / hoi_tham / khieu_nai / spam
 * Su dung Gemini (SDK @google/genai).
 *
 * @param {object} emailData — { from, subject, body, attachments }
 * @returns {object} { loai, ngon_ngu, ly_do, han_giao_hang, hinh_thuc_giao, ..., _ai_request_payload }
 */
export async function classifyEmailGemini(emailData) {
  const promptText = await getPrompt("email-classify", {
    emailFrom: emailData.from,
    emailSubject: emailData.subject,
    emailAttachments:
      emailData.attachments.map((a) => a.name).join(", ") || "none",
    emailBody: emailData.body.slice(0, 500),
  });

  const modelName = geminiModel();

  const requestPayload = {
    model: modelName,
    contents: [{ role: "user", parts: [{ text: promptText }] }],
  };

  const response = await generateContentWithRetry(
    geminiAi,
    requestPayload,
    "EmailClassifyGemini"
  );

  const text = response.text ?? "{}";
  let result;
  try {
    result = extractJson(text);
  } catch (e) {
    result = {};
  }

  result._ai_request_payload = requestPayload;
  return result;
}
