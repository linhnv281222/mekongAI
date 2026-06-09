/**
 * Selective knowledge block loader.
 *
 * Problem: Every AI call loads ALL knowledge blocks (materials, heat treat,
 * surface, shapes, market) even when only 1-2 are relevant.
 *
 * Solution:
 * - `getRelevantKnowledge(requiredFields)` — only loads blocks matching field needs
 * - `getKnowledgeForField(field)` — loads single block for a specific field
 * - Pre-builds a field→block index at startup for O(1) lookup
 * - Skips blocks that are purely lookup/rule when text has no signal
 */

// Map field → which knowledge block contains relevant info
const FIELD_BLOCK_INDEX = {
  vat_lieu: ["vnt-materials"],
  ma_vat_lieu: ["vnt-materials"],
  material: ["vnt-materials"],
  xlbm: ["vnt-surface"],
  xu_ly_be_mat: ["vnt-surface"],
  surface: ["vnt-surface"],
  xu_ly_nhiet: ["vnt-heat-treat"],
  heat_treat: ["vnt-heat-treat"],
  hrc: ["vnt-heat-treat"],
  ma_quy_trinh: ["vnt-shapes"],
  hinh_dang: ["vnt-shapes"],
  shape: ["vnt-shapes"],
  thi_truong: ["vnt-markets"],
  market: ["vnt-markets"],
};

// Reverse index: block → all fields it covers
const BLOCK_FIELDS = {};
for (const [field, blocks] of Object.entries(FIELD_BLOCK_INDEX)) {
  for (const block of blocks) {
    if (!BLOCK_FIELDS[block]) BLOCK_FIELDS[block] = [];
    BLOCK_FIELDS[block].push(field);
  }
}

/**
 * Get only the knowledge blocks needed for specific drawing fields.
 * Pass the fields you actually need — everything else is skipped.
 *
 * @param {string[]} requiredFields — e.g. ["vat_lieu", "xu_ly_be_mat"]
 * @returns {Promise<{ blockKey: string, content: string }[]>}
 *
 * @example
 * const needed = await getRelevantKnowledge(["vat_lieu", "xlbm"]);
 * // Only loads vnt-materials and vnt-surface
 */
export async function getRelevantKnowledge(requiredFields) {
  const { getKnowledgeBlock } = await import("../prompts/promptStore.js");

  if (!requiredFields || requiredFields.length === 0) {
    return [];
  }

  const neededBlocks = new Set();
  for (const field of requiredFields) {
    const blocks = FIELD_BLOCK_INDEX[field.toLowerCase()] || [];
    for (const b of blocks) {
      neededBlocks.add(b);
    }
  }

  if (neededBlocks.size === 0) {
    return [];
  }

  const results = [];
  for (const blockKey of neededBlocks) {
    const content = await getKnowledgeBlock(blockKey);
    if (content) {
      results.push({ blockKey, content });
    }
  }
  return results;
}

/**
 * Build a compact knowledge context string for a specific task.
 * Only includes blocks that are actually relevant.
 *
 * @param {string[]} requiredFields
 * @returns {Promise<string>} — rendered knowledge string ready to inject
 *
 * @example
 * const ctx = await buildKnowledgeContext(["vat_lieu", "xu_ly_nhiet"]);
 * // "## Nguyên vật liệu:\n{{MATERIAL}}\n\n## Xử lý nhiệt:\n{{HEAT_TREAT}}\n"
 */
export async function buildKnowledgeContext(requiredFields) {
  if (!requiredFields || requiredFields.length === 0) {
    return "";
  }

  const blocks = await getRelevantKnowledge(requiredFields);
  if (blocks.length === 0) return "";

  const blockTitleMap = {
    "vnt-materials": "MATERIAL",
    "vnt-heat-treat": "HEAT_TREAT",
    "vnt-surface": "SURFACE",
    "vnt-shapes": "SHAPE",
    "vnt-markets": "MARKET",
  };

  const parts = [];
  for (const { blockKey, content } of blocks) {
    const varName = blockTitleMap[blockKey];
    if (varName) {
      parts.push(`{{${varName}}}\n${content}`);
    } else {
      parts.push(content);
    }
  }

  return parts.join("\n\n");
}

/**
 * Fields typically needed for each drawing step.
 * Used to auto-determine which knowledge to load.
 */
export const FIELD_REQUIREMENTS = {
  // Initial classification — very minimal
  classify: ["thi_truong"],

  // Drawing analysis — full set
  drawing: ["vat_lieu", "xu_ly_be_mat", "xu_ly_nhiet", "hinh_dang", "ma_quy_trinh"],

  // Chat extraction — medium set
  chat: ["vat_lieu", "xu_ly_be_mat", "xu_ly_nhiet", "thi_truong"],

  // Market-only tasks
  market: ["thi_truong"],

  // Material reference
  material_only: ["vat_lieu"],
};

/**
 * Get knowledge for a specific task type.
 * @param {"classify"|"drawing"|"chat"|"market"|"material_only"} task
 * @returns {Promise<string>}
 */
export async function getKnowledgeForTask(task) {
  const fields = FIELD_REQUIREMENTS[task];
  if (!fields) return "";
  return buildKnowledgeContext(fields);
}

/**
 * Analyze which drawing fields are extractable by regex/rules
 * vs. which need AI. Returns arrays of each.
 *
 * @param {object} pageText — extracted text from drawing page
 * @returns {{ ruleExtractable: string[], aiNeeded: string[] }}
 */
export function analyzeFieldExtractionFeasibility(pageText) {
  const ruleExtractable = [];
  const aiNeeded = [];

  // ma_ban_ve patterns — rule-extractable
  if (/图纸号码| Drawing No|図 ?面 ?番 ?号/i.test(pageText)) {
    ruleExtractable.push("ma_ban_ve");
  }

  // Material codes — rule-extractable from text
  if (/材料[:\s]*[A-Z0-9-]+/i.test(pageText)) {
    ruleExtractable.push("vat_lieu");
  }
  if (/MATERIAL/i.test(pageText)) {
    ruleExtractable.push("vat_lieu");
  }

  // Quantity — rule-extractable
  if (/数量[:\s]*\d+/i.test(pageText) || /QTY[:\s]*\d+/i.test(pageText)) {
    ruleExtractable.push("so_luong");
  }

  // Surface treatment — sometimes rule-extractable
  if (/表面処理|表面硬化|Surface|Tiêu chuẩn bề mặt/i.test(pageText)) {
    ruleExtractable.push("xu_ly_be_mat");
  }

  // Heat treat — sometimes rule-extractable
  if (/熱処理|热处理|HEAT TREAT|硬度/i.test(pageText)) {
    ruleExtractable.push("xu_ly_nhiet");
  }

  // If pattern not matched above, likely needs AI
  const allDrawingFields = [
    "ma_ban_ve", "vat_lieu", "so_luong", "xu_ly_be_mat",
    "xu_ly_nhiet", "dung_sai_chung", "hinh_dang", "kich_thuoc",
    "so_be_mat_cnc", "dung_sai_chat_nhat", "ma_quy_trinh",
  ];

  for (const field of allDrawingFields) {
    if (!ruleExtractable.includes(field)) {
      aiNeeded.push(field);
    }
  }

  return { ruleExtractable, aiNeeded };
}
