import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getJob, getJobAsync, getJobs, getJobsAsync, updateJob, pool, normalizeDbRow } from "../data/jobStore.js";
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
    return { ok: false, status: 400, body: { error: "Thiếu job id" } };
  }
  if (!filename) {
    return {
      ok: false,
      status: 400,
      body: { error: "Thiếu tên file (?f= hoặc body JSON { f })" },
    };
  }

  // ── 0. Sanitize filename ngay — dùng cho cả DB lookup lẫn disk lookup ──
  const safeName = String(filename).replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  const safeBaseName = path.basename(safeName, path.extname(safeName));

  // ── 1. Lấy job từ DB: thử direct lookup trước, fallback bằng gmail_id ──
  let job = await getJob(jobId);
  if (!job && pool && jobId && typeof jobId === "string") {
    const isNum = String(jobId).match(/^\d+$/);
    if (!isNum) {
      // String job ID → query bằng gmail_id (cho chat jobs)
      try {
        const byGmail = await pool.query(
          "SELECT * FROM mekongai.agent_jobs WHERE gmail_id=$1 LIMIT 1",
          [jobId]
        );
        if (byGmail.rows[0]) {
          job = normalizeDbRow(byGmail.rows[0]);
        }
      } catch (_) {}
    }
  }
  if (!job)
    return { ok: false, status: 404, body: { error: "Không tìm thấy job" } };

  // ── 2. Lấy actual chat job id từ gmail_id để construct file path ──
  // gmail_id dạng: "chat_chat_mo8jum7g_jxpc"  → actual id: "chat_mo8jum7g_jxpc"
  const isChatJob = job.source === "chat";
  let chatJobId = jobId;
  if (isChatJob && job.gmail_id) {
    const match = job.gmail_id.match(/^(?:chat_)+(.+)$/);
    chatJobId = match ? match[1] : jobId;
  }

  // ── 3. Thử lấy từ thư mục uploads (chat uploads) ──
  const PROJECT_ROOT = path.resolve(__dirname, "../..");
  const uploadsDir = path.join(PROJECT_ROOT, "uploads");

  // Extract hash filename from the incoming filename (may have chat prefix)
  // Pattern: 16-char hex hash + .pdf anywhere in the string
  const hashMatch = safeName.match(/([a-f0-9]{16}\.pdf)/i);
  const hashFileName = hashMatch ? hashMatch[1] : null;

  const diskPaths = [
    // Safe name với job id (for short hash names like 53a24d8c25aa9915.pdf)
    path.join(uploadsDir, chatJobId + "_" + safeName),
    // Filename đã có prefix sẵn (e.g. chat_mo8p6wnm_6cys_53a24d8c25aa9915.pdf) → strip prefix
    hashFileName ? path.join(uploadsDir, chatJobId + "_" + hashFileName) : null,
    // Raw filename (encoded) — thử decode
    path.join(uploadsDir, chatJobId + "_" + decodeURIComponent(filename)),
    // Pattern cũ: chat_{jobId}_{baseName}.pdf (archive copy)
    path.join(uploadsDir, "chat_" + chatJobId + "_" + safeBaseName + ".pdf"),
    path.join(uploadsDir, "chat_" + chatJobId + "_" + decodeURIComponent(safeBaseName) + ".pdf"),
    // Safe name không có prefix
    path.join(uploadsDir, safeName),
    // Pattern cũ: chat_full_{originalName}
    path.join(uploadsDir, "chat_full_" + safeName),
    path.join(uploadsDir, "chat_full_" + decodeURIComponent(filename)),
  ].filter(Boolean);
  for (const filePath of diskPaths) {
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

  // ── 3b. Fallback: scan uploads dir tìm file bằng hash filename hoặc chat job pattern ──
  try {
    const entries = fs.readdirSync(uploadsDir);
    // Nếu có hash filename (16-char hex), tìm file chứa hash đó (bỏ qua prefix vì numeric DB jobs dùng full chat id)
    if (hashFileName) {
      for (const entry of entries) {
        if (entry.includes(hashFileName) && entry.endsWith('.pdf')) {
          const filePath = path.join(uploadsDir, entry);
          try {
            const buf = fs.readFileSync(filePath);
            if (buf.length > 0) return { ok: true, buf };
          } catch (_) {}
        }
      }
    }
    // Fallback: tìm bằng chat job id pattern
    const chatPattern = new RegExp("^chat[_]?" + String(chatJobId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    for (const entry of entries) {
      if (chatPattern.test(entry)) {
        const filePath = path.join(uploadsDir, entry);
        try {
          const buf = fs.readFileSync(filePath);
          if (buf.length > 0) return { ok: true, buf };
        } catch (_) {}
      }
    }
  } catch (_) {}

  // ── 4. Thử tìm trong attachments của job (upload trực tiếp) ──
  let att = Array.isArray(job.attachments)
    ? job.attachments.find((a) => {
        const name = typeof a === "string" ? a : a?.name;
        return name === filename || name === safeName;
      })
    : null;

  // ── 5. Thử Gmail (chỉ cho job từ email) ──
  const isGmailJob = !!(job.gmail_id || job.gmailId) && job.source !== "chat";
  if ((!att || typeof att === "string") && isGmailJob) {
    try {
      const gmail = makeGmail();
      const emailData = await parseGmailMsg(gmail, job.gmail_id || job.gmailId);
      const refreshed = emailData.attachments.map((a) => ({
        name: a.name,
        attachmentId: a.attachmentId,
      }));
      updateJob(Number(job.id), { attachments: refreshed });
      att = refreshed.find((a) => a.name === filename || a.name === safeName);
      res.setHeader(
        "X-Job-Attachments",
        encodeURIComponent(JSON.stringify(refreshed))
      );
    } catch (_) {
      /* bỏ qua */
    }
  }

  if (!att || typeof att === "string" || !att.attachmentId) {
    return {
      ok: false,
      status: 404,
      body: { error: "Không tìm thấy file đính kèm" },
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
      body: { error: "Lỗi tại attachment: " + e.message },
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

router.get("/", async (req, res) => {
  const merged = await getJobsAsync();
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
      thi_truong: j.thi_truong || null,
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
      source: j.source || null,
      email_body: j.email_body || null,
      han_bao_gia: j.han_bao_gia || null,
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

router.get("/:id", async (req, res) => {
  const job = await getJobAsync(req.params.id);
  if (!job) return res.status(404).json({ error: "Không tìm thấy" });
  res.json(job);
});

// ─── PUT /jobs/:id ──────────────────────────────────────────────────────────

router.put("/:id", async (req, res) => {
  const { drawings, body } = req.body;

  // TODO: remove debug logging
  console.log('[PUT /jobs/:id] drawings:', JSON.stringify(drawings)?.slice(0, 200));
  console.log('[PUT /jobs/:id] body:', JSON.stringify(body)?.slice(0, 200));

  // Always fetch job once to get numeric id
  const job = await getJobAsync(req.params.id);
  if (!job) return res.status(404).json({ error: "Không tìm thấy" });

  const jobDbId = Number(job.id);
  if (!jobDbId || Number.isNaN(jobDbId)) {
    console.error("[PUT /jobs/:id] invalid job.id:", job.id);
    return res.status(400).json({ error: "Invalid job id" });
  }

  if (drawings && Array.isArray(drawings)) {
    const existing = Array.isArray(job.drawings) ? job.drawings : [];
    const updated = existing.map((d) => {
      const updatedD = drawings.find((u) => u.id === d.id);
      if (updatedD) {
        const updatedNote = updatedD.data?.note ?? updatedD.note ?? d.data?.note ?? "";
        const updatedDanhGia = updatedD.data?.danh_gia ?? updatedD.danh_gia ?? d.data?.danh_gia ?? 0;
        return {
          ...d,
          data: {
            ...(d.data || {}),
            ...(updatedD.data || {}),
            note: updatedNote,
            danh_gia: updatedDanhGia,
          },
        };
      }
      return d;
    });

    await updateJob(jobDbId, { drawings: updated });
  }

  if (body && typeof body === "object") {
    const allowed = [
      "ghi_chu", "han_giao", "han_bao_gia", "hinh_thuc_giao",
      "xu_ly_be_mat", "vat_lieu_chung_nhan",
      "classify_output",
    ];
    const fields = Object.keys(body)
      .filter((k) => allowed.includes(k))
      .reduce((acc, k) => ({ ...acc, [k]: body[k] }), {});
    if (Object.keys(fields).length > 0) {
      await updateJob(jobDbId, fields);
    }
  }

  res.json({ ok: true });
});

// ─── POST /jobs/:id/push-erp ────────────────────────────────────────────────

router.post("/:id/push-erp", async (req, res) => {
  const job = await getJobAsync(req.params.id);
  if (!job) return res.status(404).json({ error: "Không tìm thấy" });

  updateJob(job.id, { status: "pushed", pushed_at: Date.now() });

  res.json({ ok: true, job_id: job.id, message: "Push ERP thanh cong" });
});

export default router;
