/**
 * MinerU PDF preprocessor — extracts structured text from PDFs before AI analysis.
 *
 * Workflow comparison:
 *
 * BEFORE (current):
 *   PDF bytes → Gemini/Claude Vision → raw AI analysis → JSON
 *   Cost: sending full PDF image to AI every time
 *
 * AFTER (with MinerU):
 *   PDF bytes → MinerU (local) → clean Markdown → Gemini/Claude Text → structured JSON
 *   Cost: fast local extraction + much smaller text input to AI
 *
 * MinerU advantages:
 * - VLM+OCR dual engine (109 languages)
 * - Layout detection (tables, figures, multi-column)
 * - Removes headers/footers/pagination noise
 * - Native table→HTML conversion
 * - Native formula→LaTeX conversion
 *
 * The existing AI analyzer (geminiAnalyzer / anthropicAnalyzer) receives
 * the extracted Markdown/text instead of raw PDF bytes. This is significantly
 * cheaper because:
 * 1. Text tokens cost far less than vision tokens
 * 2. MinerU has already "read" the document — less work for the AI
 * 3. Tables and structured data are explicit, not implied from visual layout
 *
 * FALLBACK: If MinerU is unavailable or fails, the original workflow
 * (PDF bytes → AI Vision) is used transparently.
 */

import { isMinerUAvailable, parsePdfSync, submitParseTask, waitForTask } from "./mineruClient.js";
import { mineruCfg } from "./config.js";

// ─── AVAILABILITY CHECK ──────────────────────────────────────────────────────

let _available = null; // cached result
let _checkTime = 0;
const CHECK_TTL_MS = 60_000; // re-check every 60s

/**
 * Check if MinerU is available (cached result).
 * @returns {Promise<boolean>}
 */
export async function isMinerUEnabled() {
  if (!mineruCfg.apiUrl) return false;
  if (_available !== null && Date.now() - _checkTime < CHECK_TTL_MS) {
    return _available;
  }
  _available = await isMinerUAvailable(mineruCfg.apiUrl);
  _checkTime = Date.now();
  return _available;
}

// ─── PARSE FUNCTION ───────────────────────────────────────────────────────

/**
 * Parse a PDF with MinerU.
 * Returns: { mineruText, pageCount, allText, tables }
 *
 * @param {string} pdfPath — file path on disk
 * @returns {Promise<object|null>} null if MinerU unavailable
 */
export async function parseWithMinerU(pdfPath) {
  if (!await isMinerUEnabled()) {
    return null;
  }

  try {
    let result;

    if (mineruCfg.syncMode) {
      result = await parsePdfSync({
        pdfPath,
        apiUrl: mineruCfg.apiUrl,
        returnMd: true,
        returnJson: true,
        gzip: true,
      });
    } else {
      // Async mode: submit → poll → get result
      const task = await submitParseTask({
        pdfPath,
        apiUrl: mineruCfg.apiUrl,
      });

      const waitResult = await waitForTask(
        task.taskId,
        mineruCfg.apiUrl,
        mineruCfg.pollIntervalMs,
        mineruCfg.asyncTimeoutMs
      );

      if (!waitResult.ok) {
        throw new Error(`MinerU task failed: ${waitResult.status}`);
      }

      result = waitResult.result || {};
    }

    // Normalize MinerU output
    return normalizeMinerUOutput(result, pdfPath);
  } catch (e) {
    console.warn(`[MinerU] parse error for ${pdfPath}:`, e.message);
    // Don't cache failure — might be transient
    return null;
  }
}

// ─── NORMALIZE OUTPUT ─────────────────────────────────────────────────────

/**
 * Normalize MinerU output into a structure the existing drawing analyzer can use.
 *
 * MinerU returns pages with content blocks. We extract:
 * - allText: concatenated text from all pages
 * - pageTexts: text per page (for per-page analysis)
 * - tables: extracted tables as HTML strings
 * - images: figure descriptions if available
 * - metadata: page count, document info
 *
 * @param {object} mineruResult
 * @param {string} pdfPath
 * @returns {{ mineruText: string, pageTexts: string[], tables: string[], pageCount: number }}
 */
export function normalizeMinerUOutput(mineruResult, pdfPath) {
  if (!mineruResult) return null;

  // MinerU v3 returns: { pages: [{ page_index, md_content, json_content, ... }] }
  // Each page has markdown content ready for AI consumption
  const pages = mineruResult.pages || mineruResult.result?.pages || [];
  const pageCount = pages.length || mineruResult.page_count || 0;

  const pageTexts = [];
  const tables = [];
  let allText = "";

  for (const page of pages) {
    // Primary: use md_content (Markdown) if available
    let pageText = page.md_content || page.markdown || page.content || "";

    // Fallback: reconstruct from json_content blocks
    if (!pageText && page.json_content) {
      pageText = extractTextFromBlocks(page.json_content);
    }

    // Also extract tables if present
    if (page.tables && Array.isArray(page.tables)) {
      for (const tbl of page.tables) {
        if (tbl.html || tbl.content) {
          tables.push(tbl.html || tbl.content);
        }
      }
    }

    // Clean up: remove excessive whitespace but preserve structure
    pageText = cleanMarkdown(pageText);
    pageTexts.push(pageText);
    allText += pageText + "\n\n--- PAGE BREAK ---\n\n";
  }

  // Extract figure descriptions if available
  const figures = [];
  for (const page of pages) {
    if (page.images && Array.isArray(page.images)) {
      for (const img of page.images) {
        if (img.description || img.caption) {
          figures.push(img.description || img.caption);
        }
      }
    }
  }

  return {
    mineruText: allText.trim(),
    pageTexts,
    tables,
    figures,
    pageCount,
    pdfPath,
    source: "mineru",
  };
}

/**
 * Extract plain text from MinerU JSON content blocks.
 * Handles nested block structure.
 */
function extractTextFromBlocks(blocks) {
  if (!blocks) return "";
  if (typeof blocks === "string") return blocks;

  const lines = [];
  const walk = (item) => {
    if (typeof item === "string") {
      lines.push(item.trim());
    } else if (Array.isArray(item)) {
      for (const child of item) walk(child);
    } else if (item && typeof item === "object") {
      // Try common text fields
      const text = item.text || item.content || item.md || item.string_val || "";
      if (text) lines.push(String(text).trim());
      // Recurse into children
      const children = item.children || item.blocks || item.content || item.items || [];
      if (Array.isArray(children)) {
        for (const child of children) walk(child);
      }
    }
  };

  walk(blocks);
  return lines.join("\n");
}

/**
 * Clean Markdown text for AI consumption.
 * - Remove excessive blank lines
 * - Normalize whitespace
 * - Preserve structural elements (tables, headers)
 * - Remove page numbers / headers / footers ( MinerU already does this but be safe)
 */
function cleanMarkdown(text) {
  if (!text) return "";
  let cleaned = text;

  // Remove lines that are just page numbers (standalone numbers)
  cleaned = cleaned
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Skip lines that are just page numbers
      if (/^\d+\s*$/.test(trimmed)) return false;
      // Skip very short lines that look like page separators
      if (/^[-_]{5,}$/.test(trimmed)) return false;
      return true;
    })
    .join("\n");

  // Collapse more than 2 consecutive blank lines to 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // Remove trailing whitespace per line
  cleaned = cleaned
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");

  return cleaned.trim();
}

// ─── PROXY: decide MinerU vs original ───────────────────────────────────────

/**
 * Get text for AI analysis. Uses MinerU if available, otherwise returns null
 * so caller falls back to original PDF→AI flow.
 *
 * @param {string} pdfPath
 * @returns {Promise<{mineruText: string, pageTexts: string[], tables: string[], pageCount: number}|null>}
 */
export async function getPdfTextForAI(pdfPath) {
  return await parseWithMinerU(pdfPath);
}

// ─── PAGE-BY-PAGE EXTRACTION ───────────────────────────────────────────────

/**
 * Extract text for a specific page range.
 * Useful for splitting multi-page PDFs by MinerU page before AI analysis.
 *
 * @param {string} pdfPath
 * @param {number[]} pageNumbers (1-based, e.g. [1, 3, 5])
 * @returns {Promise<object|null>}
 */
export async function getPageTexts(pdfPath, pageNumbers = []) {
  const full = await parseWithMinerU(pdfPath);
  if (!full) return null;

  if (!pageNumbers.length) return full;

  const filteredTexts = [];
  for (const pgNum of pageNumbers) {
    const idx = pgNum - 1;
    if (full.pageTexts[idx]) {
      filteredTexts.push(full.pageTexts[idx]);
    }
  }

  return {
    ...full,
    mineruText: filteredTexts.join("\n\n--- PAGE BREAK ---\n\n"),
    pageTexts: filteredTexts,
    requestedPages: pageNumbers,
  };
}

/**
 * Extract only drawing-relevant pages from MinerU output.
 * Combines with existing pageTriage for best results.
 *
 * @param {object} mineruOutput — result from parseWithMinerU
 * @param {string[]} drawingPageNumbers (1-based)
 * @returns {object}
 */
export function extractDrawingPages(mineruOutput, drawingPageNumbers) {
  if (!mineruOutput) return null;

  if (!drawingPageNumbers?.length) {
    return mineruOutput; // use all
  }

  const filtered = drawingPageNumbers.map((n) => {
    const idx = n - 1;
    return mineruOutput.pageTexts[idx] || "";
  }).filter(Boolean);

  return {
    ...mineruOutput,
    mineruText: filtered.join("\n\n--- PAGE BREAK ---\n\n"),
    pageTexts: filtered,
    requestedPages: drawingPageNumbers,
  };
}
