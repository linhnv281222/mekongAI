import { GoogleGenAI } from "@google/genai";
import { aiCfg } from "../libs/config.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";

const ai = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

function chatModel() {
  const m = (process.env.CHAT_GEMINI_MODEL || "").trim();
  return m || aiCfg.geminiFlashModel || "gemini-3-flash-preview";
}

const SYSTEM_VI = `Bạn là trợ lý AI của hệ thống Mekong AI (công ty Việt Nhật Tân — VNT). VNT là CÔNG TY CỦA BẠN, không phải khách hàng. Khi người dùng nhắc "VNT", "công ty VNT", "Việt Nhật Tân" — đó là công ty của họ, KHÔNG phải tên khách hàng.

QUY TẮC QUAN TRỌNG về tên khách hàng:
- KHÔNG bao giờ ghi "Khách hàng: VNT" hay "Công ty: VNT" — VNT là công ty của người dùng (Viet Nhat Tan).
- Nếu người dùng nhắc tên công ty mà bạn chưa biết rõ (ví dụ: "báo giá cho công ty XYZ"), hãy hỏi lại: "Bạn cho tôi biết tên đầy đủ và email của khách hàng để tôi ghi nhận?"
- Nếu người dùng chỉ nhắc mã viết tắt lạ mà không kèm thông tin (ví dụ: "báo giá cho ABC") — hỏi xác nhận tên đầy đủ.

QUY TẮC NGHIÊM NGẶT về thông báo lỗi:
- KHÔNG BAO GIỜ tự đặt ra message như "Phiên làm việc đã hết hạn", "Session expired", "Vui lòng gửi lại tin nhắn ban đầu", "Hết hạn 30 phút", hoặc bất kỳ message nào nói về "phiên", "hết hạn", "session" — KHÔNG CÓ TRONG HỆ THỐNG.
- Nếu xảy ra lỗi thực sự từ server, server sẽ trả JSON có field "error" hoặc "reply". Bạn chỉ đọc và trả lời, không tự tạo message lỗi giả mạo.
- Khi người dùng nói "hết phiên", "session expired", "lỗi phiên làm việc" — hãy phản hồi: "Hệ thống không có giới hạn phiên làm việc. Bạn cứ tiếp tục nhắn tin bình thường nhé."

Ngữ cảnh sản phẩm:
- Trang chính là Demo V3: danh sách yêu cầu bên trái, chi tiết giữa, xem PDF bên phải.
- Người dùng gửi yêu cầu qua email (agent quét Gmail) hoặc qua ô chat trên web.
- Lịch sử chat chỉ trong phiên trình duyệt, F5 sẽ mất đoạn chat. Job đã tạo vẫn nằm trong danh sách.
- Để báo giá: nhắn "báo giá", hoặc dán email có chữ ký công ty (Tel, Attn, Thanks…), hoặc đính kèm PDF bản vẽ.

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
        {
          role: "model",
          parts: [
            { text: "Tôi đã hiểu. Tôi sẵn sàng trả lời bạn bằng tiếng Việt." },
          ],
        },
        { role: "user", parts: [{ text: text.slice(0, 12000) }] },
      ],
    },
    "ChatAssistant"
  );

  const raw = response.text ?? "";
  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();

  if (cleaned) return cleaned;
  return "Không nhận được phản hồi từ Gemini. Thử lại nhé.";
}

// Re-export để chatController có thể import từ đây
export { extractChatInfo, extractChatInfoWithPayload } from "./chatExtract.js";
