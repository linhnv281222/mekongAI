import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getJob, getJobs, updateJob } from "../data/jobStore.js";
import {
  downloadAttachment,
  makeGmail,
  parseGmailMsg,
} from "../libs/gmailClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = express.Router();

function resolveAttachmentFilename(req) {
  const bodyF = req.body?.f;
  if (bodyF != null && String(bodyF).trim()) {
    let filename = String(bodyF).trim();
    if (filename.includes("%")) {
      try {
        filename = decodeURIComponent(filename.replace(/\+/g, " "));
      } catch {
        /* giữ nguyên */
      }
    }
    return filename;
  }
  let f = req.query.f;
  if (Array.isArray(f)) f = f[0];
  let filename = f != null ? String(f).trim() : "";
  if (filename) {
    if (filename.includes("%")) {
      try {
        filename = decodeURIComponent(filename.replace(/\+/g, " "));
      } catch {
        /* giữ nguyên */
      }
    }
    return filename;
  }
  const rawTail = req.params[0] ?? req.params["0"] ?? "";
  if (!rawTail) return "";
  try {
    return decodeURIComponent(String(rawTail).replace(/\+/g, " "));
  } catch {
    return String(rawTail);
  }
}

/** Lấy buffer PDF từ Gmail HOẶC từ thư mục uploads (chat uploads); set header X-Job-Attachments khi refresh danh sách đính kèm. */
async function loadAttachmentPdfBuffer(jobId, filename, res) {
  if (!jobId) {
    return { ok: false, status: 400, body: { error: "Thieu job id" } };
  }
  if (!filename) {
    return {
      ok: false,
      status: 400,
      body: { error: "Thieu ten file (?f= hoac body JSON { f })" },
    };
  }

  const job = getJob(jobId);
  if (!job)
    return { ok: false, status: 404, body: { error: "Khong tim thay job" } };

  // ── 1. Thử lấy từ thư mục uploads (chat uploads / agent uploads) ──
  const PROJECT_ROOT = path.resolve(__dirname, "../..");
  const uploadsDir = path.join(PROJECT_ROOT, "uploads");
  const safeName = filename.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  const altPaths = [
    path.join(uploadsDir, filename),
    path.join(uploadsDir, jobId + "_" + filename),
    // Pattern chat upload: chat_{jobId}_{baseName}.pdf  (bản archive copy)
    path.join(uploadsDir, "chat_" + jobId + "_" + path.basename(filename)),
    // Pattern safeName (đã sanitize)
    path.join(uploadsDir, jobId + "_" + safeName),
    // Pattern cũ: chat_full_{timestamp}_{originalName}
    path.join(uploadsDir, "chat_full_" + filename),
    path.join(uploadsDir, "chat_full_" + safeName),
  ];
  for (const filePath of altPaths) {
    if (fs.existsSync(filePath)) {
      try {
        const buf = fs.readFileSync(filePath);
        if (buf.length > 0) {
          return { ok: true, buf };
        }
      } catch (_) {
        /* thử path khác */
      }
    }
  }

  // ── 2. Thử tìm trong attachments của job (upload trực tiếp) ──
  let att = Array.isArray(job.attachments)
    ? job.attachments.find((a) => {
        const name = typeof a === "string" ? a : a?.name;
        return name === filename;
      })
    : null;

  // ── 3. Thử Gmail (chỉ cho job từ email, có gmail_id) ──
  const isGmailJob = !!(job.gmail_id || job.gmailId) && job.source !== "chat";
  if ((!att || typeof att === "string") && isGmailJob) {
    try {
      const gmail = makeGmail();
      const emailData = await parseGmailMsg(gmail, job.gmail_id || job.gmailId);
      const refreshed = emailData.attachments.map((a) => ({
        name: a.name,
        attachmentId: a.attachmentId,
      }));
      updateJob(job.id, { attachments: refreshed });
      att = refreshed.find((a) => a.name === filename);
      res.setHeader(
        "X-Job-Attachments",
        encodeURIComponent(JSON.stringify(refreshed))
      );
    } catch (_) {
      /* bo qua */
    }
  }

  if (!att || typeof att === "string" || !att.attachmentId) {
    return {
      ok: false,
      status: 404,
      body: { error: "Khong tim thay attachment" },
    };
  }

  try {
    const gmail = makeGmail();
    const buf = await downloadAttachment(
      gmail,
      job.gmail_id || job.gmailId,
      att.attachmentId,
      att.name
    );
    return { ok: true, buf };
  } catch (e) {
    console.error("[AttachmentProxy]", e.message);
    return {
      ok: false,
      status: 500,
      body: { error: "Loi tai attachment: " + e.message },
    };
  }
}

/**
 * Xem trước file đính kèm Gmail (raw PDF).
 * GET /jobs/:id/attachment?f=... | /attachment/* | /attachment-preview?f=
 */
export async function attachmentPreviewHandler(req, res) {
  const jobId = req.params.id ?? req.params.jobId;
  const filename = resolveAttachmentFilename(req);
  const result = await loadAttachmentPdfBuffer(jobId, filename, res);
  if (!result.ok) return res.status(result.status).json(result.body);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(result.buf);
}

/**
 * Cùng nội dung như GET nhưng trả JSON { ok, mime, b64 } — tránh IDM chặn GET/fetch PDF.
 * POST /jobs/:id/attachment-preview  body: { "f": "ten file.pdf" }
 */
export async function attachmentPreviewPostHandler(req, res) {
  const jobId = req.params.id ?? req.params.jobId;
  const filename = resolveAttachmentFilename(req);
  const result = await loadAttachmentPdfBuffer(jobId, filename, res);
  if (!result.ok) return res.status(result.status).json(result.body);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.json({
    ok: true,
    mime: "application/pdf",
    b64: Buffer.from(result.buf).toString("base64"),
  });
}

/** Gộp bản ghi trùng gmail_id (dữ liệu cũ / race): giữ bản nhiều trang hoặc mới hơn */
function dedupeJobsByGmail(rows) {
  const filtered = rows.filter((j) => j != null && j.id != null);
  const map = new Map();
  for (const j of filtered) {
    const gid = j.gmail_id || j.gmailId || "";
    const key = gid || `__id__:${j.id}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, j);
      continue;
    }
    const score = (x) => {
      const pages = x.drawings?.length || 0;
      const raw = x.created_at;
      const t =
        typeof raw === "number"
          ? raw
          : raw != null
          ? new Date(raw).getTime()
          : 0;
      const safeT = Number.isNaN(t) ? 0 : t;
      return pages * 1e15 + safeT;
    };
    if (score(j) >= score(prev)) map.set(key, j);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta =
      typeof a.created_at === "number"
        ? a.created_at
        : new Date(a.created_at || 0).getTime();
    const tb =
      typeof b.created_at === "number"
        ? b.created_at
        : new Date(b.created_at || 0).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
}

// ─── GET /jobs ──────────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  const merged = dedupeJobsByGmail(getJobs());
  const jobs = merged.map((j) => {
    const pageCount = j.drawings?.length || 0;
    const fileCount = Array.isArray(j.attachments) ? j.attachments.length : 0;
    return {
      id: j.id,
      gmail_id: j.gmail_id || j.gmailId || null,
      subject: j.subject,
      sender: j.sender,
      sender_email: j.sender_email,
      sender_name: j.sender_name || null,
      classify: j.classify,
      ngon_ngu: j.ngon_ngu,
      classify_output: j.classify_output || null,
      lines_count: pageCount,
      attachment_count: fileCount,
      preview_label:
        fileCount > 0
          ? `${fileCount} file · ${pageCount} trang đã đọc`
          : `${pageCount} trang đã đọc`,
      attachments: j.attachments || [],
      status: j.status,
      created_at: j.created_at,
      ten_cong_ty: j.ten_cong_ty || null,
      han_giao: j.han_giao || null,
      hinh_thuc_giao: j.hinh_thuc_giao || null,
      xu_ly_be_mat: j.xu_ly_be_mat ?? null,
      vat_lieu_chung_nhan: j.vat_lieu_chung_nhan ?? null,
      drawings: j.drawings || [],
      // AI Debug payloads
      classify_ai_payload: j.classify_ai_payload ?? null,
      drawing_ai_payload: j.drawing_ai_payload ?? null,
    };
  });
  res.json({ count: jobs.length, data: jobs });
});

// ─── GET /jobs/:id/attachment* — phải khai báo TRƯỚC GET /:id ───────────────
// attachment-preview: cùng handler với serverMain app.get (đề phòng route app-level không chạy / deploy cũ)

router.get("/:id/attachment-preview", attachmentPreviewHandler);
router.post("/:id/attachment-preview", attachmentPreviewPostHandler);
router.get("/:id/attachment", attachmentPreviewHandler);
router.get("/:id/attachment/*", attachmentPreviewHandler);

// ─── GET /jobs/:id ─────────────────────────────────────────────────────────

router.get("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Khong tim thay" });
  res.json(job);
});

// ─── POST /jobs/:id/push-erp ────────────────────────────────────────────────

router.post("/:id/push-erp", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Khong tim thay" });

  updateJob(job.id, { status: "pushed", pushed_at: Date.now() });

  res.json({ ok: true, job_id: job.id, message: "Push ERP thanh cong" });
});

export default router;
