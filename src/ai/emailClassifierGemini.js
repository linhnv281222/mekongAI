import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aiCfg } from "../libs/config.js";
import { getPrompt, getKnowledgeBlock } from "../prompts/promptStore.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";
import { extractJson } from "./jsonExtract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CONFIG_FILE = path.join(__dirname, "../../data/ai-model-config.json");

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
  const [promptText, marketData] = await Promise.all([
    getPrompt("email-classify", {
      emailFrom: emailData.from,
      emailSubject: emailData.subject,
      emailAttachments:
        emailData.attachments.map((a) => a.name).join(", ") || "none",
      // TRUNCATE: already 500 in prompt, further limit to 500 for consistency
      // Classification needs subject + keyword signals, not full body
      emailBody: emailData.body.slice(0, 500),
    }),
    getKnowledgeBlock("vnt-markets"),
  ]);

  // Inject MARKET variable — replace {{MARKET}} placeholder in rendered prompt
  const finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );

  const modelName = geminiModel();

  const requestPayload = {
    model: modelName,
    contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
    generationConfig: { temperature: 0 },
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
