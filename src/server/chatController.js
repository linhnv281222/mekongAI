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
import { GoogleGenAI } from "@google/genai";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";
import { getPrompt, getKnowledgeBlock } from "../prompts/promptStore.js";
import { saveJob } from "../data/jobStore.js";
import { chatAssistantReply } from "../ai/chatExtract.js";
import { loadAiConfig } from "../ai/aiConfig.js";
import { callClaudeWithRetry } from "../ai/claudeRetry.js";
import { addSseClient, removeSseClient, emitSseEvent, ensureCleanup } from "./sseManager.mjs";

/** Extract JSON — thử parse trực tiếp, thất bại thì tìm balanced { ... } trong text */
function extractJson(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}

  const objMatch = findBalancedBraces(cleaned, '{', '}');
  if (objMatch) {
    try { return JSON.parse(objMatch); } catch {}
  }
  const arrMatch = findBalancedBraces(cleaned, '[', ']');
  if (arrMatch) {
    try { return JSON.parse(arrMatch); } catch {}
  }
  throw new Error("Không thể extract JSON from response");
}

/** Tìm text con bắt đầu bởi openChar và kết thúc bởi closeChar (đã cân bằng) */
function findBalancedBraces(text, openChar, closeChar) {
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === openChar) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === openChar) depth++;
    else if (ch === closeChar) depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

const chatAi = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

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
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ─── GỌI API ĐỌC BẢN VẼ ─────────────────────────────────────────────────────
async function analyzeDrawingApi(pdfPath, filename, emailContext = null) {
  const { provider } = loadAiConfig();
  return postPdfToDrawingsApi({
    pdfPath,
    filename,
    baseUrl: agentCfg.banveApiUrl,
    provider,
    emailContext,
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
  { key: "co_van_chuyen", label: "Có vận chuyển không?", type: "select", options: ["Có", "Không"], required: true },
  { key: "ghi_chu_noi_bo", label: "Ghi chú nội bộ", type: "textarea", placeholder: "Ghi chú chỉ hiển thị trong hệ thống..." },
];

/** Lưu tạm kết quả phân tích bản vẽ giữa 2 bước: { jobId -> { drawings, fileErrors, message } } */
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

// ─── PHÂN TÍCH FILE (dùng chung cho cả 2 luồng) ─────────────────────────────

/**
 * Xây dựng chuỗi context từ chat message để truyền vào Gemini drawing analysis.
 * Gemini sẽ ưu tiên: nội dung chat > bản vẽ.
 */
async function buildChatContext(chatMessage) {
  const text = (chatMessage || "").trim();
  if (!text) return "";
  return `[NỘI DUNG CHAT]\n${text.slice(0, 3000)}`;
}

/**
 * Chuẩn hóa kết quả từ chat-classify: fix lỗi AI thường gặp và build chat_luu_y
 * từ so_luong khi AI không trả đúng.
 */
function normalizeChatInfo(chatInfo) {
  if (!chatInfo || typeof chatInfo !== "object") return null;

  // Fix lỗi chính tả: "so_luang" → "so_luong"
  let soLuong = chatInfo.so_luong ?? chatInfo.so_luang ?? null;

  // Chuan hoa so_luong
  if (typeof soLuong === "string") {
    soLuong = soLuong.trim();
    if (!soLuong) soLuong = null;
  }

  // Nếu so_luong là "unknown" → null để tránh logic
  if (soLuong === "unknown" || soLuong === "Unknown") {
    soLuong = null;
  }

  // Build chat_luu_y: ưu tiên AI trả, fallback từ so_luong
  let chatLuuY = chatInfo.chat_luu_y ?? null;

  // Loc cac gia tri vô nghĩa mà AI hay trả nhầm
  const invalidValues = ["无", "无内容", "none", "none.", "không có", "n/a", "null", ""];
  const isInvalid = (v) => !v || invalidValues.includes(String(v).toLowerCase().trim());

  if (isInvalid(chatLuuY) && soLuong) {
    // Fallback: build từ so_luong
    if (String(soLuong).includes("(áp dụng cho tất cả)")) {
      const num = String(soLuong).replace(/\s*\(áp dụng cho tất cả\)/, "").trim();
      chatLuuY = `Số lượng từ chat: ${num} pcs — áp dụng cho TẤT CẢ các bản vẽ`;
    } else if (soLuong.includes(":")) {
      // dạng "MA1: 100 pcs, MA2: 50 pcs"
      chatLuuY = `Số lượng từ chat: ${soLuong} — mỗi mã có số lượng riêng`;
    } else {
      chatLuuY = `Số lượng từ chat: ${soLuong} pcs — áp dụng cho TẤT CẢ các bản vẽ`;
    }
  } else if (isInvalid(chatLuuY)) {
    chatLuuY = null;
  }

  return {
    ...chatInfo,
    so_luong: soLuong,
    chat_luu_y: chatLuuY,
  };
}

/**
 * Phân tích ghi chú nội bộ từ form chatbot — chỉ cần so_luong.
 * Reuse classifyChatMessage, chỉ lấy thông tin cần thiết.
 */
async function classifyGhiChuNoiBo(ghiChuNoiBo) {
  if (!ghiChuNoiBo?.trim()) return null;

  const raw = await classifyChatMessage(ghiChuNoiBo);
  if (!raw) return null;

  return normalizeChatInfo(raw);
}

/**
 * Build context cho Gemini drawing analyzer.
 * Chỉ chèn nội dung chat + chat_luu_y (AI đã suy luận rule trong prompt).
 * Gemini drawing prompt tự xử lý theo rule trong chat_luu_y.
 * @param {string|null} chatMessage
 * @param {object|null} chatInfo — kết quả classify (có thể có chat_luu_y)
 */
function buildChatContextForAnalyzer(chatMessage, chatInfo = null) {
  // Chuẩn hóa chatInfo: fix lỗi AI + build chat_luu_y fallback
  const info = normalizeChatInfo(chatInfo);

  const lines = [];

  if (chatMessage?.trim()) {
    lines.push(`[NỘI DUNG CHAT TỪ KHÁCH HÀNG]`);
    lines.push(chatMessage.trim().slice(0, 3000));
  }

  // Lưu ý từ chat — luôn có (được build từ normalizeChatInfo)
  if (info?.chat_luu_y) {
    lines.push("");
    lines.push(`[LƯU Ý TỪ PHÂN TÍCH CHAT — ÁP DỤNG CHO TẤT CẢ BẢN VẼ]`);
    lines.push(info.chat_luu_y);
  }

  if (info) {
    const parts = [];
    if (info.ten_cong_ty && info.ten_cong_ty !== "unknown") {
      parts.push(`Tên công ty: ${info.ten_cong_ty}`);
    }
    if (info.ten_nguoi_lien_he && info.ten_nguoi_lien_he !== "unknown") {
      parts.push(`Người liên hệ: ${info.ten_nguoi_lien_he}`);
    }
    if (info.email_khach_hang && info.email_khach_hang !== "unknown") {
      parts.push(`Email: ${info.email_khach_hang}`);
    }
    if (info.ngon_ngu && info.ngon_ngu !== "unknown") {
      parts.push(`Ngôn ngữ: ${info.ngon_ngu}`);
    }
    if (info.so_luong && info.so_luong !== "unknown") {
      parts.push(`Số lượng chung: ${info.so_luong}`);
    }
    if (parts.length > 0) {
      lines.push("");
      lines.push("[THÔNG TIN KHÁCH HÀNG TỪ CHAT]");
      lines.push(...parts);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

/**
 * Phân tích file PDF, trả về { drawings, fileErrors }.
 * @param {Array<{path: string, originalname: string}>} files
 * @param {string} jobId
 * @param {string|null} emailContext — chuỗi context đã build sẵn (từ buildChatContextForAnalyzer)
 * @param {object|null} chatInfoOverride — thông tin so_luong từ chat để override vào drawing
 */
/**
 * Process a single page: call AI, normalize, override quantity, check minimal data.
 * Returns null on failure.
 */
async function processPage(pg, safeFileName, emailContext, chatInfoOverride, jobId, pageIndex, totalPages) {
  console.log('[analyzeFilesForJob] Analyzing page: ' + pg.name + ' page=' + pg.page);
  if (jobId) {
    emitSseEvent(jobId, "progress", {
      phase: "analyzing",
      current: pageIndex + 1,
      total: totalPages,
      message: 'Đang phân tích trang ' + pg.page + '...',
    });
  }
  try {
    const result = await analyzeDrawingApi(pg.path, pg.name, emailContext);
    console.log('[analyzeFilesForJob] API result success=' + !!result.data);
    const flat = normalizeDrawingToFlat(result.data);

    if (chatInfoOverride) {
      const soLuong = chatInfoOverride.so_luong;
      if (soLuong && soLuong !== "unknown") {
        if (soLuong.includes(":")) {
          for (const [ma, sl] of Object.entries(chatInfoOverride.so_luong_theo_ma || {})) {
            if (flat.ma_ban_ve?.toLowerCase().includes(ma.toLowerCase())) {
              flat.so_luong = Number(sl);
              break;
            }
          }
        } else {
          flat.so_luong = Number(String(soLuong).replace(/\s*\(áp dụng cho tất cả\)/, "").trim());
        }
      }
    }

    if (!drawingHasMinimalData(flat)) {
      console.log("[ChatBaoGia] Trang " + pg.page + " không có dữ liệu -> bỏ qua");
      return { _done: true, _error: null };
    }

    console.log("[ChatBaoGia] OK: " + flat.ma_ban_ve + " | " + flat.vat_lieu + " | SL:" + flat.so_luong);
    return { _done: true, result: { ...result, data: flat, filename: safeFileName, page: pg.page, fileIndex: 0 } };
  } catch (e) {
    console.error('[analyzeFilesForJob] API error page=' + pg.page + ':', e.message);
    return { _done: true, _error: 'Trang ' + pg.page + ' (' + pg.name + '): ' + e.message };
  } finally {
    console.log('[analyzeFilesForJob] Unlinking: ' + pg.path);
    await new Promise(r => fs.unlink(pg.path, err => {
      if (err && err.code !== 'ENOENT') console.error('[analyzeFilesForJob] unlink err:', err.message);
      r();
    }));
  }
}

/**
 * Run tasks with limited concurrency (semaphore pattern).
 * @param {Function[]} tasks - Array of task functions
 * @param {number} limit - Max concurrent tasks
 * @param {string|null} jobId - Job ID for SSE progress events
 * @param {number} totalTasks - Total number of tasks for progress calculation
 */
async function runWithLimit(tasks, limit, jobId = null, totalTasks = 0) {
  const results = [];
  let completed = 0;
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn => fn()));
    completed += batchResults.length;
    results.push(...batchResults);
    if (jobId) {
      emitSseEvent(jobId, "progress", {
        phase: "analyzing",
        current: completed,
        total: totalTasks,
        message: 'Đã phân tích ' + completed + '/' + totalTasks + ' trang...',
      });
    }
    if (i + limit < tasks.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return results;
}

async function analyzeFilesForJob(files, jobId, emailContext = null, chatInfoOverride = null) {
  console.log('[analyzeFilesForJob] START files=' + files.length + ' jobId=' + jobId);
  const allResults = [];
  const fileErrors = [];

  for (const file of files) {
    if (!file.path) { console.log('[analyzeFilesForJob] skip file: no path'); continue; }

    console.log('[analyzeFilesForJob] Processing: ' + file.originalname);
    const extLower = file.originalname.toLowerCase();

    if (extLower.endsWith(".pdf")) {
      const safeFileName = path.basename(file.path);
      let pages;
      try {
        pages = await splitPdf(fs.readFileSync(file.path), safeFileName);
      } catch (e) {
        console.log('[analyzeFilesForJob] splitPdf failed: ' + e.message);
        const tmpPath = path.join(UPLOADS_DIR, "chat_full_" + Date.now() + "_" + safeFileName);
        fs.writeFileSync(tmpPath, fs.readFileSync(file.path));
        pages = [{ path: tmpPath, page: 1, name: safeFileName, total: 1 }];
      }
      console.log('[analyzeFilesForJob] PDF split into ' + pages.length + ' pages');

      const totalTasks = pages.length;
      const pageResults = await runWithLimit(
        pages.map((pg, idx) => () => processPage(pg, safeFileName, emailContext, chatInfoOverride, jobId, idx, totalTasks)),
        3,
        jobId,
        totalTasks
      );

      for (const r of pageResults) {
        if (!r || r._error) {
          if (r?._error) fileErrors.push(r._error);
          continue;
        }
        allResults.push(r.result);
      }
    } else {
      fileErrors.push(file.originalname + ": định dạng ảnh chưa được hỗ trợ phân tích. Vui lòng gửi file PDF.");
    }
  }

  console.log('[analyzeFilesForJob] DONE results=' + allResults.length + ' errors=' + fileErrors.length);
  return { allResults, fileErrors };
}

// ─── Phân tích chat trước khi xử lý bản vẽ ──────────────────────────────────

/**
 * Gọi AI phân tích tin nhắn chat để trích xuất so_luong, ten_kh, email...
 * Kết quả trả về: { so_luong, ten_cong_ty, email, ... } hoặc null nếu thất bại.
 */
async function classifyChatMessage(chatMessage) {
  if (!chatMessage?.trim()) return null;

  const { provider } = loadAiConfig();

  if (provider === "claude") {
    return classifyChatMessageClaude(chatMessage);
  }
  return classifyChatMessageGemini(chatMessage);
}

async function classifyChatMessageGemini(chatMessage) {
  if (!aiCfg.geminiKey) return null;

  try {
    const [materials, heatTreat, surface] = await Promise.all([
      getKnowledgeBlock("vnt-materials"),
      getKnowledgeBlock("vnt-heat-treat"),
      getKnowledgeBlock("vnt-surface"),
    ]);

    const promptText = await getPrompt("chat-classify", {
      chatMessage: chatMessage.trim(),
      MATERIAL: materials ?? "",
      HEAT_TREAT: heatTreat ?? "",
      SURFACE: surface ?? "",
    });

    const response = await generateContentWithRetry(
      chatAi,
      {
        model: aiCfg.geminiModel,
        contents: [
          {
            parts: [{ text: promptText }],
          },
        ],
      },
      "chat-classify"
    );

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = extractJson(raw);
    console.log("[chat-classify] Kết quả:", JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    console.error("[chat-classify] Lỗi phân tích:", e.message);
    return null;
  }
}

async function classifyChatMessageClaude(chatMessage) {
  if (!aiCfg.anthropicKey) return null;

  try {
    const [materials, heatTreat, surface] = await Promise.all([
      getKnowledgeBlock("vnt-materials"),
      getKnowledgeBlock("vnt-heat-treat"),
      getKnowledgeBlock("vnt-surface"),
    ]);

    const promptText = await getPrompt("chat-classify", {
      chatMessage: chatMessage.trim(),
      MATERIAL: materials ?? "",
      HEAT_TREAT: heatTreat ?? "",
      SURFACE: surface ?? "",
    });

    const { model } = loadAiConfig();
    const resolvedModel = (model && model.trim())
      ? model.trim()
      : process.env.ANTHROPIC_MODEL || aiCfg.anthropicModel || "claude-sonnet-4-6";

    const res = await callClaudeWithRetry({
      headers: {
        "Content-Type": "application/json",
        "x-api-key": aiCfg.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: resolvedModel,
        max_tokens: 5024,
        messages: [{ role: "user", content: promptText }],
      },
      logTag: "chat-classify",
    });

    if (!res.ok) {
      console.error("[chat-classify] Claude error:", res.error);
      return null;
    }

    const raw = res.data.content?.[0]?.text || "";
    const parsed = extractJson(raw);
    console.log("[chat-classify] Kết quả (Claude, attempt " + res.attempt + "):", JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    console.error("[chat-classify] Lỗi phân tích Claude:", e.message);
    return null;
  }
}

// ─── STEP 1: Phân tích bản vẽ + trả form (async) ───────────────────────────

/**
 * Fully async version — returns immediately, processes in background, emits SSE events.
 */
async function handleBaoGiaChatAsync(message, files, jobId) {
  let chatInfo = null;
  try {
    // Bước 0: Phân tích chat để trích xuất thông tin
    emitSseEvent(jobId, "progress", { phase: "classifying", current: 0, total: 0, message: "Đang phân tích yêu cầu..." });
    chatInfo = await classifyChatMessage(message);
    console.log("[handleBaoGiaChat] classify result:", JSON.stringify(chatInfo));

    const emailContext = buildChatContextForAnalyzer(message, chatInfo);
    const chatInfoNormalized = normalizeChatInfo(chatInfo);

    // Buoc 2: Phan tich cac file PDF (SSE progress emitted inside)
    const { allResults, fileErrors } = await analyzeFilesForJob(files, jobId, emailContext, chatInfoNormalized);

    // Build reply
    let reply = "";
    if (allResults.length > 0) {
      reply += "Đã phân tích " + allResults.length + " bản vẽ:\n\n";
      const seen = new Set();
      for (const r of allResults) {
        const key = r.data?.ma_ban_ve;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        reply += "- " + (r.data.ma_ban_ve || "?") + " | " + (r.data.vat_lieu || "?") + " | SL:" + (r.data.so_luong || "?") + "\n";
      }
      reply += "\n";
    }
    if (fileErrors.length > 0) {
      reply += "Một số file không phân tích được:\n" + fileErrors.join("\n") + "\n\n";
    }
    reply += "Bạn hãy điền đầy đủ thông tin để hoàn tất yêu cầu báo giá nhé:";

    // Lưu tạm để bước 2 sử dụng
    setPendingRfq(jobId, {
      drawings: allResults,
      fileErrors,
      message: message || "",
      chatInfo: chatInfo || null,
    });

    const result = {
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

    emitSseEvent(jobId, "done", { result, drawings_count: allResults.length, fileErrors });

  } catch (e) {
    console.error("[handleBaoGiaChat] EXCEPTION:", e.message);
    emitSseEvent(jobId, "error", { error: e.message });
  }
}

/**
 * Sync version — for demos that expect immediate response.
 * WARNING: may still cause 504 on slow connections.
 */
async function handleBaoGiaChat(message, files, jobId) {
  const chatInfo = await classifyChatMessage(message);
  console.log("[handleBaoGiaChat] classify result:", JSON.stringify(chatInfo));

  const emailContext = buildChatContextForAnalyzer(message, chatInfo);
  const chatInfoNormalized = normalizeChatInfo(chatInfo);

  const { allResults, fileErrors } = await analyzeFilesForJob(files, jobId, emailContext, chatInfoNormalized);

  let reply = "";
  if (allResults.length > 0) {
    reply += "Đã phân tích " + allResults.length + " bản vẽ:\n\n";
    const seen = new Set();
    for (const r of allResults) {
      const key = r.data?.ma_ban_ve;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      reply += "- " + (r.data.ma_ban_ve || "?") + " | " + (r.data.vat_lieu || "?") + " | SL:" + (r.data.so_luong || "?") + "\n";
    }
    reply += "\n";
  }
  if (fileErrors.length > 0) {
    reply += "Một số file không phân tích được:\n" + fileErrors.join("\n") + "\n\n";
  }
  reply += "Bạn hãy điền đầy đủ thông tin để hoàn tất yêu cầu báo giá nhé:";

  setPendingRfq(jobId, {
    drawings: allResults,
    fileErrors,
    message: message || "",
    chatInfo: chatInfo || null,
  });

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

// ─── STEP 2: Nhận form đã điền + tạo job (async version) ───────────────────

/**
 * Async version: returns immediately, emits SSE progress, then 'done'.
 * Used when files need analysis (no pending data).
 */
async function handleRfqFormSubmissionAsync(jobId, formData, files) {
  let allResults = [];
  let fileErrors = [];
  let ghiChuInfo = null;

  try {
    const parsed = typeof formData === "string" ? JSON.parse(formData) : formData;
    const ghiChuNoiBo = parsed.ghi_chu_noi_bo || "";

    // Step 1: Analyze files
    if (files && files.length > 0) {
      console.log("[ChatRfqAsync] Phân tích " + files.length + " file...");
      emitSseEvent(jobId, "progress", { phase: "analyzing", current: 0, total: files.length, message: "Đang phân tích file đính kèm..." });

      const analyzed = await analyzeFilesForJob(files, jobId, null, null);
      allResults = analyzed.allResults;
      fileErrors = analyzed.fileErrors;
    }

    // Step 2: Classify ghi chú nội bộ
    if (ghiChuNoiBo.trim()) {
      emitSseEvent(jobId, "progress", { phase: "classifying", current: 0, total: 0, message: "Đang phân tích ghi chú..." });
      ghiChuInfo = await classifyGhiChuNoiBo(ghiChuNoiBo);
      console.log("[ChatRfqAsync] Ghi chu classify:", JSON.stringify(ghiChuInfo));

      if (ghiChuInfo?.so_luong && ghiChuInfo.so_luong !== "unknown") {
        for (const r of allResults) {
          if (!r.data) continue;
          const soLuong = ghiChuInfo.so_luong;
          if (String(soLuong).includes(":")) {
            for (const [ma, sl] of Object.entries(ghiChuInfo.so_luong_theo_ma || {})) {
              if (r.data.ma_ban_ve?.toLowerCase().includes(ma.toLowerCase())) {
                r.data.so_luong = Number(sl);
                break;
              }
            }
          } else {
            r.data.so_luong = Number(String(soLuong).replace(/\s*\(áp dụng cho tất cả\)/, "").trim());
          }
        }
      }
    }

    const tenCongTy = parsed.ten_cong_ty || "";
    const nguoiLienHe = parsed.nguoi_lien_he || "";
    const email = parsed.email || "";
    const maKhachHang = parsed.ma_khach_hang || "";
    const coVat = parsed.co_vat || "Không";
    const xuLyBeMat = parsed.xu_ly_be_mat || "Không";
    const coVanChuyen = parsed.co_van_chuyen || "Không";

    if (!tenCongTy) {
      emitSseEvent(jobId, "done", {
        result: {
          isBotReply: true,
          askClarify: true,
          step: 2,
          job_id: jobId,
          rfq_form: RFQ_FORM_FIELDS,
          reply: "Vui lòng điền **Tên công ty khách hàng** để hoàn tất yêu cầu.",
        },
      });
      return;
    }

    // Save job
    const jobData = {
      id: jobId,
      gmail_id: jobId,
      subject: "Chat báo giá",
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
        ghi_chu_noi_bo: ghiChuInfo || null,
      },
      xu_ly_be_mat: xuLyBeMat === "Có",
      vat_lieu_chung_nhan: coVat === "Có",
      ten_cong_ty: tenCongTy,
      ma_khach_hang: maKhachHang,
      ghi_chu: ghiChuNoiBo || "",
      co_van_chuyen: coVanChuyen === "Có",
      attachments: (files || []).map((f) => ({ name: path.basename(f.path), source: "chat" })),
      drawings: allResults,
      status: "pending_review",
      created_at: Date.now(),
      source: "chat",
      drawing_ai_payload: allResults.length > 0 ? allResults.map((r) => r.request_payload).filter(Boolean) : null,
    };

    emitSseEvent(jobId, "progress", { phase: "saving", current: 0, total: 0, message: "Đang lưu yêu cầu..." });
    await saveJob(jobData);
    console.log('[ChatRfqAsync] Job saved OK, jobId:', jobId);

    // Build reply
    let reply = "Đã tạo yêu cầu báo giá thành công!\n\n";
    reply += "**Thông tin yêu cầu:**\n";
    if (maKhachHang) reply += "- Mã KH: " + maKhachHang + "\n";
    reply += "- Công ty: " + tenCongTy + "\n";
    if (nguoiLienHe) reply += "- Người LH: " + nguoiLienHe + "\n";
    if (email) reply += "- Email: " + email + "\n";
    reply += "- VAT: " + coVat + "\n";
    reply += "- XLBM: " + xuLyBeMat + "\n";
    reply += "- Vận chuyển: " + coVanChuyen + "\n";

    if (allResults.length > 0) {
      reply += "\n**Bản vẽ đã phân tích (" + allResults.length + "):**\n";
      const seen = new Set();
      for (const r of allResults) {
        const key = r.data?.ma_ban_ve;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        reply += "- " + (r.data.ma_ban_ve || "?") + " | " + (r.data.vat_lieu || "?") + " | SL:" + (r.data.so_luong || "?") + "\n";
      }
    }
    reply += "\nJob **" + jobId + "** đã được tạo. Xem tại **Demo V3**.";
    if (fileErrors.length > 0) {
      reply += "\n\nMột số file không phân tích được:\n" + fileErrors.join("\n");
    }

    emitSseEvent(jobId, "done", {
      result: { isBotReply: true, reply, job_id: jobId, drawings_count: allResults.length, step: "done" },
    });

  } catch (e) {
    console.error("[ChatRfqAsync] EXCEPTION:", e.message);
    emitSseEvent(jobId, "error", { error: e.message });
  }
}

// ─── STEP 2: Nhận form đã điền + tạo job ──────────────────────────────────

async function handleRfqFormSubmission(jobId, formData, files) {
  console.log('[ChatRfq] handleRfqFormSubmission START jobId=' + jobId);
  const pending = getPendingRfq(jobId);

  // Lấy drawings từ pending (bước 1 đã phân tích), hoặc phân tích trực tiếp nếu có file
  let allResults = [];
  let fileErrors = [];
  const message = pending?.message || "";

  if (pending && pending.drawings && pending.drawings.length > 0) {
    // Có pending -> dùng drawings từ bước 1
    allResults = pending.drawings;
    fileErrors = pending.fileErrors || [];
  } else if (files && files.length > 0) {
    // Không có pending nhưng có file -> phân tích ngay
    console.log("[ChatRfq] Không có pending, phân tích " + files.length + " file trực tiếp...");
    const analyzed = await analyzeFilesForJob(files, jobId, message || null);
    allResults = analyzed.allResults;
    fileErrors = analyzed.fileErrors;
  }

  const parsed = typeof formData === "string" ? JSON.parse(formData) : formData;

  // Lấy thông tin từ form
  const tenCongTy = parsed.ten_cong_ty || "";
  const nguoiLienHe = parsed.nguoi_lien_he || "";
  const email = parsed.email || "";
  const maKhachHang = parsed.ma_khach_hang || "";
  const coVat = parsed.co_vat || "Không";
  const xuLyBeMat = parsed.xu_ly_be_mat || "Không";
  const coVanChuyen = parsed.co_van_chuyen || "Không";
  const ghiChuNoiBo = parsed.ghi_chu_noi_bo || "";

  // Phân tích ghi chú nội bộ để trích xuất so_luong
  let ghiChuInfo = null;
  if (ghiChuNoiBo.trim()) {
    console.log("[ChatRfq] Phân tích ghi chú nội bộ:", ghiChuNoiBo.slice(0, 200));
    ghiChuInfo = await classifyGhiChuNoiBo(ghiChuNoiBo);
    console.log("[ChatRfq] Ghi chu classify:", JSON.stringify(ghiChuInfo));

    // Override so_luong lên drawings
    if (ghiChuInfo?.so_luong && ghiChuInfo.so_luong !== "unknown") {
      for (const r of allResults) {
        if (!r.data) continue;
        const soLuong = ghiChuInfo.so_luong;
        if (String(soLuong).includes(":")) {
          // dạng "MA1: 100, MA2: 50"
          for (const [ma, sl] of Object.entries(ghiChuInfo.so_luong_theo_ma || {})) {
            if (r.data.ma_ban_ve?.toLowerCase().includes(ma.toLowerCase())) {
              r.data.so_luong = Number(sl);
              break;
            }
          }
        } else {
          r.data.so_luong = Number(String(soLuong).replace(/\s*\(áp dụng cho tất cả\)/, "").trim());
        }
      }
      console.log("[ChatRfq] Override so_luong từ ghi chú:", ghiChuInfo.so_luong);
    }
  }

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
      ghi_chu_noi_bo: ghiChuInfo || null,
    },
    xu_ly_be_mat: xuLyBeMat === "Có",
    vat_lieu_chung_nhan: coVat === "Có",
    ten_cong_ty: tenCongTy,
    ma_khach_hang: maKhachHang,
    ghi_chu: ghiChuNoiBo || "",
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

  console.log('[ChatRfq] Saving job data, drawings count:', allResults.length);
  try {
    await saveJob(jobData);
    console.log('[ChatRfq] Job saved OK, jobId:', jobId);
  } catch(e) {
    console.error('[ChatRfq] saveJob FAILED:', e.message, e.stack?.split('\n').slice(0,3).join(' | '));
    throw e;
  }

  // Xóa tạm sau khi lưu thành công
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
    if (/GEMINI_API_KEY|ANTHROPIC_API_KEY|not set/i.test(errMsg)) {
      reply =
        "Hiện gọi AI không thành công. Kiểm tra API key trong file .env và khởi động lại server.\n" +
        "Bạn vẫn có thể dán nội dung email báo giá hoặc đính kèm file PDF để tạo job.";
    } else if (/got status:\s*503|high demand|UNAVAILABLE/i.test(errMsg)) {
      reply =
        "Máy chủ AI đang quá tải (503). Vui lòng thử lại sau vài phút.\n" +
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
      const pending = getPendingRfq(jobId);
      const hasFilesToAnalyze = files && files.length > 0;
      const noPendingData = !pending || !pending.drawings || pending.drawings.length === 0;

      // File analysis needed but no pending data -> must do async
      if (hasFilesToAnalyze && noPendingData) {
        ensureCleanup();
        emitSseEvent(jobId, "progress", { phase: "queued", current: 0, total: 0, message: "Đang phân tích file đính kèm..." });

        // Return immediately; frontend will wait via SSE
        res.json({
          isBotReply: true,
          reply: "Đang phân tích " + files.length + " file đính kèm. Bạn đợi một chút nhé...",
          step: "processing",
          job_id: jobId,
          drawings_count: 0,
        });

        handleRfqFormSubmissionAsync(jobId, rfqFormData, files).catch((e) => {
          console.error("[ChatController] handleRfqFormSubmissionAsync error:", e.message);
        });
        return;

      } else {
        // Normal: use pending data or no files needed -> synchronous
        const result = await handleRfqFormSubmission(jobId, rfqFormData, files);
        console.log('[ChatController] Response (RFQ):', JSON.stringify(result).slice(0, 200));
        return res.json(result);
      }
    }

    // Step 1: Normal chat hoặc báo giá (phân tích bản vẽ + trả form)
    const intent = isBaoGiaIntent(message, files);

    if (!intent) {
      const result = await handleNormalChat(message);
      return res.json(result);
    }

    // Bao gia: RETURN IMMEDIATELY with job_id, process in background
    ensureCleanup();
    emitSseEvent(jobId, "progress", { phase: "queued", current: 0, total: 0, message: "Đang xếp hàng chờ xử lý..." });

    // Return job_id immediately so client can start listening to SSE
    res.json({
      isBotReply: true,
      reply: "Đang phân tích " + files.length + " file PDF. Bạn đợi một chút nhé...",
      step: "processing",
      job_id: jobId,
      drawings_count: 0,
    });

    // Fire-and-forget background processing
    handleBaoGiaChatAsync(message, files, jobId).catch((e) => {
      console.error("[ChatController] handleBaoGiaChatAsync error:", e.message);
    });

  } catch (e) {
    console.error("[ChatController] EXCEPTION:", e.message, e.stack?.split('\n').slice(0,4).join(' | '));
    res.status(500).json({
      error: e.message,
      isBotReply: true,
      reply: "Đã xảy ra lỗi khi xử lý. Vui lòng thử lại.",
    });
  }
});

// ─── GET /chat/stream/:jobId — SSE endpoint ─────────────────────────────────

router.get("/stream/:jobId", (req, res) => {
  const { jobId } = req.params;
  console.log("[SSE] Client connected jobId=" + jobId);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering for SSE
  res.flushHeaders();

  ensureCleanup();
  addSseClient(jobId, res);

  // Send initial heartbeat
  res.write(`event: connected\ndata: ${JSON.stringify({ jobId })}\n\n`);

  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(jobId, res);
    console.log("[SSE] Client disconnected jobId=" + jobId);
  });
});

// ─── GET /chat/history ──────────────────────────────────────────────────────

router.get("/history", (req, res) => {
  res.json({
    history: [],
    message: "Lịch sử chat chỉ trong phiên hiện tại, không được lưu trữ.",
  });
});

export default router;
