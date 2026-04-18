import { GoogleGenAI } from "@google/genai";
import { aiCfg } from "../libs/config.js";
import { getPrompt } from "../prompts/promptStore.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";

const ai = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

function chatModel() {
  const m = (process.env.CHAT_GEMINI_MODEL || "").trim();
  return m || aiCfg.geminiFlashModel || "gemini-3-flash-preview";
}

/**
 * Trích xuất thông tin cấu trúc từ chat message bằng AI.
 * Dùng prompt 'chat-classify' đã được cấu hình trong admin prompts.
 *
 * @param {string} message
 * @returns {Promise<{ten_cong_ty:string, ten_nguoi_lien_he:string, email_khach_hang:string, so_luong:string, ngon_ngu:string, co_yeu_cau_bao_gia:boolean, loi_nhan:string}>}
 */
export async function extractChatInfo(message) {
  if (!aiCfg.geminiKey) {
    throw new Error("GEMINI_API_KEY chưa được cấu hình.");
  }

  const promptText = await getPrompt("chat-classify", {
    chatMessage: message || "",
  });

  const response = await generateContentWithRetry(
    ai,
    {
      model: chatModel(),
      contents: [{ role: "user", parts: [{ text: promptText }] }],
    },
    "ChatExtract"
  );

  const raw = response.text ?? "";
  const cleaned = raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      ten_cong_ty: "unknown",
      ten_nguoi_lien_he: "unknown",
      email_khach_hang: "unknown",
      so_luong: "unknown",
      ngon_ngu: "vi",
      co_yeu_cau_bao_gia: true,
      loi_nhan: message.slice(0, 200),
    };
  }
}

/**
 * Trả lời chat tự nhiên bằng Gemini.
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export async function chatAssistantReply(userMessage) {
  const text = (userMessage || "").trim();
  if (!text) return "Bạn hãy nhập nội dung cần hỏi.";

  if (!aiCfg.geminiKey) {
    throw new Error("GEMINI_API_KEY chưa được cấu hình.");
  }

  const response = await generateContentWithRetry(
    ai,
    {
      model: chatModel(),
      contents: [
        { role: "user", parts: [{ text: "Bạn là trợ lý AI của hệ thống Mekong AI. Trả lời bằng tiếng Việt, ngắn gọn, dùng **in đậm** cho từ khóa quan trọng. Không dùng markdown code block." }] },
        { role: "model", parts: [{ text: "Tôi đã hiểu. Tôi sẵn sàng trả lời bạn bằng tiếng Việt." }] },
        { role: "user", parts: [{ text: text.slice(0, 12000) }] },
      ],
    },
    "ChatAssistant"
  );

  const raw = response.text ?? "";
  const cleaned = raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();

  if (cleaned) return cleaned;
  return "Không nhận được phản hồi từ Gemini. Thử lại nhé.";
}
