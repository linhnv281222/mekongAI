import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { classifyEmail } from "../ai/emailClassifier.js";
import { loadAiConfig } from "../ai/aiConfig.js";
import { isJobProcessed, saveJob } from "../data/jobStore.js";
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
import { prefilterEmail } from "../libs/emailPreFilter.js";
import { isDuplicateMessagePersistent, markProcessed, hashMessageWithAttachments } from "../libs/messageDedup.js";
import {
  getFileCache,
  setFileCache,
  hashFile,
} from "../libs/drawingCache.js";
import { triageAllPages, filterPagesForAnalysis } from "../libs/pageTriage.js";
import { extractWithRules, shouldRetryWithAltModel } from "../libs/drawingRules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../..", "data");

// ─── FILE-BASED PROCESSED ID PERSISTENCE (no-DB fallback) ────────────────────

const PROCESSED_FILE = path.join(DATA_DIR, "processed_gmail_ids.json");

async function readProcessedIds() {
  try {
    if (!fs.existsSync(PROCESSED_FILE)) return [];
    const raw = fs.readFileSync(PROCESSED_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeProcessedIds(ids) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(ids, null, 2));
  } catch (e) {
    console.error("[ProcessedIds] Write error:", e.message);
  }
}

async function addProcessedId(gmailId) {
  const ids = await readProcessedIds();
  if (!ids.includes(gmailId)) {
    ids.push(gmailId);
    await writeProcessedIds(ids);
  }
}

/**
 * Kiểm tra email đã xử lý chưa.
 * Thứ tự: DB → file (no-DB fallback).
 */
async function isProcessed(msgId) {
  const dbProcessed = await isJobProcessed(msgId);
  if (dbProcessed) return true;
  const fileIds = await readProcessedIds();
  return fileIds.includes(msgId);
}

// ─── MIME VERIFICATION ────────────────────────────────────────────────────────

/** Verify buffer is actually a PDF (magic bytes check) */
function isPdfBuffer(buf) {
  return (
    buf.length >= 4 &&
    buf[0] === 0x25 && // %
    buf[1] === 0x50 && // P
    buf[2] === 0x44 && // D
    buf[3] === 0x46    // F
  );
}

// ─── REPLY DETECTION ───────────────────────────────────────────────────────────

/** Extract Gmail message-ID from In-Reply-To or References header */
function extractGmailId(header) {
  if (!header) return null;
  // Format: <abc123@gmail.com> or <abc123@mail.xxx>
  const match = header.match(/<([^>]+)>/);
  if (match) return match[1];
  return header.trim() || null;
}

/** Check if email is a reply to an already-processed message */
async function isReplyToProcessed(emailData) {
  const inReplyTo = emailData.inReplyTo || "";
  const references = emailData.references || "";
  const threadIds = [inReplyTo, ...references.split(/\s+/)].filter(Boolean);

  for (const tid of threadIds) {
    const gmailId = extractGmailId(tid);
    if (gmailId && (await isProcessed(gmailId))) {
      return gmailId;
    }
  }
  return null;
}

// ─── INFLIGHT PROTECTION ──────────────────────────────────────────────────────

const inflightMsgIds = new Set();

function makeJobId(msgId) {
  return "job_" + msgId.slice(-8) + "_" + Date.now().toString().slice(-4);
}

// ─── PIPELINE CHÍNH ──────────────────────────────────────────────────────────

async function processEmail(gmail, msgId) {
  if (inflightMsgIds.has(msgId)) {
    return;
  }
  inflightMsgIds.add(msgId);

  try {
    // ── 0. Kiểm tra đã xử lý chưa (DB + file) ──────────────────────────────
    if (await isProcessed(msgId)) {
      console.log(`[Agent] ${msgId} — đã xử lý → skip`);
      return;
    }

    // ── 1. Parse email ───────────────────────────────────────────────────────
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

    // ── 1b. Message dedup (body + attachment hash) — AFTER parse ─────────────
    const dedupKey = hashMessageWithAttachments(emailData.body, emailData.attachments);
    if (isDuplicateMessagePersistent(dedupKey)) {
      console.log(`[Agent] ${msgId} — duplicate message → skip`);
      await markRead(gmail, msgId);
      await addProcessedId(msgId);
      return;
    }

    // ── 1c. Rule-based prefilter (BEFORE AI classify) ─────────────────────
    const prefilter = prefilterEmail(emailData);
    if (prefilter.shouldSkip) {
      console.log(`[Agent] PREFILTER skip: ${prefilter.reason}`);
      await markRead(gmail, msgId);
      await addProcessedId(msgId);
      return;
    }

    // ── 1d. Reply detection: bỏ qua nếu reply tới email đã xử lý ──────────
    const repliedToId = await isReplyToProcessed(emailData);
    if (repliedToId) {
      console.log(
        `[Agent] Reply to processed email ${repliedToId} → skip, chỉ markRead`
      );
      await markRead(gmail, msgId);
      await addProcessedId(msgId);
      return;
    }

    // ── 2. Cheap filter: cần có PDF attachment ──────────────────────────────
    const pdfAttachments = emailData.attachments.filter((a) =>
      String(a.name).toLowerCase().endsWith(".pdf")
    );
    if (!pdfAttachments.length) {
      console.log(`[Agent] No PDF attachment → skip`);
      await markRead(gmail, msgId);
      await addProcessedId(msgId);
      return;
    }

    // ── 3. Classify (AI call) ───────────────────────────────────────────────
    const classify = await classifyEmail(emailData);
    console.log(
      `[Classify] model=${classify._model_used} | api=${classify._model_from_api} | ` +
        `body=${classify._body_len}/${classify._body_sent} → ${classify.loai} | ` +
        `${classify.ngon_ngu} | ${classify.ly_do}`
    );

    // Build email context for drawing analysis
    const emailContext = buildEmailContext(emailData, classify);
    console.log(`[EmailContext] ${emailContext.slice(0, 120)}...`);

    // Extract + strip internal debug fields
    const classifyAiPayload = classify._ai_request_payload || null;
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

    // ── 4. Không phải RFQ → chỉ markRead + persist, KHÔNG save DB ─────────
    if (!["rfq", "repeat_order"].includes(classify.loai)) {
      console.log(
        `[Agent] Không phải RFQ (${classify.loai}) → skip, không lưu DB`
      );
      await markRead(gmail, msgId);
      await addProcessedId(msgId);
      return;
    }

    // ── 5. RFQ nhưng không có PDF thực sự ──────────────────────────────────
    if (!pdfAttachments.length) {
      console.log(`[Agent] RFQ nhưng không có PDF → skip, không lưu DB`);
      await markRead(gmail, msgId);
      await addProcessedId(msgId);
      return;
    }

    // ── 6. RFQ + có PDF → xử lý ────────────────────────────────────────────
    await markRead(gmail, msgId);

    const allResults = [];

    for (const att of pdfAttachments) {
      let pdfBuffer;
      try {
        pdfBuffer = await downloadAttachment(
          gmail,
          msgId,
          att.attachmentId,
          att.name
        );
        console.log(
          `[Download] OK ${att.name} (${pdfBuffer.length} bytes)`
        );
      } catch (e) {
        console.error(`[Download] Lỗi ${att.name}:`, e.message);
        continue;
      }

      // Verify actual PDF before processing
      if (!isPdfBuffer(pdfBuffer)) {
        console.warn(
          `[Agent] Skip non-PDF (magic bytes fail): ${att.name}`
        );
        continue;
      }

      // Tách trang
      let pages;
      try {
        pages = await splitPdf(pdfBuffer, att.name);
        console.log(
          `[SplitPDF] ${att.name} → ${pages.length} trang`
        );

        // ── P2: Page triage — skip non-drawing pages before AI ─────────────
        if (pages.length > 1) {
          const triageResults = await triageAllPages(pdfBuffer, pages);
          const pagesToAnalyze = filterPagesForAnalysis(triageResults, pages);
          const skipped = pages.length - pagesToAnalyze.length;
          if (skipped > 0) {
            console.log(`[Triage] ${att.name}: skip ${skipped}/${pages.length} non-drawing pages`);
            for (const [pgNum, triage] of triageResults.entries()) {
              if (triage.type === "non-drawing") {
                console.log(`[Triage]   skip page ${pgNum}: ${triage.reason}`);
              }
            }
          }
          pages = pagesToAnalyze;
        }
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

      // Đọc từng trang = AI (with cache check)
      for (const pg of pages) {
        // ── Drawing cache check ──────────────────────────────────────────────
        let cachedResult = null;
        try {
          cachedResult = getFileCache(pg.path);
        } catch (e) {
          console.warn(`[Cache] getFileCache error for ${pg.name}:`, e.message);
        }

        let result;
        if (cachedResult) {
          console.log(`[Cache] HIT for ${pg.name} — skipping AI call`);
          result = cachedResult;
        } else {
          try {
            result = await analyzeDrawingApi(
              pg.path,
              pg.name,
              emailContext
            );
            // Cache successful result
            if (result?.data) {
              try {
                setFileCache(pg.path, result);
              } catch (e) {
                console.warn(`[Cache] setFileCache error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[BV] Lỗi trang ${pg.page}:`, e.message);
            result = null;
          }
        }

        if (!result?.data) {
          console.warn(`[BV] No result for ${pg.name} — skipping`);
          try { fs.unlink(pg.path, () => {}); } catch {}
          continue;
        }

        const d = result.data;
        const flat = normalizeDrawingToFlat(d);

        // ── P3: Rule-based enrichment — fill missing fields ─────────────────
        try {
          const enriched = extractWithRules("", flat);
          if (enriched.confidence > 0 && enriched.fieldsFound > 0) {
            console.log(`[Rules] enriched: fields=${enriched.fieldsFound} conf=${enriched.confidence}/10 missing=${enriched.missing.join(",") || "none"}`);
          }
          // Only fill truly empty fields, don't override AI output
          for (const key of enriched.missing) {
            if (flat[key] == null || flat[key] === "" || flat[key] === "Không ghi trên bản vẽ") {
              if (enriched.extracted[key] != null && enriched.extracted[key] !== "") {
                flat[key] = enriched.extracted[key];
                console.log(`[Rules] filled ${key} = "${flat[key]}"`);
              }
            }
          }
        } catch (e) {
          console.warn(`[Rules] enrichment error:`, e.message);
        }

        // Override so_luong từ email classify
        if (classify.so_luong_chung && !classify.so_luong_theo_ma) {
          flat.so_luong = classify.so_luong_chung;
        } else if (classify.so_luong_theo_ma) {
          const override = classify.so_luong_theo_ma[flat.ma_ban_ve];
          if (override) flat.so_luong = override;
        }

        if (!drawingHasMinimalData(flat)) {
          console.warn(
            `[BV] Skip trang ${pg.page} (${pg.name}) — không đủ dữ liệu`
          );
          console.warn(
            `[BV]   ma_ban_ve="${flat.ma_ban_ve}" vat_lieu="${flat.vat_lieu}" kich_thuoc="${flat.kich_thuoc}"`
          );
          try { fs.unlink(pg.path, () => {}); } catch {}
          continue;
        }

        console.log(
          `[BV] ✓ ${flat.ma_ban_ve} | ${flat.vat_lieu} | SL:${flat.so_luong} | QT:${flat.ma_quy_trinh} | ${String(flat.ly_giai_qt).slice(0, 80)}`
        );
        allResults.push({
          ...result,
          data: flat,
          filename: att.name,
          page: pg.page,
          fileIndex: 0,
        });

        try { fs.unlink(pg.path, () => {}); } catch {}

        // Rate limit between AI calls
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // ── 7. Lưu job + mark đã xử lý ────────────────────────────────────────
    const jobId = makeJobId(msgId);
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
      source: "email",
      classify_ai_payload: classifyAiPayload,
      drawing_ai_payload: drawingAiPayloads,
    };

    await saveJob(jobData);
    await addProcessedId(msgId);
    markProcessed(dedupKey); // mark message dedup
  } finally {
    inflightMsgIds.delete(msgId);
  }
}

// ─── BUILD EMAIL CONTEXT ───────────────────────────────────────────────────────

function buildEmailContext(emailData, classify) {
  const parts = [];

  if (emailData.body) {
    parts.push(`[NỘI DUNG EMAIL]\n${emailData.body.slice(0, 2000)}`);
  }

  if (emailData.attachments?.length) {
    const names = emailData.attachments.map((a) => a.name).join(", ");
    parts.push(`[FILE ĐÍNH KÈM] ${names}`);
  }

  if (classify) {
    const extras = [];
    if (classify.ten_cong_ty) extras.push(`Công ty: ${classify.ten_cong_ty}`);
    if (classify.ngon_ngu) extras.push(`Ngôn ngữ: ${classify.ngon_ngu}`);
    if (classify.han_giao_hang)
      extras.push(`Hạn giao: ${classify.han_giao_hang}`);
    if (classify.xu_ly_be_mat)
      extras.push(`Xử lý bề mặt: ${classify.xu_ly_be_mat}`);
    if (classify.vat_lieu_chung_nhan)
      extras.push(`VAT liệu: ${classify.vat_lieu_chung_nhan}`);
    if (classify.so_luong_chung)
      extras.push(`Số lượng chung: ${classify.so_luong_chung}`);
    if (classify.so_luong_theo_ma)
      extras.push(
        `Số lượng theo mã: ${JSON.stringify(classify.so_luong_theo_ma)}`
      );
    if (extras.length) {
      parts.push(`[THÔNG TIN PHÂN LOẠI]\n${extras.join(" | ")}`);
    }
  }

  if (!parts.length) return "";
  return parts.join("\n\n");
}

// ─── GỌI API SERVER ĐỌC BẢN VẼ ─────────────────────────────────────────────

async function analyzeDrawingApi(pdfPath, filename, emailContext = null) {
  const { provider } = loadAiConfig();
  console.log(
    `[analyzeDrawingApi] POST ${agentCfg.banveApiUrl}/drawings — ` +
      `provider=${provider} — file: ${filename}` +
      `${emailContext ? " [HAS_EMAIL_CONTEXT]" : ""}`
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

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────

async function scanOnce(gmail) {
  console.log(
    `\n[Scan] ${new Date().toLocaleTimeString("vi-VN")} — Quét email mới...`
  );
  try {
    const messages = await fetchUnread(gmail);
    console.log(
      `[Scan] Tìm thấy ${messages.length} email chưa đọc có đính kèm PDF`
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

  await scanOnce(gmail);
  setInterval(() => scanOnce(gmail), gmailCfg.scanIntervalSec * 1000);
}

run().catch((e) => {
  console.error("[Fatal]", e.message);
  process.exit(1);
});
