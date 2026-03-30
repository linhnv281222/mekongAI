import { google } from "googleapis";
import { gmailCfg } from "./config.js";

/**
 * Tao Gmail client da duoc authenticate.
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
 * Lay danh sach email chua doc co dinh kem file trong 24h.
 * @param {object} gmail — Gmail client
 * @param {number} hoursBack — so gio de lay (mac dinh 24)
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
 * Parse noi dung 1 email tu Gmail.
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

  // Body
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
 * Tai file dinh kem tu Gmail.
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
 * Danh dau email da doc (go bo UNREAD label).
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
    console.warn("[Gmail] markRead loi:", e.message);
  }
}
