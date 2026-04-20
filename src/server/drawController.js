import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { fileURLToPath } from "url";
import { analyzDrawing, correctDrawing } from "../ai/claudeAnalyzer.js";
import { analyzeDrawingGemini } from "../ai/geminiAnalyzer.js";
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

function loadAiConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf8"));
      let provider =
        typeof raw?.provider === "string"
          ? raw.provider.trim().toLowerCase()
          : "";
      if (!provider && raw?.model != null && String(raw.model).trim() !== "") {
        const m = String(raw.model).trim().toLowerCase();
        provider = m.startsWith("gemini") ? "gemini" : "claude";
      }
      if (provider !== "claude" && provider !== "gemini") {
        provider = "claude";
      }
      return { provider };
    }
  } catch {}
  return { provider: "claude" };
}

/** Chọn analyzer dựa trên provider hint hoặc config file */
function selectAnalyzer(providerHint) {
  const effective = providerHint || loadAiConfig().provider;
  if (effective === "gemini") {
    return { fn: analyzeDrawingGemini, label: "gemini" };
  }
  return { fn: analyzDrawing, label: "claude" };
}

const router = express.Router();

// ─── MULTER ────────────────────────────────────────────────────────────────

const upload = multer({
  dest: UPLOADS_DIR,
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    cb(ok ? null : new Error("Chi nhan PDF"), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── TACH TRANG PDF (local — chi tra ve Buffer) ────────────────────────────

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
  if (!req.file) return res.status(400).json({ error: "Thieu file PDF" });

  try {
    const providerHint = req.query.provider || null;
    const { fn: analyzer, label: provider } = selectAnalyzer(providerHint);
    const result = await analyzer(req.file.path);

    if (!result.success) return res.status(422).json({ error: result.error });

    logAiRaw({ filename: req.file.originalname, provider, raw: result.raw });
    const flat = normalizeDrawingToFlat(result.data);
    const id = await saveDrawing(req.file.originalname, flat);
    res.json({
      id,
      data: flat,
      filename: req.file.originalname,
      request_payload: result.request_payload,
    });
  } catch (e) {
    console.error(
      "[DrawController] EXCEPTION:",
      e.message,
      e.stack?.split("\n")[1] ?? ""
    );
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// ─── POST /drawings/batch — Tach + doc nhieu trang ─────────────────────────

router.post("/batch", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Thieu file PDF" });

  const pdfBuffer = fs.readFileSync(req.file.path);
  fs.unlink(req.file.path, () => {});

  const providerHint = req.query.provider || null;
  const { fn: analyzer, label: provider } = selectAnalyzer(providerHint);

  let pages = [];
  try {
    pages = await splitPdfLocal(pdfBuffer);
  } catch (e) {
    return res.status(500).json({ error: "Tach trang that bai: " + e.message });
  }

  const results = [];
  for (const pg of pages) {
    try {
      const result = await analyzer(pg.path);
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
          id,
          data: flat,
          request_payload: result.request_payload,
        });
        console.log(
          `[Batch] ✓ Trang ${pg.page}: ${flat.ma_ban_ve} — ${flat.vat_lieu}`
        );
      } else {
        console.warn(`[Batch] Trang ${pg.page} loi:`, result.error);
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
    return res.status(400).json({ error: "Thieu noi dung" });

  try {
    const drawing = await getDrawing(parseInt(req.params.id));
    if (!drawing) return res.status(404).json({ error: "Khong tim thay" });

    const result = await correctDrawing(drawing.full_data, message);
    if (!result.success) return res.status(422).json({ error: result.error });

    logAiRaw({
      filename: `correct_${drawing.id}`,
      provider: "claude",
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
  if (!d) return res.status(404).json({ error: "Khong tim thay" });
  res.json(d);
});

export default router;
