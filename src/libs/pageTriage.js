/**
 * Page triage — determines if a PDF page is a drawing page before AI analysis.
 *
 * Strategy:
 * 1. Extract text from page (lightweight, no AI)
 * 2. Score based on drawing-specific signals
 * 3. Return page type: "drawing" | "non-drawing" | "unknown"
 *
 * Drawing signals: CAD metadata, title block keywords, dimension annotations,
 * tolerance specs, GD&T symbols, Japanese drawing numbers, section views.
 *
 * Non-drawing signals: large blocks of prose text, tables/BOM headers,
 * cover sheet elements, terms & conditions.
 */

import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";

// Weight thresholds
const DRAWING_THRESHOLD = 2;   // min score to classify as "drawing"
const NON_DRAWING_THRESHOLD = -2; // max score to classify as "non-drawing"

// ── Positive signals (add to drawing score) ──────────────────────────────────
const DRAWING_PATTERNS = [
  // Drawing number patterns
  [/图纸|图样|工程图|設計図| صنع رس/i, 3],
  [/(?:drawing|dwg|図|drawing\.?|dwg\.?)\s*(?:no\.?|番号|番|number|#)\s*:?\s*[\w\-\.]+/i, 3],
  [/^drawing\s*no\.?\s*:?\s*/im, 3],
  [/^圖號|圖號|^圖\s*號/im, 3],

  // Title block indicators
  [/材料[:\s]*[a-z0-9]/i, 2],
  [/material[:\s]*[a-z0-9]/i, 2],
  [/数量|數量|数量|qty|quan.?tity/i, 2],
  [/scale[:\s]*[1:\d]/i, 2],
  [/比例尺|尺度/i, 2],
  [/unit[:\s]*(mm|mm\s*)|mil?imeter/i, 1],
  [/ Toleranc|TOLERA|dung.?sai/i, 2],
  [/general\s*tolerance/i, 2],
  [/JIS\s*B\s*\d+|ISO\s*\d+/i, 2],
  [/ANSI\s*Y|ASME\s*Y/i, 2],

  // Geometric dimensioning
  [/(?:position|t位置|posi)\s*[:\s]*[\d\.]+/i, 1],
  [/(?:flatness|平坦度|平たん度)/i, 1],
  [/(?:straightness|直角度|真直度)/i, 1],
  [/(?:perpendicular|直角度)/i, 1],
  [/(?:parallelism|平行度)/i, 1],
  [/(?:symmetry|対称度)/i, 1],
  [/(?:runout|振れ)/i, 1],
  [/(?:concentric|同芯度)/i, 1],

  // Manufacturing processes
  [/表面処理|表面硬化|熱処理|表面|treatment/i, 1],
  [/heat\s*treat/i, 1],
  [/cutting\s*edge|刃先|切れ刃/i, 1],

  // Dimension format patterns
  [/\b[øØφ]\s*\d+[\.,]?\d*/i, 2],  // diameter symbol + number
  [/\br\d+\b/i, 1],                  // r + number (radius)
  [/\bs\d+\b/i, 1],                  // s + number (chamfer)
  [/\b\d+\s*[x×]\s*\d+\s*[x×]\s*\d+\b/i, 1],  // L×W×H format
  [/±\s*[\d\.]+/i, 1],              // tolerance ±

  // Japanese machining terms
  [/旋盤|フライス|マシニング|切削|研磨/i, 1],
  [/加工|Manufacturing/i, 1],
  [/公差|許容差|tolerance/i, 2],

  // Surface finish
  [/\bRa\s*[\d\.]+/i, 2],
  [/\bN\d+\b/i, 1],  // N1-N12 surface grade
  [/\b\d\.?\d*\s*(μ|micro)/i, 1],

  // CAD format indicators
  [/A[0-4]\s*$/i, 1],  // A3, A4 sheet size
  [/sheet\s*(size|format|a[0-4])/i, 1],
  [/^1:1\s*$/im, 2],   // scale notation

  // Technical symbols
  [/[↗↘↙↖⟲⟳⊙⊕⊗⊘]/i, 1],  // various technical/engineering symbols
  [/断面|section|sect/i, 1],
  [/詳图|詳細|detail/i, 1],
  [/视图|視图|view/i, 1],
  [/公差|公差/i, 1],
];

// ── Negative signals (subtract from drawing score) ─────────────────────────
const NON_DRAWING_PATTERNS = [
  // Prose text blocks (multiple consecutive long lines)
  [/^.{200,}$/m, -1],   // lines > 200 chars are rarely in drawings

  // BOM / parts list indicators
  [/^(?:no\.?|no|item|part|品名|項番)\s/i, -2],
  [/^(?:description|name|name|品名|名称)/i, -2],
  [/^(?:qty|quantity|数量|數量)\s/i, -2],
  [/^(?:unit|単位|單位)\s/i, -2],
  [/^(?:price|単価|單價)\s/i, -3],
  [/^(?:amount|金額)\s/i, -3],
  [/^(?:maker|maker|メーカー|廠商)\s/i, -2],
  [/^(?:vendor|供应商|vender|仕入先)\s/i, -2],

  // Table-heavy pages (many | or + characters per line)
  [/\|\s*[-─]+\s*\|/g, -1],  // ASCII table borders

  // Quote/price context
  [/見積|报价|quote|quotation|bao gia|báo giá/i, -1],

  // Email/letter content
  [/subject:|from:|to:|date:|cc:|送信|受信/i, -2],

  // Cover sheet
  [/^[^a-zA-Z\u3000-\u9FFF]*$/m, 0],  // blank-ish pages

  // "Terms and Conditions" patterns
  [/terms?\s*(and|&)\s*condit/i, -3],
  [/条項|利用規約|terms/i, -2],
  [/payment\s*term|invoice\s*no/i, -2],
];

// ── Text extraction from PDF page ───────────────────────────────────────────

/**
 * Extract text content from a single PDF page using pdf-lib.
 * This is lightweight — no AI, no OCR, just reads the PDF's text objects.
 *
 * @param {Buffer|Uint8Array} pdfBuffer
 * @param {number} pageIndex (0-based)
 * @returns {Promise<string>} extracted text
 */
export async function extractPageTextFromBuffer(pdfBuffer, pageIndex) {
  const doc = await PDFDocument.load(pdfBuffer);
  const pageCount = doc.getPageCount();
  if (pageIndex < 0 || pageIndex >= pageCount) return "";

  const page = doc.getPage(pageIndex);
  const textContent = await page.getTextContent();
  const lines = [];
  for (const item of textContent.items) {
    if (item.str) {
      lines.push(item.str);
    }
  }
  return lines.join("\n");
}

// ── Main triage function ──────────────────────────────────────────────────

/**
 * Triage a single PDF page.
 * @param {Buffer|Uint8Array} pagePdfBuffer — single-page PDF buffer
 * @returns {{ type: "drawing"|"non-drawing"|"unknown", score: number, reason: string }}
 */
export async function triagePage(pagePdfBuffer) {
  let text = "";

  try {
    text = await extractPageTextFromBuffer(pagePdfBuffer, 0);
  } catch (e) {
    // Can't read text — use file-level analysis fallback
    return {
      type: "unknown",
      score: 0,
      reason: `text_extraction_failed:${e.message}`,
    };
  }

  if (!text || text.trim().length < 20) {
    return {
      type: "non-drawing",
      score: -3,
      reason: "page_nearly_blank",
    };
  }

  return scorePage(text);
}

/**
 * Score page text for drawing probability.
 * @param {string} text — extracted page text
 * @returns {{ type: "drawing"|"non-drawing"|"unknown", score: number, reason: string }}
 */
export function scorePage(text) {
  let score = 0;
  const reasons = [];

  // Check positive signals
  for (const [pattern, weight] of DRAWING_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      score += weight * Math.min(matches.length, 3); // cap at 3 matches per pattern
      if (weight >= 2) {
        reasons.push(`+${weight}:${pattern.source.slice(0, 20)}`);
      }
    }
  }

  // Check negative signals
  for (const [pattern, weight] of NON_DRAWING_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      score += weight * Math.min(matches.length, 3);
      if (weight <= -2) {
        reasons.push(`${weight}:${pattern.source.slice(0, 20)}`);
      }
    }
  }

  // Additional heuristics

  // 1. Text density check — drawings have specific character density
  const lines = text.split("\n").filter((l) => l.trim().length > 3);
  const avgLineLen = lines.length > 0
    ? lines.reduce((s, l) => s + l.trim().length, 0) / lines.length
    : 0;
  // Drawings typically have shorter lines (dimension annotations, labels)
  if (avgLineLen > 80) {
    score -= 2;
    reasons.push("-2:avgLineLen_too_long");
  } else if (avgLineLen < 30) {
    score += 1;
    reasons.push("+1:short_labels");
  }

  // 2. Ratio of numbers to letters — drawings have high number density
  const numCount = (text.match(/\d+/g) || []).length;
  const alphaCount = (text.match(/[a-zA-Z\u3040-\u9FFF]/g) || []).length;
  if (alphaCount > 0) {
    const numRatio = numCount / alphaCount;
    if (numRatio > 0.5) {
      score += 1;
      reasons.push("+1:high_number_density");
    }
  }

  // 3. Japanese characters — very common in manufacturing drawings
  const jpChars = (text.match(/[\u3000-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
  if (jpChars > 5) {
    score += 1;
    reasons.push("+1:japanese_chars");
  }

  // 4. Page size check (A3/A4 sheet references)
  if (/A[0-4](?:\s*(?:landscape|portrait))?|ISO\s*A[0-4]/i.test(text)) {
    score += 1;
    reasons.push("+1:standard_sheet_size");
  }

  // Determine type
  let type;
  if (score >= DRAWING_THRESHOLD) {
    type = "drawing";
  } else if (score <= NON_DRAWING_THRESHOLD) {
    type = "non-drawing";
  } else {
    type = "unknown";
  }

  return {
    type,
    score,
    reason: reasons.slice(0, 5).join(" | ") || `score:${score}`,
  };
}

// ── Batch triage ────────────────────────────────────────────────────────────

/**
 * Triage all pages of a multi-page PDF.
 * Returns: Map<pageIndex, triageResult>
 *
 * @param {Buffer} pdfBuffer
 * @param {Array<{path: string, page: number}>} pages — pages from splitPdf
 * @returns {Promise<Map<number, object>>}
 */
export async function triageAllPages(pdfBuffer, pages) {
  const results = new Map();

  try {
    const doc = await PDFDocument.load(pdfBuffer);
    for (const pg of pages) {
      const pageIdx = pg.page - 1; // 0-based
      if (pageIdx < 0 || pageIdx >= doc.getPageCount()) {
        results.set(pg.page, { type: "unknown", score: -99, reason: "page_out_of_range" });
        continue;
      }
      const page = doc.getPage(pageIdx);
      const textContent = await page.getTextContent();
      const lines = textContent.items.map((item) => item.str || "").join("\n");
      const scored = scorePage(lines);
      results.set(pg.page, scored);
    }
  } catch (e) {
    // On error, mark all as unknown
    for (const pg of pages) {
      results.set(pg.page, { type: "unknown", score: 0, reason: `triage_error:${e.message}` });
    }
  }

  return results;
}

/**
 * Filter pages that should be analyzed by AI.
 * - "drawing" → analyze
 * - "unknown" → analyze (default to caution)
 * - "non-drawing" → skip
 *
 * @param {Map<number, object>} triageResults
 * @param {Array} pages
 * @returns {Array} filtered pages to analyze
 */
export function filterPagesForAnalysis(triageResults, pages) {
  return pages.filter((pg) => {
    const result = triageResults.get(pg.page);
    if (!result) return true; // default: analyze
    return result.type !== "non-drawing";
  });
}
