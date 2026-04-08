/**
 * @google/genai ném Error/ServerError khi HTTP ≥400 — không trả { error } trên object response.
 * Retry chỉ có tác dụng nếu bọc generateContent trong try/catch.
 */

export function isRetryableGeminiHttpError(err) {
  const msg = err?.message || String(err);
  return (
    /got status:\s*503\b/.test(msg) ||
    /got status:\s*429\b/.test(msg) ||
    /"status"\s*:\s*"UNAVAILABLE"/i.test(msg) ||
    /high demand|RESOURCE_EXHAUSTED/i.test(msg)
  );
}

/**
 * @param {import("@google/genai").GoogleGenAI} ai
 * @param {object} params — truyền thẳng cho ai.models.generateContent(params)
 * @param {string} [logTag]
 */
export async function generateContentWithRetry(ai, params, logTag = "Gemini") {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1500;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent(params);
      if (response?.error) {
        const err = response.error;
        const code = err.code ?? err.status;
        if (
          (code === 503 || code === 429 || err.status === "UNAVAILABLE") &&
          attempt < MAX_RETRIES
        ) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(
            `[${logTag}] response.error ${code} — retry ${attempt + 1}/${MAX_RETRIES} sau ${delay}ms`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Gemini error: ${err.message || code}`);
      }
      return response;
    } catch (e) {
      if (attempt < MAX_RETRIES && isRetryableGeminiHttpError(e)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(
          `[${logTag}] HTTP tạm thời — retry ${attempt + 1}/${MAX_RETRIES} sau ${delay}ms:`,
          (e.message || "").slice(0, 160)
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
}
