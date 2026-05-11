import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import { aiCfg } from "../libs/config.js";
import { getPrompt, getKnowledgeBlock } from "../prompts/promptStore.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";
import { loadAiConfig } from "./aiConfig.js";
import { callClaudeWithRetry } from "./claudeRetry.js";

const geminiAi = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

/** Extract JSON — thử parse trực tiếp, thất bại thì tìm balanced { ... } trong text */
function extractJson(text) {
  const cleaned = String(text || "").replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = findBalancedBraces(cleaned, '{', '}');
  if (objMatch) {
    try { return JSON.parse(objMatch); } catch {}
  }
  const arrMatch = findBalancedBraces(cleaned, '[', ']');
  if (arrMatch) {
    try { return JSON.parse(arrMatch); } catch {}
  }
  throw new Error("Không thể extract JSON from response");
}

/** Tìm text con bắt đầu bởi openChar và kết thúc bởi closeChar (đã cân bằng) */
function findBalancedBraces(text, openChar, closeChar) {
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === openChar) { start = i; break; }
  }
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"' || ch === "'") { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function chatModel() {
  const m = (process.env.CHAT_GEMINI_MODEL || "").trim();
  return m || aiCfg.geminiFlashModel || "gemini-3-flash-preview";
}

function claudeModel() {
  const { model } = loadAiConfig();
  if (model && model.trim()) return model.trim();
  return process.env.ANTHROPIC_MODEL || aiCfg.anthropicModel || "claude-sonnet-4-6";
}

/**
 * Trích xuất thông tin cấu trúc từ chat message bằng AI.
 */
export async function extractChatInfo(message) {
  const { provider } = loadAiConfig();

  if (provider === "claude") {
    return extractChatInfoClaude(message);
  }
  return extractChatInfoGemini(message);
}

async function extractChatInfoGemini(message) {
  const [promptText, marketData] = await Promise.all([
    getPrompt("chat-classify", {
      chatMessage: message || "",
    }),
    getKnowledgeBlock("vnt-markets"),
  ]);

  const finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );

  const response = await generateContentWithRetry(
    geminiAi,
    {
      model: chatModel(),
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
    },
    "ChatExtract"
  );

  const raw = response.text ?? "";
  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  return extractJson(cleaned);
}

async function extractChatInfoClaude(message) {
  const [promptText, marketData] = await Promise.all([
    getPrompt("chat-classify", {
      chatMessage: message || "",
    }),
    getKnowledgeBlock("vnt-markets"),
  ]);

  const finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": aiCfg.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: {
      model: claudeModel(),
      max_tokens: 300,
      temperature: 0,
      messages: [{ role: "user", content: finalPrompt }],
    },
    logTag: "ChatExtract",
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.error}`);
  }

  const raw = res.data.content?.[0]?.text || "";
  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  return extractJson(cleaned);
}

/**
 * Trích xuất thông tin + debug payload cho chat.
 */
export async function extractChatInfoWithPayload(message) {
  const { provider } = loadAiConfig();

  if (provider === "claude") {
    return extractChatInfoWithPayloadClaude(message);
  }
  return extractChatInfoWithPayloadGemini(message);
}

async function extractChatInfoWithPayloadGemini(message) {
  const [promptText, marketData] = await Promise.all([
    getPrompt("chat-classify", {
      chatMessage: message || "",
    }),
    getKnowledgeBlock("vnt-markets"),
  ]);

  const finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );

  const requestPayload = {
    model: chatModel(),
    contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
  };

  const response = await generateContentWithRetry(
    geminiAi,
    requestPayload,
    "ChatExtract"
  );

  const raw = response.text ?? "";
  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const data = extractJson(cleaned);

  return { data, raw, request_payload: requestPayload };
}

async function extractChatInfoWithPayloadClaude(message) {
  const [promptText, marketData] = await Promise.all([
    getPrompt("chat-classify", {
      chatMessage: message || "",
    }),
    getKnowledgeBlock("vnt-markets"),
  ]);

  const finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );

  const requestPayload = {
    model: claudeModel(),
    max_tokens: 300,
    temperature: 0,
    messages: [{ role: "user", content: finalPrompt }],
  };

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": aiCfg.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: requestPayload,
    logTag: "ChatExtract",
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.error}`);
  }

  const raw = res.data.content?.[0]?.text || "";
  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const parsed = extractJson(cleaned);

  return { data: parsed, raw, request_payload: requestPayload };
}

/**
 * Trả lời chat tự nhiên.
 */
export async function chatAssistantReply(userMessage) {
  const text = (userMessage || "").trim();
  if (!text) return "Bạn hãy nhập nội dung cần hỏi.";

  const { provider } = loadAiConfig();

  if (provider === "claude") {
    return chatAssistantReplyClaude(text);
  }
  return chatAssistantReplyGemini(text);
}

async function chatAssistantReplyGemini(userMessage) {
  const response = await generateContentWithRetry(
    geminiAi,
    {
      model: chatModel(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Bạn là trợ lý AI của hệ thống Mekong AI. Trả lời bằng tiếng Việt, ngắn gọn, dùng **in đậm** cho từ khóa quan trọng. Không dùng markdown code block.",
            },
          ],
        },
        {
          role: "model",
          parts: [
            { text: "Tôi đã hiểu. Tôi sẵn sàng trả lời bạn bằng tiếng Việt." },
          ],
        },
        { role: "user", parts: [{ text: userMessage.slice(0, 12000) }] },
      ],
    },
    "ChatAssistant"
  );

  const raw = response.text ?? "";
  const cleaned = raw
    .replace(/^```json\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  return cleaned || "Không nhận được phản hồi từ AI. Thử lại nhé.";
}

async function chatAssistantReplyClaude(userMessage) {
  const SYSTEM = "Bạn là trợ lý AI của hệ thống Mekong AI. Trả lời bằng tiếng Việt, ngắn gọn, dùng **in đậm** cho từ khóa quan trọng. Không dùng markdown code block.";

  const res = await callClaudeWithRetry({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": aiCfg.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: {
      model: claudeModel(),
      max_tokens: 2048,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: userMessage.slice(0, 12000) }],
    },
    logTag: "ChatAssistant",
  });

  if (!res.ok) {
    return `Không nhận được phản hồi từ Claude. Lỗi: ${res.error}`;
  }

  const raw = res.data.content?.[0]?.text || "";
  return raw || "Không nhận được phản hồi từ Claude. Thử lại nhé.";
}
