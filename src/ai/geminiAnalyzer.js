import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { aiCfg } from "../libs/config.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";
import { enrichWithF7F8 } from "../processors/processRouter.js";
import { getKnowledgeBlock, getPrompt } from "../prompts/promptStore.js";

const geminiAi = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

/**
 * Doc ban ve PDF = Gemini (SDK moi @google/genai).
 * @param {string} pdfPath
 * @param {string} model — 'gemini-3-flash-preview' hoac 'gemini-3.5-flash-preview'
 * @returns {object} { success, data, raw, usage, request_payload }
 */
export async function analyzeDrawingGemini(pdfPath, model = null) {
  if (!aiCfg.geminiKey) {
    return { success: false, error: "GEMINI_API_KEY not set" };
  }

  const modelName = model || aiCfg.geminiModel;

  let debugPayload = null;

  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64 = pdfBuffer.toString("base64");

    const vntKnowledge = await getKnowledgeBlock("vnt-knowledge");
    const promptText = await getPrompt("gemini-drawing", {
      VNT_KNOWLEDGE: vntKnowledge ?? "",
    });

    const requestPayload = {
      model: modelName,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64,
              },
            },
            { text: promptText },
          ],
        },
      ],
    };

    // Debug payload: thay base64 bằng tên file để hiển thị (không ảnh hưởng request thật)
    debugPayload = {
      ...requestPayload,
      contents: requestPayload.contents.map((c) => ({
        ...c,
        parts: c.parts.map((p) => {
          if (p.inlineData) {
            return {
              ...p,
              inlineData: {
                ...p.inlineData,
                data: `[FILE: ${
                  pdfPath ? path.basename(pdfPath) : "corrected"
                }]`,
              },
            };
          }
          return p;
        }),
      })),
    };

    const response = await generateContentWithRetry(
      geminiAi,
      requestPayload,
      "GeminiAnalyzer"
    );

    const raw = response.text ?? "";
    const cleaned = raw
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();

    let parsed = JSON.parse(cleaned);
    parsed = enrichWithF7F8(parsed);

    return {
      success: true,
      data: parsed,
      raw,
      usage: {},
      request_payload: debugPayload,
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      raw: "",
      request_payload: debugPayload,
    };
  }
}

/**
 * Gemini backup khi correction that bai.
 */
export async function correctDrawingGemini(currentData, userMessage) {
  return analyzeDrawingGemini(null, aiCfg.geminiFlashModel);
}

/**
 * Debug prompt: send pre-rendered system prompt + user message to Gemini and return response.
 * Used by admin prompt debug panel.
 *
 * @param {string} systemPrompt — already-rendered system prompt (with knowledge blocks)
 * @param {string} userMessage — raw user input text
 * @param {string} schema — optional JSON schema for structured output
 * @returns {object} { success, data, raw, usage, request_payload }
 */
export async function debugPromptGemini(
  systemPrompt,
  userMessage,
  schema = ""
) {
  if (!aiCfg.geminiKey) {
    return { success: false, error: "GEMINI_API_KEY not set" };
  }

  const modelName = aiCfg.geminiModel;

  const instruction = schema
    ? `Phan tich yeu cau ben duoi va tra ve JSON theo schema:\n${schema}\n\nLuu y: Tra ve JSON thuan tuy, khong markdown, khong giai thich.`
    : "";

  const fullUserMessage = schema
    ? `${userMessage}\n\n${instruction}`
    : userMessage;

  const requestPayload = {
    model: modelName,
    contents: [{ parts: [{ text: fullUserMessage }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  try {
    const response = await generateContentWithRetry(
      geminiAi,
      requestPayload,
      "debugPromptGemini"
    );
    const raw = response.text ?? "";

    let data;
    try {
      const cleaned = raw
        .replace(/^```json\s*/m, "")
        .replace(/```\s*$/m, "")
        .trim();
      data = JSON.parse(cleaned);
    } catch {
      data = raw;
    }

    return {
      success: true,
      data,
      raw,
      usage: {},
      request_payload: requestPayload,
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      raw: "",
      request_payload: requestPayload,
    };
  }
}
