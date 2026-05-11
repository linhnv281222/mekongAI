import "dotenv/config";

// ─── VALIDATION ────────────────────────────────────────────────────────────

const REQUIRED_SERVER = ["ANTHROPIC_API_KEY"];
const REQUIRED_AGENT = [
  "ANTHROPIC_API_KEY",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
];

function checkRequired(keys, label) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.warn(`[Config] ${label} — thiếu: ${missing.join(", ")}`);
  }
  return missing;
}

let _warned = false;
function warnOnce(fn) {
  if (!_warned) {
    fn();
    _warned = true;
  }
}

// ─── SERVER CONFIG ──────────────────────────────────────────────────────────

checkRequired(REQUIRED_SERVER, "Server");

export const serverCfg = {
  port: parseInt(process.env.PORT || "3000", 10),
  uploadsDir: process.env.UPLOADS_DIR || "uploads",
};

// ─── AI CONFIG ──────────────────────────────────────────────────────────────

export const aiCfg = {
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
  geminiFlashModel: process.env.GEMINI_FLASH_MODEL || "gemini-2.0-flash",
};

// ─── DATABASE CONFIG ────────────────────────────────────────────────────────

export const dbCfg = {
  url: process.env.DATABASE_URL || "",
  hasDb: !!process.env.DATABASE_URL,
};

// ─── ERP CONFIG ─────────────────────────────────────────────────────────────

export const erpCfg = {
  baseUrl:
    process.env.ERP_BASE_URL || "https://api.vietnhattan.xfactory.vn/qs/api",
  bearerToken: process.env.ERP_BEARER_TOKEN || "",
  loginUrl: process.env.ERP_LOGIN_URL || "",
  username: process.env.ERP_USERNAME || "",
  password: process.env.ERP_PASSWORD || "",
  isMock: !process.env.ERP_BASE_URL || !process.env.ERP_BEARER_TOKEN,
};

// ─── GMAIL CONFIG ──────────────────────────────────────────────────────────

export const gmailCfg = {
  clientId: process.env.GMAIL_CLIENT_ID || "",
  clientSecret: process.env.GMAIL_CLIENT_SECRET || "",
  refreshToken: process.env.GMAIL_REFRESH_TOKEN || "",
  user: process.env.GMAIL_USER || "sales@vietnhattan.com.vn",
  scanIntervalSec: (() => {
    const sec = parseInt(process.env.SCAN_INTERVAL_SECONDS || "", 10);
    if (!isNaN(sec) && sec > 0) return sec;
    return parseInt(process.env.SCAN_INTERVAL_MINUTES || "1", 10) * 60;
  })(),
};

// ─── AGENT CONFIG ───────────────────────────────────────────────────────────

export const agentCfg = {
  banveApiUrl: process.env.BANVE_API_URL || "http://localhost:3000",
};

// ─── AGGREGATE CFG ───────────────────────────────────────

export const CFG = {
  server: serverCfg,
  ai: aiCfg,
  db: dbCfg,
  erp: erpCfg,
  gmail: gmailCfg,
  agent: agentCfg,
};

export default CFG;
