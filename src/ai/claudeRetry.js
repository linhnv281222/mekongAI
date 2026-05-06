/**
 * Shared retry utility for Anthropic Claude API calls.
 * Retries on: 429, 529, 500, 502, 503, 504, network errors.
 * Exponential backoff: baseDelay * 2^(attempt-1), capped at maxDelay.
 * Returns { success, data, error, raw, isRetryable, attempt }.
 */

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 30000;

/** HTTP status codes that should trigger a retry */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);

/**
 * Determine if a result is retryable.
 * @param {{ ok: boolean, status: number, data: object|null, error: string|null }} res
 * @returns {boolean}
 */
function isRetryableResult(res) {
  if (!res.ok) {
    if (RETRYABLE_STATUS_CODES.has(res.status)) return true;
    const errText = res.errorText || "";
    if (res.status === 400 && (errText.includes("rate_limit") || errText.includes("overloaded"))) return true;
    return false;
  }
  return false;
}

/**
 * Call Anthropic API with automatic retry on retryable errors.
 *
 * @param {object} options
 * @param {string} options.url - Full API URL
 * @param {object} options.headers - Request headers
 * @param {object|string} options.body - Request body
 * @param {string} [options.logTag] - Tag for log messages (e.g. "email-classify")
 * @param {number} [options.maxRetries] - Max retry attempts (default 5)
 * @param {number} [options.baseDelayMs] - Base delay in ms (default 2000)
 * @param {number} [options.maxDelayMs] - Max delay cap in ms (default 30000)
 * @returns {Promise<{ ok: boolean, status: number, data: object|null, error: string|null, errorText: string, attempt: number }>}
 */
export async function callClaudeWithRetry({
  url = "https://api.anthropic.com/v1/messages",
  headers,
  body,
  logTag = "Claude",
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
}) {
  const lastResult = { ok: false, status: 0, data: null, error: null, errorText: "", attempt: 0 };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult.attempt = attempt;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      });

      const errorText = await res.text();

      if (res.ok) {
        let data = null;
        try { data = JSON.parse(errorText); } catch {}
        return { ok: true, status: res.status, data, error: null, errorText: "", attempt };
      }

      let errMsg = errorText;
      try { const j = JSON.parse(errorText); errMsg = j.error?.message || errorText; } catch {}

      lastResult.ok = false;
      lastResult.status = res.status;
      lastResult.error = `HTTP ${res.status}: ${errMsg}`.slice(0, 300);
      lastResult.errorText = errorText;

      const isRetryable = RETRYABLE_STATUS_CODES.has(res.status) ||
        (res.status === 400 && (errorText.includes("rate_limit") || errorText.includes("overloaded")));

      if (!isRetryable || attempt === maxRetries) {
        console.error(`[${logTag}] Claude API error (attempt ${attempt}/${maxRetries}): HTTP ${res.status}: ${errMsg}`.slice(0, 500));
        return lastResult;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      console.warn(`[${logTag}] Claude retryable error HTTP ${res.status} (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));

    } catch (e) {
      lastResult.ok = false;
      lastResult.status = 0;
      lastResult.error = e.message;
      lastResult.errorText = e.message;

      if (attempt === maxRetries) {
        console.error(`[${logTag}] Claude network error (attempt ${attempt}/${maxRetries}): ${e.message}`);
        return lastResult;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      console.warn(`[${logTag}] Claude network error (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return lastResult;
}
