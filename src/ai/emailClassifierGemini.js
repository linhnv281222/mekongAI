import { GoogleGenAI } from "@google/genai";
import { aiCfg } from "../libs/config.js";
import { getPrompt } from "../prompts/promptStore.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";

const geminiAi = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

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

  const modelName = aiCfg.geminiModel || "gemini-2.0-flash";

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
  const result = JSON.parse(text.replace(/```json|```/g, "").trim());

  result._ai_request_payload = requestPayload;
  return result;
}
