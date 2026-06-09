/**
 * Shared JSON extraction utility — used by all AI modules.
 * Replaces duplicate extractJson/findBalancedBraces in:
 * - ai/emailClassifierGemini.js
 * - ai/emailClassifierClaude.js
 * - ai/geminiAnalyzer.js
 * - ai/anthropicAnalyzer.js
 * - ai/chatExtract.js
 */

/**
 * Find balanced braces/brackets in text and return the matched substring.
 * @param {string} text
 * @param {string} openChar
 * @param {string} closeChar
 * @returns {string|null}
 */
export function findBalancedBraces(text, openChar, closeChar) {
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === openChar) { start = i; break; }
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"' || ch === "'") { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * Extract JSON from AI response text.
 * Strategy: try direct parse → try balanced object → try balanced array.
 * @param {string} text
 * @returns {object}
 */
export function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gm, "")
    .trim();

  try { return JSON.parse(cleaned); } catch {}

  const objMatch = findBalancedBraces(cleaned, "{", "}");
  if (objMatch) {
    try { return JSON.parse(objMatch); } catch {}
  }

  const arrMatch = findBalancedBraces(cleaned, "[", "]");
  if (arrMatch) {
    try { return JSON.parse(arrMatch); } catch {}
  }

  throw new Error("Không thể extract JSON from response");
}
