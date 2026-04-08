import { GoogleGenAI } from "@google/genai";
import { aiCfg } from "../libs/config.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";

const ai = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

function chatModel() {
  const m = (process.env.CHAT_GEMINI_MODEL || "").trim();
  return m || aiCfg.geminiFlashModel || "gemini-3-flash-preview";
}

const SYSTEM_VI = `Bạn là trợ lý AI của hệ thống Mekong AI (Việt Nhật Tân — VNT). Hệ thống giúp xử lý email RFQ, phân tích bản vẽ PDF, tạo job báo giá tự động.

Ngữ cảnh sản phẩm:
- Trang chính là Demo V3: danh sách yêu cầu bên trái, chi tiết giữa, xem PDF bên phải.
- Người dùng gửi yêu cầu qua email (agent quét Gmail) hoặc qua ô chat trên web.
- Lịch sử chat chỉ trong phiên trình duyệt, F5 sẽ mất đoạn chat. Job đã tạo vẫn nằm trong danh sách.
- Để báo giá: nhắc "báo giá", hoặc dán email có chữ ký công ty (Tel, Attn, Thanks…), hoặc đính kèm PDF bản vẽ.

Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng. Dùng **in đậm** cho từ khóa quan trọng. Không dùng markdown code block trong câu trả lời.`;

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
        { role: "user", parts: [{ text: SYSTEM_VI }] },
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
