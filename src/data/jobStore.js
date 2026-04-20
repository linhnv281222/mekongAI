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
  if (!pool) {
    
    return;
  }
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
    await pool.query(
      `
      INSERT INTO agent_jobs
        (gmail_id, subject, sender_email, sender_name, sender_company,
         classify, ngon_ngu, status, raw_email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (gmail_id) DO UPDATE SET
        classify=$6, ngon_ngu=$7, status=$8, updated_at=NOW()
    `,
      [
        j.gmail_id || j.gmailId,
        j.subject,
        j.sender_email || j.senderEmail,
        j.sender_name || j.senderName,
        j.sender_company || j.senderCompany,
        j.classify,
        j.ngon_ngu || j.ngonNgu,
        j.status,
        JSON.stringify(j.raw || {}),
      ]
    );
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
 * Lay 1 job theo id
 */
export function getJob(id) {
  return readJobs().find((j) => j.id === id) || null;
}

/**
 * Cap nhat job theo id
 */
export function updateJob(id, updates) {
  if (id == null) return;
  const jobs = readJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return;
  jobs[idx] = { ...jobs[idx], ...updates };
  writeJobs(jobs);

  // DB
  if (pool && updates.gmail_id) {
    const cols = Object.keys(updates)
      .map((k, i) => `${k}=$${i + 2}`)
      .join(",");
    pool
      .query(
        `UPDATE agent_jobs SET ${cols}, updated_at=NOW() WHERE gmail_id=$1`,
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
  const r = await pool.query("SELECT id FROM agent_jobs WHERE gmail_id=$1", [
    gmailId,
  ]);
  return r.rows.length > 0;
}

export { pool };
