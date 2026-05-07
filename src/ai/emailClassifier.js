import { aiCfg } from "../libs/config.js";
import { loadAiConfig } from "./aiConfig.js";

/**
 * Export config loader so callers can check provider.
 */
export function getAiProvider() {
  return loadAiConfig().provider;
}

/**
 * Phân loại email = rfq / repeat_order / hoi_tham / khieu_nai / spam.
 * Sử dụng provider từ config (gemini hoặc claude).
 */
export async function classifyEmail(emailData) {
  const { provider } = loadAiConfig();

  if (provider === "gemini") {
    const { classifyEmailGemini } = await import("./emailClassifierGemini.js");
    return classifyEmailGemini(emailData);
  }

  const { classifyEmailClaude } = await import("./emailClassifierClaude.js");
  return classifyEmailClaude(emailData);
}
