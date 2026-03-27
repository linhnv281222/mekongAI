/**
 * server.js — Mekong AI
 * Chạy: node server.js
 */
import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { PDFDocument } from "pdf-lib";
import { analyzDrawing, correctDrawing } from "./analyzer.js";
import { initDB, saveDrawing, listDrawings, getDrawing, reviewDrawing } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ── MULTER ────────────────────────────────────────────────────────────────────
const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "application/pdf"
      || file.originalname.toLowerCase().endsWith(".pdf");
    cb(ok ? null : new Error("Chỉ nhận PDF"), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ── JOB STORE (in-memory + file) ──────────────────────────────────────────────
const JOB_FILE = path.join(__dirname, "agent_jobs.json");

function readJobs() {
  try { return JSON.parse(fs.readFileSync(JOB_FILE, "utf8")); } catch { return []; }
}
function writeJobs(jobs) {
  fs.writeFileSync(JOB_FILE, JSON.stringify(jobs.slice(0, 100), null, 2));
}
function saveJob(job) {
  const jobs = readJobs().filter(j => j.id !== job.id);
  writeJobs([job, ...jobs]);
}

// ── TÁCH TRANG PDF ────────────────────────────────────────────────────────────
async function splitPDF(buffer) {
  const doc = await PDFDocument.load(buffer);
  const total = doc.getPageCount();
  const pages = [];
  for (let i = 0; i < total; i++) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(doc, [i]);
    single.addPage(page);
    const bytes = await single.save();
    const tmpPath = path.join("uploads", `page_${i+1}_${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, bytes);
    pages.push({ path: tmpPath, page: i + 1, total });
  }
  return pages;
}

// ── POST /drawings — Đọc 1 file (single page) ─────────────────────────────────
app.post("/drawings", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Thiếu file PDF" });
  try {
    const result = await analyzDrawing(req.file.path);
    if (!result.success) return res.status(422).json({ error: result.error });
    const id = await saveDrawing(req.file.originalname, result.data);
    res.json({ id, data: result.data, tokens_used: result.usage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// ── POST /drawings/batch — Tách trang + đọc từng trang ────────────────────────
app.post("/drawings/batch", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Thiếu file PDF" });

  const pdfBuffer = fs.readFileSync(req.file.path);
  fs.unlink(req.file.path, () => {});

  let pages = [];
  try {
    pages = await splitPDF(pdfBuffer);
  } catch (e) {
    return res.status(500).json({ error: "Tách trang thất bại: " + e.message });
  }

  console.log(`[Batch] Tách được ${pages.length} trang`);

  // Đọc tuần tự để tránh rate limit
  const results = [];
  for (const pg of pages) {
    console.log(`[Batch] Đọc trang ${pg.page}/${pg.total}...`);
    try {
      const result = await analyzDrawing(pg.path);
      if (result.success) {
        const d = result.data;
        // Bỏ qua trang trắng / không có dữ liệu
        if (!d?.ban_ve?.ma_ban_ve && !d?.vat_lieu?.ma && !d?.kich_thuoc_bao?.dai) {
          console.log(`[Batch] Trang ${pg.page} không có dữ liệu → bỏ qua`);
          continue;
        }
        const id = await saveDrawing(`trang_${pg.page}.pdf`, d);
        results.push({ page: pg.page, id, data: d, tokens_used: result.usage });
        console.log(`[Batch] ✓ Trang ${pg.page}: ${d?.ban_ve?.ma_ban_ve} — ${d?.vat_lieu?.ma}`);
      } else {
        console.warn(`[Batch] Trang ${pg.page} lỗi:`, result.error);
      }
    } catch (e) {
      console.error(`[Batch] Trang ${pg.page} exception:`, e.message);
    } finally {
      fs.unlink(pg.path, () => {});
    }
    // Delay nhỏ tránh rate limit
    await new Promise(r => setTimeout(r, 800));
  }

  res.json({
    total_pages: pages.length,
    read_count: results.length,
    results,
  });
});

// ── POST /drawings/:id/correct ────────────────────────────────────────────────
app.post("/drawings/:id/correct", async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Thiếu nội dung" });
  try {
    const drawing = await getDrawing(parseInt(req.params.id));
    if (!drawing) return res.status(404).json({ error: "Không tìm thấy" });
    const result = await correctDrawing(drawing.full_data, message);
    if (!result.success) return res.status(422).json({ error: result.error });
    await reviewDrawing(drawing.id, { status: "reviewed", notes: message, correctedData: result.data });
    res.json({ data: result.data, tokens_used: result.usage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /drawings ─────────────────────────────────────────────────────────────
app.get("/drawings", async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const rows = await listDrawings({ limit: parseInt(limit), offset: parseInt(offset) });
  res.json({ count: rows.length, data: rows });
});

// ── GET /drawings/:id ─────────────────────────────────────────────────────────
app.get("/drawings/:id", async (req, res) => {
  const d = await getDrawing(parseInt(req.params.id));
  if (!d) return res.status(404).json({ error: "Không tìm thấy" });
  res.json(d);
});

// ── AGENT JOB ENDPOINTS ───────────────────────────────────────────────────────
app.get("/jobs", (req, res) => {
  const jobs = readJobs().map(j => ({
    id: j.id, subject: j.subject, sender: j.sender,
    sender_email: j.sender_email,
    classify: j.classify, ngon_ngu: j.ngon_ngu,
    lines_count: j.drawings?.length || 0,
    attachments: j.attachments || [],
    status: j.status, created_at: j.created_at,
  }));
  res.json({ count: jobs.length, data: jobs });
});

app.get("/jobs/:id", (req, res) => {
  const job = readJobs().find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Không tìm thấy" });
  res.json(job);
});

app.post("/jobs/:id/push-erp", (req, res) => {
  const jobs = readJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Không tìm thấy" });
  job.status = "pushed";
  job.pushed_at = Date.now();
  writeJobs(jobs);
  console.log(`[ERP Push] Job ${job.id} — ${job.drawings?.length || 0} bản vẽ`);
  res.json({ ok: true, job_id: job.id, message: "Push ERP thành công" });
});

// ── START ─────────────────────────────────────────────────────────────────────
async function start() {
  if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
  await initDB();
  app.listen(PORT, () => {
    console.log(`\nMekong AI: http://localhost:${PORT}`);
    console.log(`Demo:       http://localhost:${PORT}/demo_v3.html\n`);
  });
}

start().catch(console.error);
