/**
 * gmail_oauth_setup.js
 * Chạy 1 lần để lấy GMAIL_REFRESH_TOKEN
 * node gmail_oauth_setup.js
 */
import 'dotenv/config';
import { google } from 'googleapis';
import http from 'http';
import url from 'url';

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3001/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Thiếu GMAIL_CLIENT_ID hoặc GMAIL_CLIENT_SECRET trong .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
  ],
});

console.log('\n=== GMAIL OAUTH SETUP ===\n');
console.log('1. Mo link nay trong browser:\n');
console.log(authUrl);
console.log('\n2. Dang nhap bang ecyberlinh@gmail.com');
console.log('3. Cho phep quyen truy cap');
console.log('4. Se tu dong lay token...\n');

// Tạo local server bắt callback
const server = http.createServer(async (req, res) => {
  const qs = new url.URL(req.url, 'http://localhost:3001');
  const code = qs.searchParams.get('code');

  if (!code) {
    res.end('Khong co code. Thu lai.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.end(`
      <html><body style="font-family:sans-serif;padding:40px;background:#f0f9ff">
        <h2 style="color:#0891B2">✓ Thanh cong!</h2>
        <p>Da lay duoc Refresh Token. Quay lai terminal de copy.</p>
      </body></html>
    `);

    console.log('\n=== THEM VAO .env ===\n');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n========================\n');
    console.log('Copy dong tren vao file .env roi chay lai agent.');

    server.close();
    process.exit(0);
  } catch(e) {
    res.end('Loi: ' + e.message);
    console.error('Loi:', e.message);
    server.close();
    process.exit(1);
  }
});

server.listen(3001, () => {
  console.log('Dang cho callback tren http://localhost:3001 ...\n');
});
