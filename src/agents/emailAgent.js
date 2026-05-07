import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { classifyEmail } from "../ai/emailClassifier.js";
import { loadAiConfig } from "../ai/aiConfig.js";
import { isJobProcessed, saveJob, updateJob } from "../data/jobStore.js";
import { agentCfg, gmailCfg } from "../libs/config.js";
import { postPdfToDrawingsApi } from "../libs/postDrawingUpload.js";
import {
  downloadAttachment,
  fetchUnread,
  makeGmail,
  markRead,
  parseGmailMsg,
} from "../libs/gmailClient.js";
import { splitPdf } from "../processors/pdfSplitter.js";
import {
  drawingHasMinimalData,
  normalizeDrawingToFlat,
} from "../libs/drawingNormalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Tranh 2 luong xu ly cung 1 Gmail message */
const inflightMsgIds = new Set();

function makeJobId(msgId) {
  return "job_" + msgId.slice(-8) + "_" + Date.now().toString().slice(-4);
}

/** Chi cần có file đính kèm là proceed. AI classify sẽ quyết định có phải RFQ không. */
function cheapRfqFilter(emailData) {
  if (!emailData.attachments.length) {
    return { pass: false, reason: "no_pdf_skip" };
  }
  return { pass: true };
}

// ─── PIPELINE CHINH ───────────────────────────────────────────────────────

async function processEmail(gmail, msgId) {
  // 1. Da xu ly chua?
  if (await isJobProcessed(msgId)) {
    return;
  }
  if (inflightMsgIds.has(msgId)) {
    return;
  }
  inflightMsgIds.add(msgId);
  try {
    // 2. Parse email
    let emailData;
    try {
      emailData = await parseGmailMsg(gmail, msgId);
    } catch (e) {
      console.error("[Parse] Lỗi:", e.message);
      return;
    }

    console.log(
      `[Agent] PDFs: ${
        emailData.attachments.map((a) => a.name).join(", ") || "không có"
      }`
    );

    // ── 2b. Chỉ check attachment: có file → proceed, không → skip
    const pre = cheapRfqFilter(emailData);
    if (!pre.pass) {
      console.log(`[Agent] No attachment → skip, no AI call`);
      await markRead(gmail, msgId);
      return;
    }

    // 3. Classify (AI call)
    const classify = await classifyEmail(emailData);
    console.log(
      `[Classify] config=${classify._model_used} | api=${classify._model_from_api} | body_len=${classify._body_len}/${classify._body_sent} → ${classify.loai} | ${classify.ngon_ngu} | ${classify.ly_do}`
    );

    // Build email context for drawing analysis (Gemini uses this to prioritize email > drawing)
    const emailContext = await buildEmailContext(emailData, classify);
    console.log(`[EmailContext] ${emailContext.slice(0, 120)}...`);

    // AI Debug: extract request payload from classify result
    const classifyAiPayload = classify._ai_request_payload || null;
    // Remove internal field before saving
    if (classify._ai_request_payload) {
      delete classify._ai_request_payload;
    }

    const rawMeta = {
      subject: emailData.subject,
      from: emailData.from,
      attachments: emailData.attachments.map((a) => ({
        name: a.name,
        attachmentId: a.attachmentId,
      })),
    };

    // Không phải RFQ → ghi job ngắn (1 lần save, có id + created_at) rồi đánh dấu đã đọc
    if (!["rfq", "repeat_order"].includes(classify.loai)) {
      console.log(
        `[Agent] Không phải RFQ (${classify.loai}) → ghi nhận, bỏ qua`
      );
      await saveJob({
        id: makeJobId(msgId),
        gmail_id: msgId,
        subject: emailData.subject,
        sender: emailData.from,
        sender_email: emailData.senderEmail,
        sender_name: emailData.senderName,
        sender_company: classify.ten_cong_ty,
        classify: classify.loai,
        ngon_ngu: classify.ngon_ngu,
        thi_truong: classify.thi_truong || null,
        status: classify.loai,
        classify_output: { ...classify },
        attachments: [],
        drawings: [],
        created_at: Date.now(),
        raw: rawMeta,
        source: 'email',
        email_body: emailData.body || null,
        // AI Debug
        classify_ai_payload: classifyAiPayload,
        drawing_ai_payload: null,
      });
      await markRead(gmail, msgId);
      return;
    }

    if (!emailData.attachments.length) {
      await saveJob({
        id: makeJobId(msgId),
        gmail_id: msgId,
        subject: emailData.subject,
        sender: emailData.from,
        sender_email: emailData.senderEmail,
        sender_name: emailData.senderName,
        sender_company: classify.ten_cong_ty,
        classify: classify.loai,
        ngon_ngu: classify.ngon_ngu,
        thi_truong: classify.thi_truong || null,
        status: "no_pdf",
        classify_output: { ...classify },
        attachments: [],
        drawings: [],
        created_at: Date.now(),
        raw: rawMeta,
        source: 'email',
        email_body: emailData.body || null,
        // AI Debug
        classify_ai_payload: classifyAiPayload,
        drawing_ai_payload: null,
      });
      await markRead(gmail, msgId);
      return;
    }

    // RFQ + có PDF → bắt đầu xử lý, đánh dấu UNREAD ngay để chặn race
    await markRead(gmail, msgId);

    // 4. Xu ly tung file PDF — tach trang → AI doc → gom lai
    const allResults = [];

    for (const att of emailData.attachments) {
      let pdfBuffer;
      try {
        pdfBuffer = await downloadAttachment(
          gmail,
          msgId,
          att.attachmentId,
          att.name
        );
        console.log(`[Download] OK ${att.name} (${pdfBuffer.length} bytes)`);
      } catch (e) {
        console.error(`[Download] Lỗi ${att.name}:`, e.message);
        continue;
      }

      // Tach trang
      let pages;
      try {
        pages = await splitPdf(pdfBuffer, att.name);
        console.log(`[SplitPDF] ${att.name} → ${pages.length} trang`);
      } catch (e) {
        console.error(`[SplitPDF] Lỗi:`, e.message);
        // Fallback: gửi nguyên 1 file
        const tmpPath = path.join(
          os.tmpdir(),
          `vnt_full_${Date.now()}_${att.name}`
        );
        fs.writeFileSync(tmpPath, pdfBuffer);
        pages = [{ path: tmpPath, page: 1, name: att.name, total: 1 }];
      }

      // Doc tung trang = AI
      for (const pg of pages) {
        try {
          const result = await analyzeDrawingApi(pg.path, pg.name, emailContext);
          const d = result.data;
          const flat = normalizeDrawingToFlat(d);

          // Override so_luong tu email classify
          if (classify.so_luong_chung && !classify.so_luong_theo_ma) {
            flat.so_luong = classify.so_luong_chung;
          } else if (classify.so_luong_theo_ma) {
            const override = classify.so_luong_theo_ma[flat.ma_ban_ve];
            if (override) flat.so_luong = override;
          }

          if (!drawingHasMinimalData(flat)) {
            console.warn(`[BV] Skip trang ${pg.page} (${pg.name}) — không đủ dữ liệu AI trả về`);
            console.warn(`[BV]   ma_ban_ve="${flat.ma_ban_ve}" vat_lieu="${flat.vat_lieu}" kich_thuoc="${flat.kich_thuoc}"`);
            continue;
          }

          console.log(
            `[BV] ✓ ${flat.ma_ban_ve} | ${flat.vat_lieu} | SL:${
              flat.so_luong
            } | QT:${flat.ma_quy_trinh} | ${String(flat.ly_giai_qt).slice(
              0,
              80
            )}`
          );
          allResults.push({
            ...result,
            data: flat,
            filename: att.name,
            page: pg.page,
            fileIndex: 0,
          });
        } catch (e) {
          console.error(`[BV] Lỗi trang ${pg.page}:`, e.message);
        } finally {
          fs.unlink(pg.path, () => {});
        }

        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // 5. Tạo job ID + lưu
    const jobId = makeJobId(msgId);

    // Extract drawing AI payloads
    const drawingAiPayloads = allResults
      .map((r) => r.request_payload)
      .filter(Boolean);

    const jobData = {
      id: jobId,
      gmail_id: msgId,
      subject: emailData.subject,
      sender: emailData.from,
      sender_email: emailData.senderEmail,
      classify: classify.loai,
      ngon_ngu: classify.ngon_ngu,
      thi_truong: classify.thi_truong || null,
      classify_output: { ...classify },
      han_giao: classify.han_giao_hang,
      hinh_thuc_giao: classify.hinh_thuc_giao,
      xu_ly_be_mat: classify.xu_ly_be_mat,
      vat_lieu_chung_nhan: classify.vat_lieu_chung_nhan,
      ten_cong_ty: classify.ten_cong_ty,
      ghi_chu: null,
      email_body: emailData.body || null,
      attachments: emailData.attachments.map((a) => ({
        name: a.name,
        attachmentId: a.attachmentId,
      })),
      drawings: allResults,
      status: "pending_review",
      created_at: Date.now(),
      source: 'email',
      // AI Debug payloads
      classify_ai_payload: classifyAiPayload,
      drawing_ai_payload: drawingAiPayloads,
    };

    await saveJob(jobData);
  } finally {
    inflightMsgIds.delete(msgId);
  }
}

// ─── BUILD EMAIL CONTEXT FOR DRAWING ANALYSIS ────────────────────────────────

/**
 * Xây dựng chuỗi context từ email để truyền vào Gemini drawing analysis.
 * Gemini sẽ ưu tiên: email > drawing.
 * Format: các trường quan trọng nhất, ngắn gọn, để AI hiểu.
 */
async function buildEmailContext(emailData, classify) {
  const parts = [];

  if (emailData.body) {
    parts.push(`[NỘI DUNG EMAIL]\n${emailData.body.slice(0, 2000)}`);
  }

  if (emailData.attachments && emailData.attachments.length) {
    const names = emailData.attachments.map((a) => a.name).join(", ");
    parts.push(`[FILE ĐÍNH KÈM] ${names}`);
  }

  if (classify) {
    const extras = [];
    if (classify.ten_cong_ty) extras.push(`Công ty: ${classify.ten_cong_ty}`);
    if (classify.ngon_ngu) extras.push(`Ngôn ngữ: ${classify.ngon_ngu}`);
    if (classify.han_giao_hang) extras.push(`Hạn giao: ${classify.han_giao_hang}`);
    if (classify.xu_ly_be_mat) extras.push(`Xử lý bề mặt: ${classify.xu_ly_be_mat}`);
    if (classify.vat_lieu_chung_nhan) extras.push(`VAT liệu: ${classify.vat_lieu_chung_nhan}`);
    if (classify.so_luong_chung) extras.push(`Số lượng chung: ${classify.so_luong_chung}`);
    if (classify.so_luong_theo_ma) extras.push(`Số lượng theo mã: ${JSON.stringify(classify.so_luong_theo_ma)}`);
    if (extras.length) {
      parts.push(`[THÔNG TIN PHÂN LOẠI]\n${extras.join(" | ")}`);
    }
  }

  if (!parts.length) return "";

  return parts.join("\n\n");
}

// ─── GỌI API SERVER ĐỂ ĐỌC BẢN VẼ ───────────────────────────────────────

async function analyzeDrawingApi(pdfPath, filename, emailContext = null) {
  const { provider } = loadAiConfig();
  console.log(
    `[analyzeDrawingApi] POST ${agentCfg.banveApiUrl}/drawings — provider=${provider} — file: ${filename}${emailContext ? " [HAS_EMAIL_CONTEXT]" : ""}`
  );
  const data = await postPdfToDrawingsApi({
    pdfPath,
    filename,
    baseUrl: agentCfg.banveApiUrl,
    provider,
    emailContext,
  });

  return data;
}

// ─── MAIN LOOP ─────────────────────────────────────────────────────────────

async function scanOnce(gmail) {
  console.log(
    `\n[Scan] ${new Date().toLocaleTimeString("vi-VN")} — Quet email moi...`
  );
  try {
    const messages = await fetchUnread(gmail);
    console.log(
      `[Scan] Tìm thấy ${messages.length} email chưa đọc có đính kèm`
    );

    for (const msg of messages) {
      try {
        await processEmail(gmail, msg.id);
      } catch (e) {
        console.error(`[Scan] Lỗi xử lý ${msg.id}:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (e) {
    console.error("[Scan] Lỗi:", e.message);
  }
}

async function run() {
  // Kiểm tra config bắt buộc
  const required = [
    "ANTHROPIC_API_KEY",
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("[Config] Thiếu ENV:", missing.join(", "));
    process.exit(1);
  }

  const gmail = makeGmail();

  // Scan lần đầu ngay khi start
  await scanOnce(gmail);

  // Lặp theo interval
  setInterval(() => scanOnce(gmail), gmailCfg.scanIntervalSec * 1000);
}

run().catch((e) => {
  console.error("[Fatal]", e.message);
  process.exit(1);
});
