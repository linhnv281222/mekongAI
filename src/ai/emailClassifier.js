import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aiCfg } from "../libs/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CONFIG_FILE = path.join(__dirname, "../../data/ai-model-config.json");

/**
 * Load AI provider config (same logic as drawController).
 */
function loadAiConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf8"));
      let provider =
        typeof raw?.provider === "string"
          ? raw.provider.trim().toLowerCase()
          : "";
      if (!provider && raw?.model != null && String(raw.model).trim() !== "") {
        const m = String(raw.model).trim().toLowerCase();
        provider = m.startsWith("gemini") ? "gemini" : "claude";
      }
      if (provider !== "claude" && provider !== "gemini") {
        provider = "claude";
      }
      return { provider };
    }
  } catch {}
  return { provider: "claude" };
}

/**
 * Export config loader so callers can check provider.
 */
export function getAiProvider() {
  return loadAiConfig().provider;
}

/**
 * Phan loai email = rfq / repeat_order / hoi_tham / khieu_nai / spam.
 * Chon provider (gemini/claude) tuong tu nhu drawController.
 *
 * @param {object} emailData — { from, subject, body, attachments }
 * @returns {object} { loai, ngon_ngu, ly_do, han_giao_hang, hinh_thuc_giao, ..., _ai_request_payload }
 */
export async function classifyEmail(emailData) {
  const { provider } = loadAiConfig();

  if (provider === "gemini") {
    const { classifyEmailGemini } = await import("./emailClassifierGemini.js");
    return classifyEmailGemini(emailData);
  }

  // Default: Claude Haiku
  const { classifyEmailClaude } = await import("./emailClassifierClaude.js");
  return classifyEmailClaude(emailData);
}
