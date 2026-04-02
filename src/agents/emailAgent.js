import fs from "fs";
import fetch from "node-fetch";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { classifyEmail } from "../ai/emailClassifier.js";
import { isJobProcessed, saveJob, updateJob } from "../data/jobStore.js";
import { agentCfg, gmailCfg } from "../libs/config.js";
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
  console.log(`\n${"─".repeat(60)}`);
  console.log(`[Agent] Xu ly: ${msgId}`);

  // 1. Da xu ly chua?
  if (await isJobProcessed(msgId)) {
    console.log("[Agent] Da xu ly → bo qua");
    return;
  }
  if (inflightMsgIds.has(msgId)) {
    console.log("[Agent] Dang xu ly (in-flight) → bo qua");
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

    console.log(`[Agent] Subject: "${emailData.subject}"`);
    console.log(`[Agent] From: ${emailData.from}`);
    console.log(
      `[Agent] PDFs: ${
        emailData.attachments.map((a) => a.name).join(", ") || "khong co"
      }`
    );

    // 3. Classify = Haiku
    console.log("[Classify] Goi Haiku...");
    const classify = await classifyEmail(emailData);
    console.log(
      `[Classify] → ${classify.loai} | ${classify.ngon_ngu} | ${classify.ly_do}`
    );

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
      });
      await markRead(gmail, msgId);
      return;
    }

    if (!emailData.attachments.length) {
      console.log("[Agent] RFQ nhung khong co PDF → can lien he KH xin ban ve");
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
      });
      await markRead(gmail, msgId);
      return;
    }

    // 4. Xu ly tung file PDF — tach trang → AI doc → gom lai
    const allResults = [];

    for (const att of emailData.attachments) {
      console.log(`\n[PDF] Xu ly: ${att.name}`);
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
        console.log(`[BV] Doc trang ${pg.page}/${pages.length}: ${pg.name}`);
        try {
          const result = await analyzeDrawingApi(pg.path, pg.name);
          const d = result.data;
          const flat = normalizeDrawingToFlat(d);

          if (!drawingHasMinimalData(flat)) {
            console.log(`[BV] Trang ${pg.page} khong co du lieu → bo qua`);
            continue;
          }

          console.log(
            `[BV] ✓ ${flat.ma_ban_ve} | ${flat.vat_lieu} | SL:${flat.so_luong} | QT:${flat.ma_quy_trinh} | ${String(flat.ly_giai_qt).slice(0, 80)}`
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
    };

    await saveJob(jobData);

    const reviewUrl = `${agentCfg.banveApiUrl}/src/web/demoV3.html`;
    console.log("\n" + "═".repeat(60));
    console.log(`[Agent] ✓ Xong: ${allResults.length} ban ve`);
    console.log(`[Agent] → Co the review tai: ${reviewUrl}`);
    console.log("(Tab demoV3 hien tai se tu dong cap nhat sau 8s)");
    console.log("═".repeat(60));

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
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  // Buffer thay vì stream: fetch mặc định của Node (undici) + stream multipart hay gây "Unexpected end of form" ở multer
  const buf = fs.readFileSync(pdfPath);
  form.append("file", buf, {
    filename,
    contentType: "application/pdf",
  });

  console.log(`[analyzeDrawingApi] POST ${agentCfg.banveApiUrl}/drawings?provider=claude — file: ${filename}`);
  const res = await fetch(`${agentCfg.banveApiUrl}/drawings?provider=claude`, {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });
  console.log(`[analyzeDrawingApi] response status: ${res.status}`);

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Loi doc BV");
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
    console.log(`[Scan] Xong. Cho ${gmailCfg.scanIntervalSec} giay...`);
  } catch (e) {
    console.error("[Scan] Loi:", e.message);
  }
}

async function run() {
  console.log("\n" + "═".repeat(60));
  console.log("  Mekong AI Email Agent");
  console.log("  " + new Date().toLocaleString("vi-VN"));
  console.log("═".repeat(60));

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
