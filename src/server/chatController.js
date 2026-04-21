import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { postPdfToDrawingsApi } from "../libs/postDrawingUpload.js";
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
      cb(new Error("Chi chap nhan PDF hoac anh (jpg/png/webp/bmp)"), false);
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ─── GOI API DOC BAN VE ─────────────────────────────────────────────────────
async function analyzeDrawingApi(pdfPath, filename) {
  return postPdfToDrawingsApi({
    pdfPath,
    filename,
    baseUrl: agentCfg.banveApiUrl,
    provider: "gemini",
  });
}

// ─── TAO JOB ID ─────────────────────────────────────────────────────────────

function makeJobId() {
  return (
    "chat_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 6)
  );
}

// ─── SCHEMA FORM RFQ ──────────────────────────────────────────────────────────

/** Cac truong thong tin can thu thap khi tao bao gia tu chat */
const RFQ_FORM_FIELDS = [
  { key: "ma_khach_hang", label: "Mã khách hàng", type: "text", placeholder: "VD: CUST-001" },
  { key: "ten_cong_ty", label: "Tên công ty khách hàng", type: "text", placeholder: "VD: ABC Precision Co., Ltd", required: true },
  { key: "nguoi_lien_he", label: "Người liên hệ", type: "text", placeholder: "VD: Tanaka Yamada" },
  { key: "email", label: "Email liên hệ", type: "email", placeholder: "VD: tanaka@abc.co.jp" },
  { key: "co_vat", label: "Có VAT không?", type: "select", options: ["Có", "Không"], required: true },
  { key: "xu_ly_be_mat", label: "Có xử lý bề mặt không?", type: "select", options: ["Có", "Không"], required: true },
  {
    key: "so_luong_theo_ve",
    label: "Số lượng theo bản vẽ?",
    type: "select",
    options: ["Theo bản vẽ", "Khác"],
    required: true,
  },
  { key: "so_luong_khac", label: "Số lượng khác (nếu khác bản vẽ)", type: "number", placeholder: "VD: 50" },
  { key: "co_van_chuyen", label: "Có vận chuyển không?", type: "select", options: ["Có", "Không"], required: true },
  { key: "ghi_chu_noi_bo", label: "Ghi chú nội bộ", type: "textarea", placeholder: "Ghi chú chỉ hiển thị trong hệ thống..." },
];

/** Luu tam ket qua phan tich ban ve giua 2 buoc: { jobId -> { drawings, fileErrors, message } } */
const pendingRfqs = new Map();

function setPendingRfq(jobId, data) {
  pendingRfqs.set(jobId, { ...data, createdAt: Date.now() });
  setTimeout(() => pendingRfqs.delete(jobId), 30 * 60 * 1000);
}

function getPendingRfq(jobId) {
  return pendingRfqs.get(jobId) || null;
}

// ─── PHAT HIEN LOAI TINH NANG ─────────────────────────────────────────────

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
  return hasKeyword || hasFiles;
}

// ─── PHAN TICH FILE (dung chung cho ca 2 luong) ─────────────────────────────

/**
 * Phan tich file PDF, tra ve { drawings, fileErrors }.
 * @param {Array<{path: string, originalname: string}>} files
 * @param {string} jobId
 */
async function analyzeFilesForJob(files, jobId) {
  const allResults = [];
  const fileErrors = [];

  for (const file of files) {
    if (!file.path) continue;

    // file.path = uploads/{jobId}_{safeName}.pdf (already has full safe filename)
    // basename already includes the extension (.pdf) — do NOT append ext again
    const safeBasename = path.basename(file.path);
    const archivePath = path.join(UPLOADS_DIR, `chat_${jobId}_${safeBasename}`);
    try {
      fs.copyFileSync(file.path, archivePath);
    } catch (e) {
      // archive khong critical
    }

    const extLower = file.originalname.toLowerCase();

    if (extLower.endsWith(".pdf")) {
      // safeBasename already has the extension — use directly
      const safeFileName = safeBasename;
      let pages;
      try {
        pages = await splitPdf(fs.readFileSync(file.path), safeFileName);
      } catch (e) {
        const tmpPath = path.join(
          UPLOADS_DIR,
          "chat_full_" + Date.now() + "_" + safeFileName
        );
        fs.writeFileSync(tmpPath, fs.readFileSync(file.path));
        pages = [{ path: tmpPath, page: 1, name: safeFileName, total: 1 }];
      }

      for (const pg of pages) {
        try {
          const result = await analyzeDrawingApi(pg.path, pg.name);
          const flat = normalizeDrawingToFlat(result.data);

          if (!drawingHasMinimalData(flat)) {
            console.log(
              "[ChatBaoGia] Trang " + pg.page + " khong co du lieu -> bo qua"
            );
            continue;
          }

          allResults.push({
            ...result,
            data: flat,
            filename: safeFileName,
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
            "[ChatBaoGia] Loi trang " + pg.page + " (" + pg.name + "): " + msg
          );
          fileErrors.push(safeFileName + " trang " + pg.page + ": " + msg);
        } finally {
          fs.unlink(pg.path, () => {});
        }
      }
    } else {
      fileErrors.push(
        file.originalname +
          ": định dạng ảnh chưa được hỗ trợ phân tích. Vui lòng gửi file PDF."
      );
    }

    // NOTE: Do NOT delete file.path — the preview endpoint looks for it at this exact path.
  }

  return { allResults, fileErrors };
}

// ─── STEP 1: Phan tich ban ve + tra form ───────────────────────────────────

async function handleBaoGiaChat(message, files, jobId) {
  const { allResults, fileErrors } = await analyzeFilesForJob(files, jobId);

  // Tao reply tra ve cho user
  let reply = "";

  if (allResults.length > 0) {
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
    reply += "\n";
  }

  if (fileErrors.length > 0) {
    reply += "Một số file không phân tích được:\n" + fileErrors.join("\n") + "\n\n";
  }

  reply += "Bạn hãy điền đầy đủ thông tin để hoàn tất yêu cầu báo giá nhé:";

  // Luu tam de buoc 2 su dung
  setPendingRfq(jobId, {
    drawings: allResults,
    fileErrors,
    message: message || "",
  });

  // Tra ve response co form
  return {
    isBotReply: true,
    reply,
    step: 2,
    job_id: jobId,
    drawings_count: allResults.length,
    rfq_form: RFQ_FORM_FIELDS,
    drawings_summary: allResults.map((r) => ({
      filename: r.filename,
      page: r.page,
      data: r.data,
    })),
  };
}

// ─── STEP 2: Nhan form da dien + tao job ──────────────────────────────────

async function handleRfqFormSubmission(jobId, formData, files) {
  const pending = getPendingRfq(jobId);

  // Lay drawings tu pending (buoc 1 da phan tich), hoac phan tich truc tiep neu co file
  let allResults = [];
  let fileErrors = [];
  const message = pending?.message || "";

  if (pending && pending.drawings && pending.drawings.length > 0) {
    // Co pending -> dung drawings tu buoc 1
    allResults = pending.drawings;
    fileErrors = pending.fileErrors || [];
  } else if (files && files.length > 0) {
    // Khong co pending nhung co file -> phan tich ngay
    console.log("[ChatRfq] Khong co pending, phan tich " + files.length + " file truc tiep...");
    const analyzed = await analyzeFilesForJob(files, jobId);
    allResults = analyzed.allResults;
    fileErrors = analyzed.fileErrors;
  }

  const parsed = typeof formData === "string" ? JSON.parse(formData) : formData;

  // Lay thong tin tu form
  const tenCongTy = parsed.ten_cong_ty || "";
  const nguoiLienHe = parsed.nguoi_lien_he || "";
  const email = parsed.email || "";
  const maKhachHang = parsed.ma_khach_hang || "";
  const coVat = parsed.co_vat || "Không";
  const xuLyBeMat = parsed.xu_ly_be_mat || "Không";
  const slTheoVe = parsed.so_luong_theo_ve || "Theo bản vẽ";
  const slKhac = parsed.so_luong_khac || null;
  const coVanChuyen = parsed.co_van_chuyen || "Không";
  const ghiChuNoiBo = parsed.ghi_chu_noi_bo || "";

  // Validate
  if (!tenCongTy) {
    return {
      isBotReply: true,
      askClarify: true,
      step: 2,
      job_id: jobId,
      rfq_form: RFQ_FORM_FIELDS,
      reply: "Vui lòng điền **Tên công ty khách hàng** để hoàn tất yêu cầu.",
    };
  }

  // Tao job
  const jobData = {
    id: jobId,
    gmail_id: jobId,
    subject: message
      ? message.slice(0, 80).replace(/\n/g, " ").trim() || "Chat báo giá"
      : "Chat báo giá",
    sender: tenCongTy,
    sender_email: email,
    sender_name: nguoiLienHe,
    sender_company: tenCongTy,
    classify: "rfq",
    ngon_ngu: "vi",
    classify_output: {
      loai: "rfq",
      ngon_ngu: "vi",
      ten_cong_ty: tenCongTy,
      ly_do: "Chat bot báo giá (form)",
    },
    xu_ly_be_mat: xuLyBeMat === "Có",
    vat_lieu_chung_nhan: coVat === "Có",
    ten_cong_ty: tenCongTy,
    ma_khach_hang: maKhachHang,
    ghi_chu: ghiChuNoiBo || "",
    so_luong_khac: slKhac ? Number(slKhac) : null,
    co_van_chuyen: coVanChuyen === "Có",
    attachments: (files || []).map((f) => ({
      // Use the actual safe filename from the file on disk, not f.originalname
      // (originalname may be corrupt due to CJK encoding in multipart HTTP)
      name: path.basename(f.path),
      source: "chat",
    })),
    drawings: allResults,
    status: "pending_review",
    created_at: Date.now(),
    source: "chat",
    drawing_ai_payload:
      allResults.length > 0
        ? allResults.map((r) => r.request_payload).filter(Boolean)
        : null,
  };

  await saveJob(jobData);

  // Xoa tam sau khi luu thanh cong
  pendingRfqs.delete(jobId);

  // Tao phan hoi
  let reply = "Đã tạo yêu cầu báo giá thành công!\n\n";
  reply += "**Thông tin yêu cầu:**\n";
  if (maKhachHang) reply += "- Mã KH: " + maKhachHang + "\n";
  reply += "- Công ty: " + tenCongTy + "\n";
  if (nguoiLienHe) reply += "- Người LH: " + nguoiLienHe + "\n";
  if (email) reply += "- Email: " + email + "\n";
  reply += "- VAT: " + coVat + "\n";
  reply += "- XLBM: " + xuLyBeMat + "\n";
  reply += "- Số lượng: " + (slTheoVe === "Khác" && slKhac ? slKhac : slTheoVe) + "\n";
  reply += "- Vận chuyển: " + coVanChuyen + "\n";

  if (allResults.length > 0) {
    reply += "\n**Bản vẽ đã phân tích (" + allResults.length + "):**\n";
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
  }

  reply += "\nJob **" + jobId + "** đã được tạo. Xem tại **Demo V3**.";

  if (fileErrors && fileErrors.length > 0) {
    reply += "\n\nMột số file không phân tích được:\n" + fileErrors.join("\n");
  }

  return {
    isBotReply: true,
    reply,
    job_id: jobId,
    drawings_count: allResults.length,
    step: "done",
  };
}

// ─── XU LY CHAT THUONG ────────────────────────────────────────────────────

async function handleNormalChat(message) {
  try {
    const reply = await chatAssistantReply(message || "");
    return { isBotReply: true, ai: true, reply };
  } catch (e) {
    const errMsg = e?.message || String(e);
    let reply;
    if (!aiCfg.geminiKey || /GEMINI_API_KEY chua duoc cau hinh/i.test(errMsg)) {
      reply =
        "Hiện gọi AI không thành công. Kiểm tra GEMINI_API_KEY trong file .env và khởi động lại server.\n" +
        "Bạn vẫn có thể dán nội dung email báo giá hoặc đính kèm file PDF để tạo job.";
    } else if (/got status:\s*503|high demand|UNAVAILABLE/i.test(errMsg)) {
      reply =
        "Máy chủ Gemini đang quá tải (503). Vui lòng thử lại sau vài phút.\n" +
        "Bạn vẫn có thể dùng báo giá qua email hoặc đính kèm PDF.";
    } else {
      reply =
        "Không gọi được AI lúc này. Chi tiết: " +
        errMsg.slice(0, 400) +
        (errMsg.length > 400 ? "..." : "");
    }
    return { isBotReply: true, ai: false, reply };
  }
}

// ─── POST /chat/message ──────────────────────────────────────────────────────

router.post("/message", chatUpload.array("files", 20), async (req, res) => {
  const message = req.body.message || req.body.text || "";
  const files = req.files || [];
  const senderEmail = req.body.email || req.body.sender || "";
  const jobId = req.body.job_id || makeJobId();
  const rfqFormData = req.body.rfq_form_data;

  console.log(
    '[ChatController] "' +
      message.slice(0, 80) +
      '" | files=' +
      files.length +
      " | job_id=" +
      jobId +
      (rfqFormData ? " | RFQ_FORM_SUBMIT" : "")
  );

  // Doi ten file tu multer -> {jobId}_{safeHash}.pdf (hash avoids CJK corruption in originalname)
  for (const file of files) {
    if (!file.path) continue;
    // Compute hash from first 64KB of file to get a stable safe ASCII name
    const buf = fs.readFileSync(file.path);
    const chunk = buf.slice(0, 65536);
    const hash = crypto.createHash('sha256').update(chunk).digest('hex').slice(0, 16);
    const ext = (file.originalname || '.pdf').slice((file.originalname || '.pdf').lastIndexOf('.'));
    const safeFileName = hash + ext;
    const newPath = path.join(UPLOADS_DIR, jobId + "_" + safeFileName);
    try {
      if (file.path !== newPath) {
        fs.renameSync(file.path, newPath);
        file.path = newPath;
        file.destination = UPLOADS_DIR;
      }
    } catch (e) {
      fs.writeFileSync(newPath, buf);
      fs.unlinkSync(file.path);
      file.path = newPath;
      file.destination = UPLOADS_DIR;
    }
  }

  try {
    // Step 2: Form submission
    if (rfqFormData) {
      const result = await handleRfqFormSubmission(jobId, rfqFormData, files);
      return res.json(result);
    }

    // Step 1: Normal chat hoac bao gia (phan tich ban ve + tra form)
    const intent = isBaoGiaIntent(message, files);

    if (!intent) {
      const result = await handleNormalChat(message);
      return res.json(result);
    }

    // Bao gia: phan tich + tra form
    const result = await handleBaoGiaChat(message, files, jobId);
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
    message: "Lịch sử chat chỉ trong phiên hiện tại, không được lưu trữ.",
  });
});

export default router;
