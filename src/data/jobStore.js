import pg from "pg";
import { dbCfg } from "../libs/config.js";

const pool = dbCfg.hasDb ? new pg.Pool({ connectionString: dbCfg.url }) : null;

export async function initJobDB() {
  if (!pool) return;
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
      { col: "co_van_chuyen", type: "BOOLEAN" },
      { col: "ma_khach_hang", type: "TEXT" },
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

// ─── Public API ───────────────────────────────────────────────────────────

export function normalizeDbRow(row) {
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
    ma_khach_hang: row.ma_khach_hang || null,
    han_giao: row.han_giao || null,
    hinh_thuc_giao: row.hinh_thuc_giao || null,
    xu_ly_be_mat: row.xu_ly_be_mat ?? null,
    vat_lieu_chung_nhan: row.vat_lieu_chung_nhan || null,
    co_van_chuyen: row.co_van_chuyen ?? null,
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
 * Luu job moi hoac cap nhat job cu (chi ghi vao DB).
 */
export async function saveJob(jobData) {
  if (!pool) {
    console.warn("[JobDB] saveJob: DATABASE_URL not set, skipping.");
    return jobData.id;
  }

  const job = jobData;
  try {
    await pool.query(
      `
      INSERT INTO mekongai.agent_jobs
        (gmail_id, subject, sender_email, sender_name, sender_company,
         classify, ngon_ngu, status, lines_count, error, raw_email, extracted,
         attachments, ten_cong_ty, ma_khach_hang, han_giao, hinh_thuc_giao,
         xu_ly_be_mat, vat_lieu_chung_nhan, co_van_chuyen, drawings,
         classify_output, classify_ai_payload, drawing_ai_payload, ghi_chu)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
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
        ma_khach_hang=EXCLUDED.ma_khach_hang,
        han_giao=EXCLUDED.han_giao,
        hinh_thuc_giao=EXCLUDED.hinh_thuc_giao,
        xu_ly_be_mat=EXCLUDED.xu_ly_be_mat,
        vat_lieu_chung_nhan=EXCLUDED.vat_lieu_chung_nhan,
        co_van_chuyen=EXCLUDED.co_van_chuyen,
        drawings=EXCLUDED.drawings,
        classify_output=EXCLUDED.classify_output,
        classify_ai_payload=EXCLUDED.classify_ai_payload,
        drawing_ai_payload=EXCLUDED.drawing_ai_payload,
        ghi_chu=EXCLUDED.ghi_chu,
        updated_at=NOW()
      WHERE agent_jobs.status NOT IN ('pending_review', 'pushed')
    `,
      [
        job.gmail_id || job.gmailId || null,
        job.subject || null,
        job.sender_email || job.senderEmail || null,
        job.sender_name || job.senderName || null,
        job.sender_company || job.senderCompany || null,
        job.classify || null,
        job.ngon_ngu || job.ngonNgu || null,
        job.status || "new",
        parseInt(Array.isArray(job.drawings) ? job.drawings.length : (job.lines_count || 0), 10),
        job.error || null,
        JSON.stringify(job.raw || {}),
        JSON.stringify({}),
        job.attachments ? JSON.stringify(job.attachments) : "[]",
        job.ten_cong_ty || null,
        job.ma_khach_hang || null,
        job.han_giao || job.han_giao_hang || null,
        job.hinh_thuc_giao || null,
        job.xu_ly_be_mat ?? null,
        job.vat_lieu_chung_nhan || null,
        job.co_van_chuyen ?? null,
        job.drawings ? JSON.stringify(job.drawings) : "[]",
        job.classify_output ? JSON.stringify(job.classify_output) : null,
        job.classify_ai_payload ? JSON.stringify(job.classify_ai_payload) : null,
        job.drawing_ai_payload ? JSON.stringify(job.drawing_ai_payload) : null,
        job.ghi_chu || null,
      ]
    );
  } catch (e) {
    console.error("[JobDB] saveJob error:", e.message);
  }

  return jobData.id;
}

/**
 * Cap nhat job theo DB id hoac gmail_id (chi ghi vao DB).
 * Goi kieu 1: updateJob(jobDbId, { status: "pushed", ... })
 * Goi kieu 2: updateJob({ gmail_id: "xxx", status: "pending_review", ... })
 * Tra ve true neu update thanh cong, false neu bi skip (job da final).
 */
export async function updateJob(idOrFields, fields) {
  let jobDbId;
  let updates;

  if (typeof idOrFields === "string" || typeof idOrFields === "number") {
    jobDbId = Number(idOrFields);
    updates = fields || {};
  } else {
    jobDbId = null;
    updates = idOrFields;
  }

  if (!pool) return true;

  try {
    if (jobDbId && !Number.isNaN(jobDbId)) {
      const keys = Object.keys(updates);
      const linesIdx = keys.indexOf("lines_count");
      // Reorder values to match keys order, cast lines_count explicitly
      const vals = keys.map((k, i) =>
        k === "lines_count" ? Number(updates.lines_count) || 0 : updates[k]
      );
      const result = await pool.query(
        `UPDATE mekongai.agent_jobs
         SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(",")}, updated_at=NOW()
         WHERE id=$${keys.length + 1}
           AND status NOT IN ('pending_review', 'pushed')`,
        [...vals, jobDbId]
      );
      return (result.rowCount ?? 0) > 0;
    } else if (updates.gmail_id) {
      const keys = Object.keys(updates);
      const vals = keys.map((k) =>
        k === "lines_count" ? Number(updates.lines_count) || 0 : updates[k]
      );
      const result = await pool.query(
        `UPDATE mekongai.agent_jobs
         SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(",")}, updated_at=NOW()
         WHERE gmail_id=$${keys.length + 1}
           AND status NOT IN ('pending_review', 'pushed')`,
        [...vals, updates.gmail_id]
      );
      return (result.rowCount ?? 0) > 0;
    }
  } catch (e) {
    console.error("[JobDB] updateJob error:", e.message);
  }
  return false;
}

/**
 * Lay tat ca jobs tu PostgreSQL.
 */
export async function getJobs() {
  if (!pool) return [];
  try {
    const result = await pool.query(
      "SELECT * FROM mekongai.agent_jobs ORDER BY created_at DESC"
    );
    return result.rows.map(normalizeDbRow);
  } catch (e) {
    console.error("[JobDB] getJobs error:", e.message);
    return [];
  }
}

/**
 * Lay 1 job theo id (so nguyen = DB id, chuoi = gmail_id).
 */
export async function getJob(id) {
  if (!pool) return null;
  try {
    const isNum = String(id).match(/^\d+$/);
    const result = isNum
      ? await pool.query(
          "SELECT * FROM mekongai.agent_jobs WHERE id=$1 LIMIT 1",
          [id]
        )
      : await pool.query(
          "SELECT * FROM mekongai.agent_jobs WHERE gmail_id=$1 LIMIT 1",
          [String(id)]
        );
    return result.rows[0] ? normalizeDbRow(result.rows[0]) : null;
  } catch (e) {
    console.error("[JobDB] getJob error:", e.message);
    return null;
  }
}

/**
 * Lay 1 job theo id hoac gmail_id (DB truoc, fallback = none).
 */
export async function getJobAsync(id) {
  return getJob(id);
}

/**
 * Lay tat ca jobs (chi tu DB).
 */
export async function getJobsAsync() {
  return getJobs();
}

/**
 * Check email da duoc xu ly chua (chi kiem tra DB).
 * Tra ve true chi khi job da xu ly xong (pending_review hoac pushed).
 */
export async function isJobProcessed(gmailId) {
  if (!pool || !gmailId) return false;
  try {
    const r = await pool.query(
      `SELECT id FROM mekongai.agent_jobs
       WHERE gmail_id = $1 /* gmailId */
         AND status IN ('pending_review', 'pushed')
       LIMIT 1`,
      [gmailId]
    );
    return r.rows.length > 0;
  } catch (e) {
    console.error("[JobDB] isJobProcessed error:", e.message);
    return false;
  }
}

export { pool };
