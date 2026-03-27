import pg from "pg";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── TẠO BẢNG ────────────────────────────────────────────────────────────────
export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drawings (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL,
      ma_ban_ve   TEXT,
      ten_chi_tiet TEXT,
      vat_lieu    TEXT,
      so_luong    INTEGER,
      hinh_dang   TEXT,
      kich_thuoc  JSONB,
      full_data   JSONB NOT NULL,
      status      TEXT DEFAULT 'pending',   -- pending | reviewed | approved
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      notes       TEXT                      -- ghi chú của kỹ sư khi review
    );

    CREATE INDEX IF NOT EXISTS idx_drawings_ma ON drawings(ma_ban_ve);
    CREATE INDEX IF NOT EXISTS idx_drawings_status ON drawings(status);
    CREATE INDEX IF NOT EXISTS idx_drawings_vat_lieu ON drawings(vat_lieu);
  `);
  console.log("✓ DB initialized");
}

// ─── LƯU KẾT QUẢ PHÂN TÍCH ───────────────────────────────────────────────────
export async function saveDrawing(filename, analysisData) {
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

// ─── LẤY DANH SÁCH BẢN VẼ ────────────────────────────────────────────────────
export async function listDrawings({ limit = 20, offset = 0, status } = {}) {
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

// ─── LẤY CHI TIẾT 1 BẢN VẼ ───────────────────────────────────────────────────
export async function getDrawing(id) {
  const { rows } = await pool.query(
    "SELECT * FROM drawings WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

// ─── CẬP NHẬT STATUS + GHI CHÚ (kỹ sư review) ───────────────────────────────
export async function reviewDrawing(id, { status, notes, correctedData } = {}) {
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
