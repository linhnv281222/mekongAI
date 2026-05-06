import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CONFIG_FILE = path.join(__dirname, "../../data/ai-model-config.json");

/**
 * Load AI config from data/ai-model-config.json.
 * Shared by all AI modules.
 * @returns {{ provider: string, model: string|null }}
 */
export function loadAiConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf8"));
      return {
        provider: raw?.provider?.trim().toLowerCase() || "gemini",
        model: raw?.model?.trim() || null,
      };
    }
  } catch {}
  return { provider: "gemini", model: null };
}
