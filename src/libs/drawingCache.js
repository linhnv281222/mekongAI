/**
 * Drawing/page dedup & cache — prevents re-analyzing same PDF pages.
 *
 * Strategy:
 * - Hash entire PDF file → cache drawing results keyed by file hash.
 * - Hash individual page → cache per-page results separately.
 * - Cache hit = skip AI call entirely.
 *
 * Cache format:
 * {
 *   "file:{fileHash}": {
 *     overall: { data, timestamp },
 *     pages: {
 *       "p{pageNum}": { data, timestamp }
 *     }
 *   }
 * }
 *
 * Stored in: data/drawing_cache.json
 * TTL: configurable (default 7 days), bypassed for manual refresh.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "../../data/drawing_cache.json");
const DEFAULT_TTL_DAYS = 7;

let _cache = null; // lazy-loaded in-memory cache
let _dirty = false; // track if we need to persist

// ─── HASHING ────────────────────────────────────────────────────────────────

/** Hash a file by its contents — fast, content-addressable */
export function hashFile(filePathOrBuffer) {
  const buf = Buffer.isBuffer(filePathOrBuffer)
    ? filePathOrBuffer
    : fs.readFileSync(filePathOrBuffer);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/** Hash a single page buffer */
export function hashPage(pageBuffer) {
  const buf = Buffer.isBuffer(pageBuffer) ? pageBuffer : Buffer.from(pageBuffer);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/** Hash a string (e.g., email body + attachments) for dedup */
export function hashString(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

// ─── CACHE INIT ─────────────────────────────────────────────────────────────

function loadCache() {
  if (_cache !== null) return;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      _cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } else {
      _cache = {};
    }
  } catch {
    _cache = {};
  }
}

function persistCache() {
  if (!_dirty) return;
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(_cache, null, 2));
    _dirty = false;
  } catch (e) {
    console.warn("[DrawingCache] persist error:", e.message);
  }
}

// ─── CACHE QUERY ────────────────────────────────────────────────────────────

/**
 * Get cached drawing result for an entire file.
 * @param {string|Buffer} fileOrBuffer
 * @param {number} [ttlDays]
 * @returns {object|null}
 */
export function getFileCache(fileOrBuffer, ttlDays = DEFAULT_TTL_DAYS) {
  loadCache();
  const hash = hashFile(fileOrBuffer);
  const entry = _cache[`file:${hash}`];
  if (!entry) return null;

  const ageMs = Date.now() - entry.timestamp;
  if (ageMs > ttlDays * 86400 * 1000) {
    delete _cache[`file:${hash}`];
    _dirty = true;
    return null;
  }
  return entry.overall || null;
}

/**
 * Get cached drawing result for a specific page.
 * @param {string|Buffer} pageBuffer
 * @param {number} pageNum
 * @param {string} parentFileHash — optional parent file hash for cross-ref
 * @param {number} [ttlDays]
 * @returns {object|null}
 */
export function getPageCache(pageBuffer, pageNum, parentFileHash = "", ttlDays = DEFAULT_TTL_DAYS) {
  loadCache();
  const hash = hashPage(pageBuffer);
  const key = `p${pageNum}:${hash}`;

  // Check page-specific cache
  if (parentFileHash) {
    const fileEntry = _cache[`file:${parentFileHash}`];
    if (fileEntry?.pages?.[key]) {
      const ageMs = Date.now() - fileEntry.pages[key].timestamp;
      if (ageMs <= ttlDays * 86400 * 1000) {
        return fileEntry.pages[key].data || null;
      }
    }
  }

  // Check global page cache
  const entry = _cache[`page:${key}`];
  if (!entry) return null;
  const ageMs = Date.now() - entry.timestamp;
  if (ageMs > ttlDays * 86400 * 1000) {
    delete _cache[`page:${key}`];
    _dirty = true;
    return null;
  }
  return entry.data || null;
}

// ─── CACHE WRITE ───────────────────────────────────────────────────────────

/**
 * Save drawing result for entire file.
 * @param {string|Buffer} fileOrBuffer
 * @param {object} data
 */
export function setFileCache(fileOrBuffer, data) {
  loadCache();
  const hash = hashFile(fileOrBuffer);
  if (!_cache[`file:${hash}`]) {
    _cache[`file:${hash}`] = { pages: {} };
  }
  _cache[`file:${hash}`].overall = { data, timestamp: Date.now() };
  _dirty = true;
  persistCache();
}

/**
 * Save drawing result for a specific page.
 * @param {string|Buffer} pageBuffer
 * @param {number} pageNum
 * @param {object} data
 * @param {string} [parentFileHash]
 */
export function setPageCache(pageBuffer, pageNum, data, parentFileHash = "") {
  loadCache();
  const hash = hashPage(pageBuffer);
  const key = `p${pageNum}:${hash}`;

  if (parentFileHash) {
    if (!_cache[`file:${parentFileHash}`]) {
      _cache[`file:${parentFileHash}`] = { pages: {} };
    }
    _cache[`file:${parentFileHash}`].pages[key] = { data, timestamp: Date.now() };
  } else {
    _cache[`page:${key}`] = { data, timestamp: Date.now() };
  }
  _dirty = true;
  persistCache();
}

// ─── BATCH HELPERS ─────────────────────────────────────────────────────────

/**
 * Given a file buffer and its pages, return which pages are already cached.
 * Returns: Map<pageNum, cachedData>
 *
 * @param {Buffer} fileBuffer
 * @param {Array<{buffer: Buffer, page: number}>} pages
 * @param {number} [ttlDays]
 * @returns {Map<number, object>}
 */
export function getCachedPages(fileBuffer, pages, ttlDays = DEFAULT_TTL_DAYS) {
  loadCache();
  const fileHash = hashFile(fileBuffer);
  const cached = new Map();

  for (const pg of pages) {
    const buf = Buffer.isBuffer(pg.buffer) ? pg.buffer : Buffer.from(pg.buffer);
    const pageHash = hashPage(buf);
    const key = `p${pg.page}:${pageHash}`;

    // Check file-scoped cache first
    const fileEntry = _cache[`file:${fileHash}`];
    if (fileEntry?.pages?.[key]) {
      const ageMs = Date.now() - fileEntry.pages[key].timestamp;
      if (ageMs <= ttlDays * 86400 * 1000) {
        cached.set(pg.page, fileEntry.pages[key].data);
        continue;
      }
    }

    // Check global page cache
    const entry = _cache[`page:${key}`];
    if (entry) {
      const ageMs = Date.now() - entry.timestamp;
      if (ageMs <= ttlDays * 86400 * 1000) {
        cached.set(pg.page, entry.data);
      }
    }
  }

  return cached;
}

/**
 * Save page results in batch.
 * @param {Buffer} fileBuffer
 * @param {Array<{buffer: Buffer, page: number, data: object}>} results
 */
export function setCachedPages(fileBuffer, results) {
  loadCache();
  const fileHash = hashFile(fileBuffer);

  if (!_cache[`file:${fileHash}`]) {
    _cache[`file:${fileHash}`] = { pages: {} };
  }

  for (const r of results) {
    const buf = Buffer.isBuffer(r.buffer) ? r.buffer : Buffer.from(r.buffer);
    const pageHash = hashPage(buf);
    const key = `p${r.page}:${pageHash}`;
    _cache[`file:${fileHash}`].pages[key] = { data: r.data, timestamp: Date.now() };
  }

  _dirty = true;
  persistCache();
}

// ─── CACHE MANAGEMENT ──────────────────────────────────────────────────────

/** Get cache stats for monitoring */
export function getCacheStats() {
  loadCache();
  const fileKeys = Object.keys(_cache).filter((k) => k.startsWith("file:"));
  const pageKeys = Object.keys(_cache).filter((k) => k.startsWith("page:"));
  let totalPages = 0;
  let freshPages = 0;
  const ttlMs = DEFAULT_TTL_DAYS * 86400 * 1000;

  for (const fk of fileKeys) {
    const pages = _cache[fk].pages || {};
    totalPages += Object.keys(pages).length;
    for (const pk of Object.keys(pages)) {
      if (Date.now() - pages[pk].timestamp <= ttlMs) freshPages++;
    }
  }

  return {
    totalFileEntries: fileKeys.length,
    totalPageKeys: totalPages,
    freshPageKeys: freshPages,
    stalePageKeys: totalPages - freshPages,
  };
}

/** Invalidate all cache */
export function clearCache() {
  _cache = {};
  _dirty = true;
  persistCache();
}

/** Invalidate cache for a specific file */
export function invalidateFile(fileOrBuffer) {
  loadCache();
  const hash = hashFile(fileOrBuffer);
  delete _cache[`file:${hash}`];
  _dirty = true;
  persistCache();
}
