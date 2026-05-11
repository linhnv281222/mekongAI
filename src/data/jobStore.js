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
      { col: "thi_truong", type: "TEXT" },
      { col: "source", type: "TEXT" },
      { col: "han_bao_gia", type: "TEXT" },
      { col: "email_body", type: "TEXT" },
    ];
    for (const { col, type } of missing) {
      await pool.query(`
        ALTER TABLE mekongai.agent_jobs
        ADD COLUMN IF NOT EXISTS ${col} ${type}
      `);
    }
  } catch (_) {
    // Nếu schema chưa có (chưa chạy migration), bỏ qua
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
    thi_truong: row.thi_truong || null,
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
    source: row.source || null,
    han_bao_gia: row.han_bao_gia || null,
    email_body: row.email_body || null,
  };
}

/**
 * Chuyen doi gia tri boolean tu string ("Có"/"Không") hoac so (0/1) sang boolean.
 */
function toBool(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  const s = String(val).trim();
  return s === "Có" || s === "1" || s === "true" || s === "yes";
}

const BOOLEAN_FIELDS = new Set(["co_van_chuyen", "xu_ly_be_mat"]);

/**
 * Lưu job mới hoặc cập nhật job cũ (chỉ ghi vào DB).
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
         classify, ngon_ngu, thi_truong, status, lines_count, error, raw_email, extracted,
         attachments, ten_cong_ty, ma_khach_hang, han_giao, hinh_thuc_giao,
         xu_ly_be_mat, vat_lieu_chung_nhan, co_van_chuyen, drawings,
         classify_output, classify_ai_payload, drawing_ai_payload, ghi_chu,
         source, han_bao_gia, email_body)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      ON CONFLICT (gmail_id) DO UPDATE SET
        subject=EXCLUDED.subject,
        sender_email=EXCLUDED.sender_email,
        sender_name=EXCLUDED.sender_name,
        sender_company=EXCLUDED.sender_company,
        classify=EXCLUDED.classify,
        ngon_ngu=EXCLUDED.ngon_ngu,
        thi_truong=EXCLUDED.thi_truong,
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
        source=EXCLUDED.source,
        han_bao_gia=EXCLUDED.han_bao_gia,
        email_body=EXCLUDED.email_body,
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
        job.thi_truong || null,
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
        toBool(job.xu_ly_be_mat),
        job.vat_lieu_chung_nhan || null,
        toBool(job.co_van_chuyen),
        job.drawings ? JSON.stringify(job.drawings) : "[]",
        job.classify_output ? JSON.stringify(job.classify_output) : null,
        job.classify_ai_payload ? JSON.stringify(job.classify_ai_payload) : null,
        job.drawing_ai_payload ? JSON.stringify(job.drawing_ai_payload) : null,
        job.ghi_chu || null,
        job.source || null,
        job.han_bao_gia || null,
        job.email_body || null,
      ]
    );
  } catch (e) {
    console.error("[JobDB] saveJob error:", e.message);
  }

  return jobData.id;
}

/**
 * Cập nhật job theo DB id hoặc gmail_id (chỉ ghi vào DB).
 * Gọi kiểu 1: updateJob(jobDbId, { status: "pushed", ... })
 * Gọi kiểu 2: updateJob({ gmail_id: "xxx", status: "pending_review", ... })
 * Trả về true nếu update thành công, false nếu bị skip (job đã final).
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
      const setClauses = [];
      const queryVals = [];
      let paramIdx = 1;
      for (const k of keys) {
        let val = updates[k];
        if (k === "lines_count") val = Number(val) || 0;
        else if (BOOLEAN_FIELDS.has(k)) val = toBool(val);
        const isJson = val != null && (typeof val === "object" || k === "drawings" || k === "classify_output" || k === "classify_ai_payload" || k === "drawing_ai_payload" || k === "attachments" || k === "raw_email");
        if (isJson) {
          setClauses.push(`${k}=$${paramIdx}::jsonb`);
        } else {
          setClauses.push(`${k}=$${paramIdx}`);
        }
        queryVals.push(isJson ? JSON.stringify(val) : val);
        paramIdx++;
      }
      queryVals.push(jobDbId);
      const result = await pool.query(
        `UPDATE mekongai.agent_jobs SET ${setClauses.join(",")}, updated_at=NOW() WHERE id=$${paramIdx} AND status != 'pushed'`,
        queryVals
      );
      console.log("[JobDB] updateJob OK jobDbId:", jobDbId);
      return (result.rowCount ?? 0) > 0;
    } else if (updates.gmail_id) {
      const keys = Object.keys(updates);
      const setClauses = [];
      const queryVals = [];
      let paramIdx = 1;
      for (const k of keys) {
        let val = updates[k];
        if (k === "lines_count") val = Number(val) || 0;
        else if (BOOLEAN_FIELDS.has(k)) val = toBool(val);
        const isJson = val != null && (typeof val === "object" || k === "drawings" || k === "classify_output" || k === "classify_ai_payload" || k === "drawing_ai_payload" || k === "attachments" || k === "raw_email");
        if (isJson) {
          setClauses.push(`${k}=$${paramIdx}::jsonb`);
        } else {
          setClauses.push(`${k}=$${paramIdx}`);
        }
        queryVals.push(isJson ? JSON.stringify(val) : val);
        paramIdx++;
      }
      queryVals.push(updates.gmail_id);
      const result = await pool.query(
        `UPDATE mekongai.agent_jobs SET ${setClauses.join(",")}, updated_at=NOW() WHERE gmail_id=$${paramIdx} AND status != 'pushed'`,
        queryVals
      );
      return (result.rowCount ?? 0) > 0;
    }
  } catch (e) {
    console.error("[JobDB] updateJob error:", e.message, JSON.stringify({ updates, keys: Object.keys(updates || {}), jobDbId }));
  }
  return false;
}

/**
 * Lấy tất cả jobs từ PostgreSQL.
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
 * Lấy 1 job theo id (số nguyên = DB id, chuỗi = gmail_id).
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
 * Lấy 1 job theo id hoặc gmail_id (DB trước, fallback = none).
 */
export async function getJobAsync(id) {
  return getJob(id);
}

/**
 * Lấy tất cả jobs (chỉ từ DB).
 */
export async function getJobsAsync() {
  return getJobs();
}

/**
 * Kiểm tra email đã được xử lý chưa (chỉ kiểm tra DB).
 * Trả về true chỉ khi job đã xử lý xong (pending_review hoặc pushed).
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

export async function getJobsForReview(dateStr) {
  if (!pool) return [];
  try {
    const result = await pool.query(
      `SELECT * FROM mekongai.agent_jobs
       WHERE DATE(created_at) = $1
         AND (ghi_chu IS NOT NULL AND ghi_chu != '' AND char_length(ghi_chu) >= 10)
       ORDER BY created_at DESC`,
      [dateStr]
    );
    return result.rows.map(normalizeDbRow);
  } catch (e) {
    console.error("[JobDB] getJobsForReview error:", e.message);
    return [];
  }
}

export { pool };
