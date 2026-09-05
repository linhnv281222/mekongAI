import { getPrompt } from "../prompts/promptStore.js";
import { extractJson } from "./jsonExtract.js";

/**
 * Email classification using Xiaomi MiMo-V2.5-Pro via OpenRouter
 * Much cheaper than Claude for email classification
 */

function openrouterKey() {
  return process.env.OPENROUTER_API_KEY || "";
}

function xiaomiModel() {
  return process.env.XIAOMI_MODEL || "xiaomi/mimo-v2.5-pro";
}

/**
 * Classify email using Xiaomi MiMo-V2.5-Pro
 * @param {object} emailData - Email data with subject, body, sender, etc.
 * @returns {Promise<{success: boolean, data?: object, raw?: string, error?: string, request_payload?: object}>}
 */
export async function classifyEmailXiaomi(emailData) {
  if (!openrouterKey()) {
    return { success: false, error: "OPENROUTER_API_KEY not set" };
  }

  const modelName = xiaomiModel();
  console.log(`[XiaomiClassifier] START model=${modelName}`);

  try {
    const promptText = await getPrompt("email-classify", {
      SUBJECT: emailData.subject || "",
      BODY: emailData.body || "",
      FROM: emailData.from || "",
      EMAIL: emailData.email || "",
    });

    const requestPayload = {
      model: modelName,
      messages: [
        {
          role: "user",
          content: promptText,
        },
      ],
      temperature: 0,
      max_tokens: 2048,
    };

    const debugPayload = {
      ...requestPayload,
      _source: "xiaomi_email_classifier",
      _email_subject: emailData.subject || "",
    };

    console.log(`[XiaomiClassifier] Calling OpenRouter API...`);

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
      console.error(`[XiaomiClassifier] OpenRouter error:`, errorText);
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

    console.log(`[XiaomiClassifier] API success. Tokens: ${usage.total_tokens || 0}`);

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
    console.error(`[XiaomiClassifier] Error:`, error);
    return {
      success: false,
      error: error.message || String(error),
      raw: "",
    };
  }
}
