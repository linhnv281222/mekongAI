import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";
import { dbCfg } from "../libs/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOB_FILE =
  (process.env.AGENT_JOBS_FILE || "").trim() ||
  path.join(__dirname, "../../agent_jobs.json");

// ─── PostgreSQL pool ───────────────────────────────────────────────────────

const pool = dbCfg.hasDb ? new pg.Pool({ connectionString: dbCfg.url }) : null;

export async function initJobDB() {
  if (!pool) return;
  // Table duoc tao qua migrations/setup-db.sql
  // Ham nay chi dam bao cac cot moi nhat ton tai (ALTER TABLE neu thieu)
  try {
    const missing = [
      { col: "attachments", type: "JSONB DEFAULT '[]'" },
      { col: "ten_cong_ty", type: "TEXT" },
      { col: "han_giao", type: "TEXT" },
      { col: "hinh_thuc_giao", type: "TEXT" },
      { col: "xu_ly_be_mat", type: "BOOLEAN" },
      { col: "vat_lieu_chung_nhan", type: "TEXT" },
      { col: "drawings", type: "JSONB DEFAULT '[]'" },
      { col: "classify_output", type: "JSONB" },
      { col: "classify_ai_payload", type: "JSONB" },
      { col: "drawing_ai_payload", type: "JSONB" },
      { col: "ghi_chu", type: "TEXT" },
      { col: "pushed_at", type: "TIMESTAMPTZ" },
    ];
    for (const { col, type } of missing) {
      await pool.query(`
        ALTER TABLE mekongai.agent_jobs
        ADD COLUMN IF NOT EXISTS ${col} ${type}
      `);
    }
  } catch (_) {
    // Neu schema chua co (chua chay migration), bo qua
  }
}

// ─── File-based store (backup / standalone) ─────────────────────────────────

export function readJobs() {
  try {
    return JSON.parse(fs.readFileSync(JOB_FILE, "utf8"));
  } catch {
    return [];
  }
}

export function writeJobs(jobs) {
  const dir = path.dirname(JOB_FILE);
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = JSON.stringify(jobs.slice(0, 100), null, 2);
  const tmp = `${JOB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, payload, "utf8");
  try {
    if (fs.existsSync(JOB_FILE)) fs.unlinkSync(JOB_FILE);
  } catch {
    /* ignore */
  }
  fs.renameSync(tmp, JOB_FILE);
}

// ─── Public API ────────────────────────────────────────────────────────────

function jobGmailId(j) {
  return j.gmail_id || j.gmailId || "";
}

/**
 * Luu job moi hoac cap nhat job cu.
 * Ghi de theo gmail_id: moi email chi 1 dong trong file (tranh job tam id:null + job xong).
 * @param {object} jobData
 */
export async function saveJob(jobData) {
  const gid = jobGmailId(jobData);
  const jobs = readJobs().filter((j) => {
    if (gid && jobGmailId(j) === gid) return false;
    if (jobData.id != null && j.id === jobData.id) return false;
    return true;
  });
  writeJobs([jobData, ...jobs]);

  // DB if available
  if (pool) {
    const j = jobData;
    try {
      await pool.query(
        `
        INSERT INTO mekongai.agent_jobs
          (gmail_id, subject, sender_email, sender_name, sender_company,
           classify, ngon_ngu, status, lines_count, error, raw_email, extracted,
           attachments, ten_cong_ty, han_giao, hinh_thuc_giao,
           xu_ly_be_mat, vat_lieu_chung_nhan, drawings,
           classify_output, classify_ai_payload, drawing_ai_payload, ghi_chu)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        ON CONFLICT (gmail_id) DO UPDATE SET
          subject=EXCLUDED.subject,
          sender_email=EXCLUDED.sender_email,
          sender_name=EXCLUDED.sender_name,
          sender_company=EXCLUDED.sender_company,
          classify=EXCLUDED.classify,
          ngon_ngu=EXCLUDED.ngon_ngu,
          status=EXCLUDED.status,
          lines_count=EXCLUDED.lines_count,
          error=EXCLUDED.error,
          raw_email=EXCLUDED.raw_email,
          extracted=EXCLUDED.extracted,
          attachments=EXCLUDED.attachments,
          ten_cong_ty=EXCLUDED.ten_cong_ty,
          han_giao=EXCLUDED.han_giao,
          hinh_thuc_giao=EXCLUDED.hinh_thuc_giao,
          xu_ly_be_mat=EXCLUDED.xu_ly_be_mat,
          vat_lieu_chung_nhan=EXCLUDED.vat_lieu_chung_nhan,
          drawings=EXCLUDED.drawings,
          classify_output=EXCLUDED.classify_output,
          classify_ai_payload=EXCLUDED.classify_ai_payload,
          drawing_ai_payload=EXCLUDED.drawing_ai_payload,
          ghi_chu=EXCLUDED.ghi_chu,
          updated_at=NOW()
      `,
        [
          j.gmail_id || j.gmailId || null,
          j.subject || null,
          j.sender_email || j.senderEmail || null,
          j.sender_name || j.senderName || null,
          j.sender_company || j.senderCompany || null,
          j.classify || null,
          j.ngon_ngu || j.ngonNgu || null,
          j.status || "new",
          Array.isArray(j.drawings) ? j.drawings.length : (j.lines_count || 0),
          j.error || null,
          JSON.stringify(j.raw || {}),
          JSON.stringify({}),
          j.attachments ? JSON.stringify(j.attachments) : "[]",
          j.ten_cong_ty || null,
          j.han_giao || j.han_giao_hang || null,
          j.hinh_thuc_giao || null,
          j.xu_ly_be_mat ?? null,
          j.vat_lieu_chung_nhan || null,
          j.drawings ? JSON.stringify(j.drawings) : "[]",
          j.classify_output ? JSON.stringify(j.classify_output) : null,
          j.classify_ai_payload ? JSON.stringify(j.classify_ai_payload) : null,
          j.drawing_ai_payload ? JSON.stringify(j.drawing_ai_payload) : null,
          j.ghi_chu || null,
        ]
      );
    } catch (e) {
      console.error("[JobDB] saveJob error:", e.message);
    }
  }

  return jobData.id;
}

/**
 * Lay tat ca jobs (tu file)
 */
export function getJobs() {
  return readJobs();
}

/**
 * Lay 1 job theo id (tu file)
 */
export function getJob(id) {
  return readJobs().find((j) => j.id === id) || null;
}

/**
 * Lay tat ca jobs tu PostgreSQL.
 */
export async function getJobsFromDb() {
  if (!pool) return [];
  try {
    const r = await pool.query(
      "SELECT * FROM mekongai.agent_jobs ORDER BY created_at DESC"
    );
    return r.rows.map(normalizeDbRow);
  } catch (e) {
    console.error("[JobDB] getJobsFromDb error:", e.message);
    return [];
  }
}

/**
 * Lay 1 job theo id tu PostgreSQL.
 */
export async function getJobFromDb(id) {
  if (!pool) return null;
  try {
    const r = await pool.query(
      "SELECT * FROM mekongai.agent_jobs WHERE id=$1 OR gmail_id=$1 LIMIT 1",
      [id]
    );
    return r.rows[0] ? normalizeDbRow(r.rows[0]) : null;
  } catch (e) {
    console.error("[JobDB] getJobFromDb error:", e.message);
    return null;
  }
}

/**
 * Lay 1 job: uu tien file (local first), neu khong co thi hoi DB.
 */
export async function getJobAsync(id) {
  const fromFile = getJob(id);
  if (fromFile) return fromFile;
  return await getJobFromDb(id);
}

/**
 * Lay tat ca jobs: gop file + DB, loai bo trung lap.
 */
export async function getJobsAsync() {
  const [file, db] = await Promise.all([
    Promise.resolve(readJobs()),
    getJobsFromDb(),
  ]);
  // Gop, loai trung theo gmail_id (hoac id)
  const seen = new Map();
  const all = [...file, ...db];
  for (const j of all) {
    const key = (j.gmail_id || j.gmailId || "") || `id:${j.id}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, j);
      continue;
    }
    //Uu tien ban co nhieu drawings hon
    const score = (x) => {
      const pages = Array.isArray(x.drawings) ? x.drawings.length : 0;
      const raw = x.created_at;
      const t = typeof raw === "number" ? raw : raw ? new Date(raw).getTime() : 0;
      return pages * 1e15 + (Number.isNaN(t) ? 0 : t);
    };
    if (score(j) >= score(prev)) seen.set(key, j);
  }
  return Array.from(seen.values()).sort((a, b) => {
    const ta = typeof a.created_at === "number" ? a.created_at : new Date(a.created_at || 0).getTime();
    const tb = typeof b.created_at === "number" ? b.created_at : new Date(b.created_at || 0).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
}

/** Chuan hoa row tu DB sang format job (giong nhu file JSON) */
function normalizeDbRow(row) {
  return {
    id: row.id,
    gmail_id: row.gmail_id || row.gmailId || null,
    subject: row.subject || null,
    sender: row.sender || null,
    sender_email: row.sender_email || null,
    sender_name: row.sender_name || null,
    sender_company: row.sender_company || null,
    classify: row.classify || null,
    ngon_ngu: row.ngon_ngu || null,
    classify_output: row.classify_output || null,
    ten_cong_ty: row.ten_cong_ty || null,
    han_giao: row.han_giao || null,
    hinh_thuc_giao: row.hinh_thuc_giao || null,
    xu_ly_be_mat: row.xu_ly_be_mat ?? null,
    vat_lieu_chung_nhan: row.vat_lieu_chung_nhan || null,
    ghi_chu: row.ghi_chu || null,
    attachments: row.attachments || [],
    drawings: row.drawings || [],
    lines_count: row.lines_count || 0,
    status: row.status || "new",
    error: row.error || null,
    erp_quote_id: row.erp_quote_id || null,
    raw_email: row.raw_email || null,
    classify_ai_payload: row.classify_ai_payload || null,
    drawing_ai_payload: row.drawing_ai_payload || null,
    pushed_at: row.pushed_at || null,
    created_at: row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now(),
    updated_at: row.updated_at ? new Date(row.updated_at).getTime() : null,
  };
}

/**
 * Cap nhat job theo id
 */
export function updateJob(id, updates) {
  if (id == null) return;
  const jobs = readJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], ...updates };
    writeJobs(jobs);
  }

  // DB
  if (pool && updates.gmail_id) {
    const cols = Object.keys(updates)
      .map((k, i) => `${k}=$${i + 2}`)
      .join(",");
    pool
      .query(
        `UPDATE mekongai.agent_jobs SET ${cols}, updated_at=NOW() WHERE gmail_id=$1`,
        [updates.gmail_id, ...Object.values(updates)]
      )
      .catch(() => {});
  }
}

/**
 * Check email da duoc xu ly chua (co job trong file hoac DB).
 */
export async function isJobProcessed(gmailId) {
  if (!gmailId) return false;
  const inFile = readJobs().some((j) => jobGmailId(j) === gmailId);
  if (inFile) return true;
  if (!pool) return false;
  const r = await pool.query("SELECT id FROM mekongai.agent_jobs WHERE gmail_id=$1", [
    gmailId,
  ]);
  return r.rows.length > 0;
}

export { pool };
