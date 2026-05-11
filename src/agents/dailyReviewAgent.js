/**
 * Daily Review Agent
 *
 * Mỗi ngày lúc 0h00:
 * 1. Lấy tất cả phiếu báo giá trong ngày hôm qua có ghi_chú
 * 2. Với mỗi prompt (email-classify, gemini-drawing, chat-classify):
 *    - Gọi AI đọc prompt hiện tại + ghi_chú → refine (xóa/phần thừa, thêm phần thiếu)
 *    - Tạo version mới, activate ngay
 *    - Ghi log vào daily_review_logs
 *
 * Chạy: npm run review-agent
 */

import cron from "node-cron";

import { getJobsForReview } from "../data/jobStore.js";
import { pool } from "../data/jobStore.js";
import {
  getPromptRawContent,
  createPromptVersion,
  render,
} from "../prompts/promptStore.js";
import { aiCfg } from "../libs/config.js";
import { loadAiConfig } from "../ai/aiConfig.js";
import { callClaudeWithRetry } from "../ai/claudeRetry.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";

// Prompt keys cần review mỗi ngày
const PROMPT_KEYS_TO_REVIEW = ["email-classify", "gemini-drawing", "chat-classify"];

/** Lấy ngày hôm qua (YYYY-MM-DD) */
function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Loại bỏ nội dung email/chat khỏi ghi_chu nội bộ */
function stripEmailContent(text) {
  if (!text) return "";
  let cleaned = text;

  // Loại bỏ email headers
  const emailPatterns = [
    /^(Subject:|From:|To:|Date:|Cc:|Bcc:)[^\n]*\n/gim,
    /^(Ngày:|Gửi:|Đến:|Tiêu đề:)[^\n]*\n/gim,
    /https?:\/\/[^\s]+/g, // URLs
    /<[^>]+>/g, // HTML tags
  ];
  for (const p of emailPatterns) {
    cleaned = cleaned.replace(p, "");
  }

  // Loại bỏ quoted reply (>)
  cleaned = cleaned
    .split("\n")
    .filter((l) => !l.trim().startsWith(">"))
    .join("\n");

  // Loại bỏ signature block
  const sigIdx = cleaned.search(/^--\s*$/m);
  if (sigIdx !== -1) cleaned = cleaned.slice(0, sigIdx).trim();

  // Loại bỏ attachment references
  cleaned = cleaned.replace(/đính kèm[:\s]*[^\n]*/gi, "");
  cleaned = cleaned.replace(/file[:\s]*[^\n]*/gi, "");

  // Trim
  cleaned = cleaned.trim();

  // Nếu sau khi strip mà quá ngắn → coi là không có feedback
  if (cleaned.length < 10) return "";

  return cleaned;
}

/** Trích feedback bản vẽ (cho gemini-drawing) */
function extractDrawingFeedback(job) {
  const parts = [];

  if (Array.isArray(job.drawings)) {
    for (const dw of job.drawings) {
      const data = dw.data || dw;
      const danhGia = data.danh_gia;
      if (danhGia !== undefined && danhGia !== null && danhGia !== "") {
        const note = data.note || "";
        if (note.trim().length >= 3) {
          parts.push(
            `[Bản vẽ: ${data.ma_ban_ve || dw.filename || dw.page || "?"} | ${danhGia === 1 ? "OK" : "SAI"}]\n${note.trim()}`
          );
        }
      }
    }
  }

  return parts.join("\n\n");
}

/** Trích ghi chú nội bộ, đã loại bỏ email/chat content (cho cả 3 prompt) */
function extractInternalNotes(job) {
  const raw = job.ghi_chu || "";
  const cleaned = stripEmailContent(raw);

  if (cleaned && cleaned.length >= 10) {
    return `[Ghi chú nội bộ - Job #${job.id}]\n${cleaned}`;
  }
  return null;
}

/**
 * Tải review prompt template từ DB.
 * Admin tạo content cho key 'daily-review' qua admin UI.
 * Nếu chưa có → dùng inline fallback.
 */
async function loadReviewPrompt() {
  const content = await getPromptRawContent("daily-review");
  if (content) return content;
  // Fallback inline — chỉ dùng khi DB chưa có content
  return `Bạn là chuyên gia prompt engineering cho hệ thống báo giá cơ khí VNT.

## NHIỆM VỤ
Phân tích các ghi chú thực tế từ người dùng về kết quả AI, từ đó SỬA prompt hiện tại cho chính xác hơn.

## NGUYÊN TẮC
- KHÔNG tạo prompt mới hoàn toàn
- CHỈ sửa: xóa phần không phù hợp, bổ sung phần thiếu, chỉnh sửa phần sai
- Giữ nguyên cấu trúc và format của prompt gốc
- Nếu ghi chú không cho thấy vấn đề cụ thể → KHÔNG thay đổi

## ĐẦU VÀO

### PROMPT HIỆN TẠI:
{{CURRENT_PROMPT}}

### GHI CHÚ TỪ NGƯỜI DÙNG:
{{GHI_CHU_LIST}}

## ĐẦU RA
Trả về JSON thuần túy (không markdown, không giải thích):

{
  "changed": true hoặc false,
  "remove": ["Mô tả phần cần xóa và lý do"],
  "add": ["Nội dung cần thêm vào và lý do"],
  "revise": ["Phần cần chỉnh sửa: [cũ] → [mới], lý do: ..."],
  "new_content": "...prompt đã sửa...",
  "reason": "Tóm tắt 1-2 câu"
}`;
}

/** Gọi AI refine prompt (dùng provider/model đang cấu hình) */
async function refineWithAI(currentPromptContent, ghiChuList, modelName) {
  const { provider } = loadAiConfig();

  if (provider === "gemini") {
    return refineWithGemini(currentPromptContent, ghiChuList, modelName);
  } else {
    return refineWithClaude(currentPromptContent, ghiChuList, modelName);
  }
}

async function refineWithClaude(currentPromptContent, ghiChuList, modelName) {
  const reviewPrompt = await loadReviewPrompt();
  const systemPrompt = render(reviewPrompt, {
    CURRENT_PROMPT: currentPromptContent || "(trống)",
    GHI_CHU_LIST: ghiChuList || "(không có ghi chú)",
  });

  const requestPayload = {
    model: modelName || aiCfg.anthropicModel || "claude-sonnet-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: systemPrompt }],
  };

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": aiCfg.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: requestPayload,
    logTag: "daily-review",
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.error}`);
  }

  const text = res.data?.content?.[0]?.text || "";
  return parseAIResponse(text);
}

async function refineWithGemini(currentPromptContent, ghiChuList, modelName) {
  if (!aiCfg.geminiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const geminiAi = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

  const reviewPrompt = await loadReviewPrompt();
  const systemPrompt = render(reviewPrompt, {
    CURRENT_PROMPT: currentPromptContent || "(trống)",
    GHI_CHU_LIST: ghiChuList || "(không có ghi chú)",
  });

  const model = modelName || aiCfg.geminiModel || "gemini-3-flash-preview";

  const requestPayload = {
    model,
    contents: [{ parts: [{ text: systemPrompt }] }],
  };

  const response = await generateContentWithRetry(geminiAi, requestPayload, "dailyReview");
  const text = response.text || "";

  return parseAIResponse(text);
}

/** Parse JSON từ response AI */
function parseAIResponse(text) {
  const cleaned = String(text || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gm, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    const objStart = cleaned.indexOf("{");
    if (objStart !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = objStart; i < cleaned.length; i++) {
        if (cleaned[i] === "{") depth++;
        else if (cleaned[i] === "}") {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
      if (end !== -1) {
        try { return JSON.parse(cleaned.slice(objStart, end)); } catch {}
      }
    }
    // Debug: log raw response
    console.error("[DailyReview] Raw AI response:", cleaned.slice(0, 1000));
    throw new Error("Không parse được JSON từ AI response");
  }
}

/** Lưu log vào daily_review_logs */
async function saveReviewLog({
  reviewDate,
  promptKey,
  jobIds,
  ghiChuSummary,
  refinedContent,
  diffSummary,
  aiModel,
}) {
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO mekongai.daily_review_logs
         (review_date, prompt_key, job_ids, ghi_chu_summary, refined_content, diff_summary, ai_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        reviewDate,
        promptKey,
        JSON.stringify(jobIds),
        (ghiChuSummary || "").slice(0, 5000),
        refinedContent || null,
        (diffSummary || "").slice(0, 5000),
        aiModel || null,
      ]
    );
  } catch (e) {
    console.error("[DailyReview] saveLog error:", e.message);
  }
}

/** Apply diff (remove/revise/add) vào prompt gốc */
function applyDiff(currentPrompt, result) {
  let content = currentPrompt;

  // Revise: "gốc → mới"
  for (const item of (result.revise || [])) {
    const arrowIdx = item.indexOf("→");
    if (arrowIdx === -1) continue;
    const from = item.slice(0, arrowIdx).trim();
    const to = item.slice(arrowIdx + 1).trim();
    if (from && content.includes(from)) {
      content = content.replace(from, to);
    }
  }

  // Remove: xóa đoạn text nguyên văn
  for (const item of (result.remove || [])) {
    if (item && content.includes(item)) {
      content = content.replace(item, "");
    }
  }

  // Add: thêm vào cuối prompt
  for (const item of (result.add || [])) {
    if (item && !content.includes(item)) {
      content += `\n\n${item}`;
    }
  }

  return content.trim();
}

/** Chạy review cho 1 prompt key */
async function reviewPromptKey(promptKey, jobs, reviewDate) {
  console.log(`\n[DailyReview] === Reviewing: ${promptKey} ===`);

  const currentContent = await getPromptRawContent(promptKey);
  if (!currentContent) {
    console.log(`[DailyReview] Skip ${promptKey} — không có prompt content`);
    return { promptKey, skipped: true };
  }

  // Route feedback đúng vào đúng prompt
  const ghiChuParts = [];

  if (promptKey === "gemini-drawing") {
    // gemini-drawing: lấy drawing feedback + fallback internal notes
    for (const job of jobs) {
      const feedback = extractDrawingFeedback(job);
      if (feedback) ghiChuParts.push(feedback);
    }
    // Fallback: nếu không có drawing feedback, dùng internal notes
    if (ghiChuParts.length === 0) {
      for (const job of jobs) {
        const note = extractInternalNotes(job);
        if (note) ghiChuParts.push(note);
      }
    }
  } else {
    // email-classify, chat-classify: chỉ internal notes
    for (const job of jobs) {
      const note = extractInternalNotes(job);
      if (note) ghiChuParts.push(note);
    }
  }

  if (ghiChuParts.length === 0) {
    console.log(`[DailyReview] Skip ${promptKey} — không có ghi chú nào`);
    return { promptKey, skipped: true, reason: "no_ghi_chu" };
  }

  const ghiChuList = ghiChuParts.join("\n\n---\n\n");
  const jobIds = jobs.map((j) => j.id);

  console.log(`[DailyReview] ${promptKey}: ${jobs.length} jobs, ${ghiChuParts.length} ghi_chu entries`);
  if (ghiChuList.length > 200) {
    console.log(`[DailyReview]   First entry preview: ${ghiChuList.substring(0, 200)}`);
  }

  const { provider, model } = loadAiConfig();
  const modelName = model || (provider === "gemini" ? aiCfg.geminiModel : aiCfg.anthropicModel);

  let result;
  try {
    result = await refineWithAI(currentContent, ghiChuList, modelName);
  } catch (e) {
    console.error(`[DailyReview] AI refine error for ${promptKey}:`, e.message);
    return { promptKey, error: e.message };
  }

  if (!result || !result.changed) {
    console.log(`[DailyReview] ${promptKey}: không có thay đổi (AI không yêu cầu sửa)`);
    await saveReviewLog({
      reviewDate,
      promptKey,
      jobIds,
      ghiChuSummary: ghiChuList.slice(0, 5000),
      refinedContent: null,
      diffSummary: "Không có thay đổi",
      aiModel: modelName,
    });
    return { promptKey, changed: false };
  }

  const diffSummary = [
    result.remove?.length ? `XÓA: ${result.remove.join("; ")}` : "",
    result.add?.length ? `THÊM: ${result.add.join("; ")}` : "",
    result.revise?.length ? `SỬA: ${result.revise.join("; ")}` : "",
    result.reason ? `LÝ DO: ${result.reason}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  console.log(`[DailyReview] ${promptKey}: ${result.reason}`);
  console.log(`[DailyReview]   Remove: ${(result.remove || []).join("; ")}`);
  console.log(`[DailyReview]   Add:    ${(result.add || []).join("; ")}`);
  console.log(`[DailyReview]   Revise: ${(result.revise || []).join("; ")}`);

  // Apply diff vào prompt gốc
  const newContent = applyDiff(currentContent, result);

  // Kiểm tra new_content có thay đổi thật không
  if (newContent === currentContent) {
    console.log(`[DailyReview] ${promptKey}: apply diff không thay đổi gì → bỏ qua`);
    await saveReviewLog({
      reviewDate,
      promptKey,
      jobIds,
      ghiChuSummary: ghiChuList.slice(0, 5000),
      refinedContent: null,
      diffSummary: "Apply diff không tạo ra thay đổi",
      aiModel: modelName,
    });
    return { promptKey, changed: false };
  }

  // Lấy version hiện tại để log
  const lastVersionRows = await pool.query(
    "SELECT version FROM prompt_versions WHERE template_id = (SELECT id FROM prompt_templates WHERE key = $1) AND is_active = true",
    [promptKey]
  );
  const lastVer = lastVersionRows.rows[0]?.version || 0;

  const versionResult = await createPromptVersion(
    promptKey,
    newContent,
    `v${lastVer + 1} - ${reviewDate}`,
    "daily-review-agent",
    true
  );

  if (versionResult) {
    console.log(`[DailyReview] ${promptKey}: → v${versionResult.version} (đã activate)`);
  } else {
    console.error(`[DailyReview] ${promptKey}: Tạo version thất bại`);
  }

  await saveReviewLog({
    reviewDate,
    promptKey,
    jobIds,
    ghiChuSummary: ghiChuList.slice(0, 5000),
    refinedContent: newContent,
    diffSummary,
    aiModel: modelName,
  });

  return {
    promptKey,
    changed: true,
    version: versionResult?.version,
    reason: result.reason,
    removes: result.remove,
    adds: result.add,
    revises: result.revise,
  };
}

/** Chạy review toàn bộ */
export async function runDailyReview(dateStr = null) {
  const reviewDate = dateStr || getYesterdayStr();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[DailyReview] Bắt đầu review ngày: ${reviewDate}`);
  console.log(`${"=".repeat(60)}`);

  const jobs = await getJobsForReview(reviewDate);
  console.log(`[DailyReview] Tìm thấy ${jobs.length} phiếu có ghi_chu`);

  if (jobs.length === 0) {
    console.log("[DailyReview] Không có gì để review — kết thúc.");
    return { reviewDate, jobs: 0, results: [] };
  }

  const results = [];
  for (const key of PROMPT_KEYS_TO_REVIEW) {
    const r = await reviewPromptKey(key, jobs, reviewDate);
    results.push(r);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const changed = results.filter((r) => r.changed);
  const skipped = results.filter((r) => r.skipped);
  const errors = results.filter((r) => r.error);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[DailyReview] XONG — ${changed.length}/${PROMPT_KEYS_TO_REVIEW.length} prompt được cập nhật`);
  if (skipped.length) console.log(`  Bỏ qua: ${skipped.map((s) => s.promptKey).join(", ")}`);
  if (errors.length) console.log(`  Lỗi: ${errors.map((e) => `${e.promptKey}: ${e.error}`).join(", ")}`);
  console.log(`${"=".repeat(60)}\n`);

  return { reviewDate, jobs: jobs.length, results, changed: changed.length };
}

// ─── CRON SCHEDULER ────────────────────────────────────────────────────────

export function startScheduler() {
  cron.schedule("0 0 * * *", async () => {
    console.log("\n[DailyReview] ═══ CRON TRIGGERED ═══");
    try {
      await runDailyReview();
    } catch (e) {
      console.error("[DailyReview] CRON error:", e.message);
    }
  }, {
    timezone: "Asia/Ho_Chi_Minh",
  });

  console.log("[DailyReview] Scheduler started — chạy lúc 0h00 mỗi ngày (Asia/Ho_Chi_Minh)");
}

// ─── CLI ──────────────────────────────────────────────────────────────────

async function runNow() {
  console.log("[DailyReview] Chay ngay...");
  const result = await runDailyReview();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (process.argv[2] === "now") {
  runNow();
} else {
  startScheduler();
}
