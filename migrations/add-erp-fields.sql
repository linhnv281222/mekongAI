-- Add ERP-compatible fields to drawings table
-- Date: 2026-09-09

ALTER TABLE drawings ADD COLUMN IF NOT EXISTS quy_cach_nvl JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS kieu_cach TEXT;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS nvl_cho_bao_nhieu_sp INTEGER DEFAULT 1;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS kich_thuoc_san_pham JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS gia_tri_tinh_toan JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS nguyen_cong_dac_biet JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS bien_so_gia_cong JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS features_cnc JSONB;

COMMENT ON COLUMN drawings.quy_cach_nvl IS 'Quy cách nguyên vật liệu: {chat_lieu, ma_nguyen_vat_lieu, ten_nguyen_vat_lieu, nha_cung_cap, khoi_luong_rieng}';
COMMENT ON COLUMN drawings.kieu_cach IS 'Kiểu cách: Hình tấm, Hình khối, Hình tròn xoay, etc.';
COMMENT ON COLUMN drawings.nvl_cho_bao_nhieu_sp IS 'Một phôi NVL tạo ra bao nhiêu sản phẩm';
COMMENT ON COLUMN drawings.kich_thuoc_san_pham IS 'Kích thước sản phẩm hoàn thiện: {chieu_dai, chieu_rong, chieu_cao}';
COMMENT ON COLUMN drawings.gia_tri_tinh_toan IS 'Giá trị tính toán: {khoi_luong_kg, kich_thuoc_c, so_luong_c, ty_gc_mc, so_mat_can_gc_mc}';
COMMENT ON COLUMN drawings.nguyen_cong_dac_biet IS 'Nguyên công đặc biệt: {wc, gf, lf, han, cayren, dongpin, tool}';
COMMENT ON COLUMN drawings.bien_so_gia_cong IS 'Biên số gia công: [{danh_muc, kich_thuoc, khoi_luong, loai_vat_lieu, nguyen_cong_han, do_kho_dung}]';
COMMENT ON COLUMN drawings.features_cnc IS 'CNC Features chi tiết: [{type, code, diameter, depth, quantity, lan_ga, location, extra_params}]';
