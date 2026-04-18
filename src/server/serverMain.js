import "./setupEnv.js";

import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import { initDB } from "../data/drawRepository.js";
import { getJob, initJobDB } from "../data/jobStore.js";
import { serverCfg } from "../libs/config.js";
import { seedDefaults } from "../prompts/promptStore.js";
import drawController from "./drawController.js";
import jobController, {
  attachmentPreviewHandler,
  attachmentPreviewPostHandler,
} from "./jobController.js";
import promptController from "./promptController.js";
import chatController from "./chatController.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../.."); // mekongAI/

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Accept-Language', 'Authorization']
}));
app.use(express.json());

/**
 * URL cũ (iframe / cache JS): GET /jobs/:id/attachment/<tên file>
 * Express không khớp ổn với ( ) trong path → 404. Chuyển sang attachment-preview?f=
 */
function redirectLegacyJobAttachment(req, res, next) {
  if (req.method !== "GET") return next();
  const pathOnly = req.path.split("?")[0];
  const m = pathOnly.match(/^\/jobs\/([^/]+)\/attachment\/(.+)$/);
  if (!m) return next();
  const jobId = m[1];
  const tail = m[2];
  let filename = tail;
  try {
    filename = decodeURIComponent(tail.replace(/\+/g, " "));
  } catch {
    /* giữ tail */
  }
  const q = new URLSearchParams();
  q.set("f", filename);
  res.redirect(302, `/jobs/${jobId}/attachment-preview?${q.toString()}`);
}

// ─── API / HTML routes (trước static để /admin/prompts/... không bị 404 nhầm) ───

app.use("/drawings", drawController);
app.use("/chat", chatController);
app.use(redirectLegacyJobAttachment);
// Preview PDF — tên file qua ?f=
app.get("/jobs/:jobId/attachment-preview", attachmentPreviewHandler);
app.post("/jobs/:jobId/attachment-preview", attachmentPreviewPostHandler);
// Catch-all: redirect /chat/jobs/* → /jobs/* (giữ nguyên method qua 307)
app.use("/chat/jobs", (req, res) => {
  const target = req.originalUrl.replace(/^\/chat\/jobs/, "/jobs");
  res.redirect(307, target);
});

app.use("/jobs", jobController);
app.use("/admin/prompts", promptController);

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/** Gợi ý cho trang demo: chỉ email hộp thư (không lộ secret) */
app.get("/api/demo-hint", (req, res) => {
  res.json({
    inboxEmail: process.env.GMAIL_USER || "",
  });
});

/** Schema UI tab Thông tin chung (demoV3) — khớp field JSON phân loại email */
app.get("/api/email-classify-ui-schema", (req, res) => {
  try {
    const p = path.join(
      __dirname,
      "../prompts/defaults/email-classify-ui.json"
    );
    const raw = fs.readFileSync(p, "utf8");
    res.type("application/json").send(raw);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Debug xem trước đính kèm — không trả nội dung file, chỉ JSON để dán cho support.
 * Ví dụ: /api/debug/attachment?jobId=job_xxx&f=715-C07418-002%20(Rev%20A).pdf
 */
app.get("/api/debug/attachment", (req, res) => {
  const jobIdRaw = req.query.jobId ?? req.query.job;
  let f = req.query.f;
  if (Array.isArray(f)) f = f[0];
  const jobId =
    jobIdRaw != null && String(jobIdRaw).trim() ? String(jobIdRaw).trim() : "";
  const job = jobId ? getJob(jobId) : null;
  const names = Array.isArray(job?.attachments)
    ? job.attachments
        .map((a) => (typeof a === "string" ? a : a?.name))
        .filter(Boolean)
    : [];
  let want = f != null ? String(f).trim() : "";
  if (want.includes("%")) {
    try {
      want = decodeURIComponent(want.replace(/\+/g, " "));
    } catch {
      /* giữ */
    }
  }
  const exactNameMatch = want ? names.some((n) => n === want) : false;
  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    jobId: jobId || null,
    queryF: f != null ? String(f) : null,
    decodedFilenameCandidate: want || null,
    jobFound: !!job,
    gmail_id: job?.gmail_id ?? null,
    attachmentCount: names.length,
    attachmentNames: names,
    exactNameMatch,
    explain: !job
      ? "Không có job trong store — sai jobId hoặc agent chưa ghi DB."
      : !want
      ? "Thiếu ?f= — iframe cần URL dạng /jobs/<id>/attachment-preview?f=<encodeURIComponent(tên)>"
      : !exactNameMatch
      ? "Có job nhưng tên file không khớp (so sánh attachmentNames với tên bạn gửi)."
      : "Tên khớp — nếu vẫn lỗi, kiểm tra Gmail OAuth / attachmentId.",
    sampleUrl:
      jobId && want
        ? `/jobs/${encodeURIComponent(
            jobId
          )}/attachment-preview?f=${encodeURIComponent(want)}`
        : jobId
        ? `/jobs/${encodeURIComponent(jobId)}/attachment-preview?f=`
        : null,
  });
});

// Trang chủ: Demo Agent V3 (hộp thư + báo giá)
app.get("/", (req, res) => {
  res.redirect(302, "/src/web/demoV3.html");
});

// Static: HTML, CSS, JS từ thư mục gốc project
app.use(express.static(PROJECT_ROOT));

// ─── 404 CATCHER ─────────────────────────────────────────────────────────

app.use((req, res) => {
  const path = req.path || "";
  const payload = { error: "Không tìm thấy: " + path };
  if (path.includes("attachment")) {
    payload.note =
      "req.path không gồm query (?f=...). Nếu URL có ?f= mà vẫn 404 → route chưa đăng ký (restart server / pull code mới).";
    payload.originalUrl = req.originalUrl;
    payload.debugUrl =
      "/api/debug/attachment?jobId=<jobId>&f=" +
      encodeURIComponent("Ten file.pdf");
  }
  res.status(404).json(payload);
});

// ─── ERROR HANDLER ────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: err.message });
});

// ─── STARTUP ──────────────────────────────────────────────────────────────

async function start() {
  if (!fs.existsSync(serverCfg.uploadsDir)) {
    fs.mkdirSync(serverCfg.uploadsDir, { recursive: true });
  }

  await initDB();
  await initJobDB();
  await seedDefaults();

  app.listen(serverCfg.port, () => {
    console.log(`\nMekong AI Server: http://localhost:${serverCfg.port}`);
    console.log(
      `Demo V3 (mặc định /): http://localhost:${serverCfg.port}/src/web/demoV3.html`
    );
    console.log(
      `Demo (cũ):        http://localhost:${serverCfg.port}/src/web/demo.html\n`
    );
    console.log(
      `Admin Prompts:    http://localhost:${serverCfg.port}/src/web/admin-prompts.html`
    );
    console.log(`[Ready]`);
  });
}

start().catch((e) => {
  console.error("[Fatal]", e.message);
  process.exit(1);
});
