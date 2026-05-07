import { google } from "googleapis";
import { gmailCfg } from "./config.js";

/**
 * Strip email thread content (quoted replies, forwarded, signatures)
 * to reduce noise before AI classification.
 */
function stripEmailThread(rawBody) {
  if (!rawBody) return "";
  let body = rawBody;

  // Remove forwarded headers
  body = body.replace(
    /[-_]{10,}\s*(Forwarded message|Chuyển tiếp|Người gửi ban đầu|Original Message)[-_]*\s*/gi,
    ""
  );
  body = body.replace(/^(From:|To:|Cc:|Date:|Subject:)[^\n]*\n/gim, "");

  // Remove quoted lines (starts with >)
  body = body
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n");

  // Remove signature block
  const sigIdx = body.search(/^--\s*$/m);
  if (sigIdx !== -1) body = body.slice(0, sigIdx).trim();

  // Remove "On ... wrote:" blocks
  body = body.replace(/On\s+.+?\bwrote:\s*/gi, "");

  // Collapse excessive whitespace
  body = body.replace(/\n{4,}/g, "\n\n");

  return body.trim();
}

/**
 * Tạo Gmail client đã được authenticate.
 * @returns {object} gmail API client
 */
export function makeGmail() {
  const auth = new google.auth.OAuth2(
    gmailCfg.clientId,
    gmailCfg.clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  auth.setCredentials({ refresh_token: gmailCfg.refreshToken });
  return google.gmail({ version: "v1", auth });
}

/**
 * Lấy danh sách email chưa đọc có đính kèm file trong 24h.
 * @param {object} gmail — Gmail client
 * @param {number} hoursBack — số giờ để lấy (mặc định 24)
 * @returns {Array} mang message objects
 */
export async function fetchUnread(gmail, hoursBack = 24) {
  const since = Math.floor((Date.now() - hoursBack * 3600000) / 1000);
  const res = await gmail.users.messages.list({
    userId: "me",
    q: `is:unread has:attachment after:${since} to:${gmailCfg.user}`,
    maxResults: 30,
  });
  return res.data.messages || [];
}

/**
 * Parse nội dung 1 email từ Gmail.
 * @param {object} gmail
 * @param {string} msgId
 * @returns {object} { msgId, subject, from, senderEmail, senderName, body, attachments }
 */
export async function parseGmailMsg(gmail, msgId) {
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: msgId,
    format: "full",
  });
  const headers = msg.data.payload.headers || [];
  const hdr = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    "";

  const subject = hdr("Subject");
  const from = hdr("From");
  const date = hdr("Date");

  const emailMatch = from.match(/<(.+?)>/);
  const senderEmail = emailMatch?.[1] || from;
  const senderName = from.replace(/<.+>/, "").trim().replace(/"/g, "");

  // Body — strip email thread (quoted replies, forwarded, signatures) first
  let body = "";

  function walkParts(part) {
    if (part.mimeType === "text/plain" && part.body?.data)
      body += Buffer.from(part.body.data, "base64").toString("utf-8");
    else if (part.mimeType === "text/html" && !body && part.body?.data)
      body += Buffer.from(part.body.data, "base64")
        .toString("utf-8")
        .replace(/<[^>]+>/g, " ");
    if (part.parts) part.parts.forEach(walkParts);
  }
  walkParts(msg.data.payload);

  // Strip thread noise
  body = stripEmailThread(body);

  // PDF attachments
  const attachments = [];
  function findPDFs(part) {
    if (
      part.filename?.toLowerCase().endsWith(".pdf") &&
      part.body?.attachmentId
    )
      attachments.push({
        name: part.filename,
        attachmentId: part.body.attachmentId,
      });
    if (part.parts) part.parts.forEach(findPDFs);
  }
  findPDFs(msg.data.payload);

  return {
    msgId,
    subject,
    from,
    senderEmail,
    senderName: senderName.split(/[\s,　]/)[0] || senderName,
    date,
    body: body.slice(0, 4000),
    attachments,
  };
}

/**
 * Tải file đính kèm từ Gmail.
 * @param {object} gmail
 * @param {string} msgId
 * @param {string} attachmentId
 * @param {string} filename
 * @returns {Buffer}
 */
export async function downloadAttachment(gmail, msgId, attachmentId, filename) {
  const att = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId: msgId,
    id: attachmentId,
  });
  return Buffer.from(att.data.data, "base64");
}

/**
 * Đánh dấu email đã đọc (gỡ bỏ UNREAD label).
 * @param {object} gmail
 * @param {string} msgId
 */
export async function markRead(gmail, msgId) {
  try {
    await gmail.users.messages.modify({
      userId: "me",
      id: msgId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
  } catch (e) {
    console.warn("[Gmail] markRead lỗi:", e.message);
  }
}
