/**
 * MinerU API client — wraps the MinerU FastAPI server.
 *
 * MinerU transforms PDFs into LLM-ready Markdown/JSON.
 * Compared to raw PDF→AI, MinerU:
 * - Extracts structured text (no OCR hallucination)
 * - Detects layout: tables, formulas, figures
 * - Returns clean Markdown per page
 *
 * API endpoints (from MinerU fast_api.py):
 * - POST /file_parse  → synchronous, returns result directly
 * - POST /tasks        → async, returns task_id immediately
 * - GET  /tasks/{id}   → check task status
 * - GET  /tasks/{id}/result → get result
 * - GET  /health       → health check
 *
 * Integration strategy:
 * - MinerU runs as a LOCAL Docker service (or self-hosted)
 * - Node.js calls it via HTTP (fetch)
 * - Falls back to current PDF→AI flow if MinerU unavailable
 *
 * Install: pip install -U "mineru[all]"  (or Docker)
 * Start:  mineru-server --port 8000
 * Docker: docker run -p 8000:8000 opendatalab/mineru-api
 */

import fs from "fs";

const DEFAULT_API_URL = "http://127.0.0.1:8000";

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

/**
 * Check if MinerU server is reachable.
 * @param {string} [apiUrl]
 * @returns {Promise<boolean>}
 */
export async function isMinerUAvailable(apiUrl) {
  try {
    const url = (apiUrl || DEFAULT_API_URL).replace(/\/$/, "");
    const res = await fetch(`${url}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── SYNC PARSE ────────────────────────────────────────────────────────────

/**
 * Parse a PDF synchronously via MinerU /file_parse.
 * Blocks until result is ready.
 *
 * @param {object} opts
 * @param {string|Buffer} opts.pdfPath  — file path on disk
 * @param {string} [opts.apiUrl]        — MinerU server URL
 * @param {string} [opts.returnMd]      — return markdown (default: true)
 * @param {string} [opts.returnJson]     — return JSON (default: true)
 * @param {boolean} [opts.gzip]          — enable gzip (default: true)
 * @returns {Promise<{ok: boolean, markdown: string, json: object, pages: object[]}>}
 */
export async function parsePdfSync({ pdfPath, apiUrl, returnMd = true, returnJson = true, gzip = true }) {
  const url = (apiUrl || DEFAULT_API_URL).replace(/\/$/, "");

  const form = new FormData();
  const filename = pdfPath.split(/[/\\]/).pop();
  const fileBuffer = await fs.readFileSync(pdfPath);
  const blob = new Blob([fileBuffer], { type: "application/pdf" });
  form.append("files", blob, filename);

  if (returnMd) form.append("return_md", "true");
  if (returnJson) form.append("return_jsonl", "false"); // single JSON per request
  if (gzip) form.append("use_gzip", "true");

  const res = await fetch(`${url}/file_parse`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000), // 2 min timeout
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MinerU /file_parse failed: HTTP ${res.status} — ${errText}`);
  }

  // MinerU returns a JSON object with parsed content
  const data = await res.json();

  return {
    ok: true,
    ...data,
  };
}

// ─── ASYNC TASK FLOW ────────────────────────────────────────────────────────

/**
 * Submit a parse task asynchronously.
 * @param {object} opts
 * @param {string} opts.pdfPath
 * @param {string} [opts.apiUrl]
 * @returns {Promise<{ok: boolean, taskId: string, status: string}>}
 */
export async function submitParseTask({ pdfPath, apiUrl }) {
  const url = (apiUrl || DEFAULT_API_URL).replace(/\/$/, "");

  const form = new FormData();
  const filename = pdfPath.split(/[/\\]/).pop();
  const fileBuffer = await fs.readFileSync(pdfPath);
  const blob = new Blob([fileBuffer], { type: "application/pdf" });
  form.append("files", blob, filename);
  form.append("return_md", "true");
  form.append("return_jsonl", "false");

  const res = await fetch(`${url}/tasks`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MinerU /tasks failed: HTTP ${res.status} — ${errText}`);
  }

  const data = await res.json();
  // MinerU returns { task_id, status, ... }
  return {
    ok: true,
    taskId: data.task_id || data.id,
    status: data.status || "pending",
    ...data,
  };
}

/**
 * Poll task status.
 * @param {string} taskId
 * @param {string} [apiUrl]
 * @param {number} [pollIntervalMs]
 * @param {number} [maxWaitMs]
 * @returns {Promise<{ok: boolean, status: string, result: object|null}>}
 */
export async function waitForTask(taskId, apiUrl, pollIntervalMs = 2000, maxWaitMs = 300_000) {
  const url = (apiUrl || DEFAULT_API_URL).replace(/\/$/, "");
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${url}/tasks/${taskId}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`MinerU /tasks/${taskId} failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const status = (data.status || "").toLowerCase();

    if (status === "success" || status === "completed" || status === "done") {
      return { ok: true, status: "success", result: data };
    }

    if (status === "failed" || status === "error") {
      return { ok: false, status: "failed", result: data };
    }

    // Still pending/queued — wait
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return { ok: false, status: "timeout", result: null };
}

/**
 * Get task result.
 * @param {string} taskId
 * @param {string} [apiUrl]
 */
export async function getTaskResult(taskId, apiUrl) {
  const url = (apiUrl || DEFAULT_API_URL).replace(/\/$/, "");
  const res = await fetch(`${url}/tasks/${taskId}/result`, {
    method: "GET",
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`MinerU /tasks/${taskId}/result failed: HTTP ${res.status}`);
  }

  return await res.json();
}
