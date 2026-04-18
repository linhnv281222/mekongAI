/**
 * Job model - từ endpoint /jobs
 */
import { Drawing } from './drawing.model';

export interface Job {
  // Backend fields (from /jobs API)
  id: number | string;
  email_id?: string;           // from API response
  username?: string;           // from API response - sender name
  sender?: string;             // alias for username
  sender_email?: string;
  subject?: string;
  timestamp?: string;         // from API response - maps to created_at
  created_at?: string;
  classify?: string;
  ngon_ngu?: string;
  han_giao?: string | null;
  hinh_thuc_giao?: string | null;
  xu_ly_be_mat?: boolean | null;
  vat_lieu_chung_nhan?: string | null;
  ten_cong_ty?: string;
  ghi_chu?: string;
  attachments?: string[] | Array<{ name: string }>;
  drawings?: Drawing[];
  classify_output?: ClassifyOutput | string;
}

export interface ClassifyOutput {
  loai?: string;
  ngon_ngu?: string;
  han_giao_hang?: string;
  hinh_thuc_giao?: string;
  xu_ly_be_mat?: boolean | string;
  vat_lieu_chung_nhan?: string;
  ten_cong_ty?: string;
  ghi_chu?: string;
  [key: string]: any;
}
