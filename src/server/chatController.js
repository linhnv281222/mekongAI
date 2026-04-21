import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { postPdfToDrawingsApi } from "../libs/postDrawingUpload.js";
import { splitPdf } from "../processors/pdfSplitter.js";
import {
  drawingHasMinimalData,
  normalizeDrawingToFlat,
} from "../libs/drawingNormalize.js";
import { agentCfg, aiCfg } from "../libs/config.js";
import { saveJob } from "../data/jobStore.js";
import {
  chatAssistantReply,
  extractChatInfoWithPayload,
} from "../ai/chatAssistant.js";

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

// ── GỌI API ĐỌC BẢN VẼ (tái sử dụng từ emailAgent) ───────────────────────
async function analyzeDrawingApi(pdfPath, filename) {
  return postPdfToDrawingsApi({
    pdfPath,
    filename,
    baseUrl: agentCfg.banveApiUrl,
    provider: "gemini",
  });
}

function logChatUrl() {
  const url = `${agentCfg.banveApiUrl}/drawings?provider=gemini`;
}

// ─── TẠO JOB ID ─────────────────────────────────────────────────────────────

function makeJobId() {
  return (
    "chat_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 6)
  );
}

// ─── PHÁT HIỆN LOẠI TÍNH NĂNG ─────────────────────────────────────────────

const BAO_GIA_KEYWORDS = [
  "báo giá",
  "báo_giá",
  "bao gia",
  "bao_giá",
  "报价",
  "見積",
  "見積書",
  "quote",
  "quotation",
  "报价单",
  "rfq",
  "request for quote",
  "ценовое предложение",
];

function isBaoGiaIntent(message, files) {
  const text = (message || "").toLowerCase();
  const hasKeyword = BAO_GIA_KEYWORDS.some((kw) =>
    text.includes(kw.toLowerCase())
  );
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
  const hasContactWord = /\b(Thanks|Best Regards|Trân trọng|Kính gửi)/i.test(
    text
  );
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

  // ── 1. "khách hàng VNT", "customer ABC", "dành cho XYZ", "attn Mr X" — không cần separator ──
  // Pattern: keyword + tên công ty/người (tối thiểu 2 ký tự)
  const customerKeywordRe =
    /(?:^|[\s,])(?:khách?\s*hàng?|customer|client|dành\s+cho|to\s+company|for\s+company|attn|attention)\s+(.{2,60})/i;
  {
    const m = text.match(customerKeywordRe);
    if (m) {
      // Lấy phần tên — cắt ngắn ở newline hoặc nhiều khoảng trắng
      const candidate = m[1]
        .trim()
        .split(/[\n\r]+/)[0]
        .trim();
      if (candidate && candidate.length >= 2) {
        result.ten_cong_ty = candidate.slice(0, 80);
      }
    }
  }

  // ── 2. Trích từ chữ ký email công ty (pattern Nhật) ──
  if (!result.ten_cong_ty) {
    for (const line of lines) {
      if (
        /PRECISION\s+MECHANICAL|CO\.,?\s*LTD|COMPANY\s+LIMITED|Ky Thuat|I\.T|I.T|Vietnam|HCM\s+HN|SGN|HANOI/i.test(
          line
        )
      ) {
        result.ten_cong_ty = line.trim();
        break;
      }
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

async function handleBaoGiaChat(message, files, senderEmail, jobId) {
  const allResults = [];
  const fileErrors = [];

  // ── Lưu bản sao vĩnh viễn của mỗi file để preview sau này ──────────────
  for (const file of files) {
    if (!file.path) continue;
    try {
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext);
      // Pattern: chat_{jobId}_{baseName}.pdf  (dễ tìm từ jobController)
      const archiveName = `chat_${jobId}_${baseName}${ext}`;
      const archivePath = path.join(UPLOADS_DIR, archiveName);
      fs.copyFileSync(file.path, archivePath);
    } catch (e) {
      // archive không critical — bỏ qua nếu lỗi
    }
  }

  // ── Xử lý từng file PDF trước (chạy song song với AI extraction) ──
  logChatUrl(); // log URL thực tế đang dùng để debug
  const fileProcessPromise = (async () => {
    for (const file of files) {
      if (!file.path) continue;

      const ext = file.originalname.toLowerCase();

      if (ext.endsWith(".pdf")) {
        let pages;
        try {
          pages = await splitPdf(fs.readFileSync(file.path), file.originalname);
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
                "[ChatBaoGia] Trang " + pg.page + " không có dữ liệu -> bỏ qua"
              );
              continue;
            }

            allResults.push({
              ...result,
              data: flat,
              filename: file.originalname,
              page: pg.page,
            });

            console.log(
              "[ChatBaoGia] OK: " +
                flat.ma_ban_ve +
                " | " +
                flat.vat_lieu +
                " | SL:" +
                flat.so_luong
            );
          } catch (e) {
            const msg = e.message || String(e);
            console.error(
              "[ChatBaoGia] Lỗi trang " + pg.page + " (" + pg.name + "): " + msg
            );
            fileErrors.push(
              file.originalname + " trang " + pg.page + ": " + msg
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
  })();

  // ── Dùng AI trích xuất thông tin (prompt 'chat-classify' — chỉnh sửa được trong admin) ──
  let chatInfo = null;
  let classifyAiPayload = null;
  try {
    const extractResult = await extractChatInfoWithPayload(message || "");
    chatInfo = extractResult.data;
    classifyAiPayload = extractResult.request_payload;
  } catch (e) {
    console.warn("[ChatBaoGia] extractChatInfo failed:", e.message);
  }

  // Chờ file process xong
  await fileProcessPromise;

  // Fallback: regex cho email signature (khi AI thất bại)
  const emailInfo = parseEmailContent(message || "");

  // ── Validation: không có thông tin khách hàng và không có bản vẽ → hỏi lại ──
  const aiCompany =
    chatInfo && chatInfo.ten_cong_ty && chatInfo.ten_cong_ty !== "unknown"
      ? chatInfo.ten_cong_ty
      : "";
  const hasCustomer = !!(
    aiCompany ||
    emailInfo.ten_cong_ty ||
    emailInfo.sender_email ||
    emailInfo.sender_name
  );
  if (!hasCustomer && allResults.length === 0) {
    return {
      isBotReply: true,
      askClarify: true,
      reply:
        "Mình chưa có đủ thông tin để tạo báo giá. Bạn cho mình biết thêm:\n" +
        "- Tên công ty khách hàng là gì?\n" +
        "- Email liên hệ (nếu có)?\n" +
        "Hoặc dán nội dung email có chữ ký công ty / đính kèm file PDF bản vẽ nhé.",
    };
  }

  // Tạo job — ưu tiên AI extraction, fallback regex
  const companyName = aiCompany || emailInfo.ten_cong_ty || senderEmail || "";
  const jobData = {
    id: jobId,
    gmail_id: "chat_" + jobId,
    subject:
      chatInfo && chatInfo.loi_nhan && chatInfo.loi_nhan !== "unknown"
        ? chatInfo.loi_nhan.slice(0, 80)
        : emailInfo.noi_dung
        ? emailInfo.noi_dung.slice(0, 80).replaceAll("\n", " ").trim() ||
          "Chat báo giá"
        : "Chat báo giá",
    sender: companyName,
    sender_email:
      (chatInfo &&
      chatInfo.email_khach_hang &&
      chatInfo.email_khach_hang !== "unknown"
        ? chatInfo.email_khach_hang
        : emailInfo.sender_email) ||
      senderEmail ||
      "",
    sender_name:
      (chatInfo &&
      chatInfo.ten_nguoi_lien_he &&
      chatInfo.ten_nguoi_lien_he !== "unknown"
        ? chatInfo.ten_nguoi_lien_he
        : emailInfo.sender_name) || "",
    sender_company: companyName,
    classify: "rfq",
    ngon_ngu: (chatInfo && chatInfo.ngon_ngu) || emailInfo.ngon_ngu || "vi",
    classify_output: {
      loai: "rfq",
      ngon_ngu: (chatInfo && chatInfo.ngon_ngu) || "vi",
      ten_cong_ty: companyName,
      ly_do: "Chat bot báo giá",
      chat_info: chatInfo,
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
    chat_info: chatInfo,
    // AI Debug payloads
    classify_ai_payload: classifyAiPayload,
    drawing_ai_payload:
      allResults.length > 0
        ? allResults.map((r) => r.request_payload).filter(Boolean)
        : null,
  };

  await saveJob(jobData);

  // Tạo phản hồi
  let reply = "";

  if (companyName) {
    reply += "Công ty: " + companyName + "\n";
  }
  const senderName =
    chatInfo &&
    chatInfo.ten_nguoi_lien_he &&
    chatInfo.ten_nguoi_lien_he !== "unknown"
      ? chatInfo.ten_nguoi_lien_he
      : emailInfo.sender_name;
  if (senderName) {
    reply += "Người liên hệ: " + senderName + "\n";
  }
  const extractedEmail =
    chatInfo &&
    chatInfo.email_khach_hang &&
    chatInfo.email_khach_hang !== "unknown"
      ? chatInfo.email_khach_hang
      : emailInfo.sender_email;
  if (extractedEmail) {
    reply += "Email: " + extractedEmail + "\n";
  }
  if (emailInfo.dien_thoai) {
    reply += "Điện thoại: " + emailInfo.dien_thoai + "\n";
  }
  if (chatInfo && chatInfo.so_luong && chatInfo.so_luong !== "unknown") {
    reply += "Số lượng: " + chatInfo.so_luong + "\n";
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
        "\n";
    }
    reply += "\nJob " + jobId + " đã được tạo trong hệ thống. Xem tại DemoV3.";
  } else {
    reply += "\nKhông tìm thấy bản vẽ PDF để phân tích.\n\n";
    reply += "Đã ghi nhận thông tin báo giá từ nội dung tin nhắn.\n";
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

router.post("/message", chatUpload.array("files", 20), async (req, res) => {
  const message = req.body.message || req.body.text || "";
  const files = req.files || [];
  const senderEmail = req.body.email || req.body.sender || "";

  console.log(
    '[ChatController] "' + message.slice(0, 80) + '" | files=' + files.length
  );

  // Tạo jobId TRƯỚC xử lý để đặt tên file đúng pattern
  const jobId = makeJobId();

  // Đổi tên file từ multer → {jobId}_{originalName} để jobController tìm được khi preview
  for (const file of files) {
    if (!file.path) continue;
    // file.originalname đã có đuôi (.pdf), dùng trực tiếp làm safeName
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    const newPath = path.join(UPLOADS_DIR, jobId + "_" + safeName);
    try {
      fs.renameSync(file.path, newPath);
      file.path = newPath;
      file.destination = UPLOADS_DIR;
    } catch (e) {
      // Nếu rename thất bại (file đang dùng), copy rồi xóa gốc
      fs.copyFileSync(file.path, newPath);
      fs.unlinkSync(file.path);
      file.path = newPath;
      file.destination = UPLOADS_DIR;
    }
  }

  try {
    const intent = isBaoGiaIntent(message, files);

    // Không phải báo giá -> gọi AI
    if (!intent) {
      const result = await handleNormalChat(message);
      return res.json(result);
    }

    // Có intent báo giá -> phân tích
    const result = await handleBaoGiaChat(message, files, senderEmail, jobId);
    return res.json(result);
  } catch (e) {
    console.error("[ChatController] EXCEPTION:", e.message);
    res.status(500).json({
      error: e.message,
      isBotReply: true,
      reply: "Đã xảy ra lỗi khi xử lý. Vui lòng thử lại.",
    });
  }
});

// ─── GET /chat/history ──────────────────────────────────────────────────────

router.get("/history", (req, res) => {
  res.json({
    history: [],
    message: "Chat history chỉ trong phiên hiện tại, không được lưu trữ.",
  });
});

export default router;
