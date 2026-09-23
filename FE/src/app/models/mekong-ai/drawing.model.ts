/**
 * Drawing data từ AI phân tích
 */
export interface Drawing {
  id?: number | string;
  filename?: string;
  page?: number;
  fileIndex?: number;
  data?: DrawingData;
  raw?: any;
}

export interface DrawingData {
  [key: string]: unknown;
  ma_ban_ve?: string;
  vat_lieu?: string;
  so_luong?: number;
  xu_ly_be_mat?: string;
  xu_ly_nhiet?: string;
  dung_sai_chung?: string;
  hinh_dang?: string;
  kich_thuoc?: string;
  so_be_mat_cnc?: number | null;
  dung_sai_chat_nhat?: string;
  co_gdt?: boolean;
  ma_quy_trinh?: string;
  ly_giai_qt?: string;

  // ── ERP Fields ──────────────────────────────────────
  quy_cach_nvl?: QuyCachNVL;
  kieu_cach?: string;
  nvl_cho_bao_nhieu_sp?: number;
  kich_thuoc_san_pham?: KichThuocSanPham;
  gia_tri_tinh_toan?: GiaTriTinhToan;
  nguyen_cong_dac_biet?: NguyenCongDacBiet;
  bien_so_gia_cong?: BienSoGiaCong[];
  features_cnc?: FeatureCNC[];
}

export interface QuyCachNVL {
  chat_lieu?: string;          // "NHÔM", "THÉP", "INOX", "ĐỒNG", "NHỰA"
  ma_nguyen_vat_lieu?: string; // "A7075-CN", "S45C", "SUS304"
  ten_nguyen_vat_lieu?: string;
  nha_cung_cap?: string | null;
  khoi_luong_rieng?: number;   // g/cm³
}

export interface KichThuocSanPham {
  chieu_dai?: number;  // mm
  chieu_rong?: number; // mm
  chieu_cao?: number;  // mm
}

export interface GiaTriTinhToan {
  khoi_luong_kg?: number;
  kich_thuoc_c?: number;      // Số kích thước có dung sai chặt
  so_luong_c?: number;        // Tổng số kích thước
  ty_gc_mc?: number;          // Tỷ lệ gia công CNC
  so_mat_can_gc_mc?: number;  // Số bề mặt cần gia công CNC
}

export interface NguyenCongDacBiet {
  wc?: boolean;       // Wire Cut
  gf?: boolean;       // Grinding Finish
  lf?: boolean;       // Lapping Finish
  han?: boolean;      // Hàn
  cayren?: boolean;   // Cày ren
  dongpin?: boolean;  // Đóng pin
  tool?: boolean;     // Tool making
}

export interface BienSoGiaCong {
  danh_muc?: string;        // "Loại"
  kich_thuoc?: string;      // "Nhỏ 1", "Vừa 2", "Lớn 3"
  khoi_luong?: string;      // "Nhẹ 1", "Vừa 2", "Nặng 3"
  loai_vat_lieu?: string;   // "Inox D8", "Nhôm A7075"
  nguyen_cong_han?: string; // "Có", "Không"
  do_kho_dung?: string;     // "Cấp 1" - "Cấp 10"
}

export interface FeatureCNC {
  type?: string;      // "lo_thuong", "lo_taro", "vat_mep", etc.
  code?: string;
  diameter?: number;
  depth?: number;
  quantity?: number;
  lan_ga?: string;    // "MC11", "LC11", etc.
  location?: string;
  [key: string]: any; // extra params
}

