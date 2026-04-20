import fetch from "node-fetch";
import { aiCfg } from "../libs/config.js";
import { getPrompt } from "../prompts/promptStore.js";

const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";

/**
 * Phan loai email = rfq / repeat_order / hoi_tham / khieu_nai / spam.
 * Su dung Claude Haiku.
 *
 * @param {object} emailData — { from, subject, body, attachments }
 * @returns {object} { loai, ngon_ngu, ly_do, han_giao_hang, hinh_thuc_giao, ..., _ai_request_payload }
 */
export async function classifyEmailClaude(emailData) {
  const promptText = await getPrompt("email-classify", {
    emailFrom: emailData.from,
    emailSubject: emailData.subject,
    emailAttachments:
      emailData.attachments.map((a) => a.name).join(", ") || "none",
    emailBody: emailData.body.slice(0, 500),
  });

  const requestPayload = {
    model: CLASSIFY_MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: promptText }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": aiCfg.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestPayload),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || "{}";
  const result = JSON.parse(text.replace(/```json|```/g, "").trim());

  result._ai_request_payload = requestPayload;
  return result;
}
