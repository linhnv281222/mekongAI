import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aiCfg } from "../libs/config.js";
import { getKnowledgeBlock, getPrompt } from "../prompts/promptStore.js";
import { loadAiConfig } from "./aiConfig.js";
import { callClaudeWithRetry } from "./claudeRetry.js";
import { extractJson } from "./jsonExtract.js";
import { parseWithMinerU } from "../libs/pdfMinerU.js";

function anthropicModel() {
  const { model } = loadAiConfig();
  if (model && model.trim()) return model.trim();
  return process.env.ANTHROPIC_MODEL || aiCfg.anthropicModel || "claude-sonnet-4-6";
}

function anthropicKey() {
  return aiCfg.anthropicKey;
}

/**
 * Đọc bản vẽ PDF = Claude Sonnet/Opus.
 * MinerU: nếu có → gửi text thay vì PDF bytes (tiết kiệm token vision).
 */
export async function analyzeDrawingClaude(pdfPath, emailContext = null) {
  if (!anthropicKey()) {
    return { success: false, error: "ANTHROPIC_API_KEY not set" };
  }

  const modelName = anthropicModel();

  // ── P5: MinerU preprocessor ─────────────────────────────────────────
  let mineruText = null;
  if (pdfPath) {
    try {
      const mineruResult = await parseWithMinerU(pdfPath);
      if (mineruResult?.mineruText) {
        mineruText = mineruResult.mineruText;
        console.log(`[ClaudeAnalyzer] MinerU OK: ${mineruText.length} chars`);
      }
    } catch (e) {
      console.warn(`[ClaudeAnalyzer] MinerU error (will use PDF bytes):`, e.message);
    }
  }

  const [vntKnowledge, materials, heatTreat, surface, shapes] =
    await Promise.all([
      getKnowledgeBlock("vnt-knowledge"),
      getKnowledgeBlock("vnt-materials"),
      getKnowledgeBlock("vnt-heat-treat"),
      getKnowledgeBlock("vnt-surface"),
      getKnowledgeBlock("vnt-shapes"),
    ]);

  const promptText = await getPrompt("gemini-drawing", {
    VNT_KNOWLEDGE: vntKnowledge ?? "",
    MATERIAL: materials ?? "",
    HEAT_TREAT: heatTreat ?? "",
    SURFACE: surface ?? "",
    SHAPE: shapes ?? "",
    EMAIL_CONTEXT: emailContext ?? "",
    MINERU_TEXT: mineruText
      ? `[TRÍCH XUẤT TỪ MinerU — NỘI DUNG BẢN VẼ]\n${mineruText.slice(0, 50000)}\n\n[KẾT THÚC TRÍCH XUẤT MinerU]`
      : "",
  });

  let requestPayload;
  let debugPayload;

  if (mineruText) {
    // ── MinerU path: text tokens (much cheaper) ──────────────────────────
    requestPayload = {
      model: modelName,
      max_tokens: 4096,
      temperature: 0,
      system: [
        { type: "text", text: promptText, cache_control: { type: "ephemeral" } }
      ],
      messages: [
        {
          role: "user",
          content: `Phân tích bản vẽ kỹ thuật từ nội dung MinerU bên trên và trả về kết quả JSON.`,
        },
      ],
    };
    debugPayload = { ...requestPayload, _source: "mineru", _mineruChars: mineruText.length };
  } else {
    // ── Original path: PDF as base64 document ────────────────────────────
    let base64 = null;
    let filename = "corrected";
    if (pdfPath) {
      const pdfBuffer = fs.readFileSync(pdfPath);
      base64 = pdfBuffer.toString("base64");
      filename = path.basename(pdfPath);
    }

    requestPayload = {
      model: modelName,
      max_tokens: 4096,
      temperature: 0,
      system: [
        { type: "text", text: promptText, cache_control: { type: "ephemeral" } }
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: "Phân tích bản vẽ PDF trên và trả về kết quả.",
            },
          ],
        },
      ],
    };
    debugPayload = {
      ...requestPayload,
      _source: "pdf_vision",
      messages: requestPayload.messages.map((m) => ({
        ...m,
        content: m.content.map((c) =>
          c.type === "document"
            ? { ...c, source: { ...c.source, data: `[FILE: ${filename}]` } }
            : c
        ),
      })),
    };
  }

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: requestPayload,
    logTag: "analyzeDrawing",
  });

  if (!res.ok) {
    return {
      success: false,
      error: `Anthropic API: ${res.error}`,
      raw: "",
      request_payload: debugPayload,
    };
  }

  const data = res.data;
  const raw = data.content?.[0]?.text || "";
  const parsed = extractJson(raw);

  const usage = data.usage ?? {};
  console.log(
    `[ClaudeAnalyzer] tokens=in:${usage.input_tokens ?? 0}|out:${usage.output_tokens ?? 0}|cache:${usage.cache_read_tokens ?? 0} ` +
    `src=${debugPayload._source} model=${modelName} file=${debugPayload._mineruChars ? path.basename(pdfPath ?? "N/A") : "N/A"}`
  );

  return {
    success: true,
    data: parsed,
    raw,
    usage,
    request_payload: debugPayload,
  };
}

/**
 * Correct drawing data via Claude.
 */
export async function correctDrawingClaude(currentData, userMessage, emailContext = null) {
  return analyzeDrawingClaude(null, emailContext);
}

/**
 * Debug prompt: send system prompt + user message to Claude.
 */
export async function debugPromptClaude(systemPrompt, userMessage, schema = "") {
  if (!anthropicKey()) {
    return { success: false, error: "ANTHROPIC_API_KEY not set" };
  }

  const instruction = schema
    ? `Phân tích yêu cầu bên dưới và trả về JSON theo schema:\n${schema}\n\nLưu ý: Trả về JSON thuần túy, không markdown, không giải thích.`
    : "";

  const userContent = schema ? `${userMessage}\n\n${instruction}` : userMessage;

  const requestPayload = {
    model: anthropicModel(),
    max_tokens: 4096,
    temperature: 0,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }
    ],
    messages: [{ role: "user", content: userContent }],
  };

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: requestPayload,
    logTag: "debugPrompt",
  });

  if (!res.ok) {
    return {
      success: false,
      error: `Claude API: ${res.error}`,
      raw: "",
      request_payload: null,
    };
  }

  const raw = res.data.content?.[0]?.text || "";
  let parsed;
  try {
    parsed = extractJson(raw);
  } catch {
    parsed = raw;
  }

  const usage = res.data.usage ?? {};
  console.log(
    `[ClaudeAnalyzer] tokens=in:${usage.input_tokens ?? 0}|out:${usage.output_tokens ?? 0}|cache:${usage.cache_read_tokens ?? 0} ` +
    `src=debug model=${anthropicModel()}`
  );

  return {
    success: true,
    data: parsed,
    raw,
    usage,
    request_payload: requestPayload,
  };
}
