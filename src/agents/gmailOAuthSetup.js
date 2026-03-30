import "dotenv/config";
import { google } from "googleapis";
import http from "http";
import url from "url";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
// Phai TRUNG KHOP 100% voi "Authorized redirect URIs" trong Google Cloud Console
const REDIRECT_URI =
  (process.env.GMAIL_OAUTH_REDIRECT_URI || "").trim() ||
  "http://localhost:3001/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Thieu GMAIL_CLIENT_ID hoac GMAIL_CLIENT_SECRET trong .env");
  process.exit(1);
}

let callbackUrl;
try {
  callbackUrl = new URL(REDIRECT_URI);
} catch {
  console.error("GMAIL_OAUTH_REDIRECT_URI khong hop le:", REDIRECT_URI);
  process.exit(1);
}
if (callbackUrl.protocol !== "http:") {
  console.error("Script nay chi ho tro http:// (localhost). URI:", REDIRECT_URI);
  process.exit(1);
}
const CALLBACK_PORT = callbackUrl.port
  ? Number(callbackUrl.port)
  : 80;
const CALLBACK_HOST = callbackUrl.hostname;
const baseForReq = `http://${CALLBACK_HOST}:${CALLBACK_PORT}`;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
  ],
});

console.log("\n=== GMAIL OAUTH SETUP ===\n");
console.log("Redirect URI (bat buoc them CHINH XAC vao Google Console):");
console.log("  " + REDIRECT_URI);
console.log(
  "  APIs & Services -> Credentials -> OAuth client -> Authorized redirect URIs\n"
);
console.log("1. Mo link nay trong browser:\n");
console.log(authUrl);
console.log("\n2. Dang nhap bang tai khoan Gmail can su dung");
console.log("3. Cho phep quyen truy cap");
console.log("4. Se tu dong lay token...\n");

const HDR_HTML_UTF8 = { "Content-Type": "text/html; charset=utf-8" };
const HDR_TEXT_UTF8 = { "Content-Type": "text/plain; charset=utf-8" };

function htmlPage(title, bodyInner) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:40px;background:#f0f9ff;margin:0">
${bodyInner}
</body>
</html>`;
}

// Tao local server bat callback
const server = http.createServer(async (req, res) => {
  const qs = new url.URL(req.url, baseForReq);
  if (qs.pathname !== callbackUrl.pathname) {
    res.writeHead(404, HDR_TEXT_UTF8);
    res.end("Not found");
    return;
  }
  const code = qs.searchParams.get("code");

  if (!code) {
    res.writeHead(200, HDR_TEXT_UTF8);
    res.end("Không có mã xác nhận. Thử lại từ đầu.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    const body = `
      <h2 style="color:#0891B2">&#10003; Thành công!</h2>
      <p>Đã lấy được Refresh Token. Quay lại terminal để copy vào file <code>.env</code>.</p>`;
    res.writeHead(200, HDR_HTML_UTF8);
    res.end(htmlPage("OAuth — Thành công", body));

    console.log("\n=== THEM VAO .env ===\n");
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("\n========================\n");
    console.log("Copy dong tren vao file .env roi chay lai agent.");

    server.close();
    process.exit(0);
  } catch (e) {
    const errBody = `<h2 style="color:#b91c1c">Lỗi</h2><p>${escapeHtml(e.message)}</p>`;
    res.writeHead(200, HDR_HTML_UTF8);
    res.end(htmlPage("OAuth — Lỗi", errBody));
    console.error("Loi:", e.message);
    server.close();
    process.exit(1);
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
  console.log(`Dang cho callback tren ${baseForReq}${callbackUrl.pathname} ...\n`);
});
