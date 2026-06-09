/**
 * Message / email body dedup — prevents re-analyzing identical or near-identical content.
 *
 * Strategy:
 * - Hash normalized body (strip whitespace, signatures, quoted parts)
 * - Short TTL in-memory cache for fast dedup
 * - Optional persistent cache for longer-term dedup
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEDUP_FILE = path.join(__dirname, "../../data/message_dedup.json");
const DEDUP_TTL_MS = 30 * 60 * 1000; // 30 min

let _dedupCache = new Map();
let _dirty = false;

// ─── NORMALIZATION ────────────────────────────────────────────────────────

/** Normalize email/chat body for hashing — strip noise */
export function normalizeBodyForHash(body) {
  if (!body) return "";
  let text = String(body);

  // 1. Lowercase
  text = text.toLowerCase();

  // 2. Remove quoted reply blocks (> lines)
  text = text.split("\n").filter((l) => !l.trim().startsWith(">")).join("\n");

  // 3. Remove signature block
  const sigIdx = text.search(/^--\s*$/m);
  if (sigIdx !== -1) text = text.slice(0, sigIdx);

  // 4. Remove email headers
  text = text.replace(/^(subject|from|to|date|cc|bcc)[:\s][^\n]*/gim, "");

  // 5. Remove URLs
  text = text.replace(/https?:\/\/[^\s]+/g, "");

  // 6. Remove extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/** Hash a message for dedup */
export function hashMessage(body) {
  const normalized = normalizeBodyForHash(body);
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 16);
}

// ─── IN-MEMORY DEDUP ────────────────────────────────────────────────────

/**
 * Check if a message was recently processed (in-memory, short TTL).
 * @param {string} body
 * @returns {boolean} true if duplicate
 */
export function isDuplicateMessage(body) {
  const hash = hashMessage(body);
  const entry = _dedupCache.get(hash);

  if (!entry) return false;

  if (Date.now() - entry.ts > DEDUP_TTL_MS) {
    _dedupCache.delete(hash);
    return false;
  }

  return true;
}

/**
 * Mark a message as processed.
 * @param {string} body
 * @param {object} [result] — optional result to cache
 */
export function markProcessed(body, result = null) {
  const hash = hashMessage(body);
  _dedupCache.set(hash, { ts: Date.now(), result });
}

/**
 * Get cached result for a message.
 * @param {string} body
 * @returns {object|null}
 */
export function getCachedResult(body) {
  const hash = hashMessage(body);
  const entry = _dedupCache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.ts > DEDUP_TTL_MS) {
    _dedupCache.delete(hash);
    return null;
  }
  return entry.result || null;
}

// ─── PERSISTENT DEDUP (file-based) ───────────────────────────────────────

function loadDedupFile() {
  try {
    if (fs.existsSync(DEDUP_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DEDUP_FILE, "utf8"));
      // Migrate old format
      if (Array.isArray(raw)) {
        const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2h old entries
        const map = {};
        for (const entry of raw) {
          if (typeof entry === "string") {
            // Old format: just hashes array
            map[entry] = Date.now();
          } else if (entry.ts && Date.now() - entry.ts < 2 * 60 * 60 * 1000) {
            map[entry.hash] = entry.ts;
          }
        }
        return map;
      }
      return raw || {};
    }
  } catch {}
  return {};
}

function persistDedupFile() {
  if (!_dirty) return;
  try {
    const dir = path.dirname(DEDUP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DEDUP_FILE, JSON.stringify(_dedupCache, null, 2));
    _dirty = false;
  } catch (e) {
    console.warn("[Dedup] persist error:", e.message);
  }
}

/**
 * Persistent check — checks both in-memory and file cache.
 * @param {string} body
 * @returns {boolean}
 */
export function isDuplicateMessagePersistent(body) {
  const hash = hashMessage(body);

  // Check in-memory first
  if (_dedupCache.has(hash)) {
    const entry = _dedupCache.get(hash);
    if (Date.now() - entry.ts < DEDUP_TTL_MS) return true;
  }

  // Check file cache
  const fileCache = loadDedupFile();
  if (fileCache[hash]) {
    if (Date.now() - fileCache[hash] < DEDUP_TTL_MS) {
      _dedupCache.set(hash, { ts: fileCache[hash] });
      return true;
    }
  }

  return false;
}

// ─── ATTACHMENT DEDUP ────────────────────────────────────────────────────

/**
 * Hash attachment list for dedup.
 * Only considers filenames + sizes (not content for speed).
 * @param {Array<{name: string, size?: number}>} attachments
 * @returns {string}
 */
export function hashAttachmentList(attachments) {
  if (!attachments || attachments.length === 0) return "no_attach";
  const sig = attachments
    .map((a) => `${a.name}_${a.size || 0}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(sig, "utf8").digest("hex").slice(0, 16);
}

/**
 * Combined dedup: body + attachment list hash.
 * Use this for email dedup where both matter.
 * @param {string} body
 * @param {Array} attachments
 * @returns {string}
 */
export function hashMessageWithAttachments(body, attachments) {
  const bodyHash = hashMessage(body);
  const attachHash = hashAttachmentList(attachments);
  return `${bodyHash}_${attachHash}`;
}
