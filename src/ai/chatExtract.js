import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import { aiCfg } from "../libs/config.js";
import { getPrompt, getKnowledgeBlock } from "../prompts/promptStore.js";
import { generateContentWithRetry } from "../libs/geminiGenerateRetry.js";
import { loadAiConfig } from "./aiConfig.js";
import { callClaudeWithRetry } from "./claudeRetry.js";
import { extractJson } from "./jsonExtract.js";

const geminiAi = new GoogleGenAI({ apiKey: aiCfg.geminiKey });

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

  // chat-classify prompt has {{MATERIAL}}, {{HEAT_TREAT}}, {{SURFACE}} placeholders
  // but we don't inject them → they render as empty strings.
  // For chat extraction, only MARKET block is relevant. Strip unused placeholders.
  let finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );
  finalPrompt = finalPrompt
    .replace(/\{\{MATERIAL\}\}/g, "")
    .replace(/\{\{HEAT_TREAT\}\}/g, "")
    .replace(/\{\{SURFACE\}\}/g, "")
    .trim();

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

  // Strip unused knowledge placeholders — chat-classify only needs MARKET
  let finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );
  finalPrompt = finalPrompt
    .replace(/\{\{MATERIAL\}\}/g, "")
    .replace(/\{\{HEAT_TREAT\}\}/g, "")
    .replace(/\{\{SURFACE\}\}/g, "")
    .trim();

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

  let finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );
  finalPrompt = finalPrompt
    .replace(/\{\{MATERIAL\}\}/g, "")
    .replace(/\{\{HEAT_TREAT\}\}/g, "")
    .replace(/\{\{SURFACE\}\}/g, "")
    .trim();

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

  let finalPrompt = (promptText || "").replace(
    "{{MARKET}}",
    marketData || "[BẢNG THỊ TRƯỜNG KHÔNG CÓ]"
  );
  finalPrompt = finalPrompt
    .replace(/\{\{MATERIAL\}\}/g, "")
    .replace(/\{\{HEAT_TREAT\}\}/g, "")
    .replace(/\{\{SURFACE\}\}/g, "")
    .trim();

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
