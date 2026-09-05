import fs from "fs";
import path from "path";
import { aiCfg } from "../libs/config.js";
import { getKnowledgeBlock, getPrompt } from "../prompts/promptStore.js";
import { extractJson } from "./jsonExtract.js";

/**
 * Xiaomi MiMo-V2.5-Pro analyzer via OpenRouter
 * Model: xiaomi/mimo-v2.5-pro
 * Cost: $0.40 input / $1.50 output per 1M tokens
 * Vision-capable multimodal model
 */

function openrouterKey() {
  return process.env.OPENROUTER_API_KEY || "";
}

function xiaomiModel() {
  return process.env.XIAOMI_MODEL || "xiaomi/mimo-v2.5-pro";
}

/**
 * Analyze technical drawing PDF using Xiaomi MiMo-V2.5-Pro
 * @param {string} pdfPath - Path to PDF file
 * @param {string|null} emailContext - Email context for prioritization
 * @returns {Promise<{success: boolean, data?: object, raw?: string, error?: string, request_payload?: object}>}
 */
export async function analyzeDrawingXiaomi(pdfPath, emailContext = null) {
  if (!openrouterKey()) {
    return { success: false, error: "OPENROUTER_API_KEY not set" };
  }

  const modelName = xiaomiModel();
  console.log(`[XiaomiAnalyzer] START model=${modelName} pdf=${pdfPath}`);

  try {
    // Load PDF as base64
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64 = pdfBuffer.toString("base64");
    const filename = path.basename(pdfPath);

    // Load knowledge blocks and prompt
    const [vntKnowledge, materials, heatTreat, surface, shapes] =
      await Promise.all([
        getKnowledgeBlock("vnt-knowledge"),
        getKnowledgeBlock("vnt-materials"),
        getKnowledgeBlock("vnt-heat-treat"),
        getKnowledgeBlock("vnt-surface"),
        getKnowledgeBlock("vnt-shapes"),
      ]);

    const systemPrompt = await getPrompt("gemini-drawing", {
      VNT_KNOWLEDGE: vntKnowledge ?? "",
      MATERIAL: materials ?? "",
      HEAT_TREAT: heatTreat ?? "",
      SURFACE: surface ?? "",
      SHAPE: shapes ?? "",
      EMAIL_CONTEXT: emailContext ?? "",
    });

    // OpenRouter API request (OpenAI-compatible format)
    const requestPayload = {
      model: modelName,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64}`,
              },
            },
            {
              type: "text",
              text: "Phân tích bản vẽ kỹ thuật PDF trên và trả về kết quả JSON theo schema đã cho.",
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 4096,
    };

    const debugPayload = {
      ...requestPayload,
      _source: "xiaomi_openrouter",
      messages: requestPayload.messages.map((m) => ({
        ...m,
        content:
          typeof m.content === "string"
            ? m.content
            : m.content.map((c) =>
                c.type === "image_url"
                  ? { ...c, image_url: { url: `[FILE: ${filename}]` } }
                  : c
              ),
      })),
    };

    console.log(`[XiaomiAnalyzer] Calling OpenRouter API...`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey()}`,
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Mekong AI - VNT RFQ System",
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[XiaomiAnalyzer] OpenRouter error:`, errorText);
      return {
        success: false,
        error: `OpenRouter API error: ${response.status} ${errorText}`,
        raw: "",
        request_payload: debugPayload,
      };
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const usage = data.usage || {};

    console.log(`[XiaomiAnalyzer] API success. Tokens: ${usage.total_tokens || 0}`);

    // Extract JSON from response
    const parsed = extractJson(raw);

    if (!parsed) {
      return {
        success: false,
        error: "No valid JSON in response",
        raw,
        usage,
        request_payload: debugPayload,
      };
    }

    return {
      success: true,
      data: parsed,
      raw,
      usage,
      request_payload: debugPayload,
    };
  } catch (error) {
    console.error(`[XiaomiAnalyzer] Error:`, error);
    return {
      success: false,
      error: error.message || String(error),
      raw: "",
    };
  }
}
