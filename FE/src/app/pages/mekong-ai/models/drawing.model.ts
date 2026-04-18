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
}
