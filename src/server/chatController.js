import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { postPdfToDrawingsApi } from "../libs/postDrawingUpload.js";
import { enrichWithF7F8 } from "../processors/processRouter.js";
import { splitPdf } from "../processors/pdfSplitter.js";
import {
  drawingHasMinimalData,
  normalizeDrawingToFlat,
} from "../libs/drawingNormalize.js";
import { agentCfg, aiCfg } from "../libs/config.js";
import { saveJob } from "../data/jobStore.js";
import { chatAssistantReply } from "../ai/chatAssistant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const UPLOADS_DIR = path.join(PROJECT_ROOT, "uploads");

const router = express.Router();

// ─── MULTER: upload file chat (100MB/file) ────────────────────────────────────

const chatUpload = multer({
  dest: UPLOADS_DIR,
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
    ];
    const ext = file.originalname.toLowerCase();
    const isAllowed =
      allowed.includes(file.mimetype) ||
      ext.endsWith(".pdf") ||
      ext.endsWith(".jpg") ||
      ext.endsWith(".jpeg") ||
      ext.endsWith(".png") ||
      ext.endsWith(".webp") ||
      ext.endsWith(".bmp");
    if (!isAllowed) {
      cb(new Error("Chỉ chấp nhận PDF hoặc ảnh (jpg/png/webp/bmp)"), false);
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// ─── GỌI API ĐỌC BẢN VẼ (tái sử dụng từ emailAgent) ───────────────────────

async function analyzeDrawingApi(pdfPath, filename) {
  return postPdfToDrawingsApi({
    pdfPath,
    filename,
    baseUrl: agentCfg.banveApiUrl,
    provider: "gemini",
  });
}

// ─── TẠO JOB ID ─────────────────────────────────────────────────────────────

function makeJobId() {
  return "chat_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
}

// ─── PHÁT HIỆN LOẠI TÍNH NĂNG ─────────────────────────────────────────────

const BAO_GIA_KEYWORDS = [
  "báo giá", "báo_giá", "bao gia", "bao_giá",
  "报价", "見積", "見積書",
  "quote", "quotation", "报价单",
  "rfq", "request for quote",
  "ценовое предложение",
];

function isBaoGiaIntent(message, files) {
  const text = (message || "").toLowerCase();
  const hasKeyword = BAO_GIA_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
  const hasFiles = Array.isArray(files) && files.length > 0;
  const hasEmailSig = detectEmailSignature(message || "");
  return hasKeyword || hasFiles || hasEmailSig;
}

// ─── PHÁT HIỆN CHỮ KÝ EMAIL ────────────────────────────────────────────────

function detectEmailSignature(text) {
  if (!text || text.length < 60) return false;
  const hasCompany =
    /PRECISION\s+MECHANICAL|CO\.,?\s*LTD|COMPANY\s+LIMITED|Ky Thuat|I\.T|I.T|Vietnam|HCM\s+HN|SG\s+700000|SGN|HANOI/i.test(
      text
    );
  const hasContact = /\b(Tel|Fax|Mobile|HP)\s*[:.]/i.test(text);
  const hasContactWord = /\b(Thanks|Best Regards|Trân trọng|Kính gửi)/i.test(text);
  return hasCompany && (hasContact || hasContactWord);
}

// ─── TRÍCH XUẤT THÔNG TIN TỪ NỘI DUNG EMAIL ─────────────────────────────────

function parseEmailContent(text) {
  const result = {
    ten_cong_ty: "",
    sender_name: "",
    sender_email: "",
    dien_thoai: "",
    noi_dung: "",
  };
  if (!text) return result;

  const lines = text.split("\n");
  for (const line of lines) {
    if (
      /PRECISION\s+MECHANICAL|CO\.,?\s*LTD|COMPANY\s+LIMITED|Ky Thuat|I\.T|I.T|Vietnam|HCM\s+HN|SG\s+700000|SGN|HANOI/i.test(
        line
      )
    ) {
      result.ten_cong_ty = line.trim();
      break;
    }
  }

  if (!result.ten_cong_ty) {
    const m = text.match(
      /([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯ][A-Za-z\s]+(?:PRECISION\s+MECHANICAL|CO\.?,?\s*LTD|COMPANY\s+LIMITED))/i
    );
    if (m) result.ten_cong_ty = m[1].trim();
  }

  const emailMatch = text.match(
    /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/
  );
  if (emailMatch) result.sender_email = emailMatch[0];

  for (const line of lines) {
    const attnM = line.match(/^Attn[s]?\s*[:.]?\s*(.+)/i);
    if (attnM) {
      const name = attnM[1].trim().split(/\s+/).slice(0, 3).join(" ");
      if (/^[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯ]/.test(name)) {
        result.sender_name = name;
        break;
      }
    }
  }

  const telMatch = text.match(/(?:Tel)\s*[:.]?\s*([+\d\s\-().]{6,20})/i);
  if (telMatch) result.dien_thoai = telMatch[1].trim();
  else {
    const mobileMatch = text.match(
      /(?:Mobile|HP)\s*[:.]?\s*([+\d\s\-().]{6,20})/i
    );
    if (mobileMatch) result.dien_thoai = mobileMatch[1].trim();
  }

  const sigSplit = text.split(
    /(?:Thanks and Best Regards|Trân trọng|Best Regards|Kính gửi)/i
  );
  result.noi_dung = sigSplit[0]
    ? sigSplit[0].trim().slice(0, 800)
    : text.slice(0, 800);

  return result;
}

// ─── XỬ LÝ CHAT THƯỜNG — gọi Gemini ───────────────────────────────────────

async function handleNormalChat(message) {
  try {
    const reply = await chatAssistantReply(message || "");
    return { isBotReply: true, ai: true, reply };
  } catch (e) {
    const errMsg = e?.message || String(e);
    console.error("[ChatAssistant] Lỗi:", errMsg);
    let reply;
    if (!aiCfg.geminiKey || /GEMINI_API_KEY chưa được cấu hình/i.test(errMsg)) {
      reply =
        "Hiện không gọi được AI. Kiểm tra GEMINI_API_KEY trong file .env và khởi động lại server.\n" +
        "Bạn vẫn có thể dán nội dung email báo giá hoặc đính kèm file PDF để tạo job.";
    } else if (/got status:\s*503|high demand|UNAVAILABLE/i.test(errMsg)) {
      reply =
        "Máy chủ Gemini đang quá tải (503). Vui lòng thử lại sau vài phút.\n" +
        "Bạn vẫn có thể dùng báo giá qua email hoặc đính kèm PDF.";
    } else {
      reply =
        "Không gọi được AI lúc này. Chi tiết: " +
        errMsg.slice(0, 400) +
        (errMsg.length > 400 ? "…" : "");
    }
    return { isBotReply: true, ai: false, reply };
  }
}

// ─── XỬ LÝ BÁO GIÁ ─────────────────────────────────────────────────────────

async function handleBaoGiaChat(message, files, senderEmail) {
  const allResults = [];
  const fileErrors = [];
  const emailInfo = parseEmailContent(message || "");

  // Xử lý từng file PDF
  for (const file of files) {
    if (!file.path) continue;

    const ext = file.originalname.toLowerCase();

    if (ext.endsWith(".pdf")) {
      let pages;
      try {
        pages = await splitPdf(
          fs.readFileSync(file.path),
          file.originalname
        );
      } catch (e) {
        const tmpPath = path.join(
          UPLOADS_DIR,
          "chat_full_" + Date.now() + "_" + file.originalname
        );
        fs.writeFileSync(tmpPath, fs.readFileSync(file.path));
        pages = [
          { path: tmpPath, page: 1, name: file.originalname, total: 1 },
        ];
      }

      for (const pg of pages) {
        try {
          const result = await analyzeDrawingApi(pg.path, pg.name);
          const flat = normalizeDrawingToFlat(result.data);

          if (!drawingHasMinimalData(flat)) {
            console.log(
              "[ChatBaoGia] Trang " +
                pg.page +
                " không có dữ liệu -> bỏ qua"
            );
            continue;
          }

          const enriched = enrichWithF7F8(flat);
          allResults.push({
            ...result,
            data: enriched,
            filename: file.originalname,
            page: pg.page,
          });

          console.log(
            "[ChatBaoGia] OK: " +
              enriched.ma_ban_ve +
              " | " +
              enriched.vat_lieu +
              " | SL:" +
              enriched.so_luong
          );
        } catch (e) {
          console.error(
            "[ChatBaoGia] Lỗi trang " +
              pg.page +
              " (" +
              pg.name +
              "): " +
              e.message
          );
          fileErrors.push(
            file.originalname + " trang " + pg.page + ": " + e.message
          );
        } finally {
          fs.unlink(pg.path, () => {});
        }
      }
    } else {
      fileErrors.push(
        file.originalname +
          ": Định dạng ảnh chưa được hỗ trợ phân tích. Vui lòng gửi file PDF."
      );
    }

    fs.unlink(file.path, () => {});
  }

  // Tạo job
  const jobId = makeJobId();
  const companyName = emailInfo.ten_cong_ty || senderEmail || "";
  const jobData = {
    id: jobId,
    gmail_id: "chat_" + jobId,
    subject: emailInfo.noi_dung
      ? emailInfo.noi_dung
          .slice(0, 80)
          .replaceAll("\n", " ")
          .trim() || "Chat báo giá"
      : "Chat báo giá",
    sender: companyName,
    sender_email: emailInfo.sender_email || senderEmail || "",
    sender_name: emailInfo.sender_name || "",
    sender_company: companyName,
    classify: "rfq",
    ngon_ngu: "vi",
    classify_output: {
      loai: "rfq",
      ngon_ngu: "vi",
      ten_cong_ty: companyName,
      ly_do: "Chat bot báo giá",
    },
    han_giao: null,
    hinh_thuc_giao: null,
    xu_ly_be_mat: null,
    vat_lieu_chung_nhan: null,
    ten_cong_ty: companyName,
    ghi_chu: (message || "").slice(0, 500),
    attachments: files.map((f) => ({
      name: f.originalname,
      source: "chat",
    })),
    drawings: allResults,
    status: "pending_review",
    created_at: Date.now(),
    source: "chat",
    email_info: emailInfo,
  };

  await saveJob(jobData);

  // Tạo phản hồi
  let reply = "";

  if (emailInfo.ten_cong_ty) {
    reply += "Công ty: " + emailInfo.ten_cong_ty + "\n";
  }
  if (emailInfo.sender_name) {
    reply += "Người liên hệ: " + emailInfo.sender_name + "\n";
  }
  if (emailInfo.sender_email) {
    reply += "Email: " + emailInfo.sender_email + "\n";
  }
  if (emailInfo.dien_thoai) {
    reply += "Điện thoại: " + emailInfo.dien_thoai + "\n";
  }

  if (allResults.length > 0) {
    if (reply) reply += "\n";
    reply += "Đã phân tích " + allResults.length + " bản vẽ:\n\n";
    const seen = new Set();
    for (const r of allResults) {
      const key = r.data?.ma_ban_ve;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      reply +=
        "- " +
        (r.data.ma_ban_ve || "?") +
        " | " +
        (r.data.vat_lieu || "?") +
        " | SL:" +
        (r.data.so_luong || "?") +
        " | QT:" +
        (r.data.ma_quy_trinh || "?") +
        "\n";
    }
    reply +=
      "\nJob " + jobId + " đã được tạo trong hệ thống. Xem tại DemoV3.";
  } else {
    reply +=
      "\nKhông tìm thấy bản vẽ PDF để phân tích.\n\n";
    reply +=
      "Đã ghi nhận thông tin báo giá từ nội dung tin nhắn.\n";
    reply +=
      "Job " +
      jobId +
      " đã được tạo. Đính kèm file PDF bản vẽ để phân tích chi tiết.";
  }

  if (fileErrors.length > 0) {
    reply += "\n\nMột số file không phân tích được:\n" + fileErrors.join("\n");
  }

  return {
    isBotReply: true,
    reply,
    job_id: jobId,
    drawings_count: allResults.length,
  };
}

// ─── POST /chat/message ──────────────────────────────────────────────────────

router.post(
  "/message",
  chatUpload.array("files", 20),
  async (req, res) => {
    const message = req.body.message || req.body.text || "";
    const files = req.files || [];
    const senderEmail = req.body.email || req.body.sender || "";

    console.log(
      "[ChatController] \"" +
        message.slice(0, 80) +
        "\" | files=" +
        files.length
    );

    try {
      const intent = isBaoGiaIntent(message, files);

      // Không phải báo giá -> gọi AI
      if (!intent) {
        const result = await handleNormalChat(message);
        return res.json(result);
      }

      // Có intent báo giá -> phân tích
      const result = await handleBaoGiaChat(message, files, senderEmail);
      return res.json(result);
    } catch (e) {
      console.error("[ChatController] EXCEPTION:", e.message);
      res.status(500).json({
        error: e.message,
        isBotReply: true,
        reply: "Đã xảy ra lỗi khi xử lý. Vui lòng thử lại.",
      });
    }
  }
);

// ─── GET /chat/history ──────────────────────────────────────────────────────

router.get("/history", (req, res) => {
  res.json({
    history: [],
    message: "Chat history chỉ trong phiên hiện tại, không được lưu trữ.",
  });
});

export default router;
