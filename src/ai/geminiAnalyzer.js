import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { aiCfg } from "../libs/config.js";
import { enrichWithF7F8 } from "../processors/processRouter.js";
import { getKnowledgeBlock, getPrompt } from "../prompts/promptStore.js";

/**
 * Doc ban ve PDF = Gemini (SDK moi @google/genai).
 * @param {string} pdfPath
 * @param {string} model — 'gemini-3-flash-preview' hoac 'gemini-3.5-flash-preview'
 * @returns {object} { success, data, raw, usage }
 */
export async function analyzeDrawingGemini(pdfPath, model = null) {
  if (!aiCfg.geminiKey) {
    return { success: false, error: "GEMINI_API_KEY not set" };
  }

  const ai = new GoogleGenAI({ apiKey: aiCfg.geminiKey });
  const modelName = model || aiCfg.geminiModel;

  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64 = pdfBuffer.toString("base64");

    const vntKnowledge = await getKnowledgeBlock("vnt-knowledge");
    const promptText = await getPrompt("gemini-drawing", {
      VNT_KNOWLEDGE: vntKnowledge ?? "",
    });

    const response = await ai.models.generateContent({
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
    });

    const raw = response.text ?? "";
    const cleaned = raw
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();

    let parsed = JSON.parse(cleaned);
    parsed = enrichWithF7F8(parsed);

    return { success: true, data: parsed, raw, usage: {} };
  } catch (e) {
    return { success: false, error: e.message, raw: "" };
  }
}

/**
 * Gemini backup khi correction that bai.
 */
export async function correctDrawingGemini(currentData, userMessage) {
  return analyzeDrawingGemini(null, aiCfg.geminiFlashModel);
}
