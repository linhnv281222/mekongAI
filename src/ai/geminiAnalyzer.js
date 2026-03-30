import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import { aiCfg } from "../libs/config.js";
import { enrichWithF7F8 } from "../processors/processRouter.js";
import { getKnowledgeBlock, getPrompt } from "../prompts/promptStore.js";

/**
 * Doc ban ve PDF = Gemini.
 * @param {string} pdfPath
 * @param {string} model — 'gemini-2.5-pro' hoac 'gemini-2.5-flash'
 * @returns {object} { success, data, raw, usage }
 */
export async function analyzeDrawingGemini(pdfPath, model = null) {
  if (!aiCfg.geminiKey) {
    return { success: false, error: "GEMINI_API_KEY not set" };
  }

  const genAI = new GoogleGenerativeAI(aiCfg.geminiKey);
  const modelName = model || aiCfg.geminiModel;

  try {
    const genModel = genAI.getGenerativeModel({ model: modelName });
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64 = pdfBuffer.toString("base64");

    const vntKnowledge = await getKnowledgeBlock("vnt-knowledge");
    const promptText = await getPrompt("gemini-drawing", {
      VNT_KNOWLEDGE: vntKnowledge ?? "",
    });

    const result = await genModel.generateContent({
      content: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64,
          },
        },
        promptText,
      ],
    });

    const raw = result.response.text();
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
