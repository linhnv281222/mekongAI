import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { fileURLToPath } from "url";
import { analyzeDrawingGemini, correctDrawingGemini } from "../ai/geminiAnalyzer.js";
import { analyzeDrawingClaude, correctDrawingClaude } from "../ai/anthropicAnalyzer.js";
import {
  getDrawing,
  listDrawings,
  reviewDrawing,
  saveDrawing,
} from "../data/drawRepository.js";
import {
  drawingHasMinimalData,
  normalizeDrawingToFlat,
} from "../libs/drawingNormalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const UPLOADS_DIR = path.join(PROJECT_ROOT, "uploads");
const AI_CONFIG_FILE = path.join(PROJECT_ROOT, "data", "ai-model-config.json");

/** Ghi phản hồi nguyên bản từ AI vào file log (data/ai-drawing-log/YYYY-MM-DD.jsonl) */
function logAiRaw({ filename, provider, raw, page }) {}

/** Load AI config from file */
function loadAiConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf8"));
      return {
        provider: raw?.provider || "gemini",
        model: raw?.model || null,
      };
    }
  } catch {}
  return { provider: "gemini", model: null };
}

/** Chọn analyzer — gemini hoặc claude theo config */
function selectAnalyzer() {
  const { provider } = loadAiConfig();
  if (provider === "claude") {
    return { fn: analyzeDrawingClaude, label: "claude" };
  }
  return { fn: analyzeDrawingGemini, label: "gemini" };
}

const router = express.Router();

// ─── MULTER ────────────────────────────────────────────────────────────────

const upload = multer({
  dest: UPLOADS_DIR,
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    cb(ok ? null : new Error("Chỉ nhận PDF"), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── TÁCH TRANG PDF (local — chỉ trả về Buffer) ────────────────────────────

async function splitPdfLocal(buffer) {
  const doc = await PDFDocument.load(buffer);
  const total = doc.getPageCount();
  const pages = [];
  for (let i = 0; i < total; i++) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(doc, [i]);
    single.addPage(page);
    const bytes = await single.save();
    const tmpPath = path.join(UPLOADS_DIR, `page_${i + 1}_${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, bytes);
    pages.push({ path: tmpPath, page: i + 1, total });
  }
  return pages;
}

// ─── POST /drawings — Doc 1 file ───────────────────────────────────────────

router.post("/", upload.single("file"), async (req, res) => {
  console.log('[DrawController] POST /drawings START filename=' + req.file?.originalname + ' size=' + req.file?.size);
  if (!req.file) return res.status(400).json({ error: "Thiếu file PDF" });

  try {
    const providerHint = req.query.provider || null;
    const { fn: analyzer, label: provider } = selectAnalyzer(providerHint);
    const emailContext = req.body.emailContext || req.query.email_context || null;
    console.log('[DrawController] Calling analyzer provider=' + provider);
    const result = await analyzer(req.file.path, null, emailContext);
    console.log('[DrawController] Analyzer done success=' + !!result.success);
    if (!result.success) return res.status(422).json({ error: result.error });

    logAiRaw({ filename: req.file.originalname, provider, raw: result.raw });
    const flat = normalizeDrawingToFlat(result.data);
    const id = await saveDrawing(req.file.originalname, flat);
    console.log('[DrawController] POST /drawings DONE id=' + id);
    res.json({
      id,
      data: flat,
      filename: req.file.originalname,
      page: 1,
      fileIndex: 0,
      request_payload: result.request_payload,
    });
  } catch (e) {
    console.error("[DrawController] EXCEPTION:", e.message, e.stack?.split('\n')[1] ?? "");
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// ─── POST /drawings/batch — Tach + doc nhieu trang ─────────────────────────

router.post("/batch", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Thiếu file PDF" });

  const pdfBuffer = fs.readFileSync(req.file.path);
  fs.unlink(req.file.path, () => {});

  const providerHint = req.query.provider || null;
  const { fn: analyzer, label: provider } = selectAnalyzer(providerHint);

  // emailContext: ưu tiên body.emailContext (FE gửi từ uploadAndAnalyzeDrawing),
  // fallback query param email_context (chat flow dùng), cuối cùng là body.email_context
  const emailContext =
    req.body.emailContext ||
    (req.query.email_context ? decodeURIComponent(String(req.query.email_context)) : null) ||
    null;

  let pages = [];
  try {
    pages = await splitPdfLocal(pdfBuffer);
  } catch (e) {
    return res.status(500).json({ error: "Tach trang that bai: " + e.message });
  }

  const results = [];
  for (const pg of pages) {
    try {
      const result = await analyzer(pg.path, null, emailContext);
      if (result.success) {
        const flat = normalizeDrawingToFlat(result.data);
        if (!drawingHasMinimalData(flat)) {
          continue;
        }
        logAiRaw({
          filename: `trang_${pg.page}.pdf`,
          provider,
          raw: result.raw,
          page: pg.page,
        });
        const id = await saveDrawing(`trang_${pg.page}.pdf`, flat);
        results.push({
          page: pg.page,
          filename: req.file.originalname,
          fileIndex: 0,
          id,
          data: flat,
          request_payload: result.request_payload,
        });
        console.log(
          `[Batch] ✓ Trang ${pg.page}: ${flat.ma_ban_ve} — ${flat.vat_lieu}`
        );
      } else {
        console.error(`[Batch] Trang ${pg.page} lỗi:`, result.error);
      }
    } catch (e) {
      console.error(`[Batch] Trang ${pg.page} exception:`, e.message);
    } finally {
      fs.unlink(pg.path, () => {});
    }
    // Delay nho tranh rate limit
    await new Promise((r) => setTimeout(r, 800));
  }

  res.json({
    total_pages: pages.length,
    read_count: results.length,
    results,
  });
});

// ─── POST /drawings/:id/correct — Chat correction ──────────────────────────

router.post("/:id/correct", async (req, res) => {
  const { message } = req.body;
  if (!message?.trim())
    return res.status(400).json({ error: "Thiếu nội dung" });

  try {
    const drawing = await getDrawing(parseInt(req.params.id));
    if (!drawing) return res.status(404).json({ error: "Không tìm thấy" });

    const result = await correctDrawingGemini(drawing.full_data, message);
    if (!result.success) return res.status(422).json({ error: result.error });

    logAiRaw({
      filename: `correct_${drawing.id}`,
      provider: "gemini",
      raw: result.raw,
    });

    await reviewDrawing(drawing.id, {
      status: "reviewed",
      notes: message,
      correctedData: result.data,
    });
    res.json({ data: result.data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /drawings ──────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const rows = await listDrawings({
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
  res.json({ count: rows.length, data: rows });
});

// ─── GET /drawings/:id ─────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  const d = await getDrawing(parseInt(req.params.id));
  if (!d) return res.status(404).json({ error: "Không tìm thấy" });
  res.json(d);
});

export default router;
