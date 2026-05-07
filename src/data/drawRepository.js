import pg from "pg";
import { dbCfg } from "../libs/config.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: dbCfg.url,
});

export async function initDB() {
  if (!dbCfg.hasDb) {
    
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drawings (
      id           SERIAL PRIMARY KEY,
      filename     TEXT NOT NULL,
      ma_ban_ve    TEXT,
      ten_chi_tiet TEXT,
      vat_lieu     TEXT,
      so_luong     INTEGER,
      hinh_dang    TEXT,
      kich_thuoc   JSONB,
      full_data    JSONB NOT NULL,
      status       TEXT DEFAULT 'pending',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at  TIMESTAMPTZ,
      notes        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_drawings_ma ON drawings(ma_ban_ve);
    CREATE INDEX IF NOT EXISTS idx_drawings_status ON drawings(status);
    CREATE INDEX IF NOT EXISTS idx_drawings_vat_lieu ON drawings(vat_lieu);

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id          SERIAL PRIMARY KEY,
      key         TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id           SERIAL PRIMARY KEY,
      template_id  INT REFERENCES prompt_templates(id) ON DELETE CASCADE,
      version      INT NOT NULL,
      content      TEXT NOT NULL,
      variables    JSONB DEFAULT '[]',
      is_active    BOOLEAN DEFAULT false,
      created_by   TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      note         TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_blocks (
      id          SERIAL PRIMARY KEY,
      key         TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      format      TEXT DEFAULT 'text',
      content     TEXT NOT NULL,
      description TEXT,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  
}

/**
 * Lưu kết quả phân tích bản vẽ.
 * @param {string} filename
 * @param {object} analysisData — 9-field JSON từ AI
 * @returns {number} drawing id
 */
export async function saveDrawing(filename, analysisData) {
  if (!dbCfg.hasDb) {
    console.warn("[DrawRepo] Không có DB — skip saveDrawing");
    return null;
  }
  const d = analysisData;
  const result = await pool.query(
    `INSERT INTO drawings
       (filename, ma_ban_ve, ten_chi_tiet, vat_lieu, so_luong, hinh_dang, kich_thuoc, full_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      filename,
      d.ban_ve?.ma_ban_ve ?? null,
      d.ban_ve?.ten_chi_tiet ?? null,
      d.vat_lieu?.ma ?? null,
      d.san_xuat?.so_luong ?? null,
      d.hinh_dang?.phuong_an_gia_cong ?? null,
      JSON.stringify(d.kich_thuoc_bao ?? {}),
      JSON.stringify(d),
    ]
  );
  return result.rows[0].id;
}

/**
 * Lấy danh sách bản vẽ.
 * @param {{limit, offset, status}} opts
 */
export async function listDrawings({ limit = 20, offset = 0, status } = {}) {
  if (!dbCfg.hasDb) return [];
  const conditions = status ? [`status = $3`] : [];
  const params = [limit, offset, ...(status ? [status] : [])];

  const { rows } = await pool.query(
    `SELECT id, filename, ma_ban_ve, ten_chi_tiet, vat_lieu,
            so_luong, hinh_dang, status, created_at
     FROM drawings
     ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );
  return rows;
}

/**
 * Lấy chi tiết 1 bản vẽ.
 * @param {number} id
 */
export async function getDrawing(id) {
  if (!dbCfg.hasDb) return null;
  const { rows } = await pool.query("SELECT * FROM drawings WHERE id = $1", [
    id,
  ]);
  return rows[0] ?? null;
}

/**
 * Cập nhật trạng thái + ghi chú khi kỹ sư review.
 * @param {number} id
 * @param {{status, notes, correctedData}} opts
 */
export async function reviewDrawing(id, { status, notes, correctedData } = {}) {
  if (!dbCfg.hasDb) return;
  await pool.query(
    `UPDATE drawings
     SET status = COALESCE($2, status),
         notes = COALESCE($3, notes),
         full_data = COALESCE($4, full_data),
         reviewed_at = NOW()
     WHERE id = $1`,
    [id, status, notes, correctedData ? JSON.stringify(correctedData) : null]
  );
}

export { pool };
