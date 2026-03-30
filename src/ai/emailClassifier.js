import fetch from "node-fetch";
import { aiCfg } from "../libs/config.js";
import { getPrompt } from "../prompts/promptStore.js";

/**
 * Phan loai email = rfq / repeat_order / hoi_tham / khieu_nai / spam.
 * @param {object} emailData — { from, subject, body, attachments }
 * @returns {object} { loai, ngon_ngu, ly_do, han_giao_hang, hinh_thuc_giao, ... }
 */
export async function classifyEmail(emailData) {
  const promptText = await getPrompt("email-classify", {
    emailFrom: emailData.from,
    emailSubject: emailData.subject,
    emailAttachments: emailData.attachments.map((a) => a.name).join(", ") || "none",
    emailBody: emailData.body.slice(0, 500),
  });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": aiCfg.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: promptText }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "{}";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.warn("[Classify] fallback:", e.message);
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
    };
  }
}
