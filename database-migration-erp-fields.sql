-- ============================================================================
-- DATABASE MIGRATION: Add ERP Fields to drawings table
-- Created: 2026-09-09
-- Purpose: Add ERP fields for drawing analysis matching ERP form structure
-- ============================================================================

-- Add ERP columns to drawings table
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS quy_cach_nvl JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS kieu_cach TEXT;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS nvl_cho_bao_nhieu_sp INTEGER DEFAULT 1;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS kich_thuoc_san_pham JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS gia_tri_tinh_toan JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS nguyen_cong_dac_biet JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS bien_so_gia_cong JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS features_cnc JSONB;

-- Add comments for documentation
COMMENT ON COLUMN drawings.quy_cach_nvl IS 'Material specification: chat_lieu, ma_nguyen_vat_lieu, ten_nguyen_vat_lieu, nha_cung_cap, khoi_luong_rieng';
COMMENT ON COLUMN drawings.kieu_cach IS 'Style/Type of product';
COMMENT ON COLUMN drawings.nvl_cho_bao_nhieu_sp IS 'How many products can be made from one material unit';
COMMENT ON COLUMN drawings.kich_thuoc_san_pham IS 'Product dimensions: chieu_dai, chieu_rong, chieu_cao';
COMMENT ON COLUMN drawings.gia_tri_tinh_toan IS 'Calculated values: khoi_luong_kg, kich_thuoc_c, so_luong_c, ty_gc_mc, so_mat_can_gc_mc';
COMMENT ON COLUMN drawings.nguyen_cong_dac_biet IS 'Special processes: wc, gf, lf, han, cayren, dongpin, tool';
COMMENT ON COLUMN drawings.bien_so_gia_cong IS 'Processing variables: danh_muc, kich_thuoc, khoi_luong, loai_vat_lieu, nguyen_cong_han, do_kho_dung';
COMMENT ON COLUMN drawings.features_cnc IS 'CNC features array with type, code, diameter, depth, quantity, lan_ga, location';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check if columns exist
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'drawings'
AND column_name IN (
    'quy_cach_nvl',
    'kieu_cach',
    'nvl_cho_bao_nhieu_sp',
    'kich_thuoc_san_pham',
    'gia_tri_tinh_toan',
    'nguyen_cong_dac_biet',
    'bien_so_gia_cong',
    'features_cnc'
)
ORDER BY ordinal_position;

-- Check prompt version
SELECT
    pt.name,
    pv.version,
    pv.is_active,
    pv.created_at,
    LENGTH(pv.content) as content_length
FROM prompt_templates pt
JOIN prompt_versions pv ON pt.id = pv.template_id
WHERE pt.name = 'gemini-drawing'
ORDER BY pv.version DESC
LIMIT 3;
