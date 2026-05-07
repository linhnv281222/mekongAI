import { aiCfg } from "../libs/config.js";
import { getPrompt, getKnowledgeBlock } from "../prompts/promptStore.js";
import { callClaudeWithRetry } from "./claudeRetry.js";
import { loadAiConfig } from "./aiConfig.js";

/** Extract JSON — thử parse trực tiếp, thất bại thì tìm balanced { ... } trong text */
function extractJson(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = findBalancedBraces(cleaned, '{', '}');
  if (objMatch) {
    try { return JSON.parse(objMatch); } catch {}
  }
  const arrMatch = findBalancedBraces(cleaned, '[', ']');
  if (arrMatch) {
    try { return JSON.parse(arrMatch); } catch {}
  }
  throw new Error("Không thể extract JSON from response");
}

/** Tìm text con bắt đầu bởi openChar và kết thúc bởi closeChar (đã cân bằng) */
function findBalancedBraces(text, openChar, closeChar) {
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === openChar) { start = i; break; }
  }
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"' || ch === "'") { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * Trả về model name + tăng số lần gọi.
 * Đọc lại config mỗi lần gọi để đổi config mà không cần restart.
 */
function classifyModel() {
  const { model } = loadAiConfig();
  if (model && model.trim()) return model.trim();
  return process.env.ANTHROPIC_MODEL || aiCfg.anthropicModel || "claude-sonnet-4-6";
}

/**
 * Phan loai email = rfq / repeat_order / hoi_tham / khieu_nai / spam.
 *
 * @param {object} emailData — { from, subject, body, attachments }
 * @returns {object} { loai, ngon_ngu, ly_do, han_giao_hang, hinh_thuc_giao, ..., _ai_request_payload, _model_used }
 */
export async function classifyEmailClaude(emailData) {
  const CLASSIFY_MODEL = classifyModel();

  const [promptText, marketData] = await Promise.all([
    getPrompt("email-classify", {
      emailFrom: emailData.from,
      emailSubject: emailData.subject,
      emailAttachments:
        emailData.attachments.map((a) => a.name).join(", ") || "none",
      emailBody: emailData.body.slice(0, 5000),
    }),
    getKnowledgeBlock("vnt-markets"),
  ]);

  // Inject MARKET variable — replace {{MARKET}} placeholder in rendered prompt
  const finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );

  const requestPayload = {
    model: CLASSIFY_MODEL,
    max_tokens: 5000,
    messages: [{ role: "user", content: finalPrompt }],
  };

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": aiCfg.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: requestPayload,
    logTag: "email-classify",
  });

  if (!res.ok) {
    const errMsg = res.error || "unknown error";
    console.error(`[Classify] API lỗi: ${errMsg}`);
    const result = {
      loai: undefined,
      ngon_ngu: undefined,
      ly_do: `API error: ${errMsg}`,
      _http_status: res.status,
      _model_used: CLASSIFY_MODEL,
      _retry_attempts: res.attempt,
    };
    return result;
  }

  const data = res.data;
  const modelFromApi = data.model || "(không có)";
  console.log(`[Classify] API trả về: model=${modelFromApi}, id=${data.id ? data.id.slice(0, 12) + "..." : "na"} (attempt ${res.attempt})`);

  const text = data.content?.[0]?.text || "{}";

  let result;
  try {
    result = extractJson(text);
  } catch (e) {
    console.error("[Classify] JSON parse lỗi:", e.message);
    console.error("[Classify] Raw response:", text.slice(0, 500));
    result = { loai: undefined, ngon_ngu: undefined, ly_do: `JSON parse error: ${e.message}`, _raw: text };
  }

  result._ai_request_payload = requestPayload;
  result._model_used = CLASSIFY_MODEL;
  result._model_from_api = modelFromApi;
  result._body_len = emailData.body.length;
  result._body_sent = emailData.body.slice(0, 2000).length;
  result._retry_attempts = res.attempt;
  return result;
}
