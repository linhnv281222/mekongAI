import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPromptVersion,
  deletePromptVersion,
  getKnowledgeBlock,
  listKnowledgeBlocks,
  listPromptTemplates,
  listPromptVersions,
  setActivePromptVersion,
  testRender,
  updateKnowledgeBlock,
  updatePromptVersion,
} from "../prompts/promptStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const AI_CONFIG_FILE = path.join(PROJECT_ROOT, "data", "ai-model-config.json");

/** Mặc định provider */
const DEFAULT_AI_CONFIG = { provider: "claude" };

/** Đọc config từ file, tạo file nếu chưa có */
function loadAiConfig() {
  try {
    if (!fs.existsSync(AI_CONFIG_FILE)) {
      fs.mkdirSync(path.dirname(AI_CONFIG_FILE), { recursive: true });
      fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(DEFAULT_AI_CONFIG, null, 2));
    }
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
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

/** Ghi config xuống file */
function saveAiConfig(cfg) {
  fs.mkdirSync(path.dirname(AI_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

const router = express.Router({ mergeParams: true });

// GET /admin/prompts/config — lấy provider hiện tại
router.get("/config", (req, res) => {
  res.json({ data: loadAiConfig() });
});

// PUT /admin/prompts/config — cập nhật provider
router.put("/config", (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  let provider =
    typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  // Tương thích bản cũ: client gửi model (vd. gemini-2.5-pro) thay vì provider
  if (!provider && body.model != null && String(body.model).trim() !== "") {
    const m = String(body.model).trim().toLowerCase();
    provider = m.startsWith("gemini") ? "gemini" : "claude";
  }
  if (!provider || !["claude", "gemini"].includes(provider)) {
    return res.status(400).json({
      error:
        "Thiếu hoặc sai provider. Gửi JSON dạng {\"provider\":\"claude\"} hoặc {\"provider\":\"gemini\"}.",
    });
  }
  const cfg = { provider };
  saveAiConfig(cfg);
  res.json({ data: cfg });
});

// GET /admin/prompts
router.get("/", async (req, res) => {
  try {
    const templates = await listPromptTemplates();
    res.json({ data: templates ?? [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /admin/prompts/:key
router.get("/:key", async (req, res) => {
  try {
    const templates = await listPromptTemplates();
    const tpl = templates?.find((t) => t.key === req.params.key);
    if (!tpl)
      return res.status(404).json({ error: "Không tìm thấy mẫu prompt." });
    res.json({ data: tpl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /admin/prompts/:key/versions
router.get("/:key/versions", async (req, res) => {
  try {
    const versions = await listPromptVersions(req.params.key);
    if (!versions)
      return res
        .status(404)
        .json({ error: "Không tìm thấy mẫu hoặc chưa có phiên bản." });
    res.json({ data: versions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /admin/prompts/:key/versions/:v — sửa nội dung phiên bản đã chọn (không tạo số mới)
router.put("/:key/versions/:v", async (req, res) => {
  const want = parseInt(req.params.v, 10);
  if (Number.isNaN(want) || want < 1) {
    return res.status(400).json({ error: "Số phiên bản không hợp lệ." });
  }
  const { content, note, created_by } = req.body;
  if (!content?.trim()) {
    return res.status(400).json({ error: "content is required" });
  }

  try {
    const result = await updatePromptVersion(
      req.params.key,
      want,
      content,
      note ?? "",
      created_by ?? "admin"
    );
    if (!result) {
      return res.status(404).json({
        error:
          "Không cập nhật được (không có DB hoặc không tìm thấy phiên bản).",
      });
    }
    res.json({ success: true, version: result.version, id: result.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const ACTIVATE_ERR_VI = {
  bad_version: "Số phiên bản không hợp lệ.",
  template_not_found: "Không tìm thấy mẫu prompt.",
  version_not_found: "Không tìm thấy phiên bản này.",
  db_error: "Lỗi cơ sở dữ liệu.",
};

// POST /admin/prompts/:key/versions/:v/activate — đặt phiên bản này làm đang chạy
router.post("/:key/versions/:v/activate", async (req, res) => {
  const want = parseInt(req.params.v, 10);
  if (Number.isNaN(want) || want < 1) {
    return res.status(400).json({ error: ACTIVATE_ERR_VI.bad_version });
  }
  try {
    const result = await setActivePromptVersion(req.params.key, want);
    if (!result.ok) {
      const status =
        result.code === "template_not_found" ||
        result.code === "version_not_found"
          ? 404
          : 400;
      const msg = ACTIVATE_ERR_VI[result.code] || result.code;
      return res.status(status).json({ error: msg, code: result.code });
    }
    res.json({ success: true, active_version: want });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /admin/prompts/:key/versions/:v
router.get("/:key/versions/:v", async (req, res) => {
  try {
    const versions = await listPromptVersions(req.params.key);
    if (!versions)
      return res
        .status(404)
        .json({ error: "Không tìm thấy mẫu hoặc chưa có phiên bản." });
    const want = parseInt(req.params.v, 10);
    const version = versions.find((row) => Number(row.version) === want);
    if (!version)
      return res.status(404).json({ error: "Không tìm thấy phiên bản." });
    res.json({ data: version });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/prompts/:key/versions — tạo phiên bản mới (mặc định không kích hoạt)
router.post("/:key/versions", async (req, res) => {
  const { content, note, created_by, activate } = req.body;
  if (!content?.trim()) {
    return res.status(400).json({ error: "content is required" });
  }

  try {
    const result = await createPromptVersion(
      req.params.key,
      content,
      note ?? "",
      created_by ?? "admin",
      Boolean(activate)
    );

    if (!result) {
      return res.json({
        success: true,
        message: "Saved to file (no DB)",
        version: null,
      });
    }

    res.json({
      success: true,
      version: result.version,
      id: result.id,
      activated: Boolean(activate),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const DELETE_ERR_VI = {
  no_db: "Cần PostgreSQL để xóa phiên bản.",
  bad_version: "Số phiên bản không hợp lệ.",
  template_not_found: "Không tìm thấy mẫu prompt.",
  version_not_found: "Không tìm thấy phiên bản này.",
  last_version: "Không thể xóa phiên bản cuối cùng.",
  db_error: "Lỗi cơ sở dữ liệu.",
};

// DELETE /admin/prompts/:key/versions/:v
router.delete("/:key/versions/:v", async (req, res) => {
  const v = parseInt(req.params.v, 10);
  if (Number.isNaN(v) || v < 1) {
    return res.status(400).json({ error: DELETE_ERR_VI.bad_version });
  }

  try {
    const result = await deletePromptVersion(req.params.key, v);
    if (result.ok) {
      return res.json({ success: true });
    }
    const msg = DELETE_ERR_VI[result.code] || result.code;
    const status =
      result.code === "template_not_found" ||
      result.code === "version_not_found"
        ? 404
        : result.code === "last_version" || result.code === "bad_version"
        ? 400
        : 500;
    return res.status(status).json({ error: msg, code: result.code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /admin/knowledge
router.get("/knowledge/list", async (req, res) => {
  try {
    const blocks = await listKnowledgeBlocks();
    res.json({ data: blocks ?? [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /admin/knowledge/:key
router.get("/knowledge/:key", async (req, res) => {
  try {
    const content = await getKnowledgeBlock(req.params.key);
    if (content === null) {
      return res.status(404).json({ error: "Knowledge block not found" });
    }

    const allBlocks = await listKnowledgeBlocks();
    const block = allBlocks?.find((b) => b.key === req.params.key);
    res.json({ data: block ?? { key: req.params.key, content } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /admin/knowledge/:key
router.put("/knowledge/:key", async (req, res) => {
  const { content, format, headers, rows } = req.body;

  // New table format: { content, format, headers, rows }
  if (
    format === "table" &&
    Array.isArray(headers) &&
    Array.isArray(rows)
  ) {
    try {
      const payload = { format: "table", headers, rows, content: content || "" };
      const result = await updateKnowledgeBlock(req.params.key, payload);
      res.json({ success: true, updated: result.updated });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // Legacy: plain text content
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "content is required" });
  }

  try {
    const result = await updateKnowledgeBlock(req.params.key, text);
    res.json({ success: true, updated: result.updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/prompts/test — test render
router.post("/test", async (req, res) => {
  const { key, variables } = req.body;
  if (!key) return res.status(400).json({ error: "key is required" });

  try {
    const result = await testRender(key, variables ?? {});
    if (result.content === null) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
