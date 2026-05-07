/**
 * Email / Job utilities — date formatting, classify output normalization, job→email mapping
 */

import { Job } from '../models/job.model';
import { EmailRow } from '../models/email.model';
import { ClassifyOutput } from '../models/job.model';
import { UiSchema } from '../models/prompt.model';

// ── Date formatters ──────────────────────────────────────────

export function fmtDDMMHHmm(iso: string | null | undefined): string {
  const d = iso != null ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function fmtDDMM(iso: string | null | undefined): string {
  const d = iso != null ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function toDateInputValue(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    const dt = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(dt.getTime())) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function parseHanGiaoToDate(raw: string | null | undefined): Date | null {
  const iso = toDateInputValue(raw);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(x => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

// ── Classify output helpers ────────────────────────────────────

export function inferClassifyOutputFromJob(j: Job): ClassifyOutput | null {
  if (!j || typeof j !== 'object') return null;
  const o: ClassifyOutput = {};
  if (j.classify != null && j.classify !== '') o.loai = j.classify;
  if (j.ngon_ngu != null && j.ngon_ngu !== '') o.ngon_ngu = j.ngon_ngu;
  if (j.han_giao != null && j.han_giao !== '') o.han_giao_hang = j.han_giao;
  if (j.hinh_thuc_giao != null && j.hinh_thuc_giao !== '') {
    o.hinh_thuc_giao = j.hinh_thuc_giao;
  }
  if (j.co_van_chuyen !== undefined && j.co_van_chuyen !== null) {
    o.co_van_chuyen = j.co_van_chuyen;
  }
  if (j.xu_ly_be_mat !== undefined && j.xu_ly_be_mat !== null) {
    o.xu_ly_be_mat = j.xu_ly_be_mat;
  }
  if (j.vat_lieu_chung_nhan !== undefined && j.vat_lieu_chung_nhan !== null) {
    o.vat_lieu_chung_nhan = j.vat_lieu_chung_nhan;
  }
  const ten = j.ten_cong_ty ?? (j as unknown as EmailRow).ten_kh;
  if (ten != null && ten !== '') o.ten_cong_ty = ten;
  const ghi = j.ghi_chu ?? (j as unknown as EmailRow).body;
  if (ghi != null && ghi !== '') o.ghi_chu = ghi;
  return Object.keys(o).length ? o : null;
}

export function normalizeClassifyOutputFromJob(j: Job): ClassifyOutput | null {
  let raw: string | object | null | undefined = j.classify_output;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as ClassifyOutput;
  }
  return inferClassifyOutputFromJob(j);
}

// ── Job → EmailRow mapping ────────────────────────────────────

export function mapJobRowToEmail(j: Job): EmailRow {
  return {
    id: j.id,
    from: j.ten_cong_ty || j.sender || 'Agent',
    email: j.sender_email || '',
    subject: j.subject ?? '',
    preview: `${(j as unknown as { lines_count?: number }).lines_count || 0} trang da doc`,
    body: '',
    time: (() => {
      const d = j.created_at != null ? new Date(j.created_at) : null;
      return d && !Number.isNaN(d.getTime())
        ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : '—';
    })(),
    date: fmtDDMMHHmm(j.created_at),
    created_at: j.created_at,
    attachments: j.attachments || [],
    classify: j.classify ?? '',
    ngon_ngu: j.ngon_ngu ?? '',
    thi_truong: j.thi_truong ?? null,
    ten_kh: j.ten_cong_ty || j.sender || '',
    source: (j as any).source ?? undefined,
    han_giao: j.han_giao != null && j.han_giao !== '' ? j.han_giao : null,
    hinh_thuc_giao: j.hinh_thuc_giao || null,
    co_van_chuyen: j.co_van_chuyen ?? null,
    xu_ly_be_mat: j.xu_ly_be_mat ?? null,
    vat_lieu_chung_nhan: j.vat_lieu_chung_nhan ?? null,
    classify_output: normalizeClassifyOutputFromJob(j),
    drawings: j.drawings || [],
    unread: j.classify === 'pending_review',
    _agent: true,
    _needLoad: true,
    // AI Debug payloads
    classify_ai_payload: j.classify_ai_payload ?? null,
    drawing_ai_payload: j.drawing_ai_payload ?? null,
  };
}

export function mergeAgentIntoInbox(agentEmails: EmailRow[], prev: EmailRow[]): EmailRow[] {
  const nonAgent = prev.filter(e => !e._agent);
  const loadedById = new Map<string | number, EmailRow>();
  for (const e of prev) {
    if (e._agent && !e._needLoad && (e.jobId || e.id)) {
      loadedById.set(String(e.jobId || e.id), e);
    }
  }
  const merged = agentEmails.map(a => {
    const kept = loadedById.get(String(a.jobId || a.id));
    if (!kept) return a;
    return {
      ...kept,
      preview: a.preview,
      time: a.time,
      date: a.date,
      unread: a.unread,
      source: a.source ?? kept.source ?? undefined,
      attachments: a.attachments?.length ? a.attachments : kept.attachments,
      classify_output: kept.classify_output ?? a.classify_output ?? null,
    };
  });
  return [...merged, ...nonAgent];
}

// ── Classify schema helpers ───────────────────────────────────

export function collectSchemaKeys(schema: UiSchema | null): Set<string> {
  const keys = new Set<string>();
  for (const row of schema?.generalRows || []) {
    for (const cell of row.cells || []) {
      if (cell.key) keys.add(cell.key);
      if (cell.showWhenKey) keys.add(cell.showWhenKey);
    }
  }
  return keys;
}

export function truthyClassify(v: unknown): boolean {
  if (v == null || v === false) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

export function inferExtraFieldType(val: unknown): 'boolean' | 'number' | 'json' | 'textarea' | 'text' {
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number' && Number.isFinite(val)) return 'number';
  if (val != null && typeof val === 'object') return 'json';
  const s = val == null ? '' : String(val);
  if (s.length > 120) return 'textarea';
  return 'text';
}

export function humanizeClassifyKey(k: string): string {
  if (!k || typeof k !== 'string') return k;
  return k
    .split('_')
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '')
    .join(' ');
}

export function resolveClassifyValue(
  email: EmailRow,
  key: string,
  defaultValue: unknown
): unknown {
  const co = email.classify_output;
  if (co && Object.prototype.hasOwnProperty.call(co, key)) {
    return co[key];
  }
  if (key === 'han_giao_hang' && email.han_giao != null && email.han_giao !== '') {
    return email.han_giao;
  }
  if (key === 'hinh_thuc_giao' && email.hinh_thuc_giao != null) {
    return email.hinh_thuc_giao;
  }
  if (key === 'co_van_chuyen' && email.co_van_chuyen != null) {
    return email.co_van_chuyen;
  }
  if (key === 'xu_ly_be_mat' && email.xu_ly_be_mat != null) {
    return email.xu_ly_be_mat;
  }
  return defaultValue;
}
