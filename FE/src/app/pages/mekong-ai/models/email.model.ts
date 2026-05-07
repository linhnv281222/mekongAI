/**
 * Email/Job row displayed in mailbox
 */
import { Drawing } from './drawing.model';
import { ClassifyOutput } from './job.model';

export interface EmailRow {
  id: number | string;
  jobId?: number | string;
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  date: string;
  created_at?: string;
  attachments: string[] | Array<{ name: string }>;
  classify: string;
  ngon_ngu: string;
  thi_truong: string | null;
  ten_kh: string;
  han_giao: string | null;
  hinh_thuc_giao: string | null;
  co_van_chuyen: boolean | null;
  xu_ly_be_mat: boolean | null;
  vat_lieu_chung_nhan: string | null;
  classify_output: ClassifyOutput | null;
  drawings: Drawing[];
  unread: boolean;
  _agent?: boolean;
  _needLoad?: boolean;
  // AI Debug payloads from agent
  classify_ai_payload?: object | null;
  drawing_ai_payload?: Array<object | null> | null;
}
