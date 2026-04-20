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
  const rawPrompt = await getPrompt("email-classify", {
    emailFrom: emailData.from,
    emailSubject: emailData.subject,
    emailAttachments: emailData.attachments.map((a) => a.name).join(", ") || "none",
    emailBody: emailData.body.slice(0, 500),
  });

  // Fallback: if prompt is null, use default
  const promptText = rawPrompt || `Classify this email:
From: ${emailData.from}
Subject: ${emailData.subject}
Attachments: ${emailData.attachments.map((a) => a.name).join(", ") || "none"}
Body: ${emailData.body.slice(0, 500)}

Classify into ONE of:
- rfq: 見積依頼/加工依頼/見積/quotation/bao gia
- repeat_order: リピート/repeat
- hoi_tham: general question
- khieu_nai: complaint
- spam: newsletter

Return ONLY JSON.`;

  const modelName = aiCfg.geminiModel || "gemini-2.0-flash";

  const requestPayload = {
    model: modelName,
    contents: [{ role: "user", parts: [{ text: promptText }] }],
  };

  try {
    const response = await generateContentWithRetry(
      geminiAi,
      {
        model: modelName,
        contents: [{ role: "user", parts: [{ text: promptText }] }],
      },
      "EmailClassifyGemini"
    );

    const text = response.text ?? "{}";
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());

    // Attach request payload for debug
    result._ai_request_payload = requestPayload;

    return result;
  } catch (e) {
    console.warn("[ClassifyGemini] fallback:", e.message);
    return {
      loai: emailData.attachments.length > 0 ? "rfq" : "hoi_tham",
      ngon_ngu: "ja",
      ly_do: "fallback: " + e.message,
      han_giao_hang: null,
      hinh_thuc_giao: null,
      xu_ly_be_mat: null,
      vat_lieu_chung_nhan: false,
      ghi_chu: emailData.subject,
      ten_cong_ty: emailData.senderName,
      _ai_request_payload: requestPayload,
    };
  }
}
