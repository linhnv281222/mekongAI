/**
 * email_agent_v2.js — Mekong AI
 * Pipeline: Gmail scan → Classify → Extract → Tách trang PDF → AI đọc BV → Push ERP
 *
 * ENV cần có trong .env:
 *   # Gmail OAuth
 *   GMAIL_CLIENT_ID=...
 *   GMAIL_CLIENT_SECRET=...
 *   GMAIL_REFRESH_TOKEN=...
 *   GMAIL_USER=sales@vietnhattan.com.vn
 *
 *   # ERP FaceNet
 *   ERP_BASE_URL=https://erp.vietnhattan.com.vn/api
 *   ERP_LOGIN_URL=https://erp.vietnhattan.com.vn/api/auth/login
 *   ERP_USERNAME=agent@vietnhattan.com.vn
 *   ERP_PASSWORD=...
 *
 *   # AI
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 *   # Server AI đọc BV
 *   BANVE_API_URL=http://localhost:3000
 *
 *   # Cron interval (phút)
 *   SCAN_INTERVAL_MINUTES=5
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import fetch from 'node-fetch';
import FormData from 'form-data';
import pg from 'pg';
import { PDFDocument } from 'pdf-lib';

// Import job store từ server (khi chạy standalone thì dùng local store)
let _saveJob = null;
async function getSaveJobFn() {
  if (_saveJob) return _saveJob;
  try {
    const mod = await import('./server.js');
    _saveJob = mod.saveAgentJob;
  } catch(e) {
    // Standalone mode — lưu vào file JSON
    _saveJob = (job) => {
      const f = './agent_jobs.json';
      let jobs = [];
      try { jobs = JSON.parse(fs.readFileSync(f,'utf8')); } catch(e2) {}
      jobs.unshift(job);
      fs.writeFileSync(f, JSON.stringify(jobs.slice(0,50), null, 2));
      console.log(`[Agent] Job saved → agent_jobs.json (id: ${job.id})`);
      return job.id;
    };
  }
  return _saveJob;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CFG = {
  GMAIL_USER:    process.env.GMAIL_USER    || 'sales@vietnhattan.com.vn',
  BANVE_API:     process.env.BANVE_API_URL || 'http://localhost:3000',
  ERP_BASE:      process.env.ERP_BASE_URL  || 'https://api.vietnhattan.xfactory.vn/qs/api',
  ERP_LOGIN:     process.env.ERP_LOGIN_URL || '',
  ERP_USER:      process.env.ERP_USERNAME  || '',
  ERP_PASS:      process.env.ERP_PASSWORD  || '',
  INTERVAL_SEC:  parseInt(process.env.SCAN_INTERVAL_SECONDS || '30'),
  MOCK_ERP:      !process.env.ERP_BASE_URL || !process.env.ERP_BEARER_TOKEN,
};

console.log(`[Config] ERP mode: ${CFG.MOCK_ERP ? 'MOCK' : 'REAL → ' + CFG.ERP_BASE}`);
console.log(`[Config] Scan interval: ${CFG.INTERVAL_SEC} giây`);

// ── DATABASE ──────────────────────────────────────────────────────────────────
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

async function initDB() {
  if (!pool) { console.log('[DB] Không có DATABASE_URL — bỏ qua lưu trạng thái'); return; }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_jobs (
      id           SERIAL PRIMARY KEY,
      gmail_id     TEXT UNIQUE,
      subject      TEXT,
      sender_email TEXT,
      sender_name  TEXT,
      sender_company TEXT,
      classify     TEXT,
      ngon_ngu     TEXT,
      status       TEXT DEFAULT 'new',
      erp_quote_id TEXT,
      lines_count  INT DEFAULT 0,
      error        TEXT,
      raw_email    JSONB,
      extracted    JSONB,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[DB] agent_jobs ready');
}

async function isProcessed(gmailId) {
  if (!pool) return false;
  const r = await pool.query('SELECT id FROM agent_jobs WHERE gmail_id=$1', [gmailId]);
  return r.rows.length > 0;
}

async function saveJob(job) {
  if (!pool) return;
  await pool.query(`
    INSERT INTO agent_jobs
      (gmail_id, subject, sender_email, sender_name, sender_company, classify, ngon_ngu, status, raw_email)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (gmail_id) DO UPDATE SET
      classify=$6, ngon_ngu=$7, status=$8, updated_at=NOW()
  `, [job.gmailId, job.subject, job.senderEmail, job.senderName, job.senderCompany,
      job.classify, job.ngon_ngu, job.status, JSON.stringify(job.raw||{})]);
}

async function updateJob(gmailId, updates) {
  if (!pool) return;
  const cols = Object.keys(updates).map((k,i) => `${k}=$${i+2}`).join(',');
  await pool.query(
    `UPDATE agent_jobs SET ${cols}, updated_at=NOW() WHERE gmail_id=$1`,
    [gmailId, ...Object.values(updates)]
  );
}

// ── GMAIL ─────────────────────────────────────────────────────────────────────
function makeGmail() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth });
}

async function fetchUnread(gmail, hoursBack = 24) {
  const since = Math.floor((Date.now() - hoursBack * 3600000) / 1000);
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `is:unread has:attachment after:${since} to:${CFG.GMAIL_USER}`,
    maxResults: 30,
  });
  return res.data.messages || [];
}

async function parseGmailMsg(gmail, msgId) {
  const msg = await gmail.users.messages.get({ userId:'me', id:msgId, format:'full' });
  const headers = msg.data.payload.headers || [];
  const hdr = name => headers.find(h => h.name.toLowerCase()===name.toLowerCase())?.value||'';

  const subject = hdr('Subject');
  const from    = hdr('From');
  const date    = hdr('Date');

  // Parse sender
  const emailMatch = from.match(/<(.+?)>/);
  const senderEmail = emailMatch?.[1] || from;
  const senderName  = from.replace(/<.+>/, '').trim().replace(/"/g,'');

  // Body
  let body = '';
  function walkParts(part) {
    if (part.mimeType === 'text/plain' && part.body?.data)
      body += Buffer.from(part.body.data, 'base64').toString('utf-8');
    else if (part.mimeType === 'text/html' && !body && part.body?.data)
      body += Buffer.from(part.body.data, 'base64').toString('utf-8').replace(/<[^>]+>/g,' ');
    if (part.parts) part.parts.forEach(walkParts);
  }
  walkParts(msg.data.payload);

  // PDF attachments
  const attachments = [];
  function findPDFs(part) {
    if (part.filename?.toLowerCase().endsWith('.pdf') && part.body?.attachmentId)
      attachments.push({ name: part.filename, attachmentId: part.body.attachmentId });
    if (part.parts) part.parts.forEach(findPDFs);
  }
  findPDFs(msg.data.payload);

  return {
    msgId, subject, from, senderEmail,
    senderName: senderName.split(/[\s,　]/)[0] || senderName,
    date,
    body: body.slice(0, 4000),
    attachments,
  };
}

// ── CLASSIFY EMAIL — HAIKU ────────────────────────────────────────────────────
async function classifyEmail(emailData) {
  const prompt = `You classify emails for VNT — a CNC precision machining company in Vietnam.
Emails may be in Vietnamese, English, or Japanese (most common: Japanese from customers in Japan).

From: ${emailData.from}
Subject: ${emailData.subject}
Attachments: ${emailData.attachments.map(a=>a.name).join(', ') || 'none'}
Body (first 500 chars):
${emailData.body.slice(0,500)}

Classify into ONE of:
- rfq: 見積依頼/加工依頼/見積/quotation/báo giá — customer requests price quote, sends drawings
- repeat_order: リピート/repeat — customer reorders same part already quoted before
- hoi_tham: general question, capability inquiry, no drawings
- khieu_nai: complaint, quality issue, delivery problem
- spam: newsletter, advertisement, unrelated

Also extract if rfq/repeat_order:
- ngon_ngu: vi | en | ja
- han_giao_hang: delivery deadline if mentioned (ISO date or text)
- hinh_thuc_giao: delivery method (FedEx/DHL/pickup etc.)
- xu_ly_be_mat: true/false (表面処理あり=true, なし=false, not mentioned=null)
- vat_lieu_chung_nhan: true/false (材料証明書=true)
- ghi_chu: key notes from email (max 200 chars)
- ten_cong_ty: customer company name from signature

Return ONLY JSON, no explanation:
{
  "loai": "rfq",
  "ngon_ngu": "ja",
  "ly_do": "見積依頼 with PDF attachment",
  "han_giao_hang": "2026-04-20",
  "hinh_thuc_giao": "FedEx International Economy",
  "xu_ly_be_mat": false,
  "vat_lieu_chung_nhan": false,
  "ghi_chu": "...",
  "ten_cong_ty": "バンズエンジニアリング株式会社"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role:'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g,'').trim());
  } catch(e) {
    console.warn('[Classify] fallback:', e.message);
    return {
      loai: emailData.attachments.length > 0 ? 'rfq' : 'hoi_tham',
      ngon_ngu: 'ja',
      ly_do: 'fallback: ' + e.message,
      han_giao_hang: null,
      hinh_thuc_giao: null,
      xu_ly_be_mat: null,
      vat_lieu_chung_nhan: false,
      ghi_chu: emailData.subject,
      ten_cong_ty: emailData.senderName,
    };
  }
}

// ── TÁCH TỪNG TRANG PDF ───────────────────────────────────────────────────────
async function splitPDF(pdfBuffer, originalName) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);
    const bytes = await newPdf.save();
    const tmpPath = path.join(os.tmpdir(), `vnt_p${i+1}_${Date.now()}_${originalName}`);
    fs.writeFileSync(tmpPath, bytes);
    pages.push({ path: tmpPath, page: i+1, name: `${originalName}_trang${i+1}.pdf` });
  }

  console.log(`[PDF] Tách ${pageCount} trang từ ${originalName}`);
  return pages;
}

// ── DOWNLOAD ATTACHMENT ───────────────────────────────────────────────────────
async function downloadAttachment(gmail, msgId, attachmentId, filename) {
  const att = await gmail.users.messages.attachments.get({
    userId:'me', messageId:msgId, id:attachmentId,
  });
  const buffer = Buffer.from(att.data.data, 'base64');
  return buffer;
}

// ── AI ĐỌC BẢN VẼ ────────────────────────────────────────────────────────────
async function analyzeDrawing(pdfPath, filename) {
  const form = new FormData();
  form.append('file', fs.createReadStream(pdfPath), { filename });
  const res = await fetch(`${CFG.BANVE_API}/drawings`, {
    method:'POST', body:form, headers:form.getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lỗi đọc BV');
  return data; // { id, data: {...9 fields...}, tokens_used }
}

// ── ERP: BEARER TOKEN (tĩnh từ .env) ────────────────────────────────────────
function erpHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.ERP_BEARER_TOKEN}`,
  };
}

// ── ERP: TẠO PHIẾU BÁO GIÁ (HEADER) ─────────────────────────────────────────
async function createQuoteHeader(emailData, classify) {
  const langMap = { vi:'Tiếng Việt', en:'Tiếng Anh', ja:'Tiếng Nhật' };

  // Map hình thức vận chuyển → transport_method ID
  // Anh cần confirm ID thật từ ERP, tạm dùng 309 theo Postman mẫu
  const transportId = classify.hinh_thuc_giao ? 309 : null;

  const payload = {
    id:                      null,
    index:                   null,
    quota_code:              null,
    is_active:               true,
    sign_status:             "0",
    status:                  "0",
    vat:                     null,
    type:                    "Gia công",
    quoting_status:          "Mới tạo",
    format:                  "Kinh tế",
    language:                langMap[classify.ngon_ngu] || "Tiếng Nhật",
    lot_number:              1,
    quantity_for_min_price:  10,
    creator:                 process.env.ERP_USERNAME || "sale_ai@vnt.vn",
    created_date:            new Date().toISOString(),
    request_time:            emailData.date ? new Date(emailData.date).toISOString() : new Date().toISOString(),
    vat_value:               8,
    has_transport:           !!classify.hinh_thuc_giao,
    surface_treatment:       classify.xu_ly_be_mat === true,
    exchange_rate:           161.77,
    quotation_currency:      classify.ngon_ngu === 'ja' ? 'JPY' : classify.ngon_ngu === 'en' ? 'USD' : 'VND',
    transport_method:        transportId,
    company_code:            1,
    customer_code:           null, // ERP cần lookup theo email sender
    unit:                    "PCS",
    // Điều khoản — bóc tách từ email nếu có
    term: JSON.stringify([
      { languageId: "vi", terms: [
        { termName: "1", termContent: classify.han_giao_hang ? `Hạn giao: ${classify.han_giao_hang}` : "" },
        { termName: "2", termContent: classify.hinh_thuc_giao || "" },
      ]},
      { languageId: "en", terms: [] },
      { languageId: "jp", terms: [
        { termName: "1", termContent: classify.han_giao_hang ? `納期：${classify.han_giao_hang}` : "" },
        { termName: "2", termContent: classify.hinh_thuc_giao || "" },
      ]},
    ]),
    assignment: null,
    // Meta thêm để track
    _agent_note: `Mekong AI — ${emailData.senderEmail} — ${emailData.subject}`,
  };

  if (CFG.MOCK_ERP) {
    const mockCode = 'VNTAGENT' + Date.now().toString().slice(-6);
    console.log(`[ERP MOCK] Tạo phiếu BG: ${mockCode}`);
    console.log('[ERP MOCK] Payload:', JSON.stringify(payload, null, 2));
    return { quota_code: mockCode, id: mockCode, mock: true };
  }

  const res = await fetch(`${CFG.ERP_BASE}/quotation-sheets/create`, {
    method: 'POST',
    headers: erpHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('ERP tạo phiếu thất bại: ' + JSON.stringify(data));
  console.log(`[ERP] Tạo phiếu BG: ${data.quota_code || data.id}`);
  return data;
}

// ── ERP: THÊM DÒNG MÃ HÀNG ───────────────────────────────────────────────────
// Gom tất cả items của 1 phiếu rồi gọi 1 lần
// API: POST /quotation-items/insert-pdf/cache?quotaCode=xxx
async function pushAllLinesToERP(quoteCode, drawingResults) {
  // Build array theo format Postman mẫu
  const items = drawingResults.map((r, i) => {
    const d = r.data;
    return {
      id: i,
      fileNameOld: d?.ban_ve?.ma_ban_ve || r.filename?.replace('.pdf','') || `BV_${i}`,
      fileNameNew: d?.ban_ve?.ten_chi_tiet || null,
      filePath:    null,
      totalFiles:  drawingResults.length,
      // Thêm data từ AI đọc bản vẽ
      ma_nvl:      d?.vat_lieu?.ma || null,
      so_luong:    d?.san_xuat?.so_luong || 1,
      kl_phoi_kg:  d?.khoi_luong?.kl_phoi_kg || 0,
      ma_quy_trinh: d?.ma_quy_trinh || null,
      hinh_dang:   d?.hinh_dang?.loai || null,
      xu_ly_nhiet: d?.vat_lieu?.nhiet_luyen || null,
      xu_ly_be_mat: (d?.xu_ly?.be_mat||[]).map(x=>x.ten||x).join(', ') || null,
      he_so_phuc_tap: d?.phan_tich_do_phuc_tap?.he_so_phuc_tap || null,
      drawing_db_id: r.id,
    };
  });

  if (CFG.MOCK_ERP) {
    console.log(`[ERP MOCK] Push ${items.length} items vào phiếu ${quoteCode}`);
    items.forEach((it,i) => console.log(`  [${i+1}] ${it.fileNameOld} — ${it.ma_nvl||'?'} — ${it.kl_phoi_kg}kg`));
    return { ok: true, mock: true };
  }

  const url = `${CFG.ERP_BASE}/quotation-items/insert-pdf/cache?quotaCode=${encodeURIComponent(quoteCode)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: erpHeaders(),
    body: JSON.stringify(items),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('ERP push items thất bại: ' + JSON.stringify(data));
  console.log(`[ERP] Push ${items.length} bản vẽ vào phiếu ${quoteCode} ✓`);
  return data;
}

// Giữ lại addQuoteLine để tương thích, nhưng không dùng trực tiếp
async function addQuoteLine(quoteId, stt, drawingResult) {
  const d = drawingResult.data;
  console.log(`[ERP] Queue dòng ${stt}: ${d?.ban_ve?.ma_ban_ve} — ${d?.vat_lieu?.ma} — ${d?.khoi_luong?.kl_phoi_kg}kg`);
  return { queued: true };
}

// ── MARK EMAIL ĐÃ ĐỌC ────────────────────────────────────────────────────────
async function markRead(gmail, msgId) {
  try {
    await gmail.users.messages.modify({
      userId:'me', id:msgId,
      requestBody: { removeLabelIds:['UNREAD'] },
    });
  } catch(e) { console.warn('[Gmail] markRead lỗi:', e.message); }
}

// ── PIPELINE CHÍNH ────────────────────────────────────────────────────────────
async function processEmail(gmail, msgId) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Agent] Xử lý: ${msgId}`);

  // 1. Check đã xử lý chưa
  if (await isProcessed(msgId)) {
    console.log('[Agent] Đã xử lý → bỏ qua');
    return;
  }

  // 2. Parse email
  let emailData;
  try {
    emailData = await parseGmailMsg(gmail, msgId);
  } catch(e) {
    console.error('[Parse] Lỗi:', e.message);
    return;
  }

  console.log(`[Agent] Subject: "${emailData.subject}"`);
  console.log(`[Agent] From: ${emailData.from}`);
  console.log(`[Agent] PDFs: ${emailData.attachments.map(a=>a.name).join(', ')||'không có'}`);

  // 3. Classify bằng Haiku
  console.log('[Classify] Gọi Haiku...');
  const classify = await classifyEmail(emailData);
  console.log(`[Classify] → ${classify.loai} | ${classify.ngon_ngu} | ${classify.ly_do}`);

  // Lưu DB
  await saveJob({
    gmailId: msgId,
    subject: emailData.subject,
    senderEmail: emailData.senderEmail,
    senderName: emailData.senderName,
    senderCompany: classify.ten_cong_ty,
    classify: classify.loai,
    ngon_ngu: classify.ngon_ngu,
    status: classify.loai === 'rfq' || classify.loai === 'repeat_order' ? 'processing' : classify.loai,
    raw: { subject: emailData.subject, from: emailData.from, attachments: emailData.attachments.map(a=>a.name) },
  });

  // Không phải RFQ → dừng
  if (!['rfq','repeat_order'].includes(classify.loai)) {
    console.log(`[Agent] Không phải RFQ (${classify.loai}) → ghi nhận, bỏ qua`);
    await markRead(gmail, msgId);
    return;
  }

  if (!emailData.attachments.length) {
    console.log('[Agent] RFQ nhưng không có PDF → cần liên hệ KH xin bản vẽ');
    await updateJob(msgId, { status:'no_pdf' });
    await markRead(gmail, msgId);
    return;
  }

  // 4. Tạo job ID

  // 5. Xử lý từng file PDF — tách trang → AI đọc từng trang → gom lại
  const allResults = [];
  for (const att of emailData.attachments) {
    console.log(`\n[PDF] Xử lý: ${att.name}`);
    let pdfBuffer;
    try {
      pdfBuffer = await downloadAttachment(gmail, msgId, att.attachmentId, att.name);
    } catch(e) {
      console.error(`[Download] Lỗi ${att.name}:`, e.message);
      continue;
    }

    // Tách từng trang
    let pages;
    try {
      pages = await splitPDF(pdfBuffer, att.name);
    } catch(e) {
      console.error(`[SplitPDF] Lỗi:`, e.message);
      const tmpPath = path.join(os.tmpdir(), `vnt_full_${Date.now()}_${att.name}`);
      fs.writeFileSync(tmpPath, pdfBuffer);
      pages = [{ path:tmpPath, page:1, name:att.name }];
    }

    // Đọc từng trang bằng AI
    for (const pg of pages) {
      console.log(`[BV] Đọc trang ${pg.page}/${pages.length}: ${pg.name}`);
      try {
        const result = await analyzeDrawing(pg.path, pg.name);
        const d = result.data;
        if (!d?.ban_ve?.ma_ban_ve && !d?.vat_lieu?.ma) {
          console.log(`[BV] Trang ${pg.page} không có dữ liệu → bỏ qua`);
          continue;
        }
        console.log(`[BV] ✓ ${d?.ban_ve?.ma_ban_ve} | ${d?.vat_lieu?.ma} | SL:${d?.san_xuat?.so_luong} | KL:${d?.khoi_luong?.kl_phoi_kg}kg`);
        allResults.push({ ...result, filename: att.name });
      } catch(e) {
        console.error(`[BV] Lỗi trang ${pg.page}:`, e.message);
      } finally {
        fs.unlink(pg.path, ()=>{});
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // 6. Lưu kết quả vào file JSON để demo_v2.html đọc
  const jobId = 'job_' + msgId.slice(-8) + '_' + Date.now().toString().slice(-4);
  const jobData = {
    id:          jobId,
    gmail_id:    msgId,
    subject:     emailData.subject,
    sender:      emailData.from,
    sender_email: emailData.senderEmail,
    classify:    classify.loai,
    ngon_ngu:    classify.ngon_ngu,
    han_giao:    classify.han_giao_hang,
    hinh_thuc_giao: classify.hinh_thuc_giao,
    xu_ly_be_mat: classify.xu_ly_be_mat,
    vat_lieu_chung_nhan: classify.vat_lieu_chung_nhan,
    ten_cong_ty: classify.ten_cong_ty,
    ghi_chu:     emailData.body.slice(0, 500),
    attachments: emailData.attachments.map(a => a.name),
    drawings:    allResults,
    status:      'pending_review',
    created_at:  Date.now(),
  };

  // Lưu vào agent_jobs.json
  const jobFile = path.join(__dirname, 'agent_jobs.json');
  let allJobs = [];
  try { allJobs = JSON.parse(fs.readFileSync(jobFile, 'utf8')); } catch(e) {}
  allJobs.unshift(jobData);
  fs.writeFileSync(jobFile, JSON.stringify(allJobs.slice(0,100), null, 2));

  const reviewUrl = 'http://localhost:3000/demo_v2.html?job=' + jobId;
  console.log('\n' + '═'.repeat(60));
  console.log(`[Agent] ✓ Xong: ${allResults.length} bản vẽ`);
  console.log(`[Agent] → Review tại: ${reviewUrl}`);
  console.log('═'.repeat(60));

  // Tự mở browser
  const { exec } = await import('child_process');
  const openCmd = process.platform === 'win32' ? `start "" "${reviewUrl}"`
                : process.platform === 'darwin' ? `open "${reviewUrl}"`
                : `xdg-open "${reviewUrl}"`;
  exec(openCmd);

  await updateJob(msgId, { status:'pending_review', lines_count: allResults.length });

  // 7. Mark email đã đọc
  await markRead(gmail, msgId);
}

// ── MAIN LOOP ─────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n' + '═'.repeat(60));
  console.log('  Mekong AI Email Agent v2.0');
  console.log('  ' + new Date().toLocaleString('vi-VN'));
  console.log('═'.repeat(60));

  // Kiểm tra config bắt buộc
  const required = ['ANTHROPIC_API_KEY','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('[Config] Thiếu ENV:', missing.join(', '));
    process.exit(1);
  }

  await initDB();

  const gmail = makeGmail();

  // Scan lần đầu ngay khi start
  await scanOnce(gmail);

  // Lặp theo interval
  setInterval(() => scanOnce(gmail), CFG.INTERVAL_SEC * 1000);
}

async function scanOnce(gmail) {
  console.log(`\n[Scan] ${new Date().toLocaleTimeString('vi-VN')} — Quét email mới...`);
  try {
    const messages = await fetchUnread(gmail);
    console.log(`[Scan] Tìm thấy ${messages.length} email chưa đọc có đính kèm`);

    for (const msg of messages) {
      try {
        await processEmail(gmail, msg.id);
      } catch(e) {
        console.error(`[Scan] Lỗi xử lý ${msg.id}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`[Scan] Xong. Chờ ${CFG.INTERVAL_SEC} giây...`);
  } catch(e) {
    console.error('[Scan] Lỗi:', e.message);
  }
}

run().catch(e => {
  console.error('[Fatal]', e.message);
  process.exit(1);
});
