import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { classifyEmail } from "../ai/emailClassifier.js";
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

/** Tranh 2 luong xu ly cung 1 Gmail message (trong khi chua ghi job xong) */
const inflightMsgIds = new Set();

function makeJobId(msgId) {
  return "job_" + msgId.slice(-8) + "_" + Date.now().toString().slice(-4);
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
      console.error("[Parse] Loi:", e.message);
      return;
    }

    console.log(
      `[Agent] PDFs: ${
        emailData.attachments.map((a) => a.name).join(", ") || "khong co"
      }`
    );

    // 3. Classify = Haiku

    const classify = await classifyEmail(emailData);
    console.log(
      `[Classify] → ${classify.loai} | ${classify.ngon_ngu} | ${classify.ly_do}`
    );

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

    // Khong phai RFQ → ghi job ngan (1 lan save, co id + created_at) roi danh dau da doc
    if (!["rfq", "repeat_order"].includes(classify.loai)) {
      console.log(
        `[Agent] Khong phai RFQ (${classify.loai}) → ghi nhan, bo qua`
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
        status: classify.loai,
        classify_output: { ...classify },
        attachments: [],
        drawings: [],
        created_at: Date.now(),
        raw: rawMeta,
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
        status: "no_pdf",
        classify_output: { ...classify },
        attachments: [],
        drawings: [],
        created_at: Date.now(),
        raw: rawMeta,
        // AI Debug
        classify_ai_payload: classifyAiPayload,
        drawing_ai_payload: null,
      });
      await markRead(gmail, msgId);
      return;
    }

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
      } catch (e) {
        console.error(`[Download] Loi ${att.name}:`, e.message);
        continue;
      }

      // Tach trang
      let pages;
      try {
        pages = await splitPdf(pdfBuffer, att.name);
      } catch (e) {
        console.error(`[SplitPDF] Loi:`, e.message);
        // Fallback: gui nguyen 1 file
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
          const result = await analyzeDrawingApi(pg.path, pg.name);
          const d = result.data;
          const flat = normalizeDrawingToFlat(d);

          if (!drawingHasMinimalData(flat)) {
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
          });
        } catch (e) {
          console.error(`[BV] Loi trang ${pg.page}:`, e.message);
        } finally {
          fs.unlink(pg.path, () => {});
        }

        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // 5. Tao job ID + luu
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
      classify_output: { ...classify },
      han_giao: classify.han_giao_hang,
      hinh_thuc_giao: classify.hinh_thuc_giao,
      xu_ly_be_mat: classify.xu_ly_be_mat,
      vat_lieu_chung_nhan: classify.vat_lieu_chung_nhan,
      ten_cong_ty: classify.ten_cong_ty,
      ghi_chu: emailData.body.slice(0, 500),
      attachments: emailData.attachments.map((a) => ({
        name: a.name,
        attachmentId: a.attachmentId,
      })),
      drawings: allResults,
      status: "pending_review",
      created_at: Date.now(),
      // AI Debug payloads
      classify_ai_payload: classifyAiPayload,
      drawing_ai_payload: drawingAiPayloads,
    };

    await saveJob(jobData);

    const reviewUrl = `${agentCfg.banveApiUrl}/src/web/demoV3.html`;

    await updateJob(jobId, {
      gmail_id: msgId,
      status: "pending_review",
      lines_count: allResults.length,
    });

    // 6. Mark email da doc
    await markRead(gmail, msgId);
  } finally {
    inflightMsgIds.delete(msgId);
  }
}

// ─── GOI API SERVER DE DOC BAN VE ───────────────────────────────────────

async function analyzeDrawingApi(pdfPath, filename) {
  console.log(
    `[analyzeDrawingApi] POST ${agentCfg.banveApiUrl}/drawings?provider=gemini — file: ${filename}`
  );
  const data = await postPdfToDrawingsApi({
    pdfPath,
    filename,
    baseUrl: agentCfg.banveApiUrl,
    provider: "gemini",
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
      `[Scan] Tim thay ${messages.length} email chua doc co dinh kem`
    );

    for (const msg of messages) {
      try {
        await processEmail(gmail, msg.id);
      } catch (e) {
        console.error(`[Scan] Loi xu ly ${msg.id}:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (e) {
    console.error("[Scan] Loi:", e.message);
  }
}

async function run() {
  // Kiem tra config bat buoc
  const required = [
    "ANTHROPIC_API_KEY",
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("[Config] Thieu ENV:", missing.join(", "));
    process.exit(1);
  }

  const gmail = makeGmail();

  // Scan lan dau ngay khi start
  await scanOnce(gmail);

  // Lap theo interval
  setInterval(() => scanOnce(gmail), gmailCfg.scanIntervalSec * 1000);
}

run().catch((e) => {
  console.error("[Fatal]", e.message);
  process.exit(1);
});
