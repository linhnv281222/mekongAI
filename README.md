# Mekong AI — AI Đọc Bản Vẽ & Agent Báo Giá

## Cài đặt

```bash
npm install
cp .env.example .env
# Dien thong tin vao .env
```

## Chạy server chính

```bash
npm start
# Hoặc PM2:
pm2 start server.js --name ai-banve
```

Truy cập:
- http://localhost:3000              → Đọc bản vẽ đơn lẻ
- http://localhost:3000/batch.html   → Batch upload nhiều PDF
- http://localhost:3000/demo_v2.html → Demo agent báo giá (3 cột)
- http://localhost:3000/demo.html    → Demo pipeline realtime
- http://localhost:3000/erp_form.html → Form ERP mock

## Cài Gmail OAuth (1 lần duy nhất)

```bash
# Dien GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET vao .env truoc
node gmail_oauth_setup.js
# Mo link -> dang nhap -> copy code -> lay GMAIL_REFRESH_TOKEN
```

## Chạy Email Agent

```bash
# Test thu cong (1 lan)
node email_agent_v2.js

# Chay lien tuc voi PM2
pm2 start email_agent_v2.js --name mekong-agent
pm2 logs mekong-agent
```

## File quan trong

| File | Chuc nang |
|---|---|
| server.js | API server chinh |
| analyzer.js | Claude doc ban ve |
| process_router.js | Tinh KL, chon QT, do phuc tap |
| email_agent_v2.js | Agent tu dong doc email |
| gmail_oauth_setup.js | Setup Gmail OAuth 1 lan |
| demo_v2.html | Demo 3 cot (inbox + KH + ERP) |
| batch.html | Upload nhieu PDF |
| index.html | Giao dien chinh |

## Flow hoat dong

```
Gmail (moi 5 phut)
    -> Classify email (Haiku vi/en/ja)
    -> Neu RFQ: Lookup KH trong ERP
    -> Tach trang PDF
    -> AI doc tung ban ve (Sonnet)
    -> Tao phieu bao gia ERP
    -> Push tung dong ma hang
    -> Mark email da doc
```
