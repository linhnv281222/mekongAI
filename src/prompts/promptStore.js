import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../data/drawRepository.js";
import { dbCfg } from "../libs/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.join(__dirname, "defaults");

// ─── In-memory cache ──────────────────────────────────────────────────────────
const _cache = new Map(); // key → { content, variables, ts }
const _knowledgeCache = new Map(); // key → { content, ts }
const CACHE_TTL_MS = 60_000; // 1 minute

// ─── Default seed data (key → file mapping) ──────────────────────────────────
const PROMPT_DEFAULTS = {
  "drawing-system": {
    name: "Drawing Analysis — System Prompt",
    description: "Primary system prompt for Claude Sonnet 4.6 drawing analysis",
    file: "drawing-system.txt",
    variables: ["VNT_MAT", "VNT_NHIET", "VNT_BM", "VNT_HINH"],
  },
  "drawing-correction": {
    name: "Drawing Correction — System Prompt",
    description: "System prompt for chat-based correction of analysis results",
    file: "drawing-correction.txt",
    variables: [],
  },
  "email-classify": {
    name: "Email Classification Prompt",
    description: "Prompt for classifying incoming emails (Haiku)",
    file: "email-classify.txt",
    variables: ["emailFrom", "emailSubject", "emailAttachments", "emailBody"],
  },
  "gemini-drawing": {
    name: "Drawing Analysis — Gemini Prompt",
    description: "Prompt for backup drawing analysis using Gemini 2.5",
    file: "gemini-drawing.txt",
    variables: ["VNT_KNOWLEDGE"],
  },
};

const KNOWLEDGE_DEFAULTS = {
  "vnt-materials": {
    name: "VNT Materials Conversion Table",
    description:
      "Maps international material standards (DIN/AISI/JIS) to VNT JIS codes",
    file: "vnt-materials.txt",
  },
  "vnt-heat-treat": {
    name: "VNT Heat Treatment Table",
    description:
      "Maps Japanese/English/French heat treatment symbols to VNT Vietnamese names",
    file: "vnt-heat-treat.txt",
  },
  "vnt-surface": {
    name: "VNT Surface Treatment Table",
    description:
      "Maps Japanese/English surface treatment symbols to VNT Vietnamese names",
    file: "vnt-surface.txt",
  },
  "vnt-shapes": {
    name: "VNT Shape Classification Table",
    description: "Billet type classification and machining approach routing",
    file: "vnt-shapes.txt",
  },
  "vnt-knowledge": {
    name: "VNT Knowledge (Gemini)",
    description: "Compact knowledge base for Gemini backup analyzer",
    file: "vnt-knowledge.txt",
  },
};

// ─── Render variables into template ──────────────────────────────────────────
function render(template, variables) {
  let out = template;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replaceAll(`{{${key}}}`, value ?? "");
  }
  return out;
}

// ─── Detect variables used in a template ─────────────────────────────────────
function detectVariables(text) {
  const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return [...new Set(matches)];
}

// ─── Load from filesystem (fallback) ─────────────────────────────────────────
function loadFromDefaults(key, defaults) {
  const def = defaults[key];
  if (!def) return null;
  const filePath = path.join(DEFAULTS_DIR, def.file);
  if (!fs.existsSync(filePath)) return null;
  return {
    content: fs.readFileSync(filePath, "utf8"),
    variables: def.variables,
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
function isDbAvailable() {
  return dbCfg.hasDb && pool;
}

async function dbQuery(text, params) {
  if (!isDbAvailable()) return null;
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (e) {
    console.warn("[promptStore] DB query failed:", e.message);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get rendered prompt with variables substituted.
 * Order: DB cache → DB query → default file → null
 *
 * @param {string} key — e.g. "drawing-system", "email-classify"
 * @param {object} variables — map of {{VAR_NAME}} → replacement text
 * @returns {string|null}
 */
export async function getPrompt(key, variables = {}) {
  // 1. Check in-memory cache
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return render(cached.content, variables);
  }

  // 2. Try DB
  const result = await dbQuery(
    `SELECT pv.content, pv.variables
     FROM prompt_versions pv
     JOIN prompt_templates pt ON pt.id = pv.template_id
     WHERE pt.key = $1 AND pv.is_active = true`,
    [key]
  );

  if (result?.rows?.length) {
    const { content, variables: storedVars } = result.rows[0];
    const vars = Array.isArray(storedVars)
      ? storedVars
      : detectVariables(content);
    _cache.set(key, { content, variables: vars, ts: Date.now() });
    return render(content, variables);
  }

  // 3. Fallback to defaults
  const def = loadFromDefaults(key, PROMPT_DEFAULTS);
  if (def) {
    _cache.set(key, {
      content: def.content,
      variables: def.variables,
      ts: Date.now(),
    });
    return render(def.content, variables);
  }

  return null;
}

/**
 * Get a knowledge block by key.
 * Order: knowledge cache → DB → default file → null
 *
 * @param {string} key — e.g. "vnt-materials"
 * @returns {string|null}
 */
export async function getKnowledgeBlock(key) {
  // 1. Check cache
  const cached = _knowledgeCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.content;
  }

  // 2. Try DB
  const result = await dbQuery(
    "SELECT content FROM knowledge_blocks WHERE key = $1",
    [key]
  );

  if (result?.rows?.length) {
    const content = result.rows[0].content;
    _knowledgeCache.set(key, { content, ts: Date.now() });
    return content;
  }

  // 3. Fallback to defaults
  const def = loadFromDefaults(key, KNOWLEDGE_DEFAULTS);
  if (def) {
    _knowledgeCache.set(key, { content: def.content, ts: Date.now() });
    return def.content;
  }

  return null;
}

/**
 * Invalidate all caches for a key (call after save/update).
 * @param {string} key
 */
export function invalidateCache(key) {
  _cache.delete(key);
  _knowledgeCache.delete(key);
}

/**
 * Invalidate all caches.
 */
export function invalidateAll() {
  _cache.clear();
  _knowledgeCache.clear();
}

/**
 * Cập nhật nội dung một phiên bản đã có (không tạo số mới).
 */
export async function updatePromptVersion(
  key,
  versionNumber,
  content,
  note = "",
  createdBy = "admin"
) {
  if (!isDbAvailable()) {
    const def = PROMPT_DEFAULTS[key];
    if (def) {
      const filePath = path.join(DEFAULTS_DIR, def.file);
      fs.writeFileSync(filePath, content, "utf8");
      invalidateCache(key);
    }
    return { version: versionNumber };
  }

  const v = Number(versionNumber);
  if (!Number.isInteger(v) || v < 1) return null;

  try {
    const tpl = await pool.query(
      "SELECT id FROM prompt_templates WHERE key = $1",
      [key]
    );
    if (!tpl.rows.length) return null;
    const templateId = tpl.rows[0].id;

    const variables = detectVariables(content);
    const noteTrim = (note || "").trim();
    const result = await pool.query(
      `UPDATE prompt_versions
       SET content = $1,
           variables = $2,
           note = CASE WHEN $3::text = '' THEN note ELSE $3 END,
           created_by = COALESCE($4, created_by)
       WHERE template_id = $5 AND version = $6
       RETURNING id, version`,
      [
        content,
        JSON.stringify(variables),
        noteTrim,
        createdBy || null,
        templateId,
        v,
      ]
    );

    if (!result.rows.length) return null;

    await pool.query(
      "UPDATE prompt_templates SET updated_at = NOW() WHERE id = $1",
      [templateId]
    );
    invalidateCache(key);
    return { id: result.rows[0].id, version: result.rows[0].version };
  } catch (e) {
    console.error("[promptStore] updatePromptVersion error:", e.message);
    return null;
  }
}

/**
 * Tạo phiên bản mới (số tăng dần). Mặc định không kích hoạt — runtime vẫn dùng bản đang active.
 *
 * @param {boolean} setActive — true: giống hành vi cũ (tất cả inactive, bản mới active)
 */
export async function createPromptVersion(
  key,
  content,
  note = "",
  createdBy = "admin",
  setActive = false
) {
  if (!isDbAvailable()) {
    const def = PROMPT_DEFAULTS[key];
    if (def) {
      const filePath = path.join(DEFAULTS_DIR, def.file);
      fs.writeFileSync(filePath, content, "utf8");
      invalidateCache(key);
    }
    return null;
  }

  try {
    const tpl = await pool.query(
      "SELECT id FROM prompt_templates WHERE key = $1",
      [key]
    );
    if (!tpl.rows.length) return null;

    const templateId = tpl.rows[0].id;

    const last = await pool.query(
      "SELECT COALESCE(MAX(version), 0) + 1 as next FROM prompt_versions WHERE template_id = $1",
      [templateId]
    );
    const nextVersion = last.rows[0].next;

    if (setActive) {
      await pool.query(
        "UPDATE prompt_versions SET is_active = false WHERE template_id = $1",
        [templateId]
      );
    }

    const variables = detectVariables(content);
    const result = await pool.query(
      `INSERT INTO prompt_versions
         (template_id, version, content, variables, is_active, created_by, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, version`,
      [
        templateId,
        nextVersion,
        content,
        JSON.stringify(variables),
        setActive,
        createdBy,
        note || "",
      ]
    );

    await pool.query(
      "UPDATE prompt_templates SET updated_at = NOW() WHERE id = $1",
      [templateId]
    );

    invalidateCache(key);

    return {
      id: result.rows[0].id,
      version: result.rows[0].version,
    };
  } catch (e) {
    console.error("[promptStore] createPromptVersion error:", e.message);
    return null;
  }
}

/**
 * @deprecated Dùng createPromptVersion(..., true) hoặc create + setActivePromptVersion
 * Giữ để tương thích: luôn tạo mới và kích hoạt.
 */
export async function savePromptVersion(
  key,
  content,
  note = "",
  createdBy = "admin"
) {
  return createPromptVersion(key, content, note, createdBy, true);
}

/**
 * Update a knowledge block (insert-or-update).
 *
 * @param {string} key
 * @param {string} content
 * @returns {{ updated: boolean }}
 */
export async function updateKnowledgeBlock(key, content) {
  if (!isDbAvailable()) {
    const def = KNOWLEDGE_DEFAULTS[key];
    if (def) {
      const filePath = path.join(DEFAULTS_DIR, def.file);
      fs.writeFileSync(filePath, content, "utf8");
      invalidateCache(key);
    }
    return { updated: false };
  }

  try {
    await pool.query(
      `INSERT INTO knowledge_blocks (key, name, content, updated_at)
         VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET content = $3, updated_at = NOW()`,
      [key, KNOWLEDGE_DEFAULTS[key]?.name ?? key, content]
    );
    invalidateCache(key);
    return { updated: true };
  } catch (e) {
    console.error("[promptStore] updateKnowledgeBlock error:", e.message);
    return { updated: false };
  }
}

/**
 * List all prompt templates with their active version info.
 *
 * @returns {Array}
 */
export async function listPromptTemplates() {
  if (!isDbAvailable()) {
    return Object.entries(PROMPT_DEFAULTS).map(([key, def]) => ({
      key,
      name: def.name,
      description: def.description,
      variables: def.variables,
      active_version: null,
      active_content: null,
    }));
  }

  const result = await pool.query(
    `SELECT pt.key, pt.name, pt.description,
            pv.version, pv.content, pv.variables, pv.note, pv.created_by, pv.created_at
     FROM prompt_templates pt
     LEFT JOIN prompt_versions pv ON pv.template_id = pt.id AND pv.is_active = true
     ORDER BY pt.id`
  );

  if (!result.rows.length) return null;

  return result.rows.map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    variables: Array.isArray(row.variables) ? row.variables : [],
    active_version: row.version ?? null,
    active_content: row.content ?? null,
    last_note: row.note ?? null,
    last_author: row.created_by ?? null,
    last_updated: row.created_at ?? null,
  }));
}

/**
 * List all versions for a template.
 *
 * @param {string} key
 * @returns {Array|null}
 */
export async function listPromptVersions(key) {
  if (!isDbAvailable()) return null;

  const result = await pool.query(
    `SELECT pv.version, pv.content, pv.variables, pv.is_active,
            pv.note, pv.created_by, pv.created_at
     FROM prompt_versions pv
     JOIN prompt_templates pt ON pt.id = pv.template_id
     WHERE pt.key = $1
     ORDER BY pv.version DESC`,
    [key]
  );

  return result.rows.length ? result.rows : null;
}

/**
 * Delete one saved version. Cannot remove the last remaining version.
 * If the deleted row was active, promotes the highest remaining version to active.
 *
 * @param {string} key — template key
 * @param {number} versionNumber — version column value
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
/**
 * Đặt phiên bản đang chạy (getPrompt đọc is_active = true).
 */
export async function setActivePromptVersion(key, versionNumber) {
  if (!isDbAvailable()) {
    invalidateCache(key);
    return { ok: true, fileMode: true };
  }

  const v = Number(versionNumber);
  if (!Number.isInteger(v) || v < 1) {
    return { ok: false, code: "bad_version" };
  }

  try {
    const tpl = await pool.query(
      "SELECT id FROM prompt_templates WHERE key = $1",
      [key]
    );
    if (!tpl.rows.length) return { ok: false, code: "template_not_found" };
    const templateId = tpl.rows[0].id;

    const row = await pool.query(
      "SELECT id FROM prompt_versions WHERE template_id = $1 AND version = $2",
      [templateId, v]
    );
    if (!row.rows.length) return { ok: false, code: "version_not_found" };

    await pool.query(
      "UPDATE prompt_versions SET is_active = false WHERE template_id = $1",
      [templateId]
    );
    await pool.query(
      `UPDATE prompt_versions SET is_active = true
       WHERE template_id = $1 AND version = $2`,
      [templateId, v]
    );
    await pool.query(
      "UPDATE prompt_templates SET updated_at = NOW() WHERE id = $1",
      [templateId]
    );
    invalidateCache(key);
    return { ok: true };
  } catch (e) {
    console.error("[promptStore] setActivePromptVersion error:", e.message);
    return { ok: false, code: "db_error" };
  }
}

export async function deletePromptVersion(key, versionNumber) {
  if (!isDbAvailable()) {
    return { ok: false, code: "no_db" };
  }

  const v = Number(versionNumber);
  if (!Number.isInteger(v) || v < 1) {
    return { ok: false, code: "bad_version" };
  }

  try {
    const tpl = await pool.query(
      "SELECT id FROM prompt_templates WHERE key = $1",
      [key]
    );
    if (!tpl.rows.length) {
      return { ok: false, code: "template_not_found" };
    }
    const templateId = tpl.rows[0].id;

    const row = await pool.query(
      "SELECT id, is_active FROM prompt_versions WHERE template_id = $1 AND version = $2",
      [templateId, v]
    );
    if (!row.rows.length) {
      return { ok: false, code: "version_not_found" };
    }

    const cnt = await pool.query(
      "SELECT COUNT(*)::int AS c FROM prompt_versions WHERE template_id = $1",
      [templateId]
    );
    if (cnt.rows[0].c <= 1) {
      return { ok: false, code: "last_version" };
    }

    const wasActive = row.rows[0].is_active;

    await pool.query(
      "DELETE FROM prompt_versions WHERE template_id = $1 AND version = $2",
      [templateId, v]
    );

    if (wasActive) {
      await pool.query(
        "UPDATE prompt_versions SET is_active = false WHERE template_id = $1",
        [templateId]
      );
      const maxRow = await pool.query(
        `SELECT version FROM prompt_versions
         WHERE template_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [templateId]
      );
      if (maxRow.rows.length) {
        await pool.query(
          `UPDATE prompt_versions SET is_active = true
           WHERE template_id = $1 AND version = $2`,
          [templateId, maxRow.rows[0].version]
        );
      }
    }

    await pool.query(
      "UPDATE prompt_templates SET updated_at = NOW() WHERE id = $1",
      [templateId]
    );

    invalidateCache(key);
    return { ok: true };
  } catch (e) {
    console.error("[promptStore] deletePromptVersion error:", e.message);
    return { ok: false, code: "db_error" };
  }
}

/**
 * List all knowledge blocks.
 *
 * @returns {Array}
 */
export async function listKnowledgeBlocks() {
  if (!isDbAvailable()) {
    return Object.entries(KNOWLEDGE_DEFAULTS).map(([key, def]) => ({
      key,
      name: def.name,
      description: def.description,
      content: null,
    }));
  }

  const result = await pool.query(
    "SELECT key, name, description, content, updated_at FROM knowledge_blocks ORDER BY key"
  );

  if (!result.rows.length) return null;

  return result.rows.map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    content: row.content,
    updated_at: row.updated_at,
  }));
}

/**
 * Seed the database with default prompts and knowledge blocks.
 * Only inserts if tables are empty (idempotent).
 */
export async function seedDefaults() {
  if (!isDbAvailable()) {
    console.log("[promptStore] No DB — using file-based defaults only");
    return;
  }

  try {
    // Seed prompt templates
    for (const [key, def] of Object.entries(PROMPT_DEFAULTS)) {
      const exists = await pool.query(
        "SELECT id FROM prompt_templates WHERE key = $1",
        [key]
      );
      if (exists.rows.length) continue;

      const filePath = path.join(DEFAULTS_DIR, def.file);
      const content = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, "utf8")
        : "";
      const variables = def.variables;

      await pool.query(
        `INSERT INTO prompt_templates (key, name, description)
           VALUES ($1, $2, $3)`,
        [key, def.name, def.description]
      );

      const tpl = await pool.query(
        "SELECT id FROM prompt_templates WHERE key = $1",
        [key]
      );
      await pool.query(
        `INSERT INTO prompt_versions
           (template_id, version, content, variables, is_active, note)
           VALUES ($1, 1, $2, $3, true, 'Initial seed from defaults')`,
        [tpl.rows[0].id, content, JSON.stringify(variables)]
      );
    }

    // Seed knowledge blocks
    for (const [key, def] of Object.entries(KNOWLEDGE_DEFAULTS)) {
      const exists = await pool.query(
        "SELECT id FROM knowledge_blocks WHERE key = $1",
        [key]
      );
      if (exists.rows.length) continue;

      const filePath = path.join(DEFAULTS_DIR, def.file);
      const content = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, "utf8")
        : "";

      await pool.query(
        `INSERT INTO knowledge_blocks (key, name, description, content)
           VALUES ($1, $2, $3, $4)`,
        [key, def.name, def.description, content]
      );
    }

    console.log("[promptStore] Defaults seeded");
  } catch (e) {
    console.error("[promptStore] seedDefaults error:", e.message);
  }
}

/**
 * Test render — substitute variables without touching DB.
 *
 * @param {string} key
 * @param {object} variables
 * @returns {{ content: string, variables: string[], source: 'db'|'cache'|'defaults' }}
 */
export async function testRender(key, variables = {}) {
  // Try cache first
  const cached = _cache.get(key);
  if (cached) {
    return {
      content: render(cached.content, variables),
      variables: cached.variables,
      source: "cache",
    };
  }

  // Try DB
  const result = await dbQuery(
    `SELECT pv.content, pv.variables
     FROM prompt_versions pv
     JOIN prompt_templates pt ON pt.id = pv.template_id
     WHERE pt.key = $1 AND pv.is_active = true`,
    [key]
  );

  if (result?.rows?.length) {
    const { content, variables: storedVars } = result.rows[0];
    const vars = Array.isArray(storedVars)
      ? storedVars
      : detectVariables(content);
    return {
      content: render(content, variables),
      variables: vars,
      source: "db",
    };
  }

  // Defaults
  const def = loadFromDefaults(key, PROMPT_DEFAULTS);
  if (def) {
    return {
      content: render(def.content, variables),
      variables: def.variables,
      source: "defaults",
    };
  }

  return { content: null, variables: [], source: null };
}
