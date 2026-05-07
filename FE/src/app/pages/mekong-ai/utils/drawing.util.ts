/**
 * Drawing normalization utilities
 * Đồng bộ với src/libs/drawingNormalize.js — FE không import Node được
 */

export interface DrawingLine {
  id: number;
  page: number;
  fileIndex: number;
  filename: string;
  ma_ban_ve: string;
  vat_lieu: string;
  so_luong: number;
  xu_ly_be_mat: string;
  xu_ly_nhiet: string;
  dung_sai_chung: string;
  hinh_dang: string;
  kich_thuoc: string;
  so_be_mat_cnc: number | null;
  dung_sai_chat_nhat: string;
  co_gdt: boolean;
  ma_quy_trinh: string;
  ly_giai_qt: string;
  dung_sai: string;
  note: string;
  danh_gia: 0 | 1 | 99;
  _raw: Record<string, unknown>;
}

export interface RawDrawing {
  id?: number | string;
  filename?: string;
  page?: number;
  fileIndex?: number;
  data?: Record<string, unknown>;
  raw?: unknown;
}

interface NormalizedDrawingData {
  ma_ban_ve: string;
  vat_lieu: string;
  so_luong: number;
  xu_ly_be_mat: string;
  xu_ly_nhiet: string;
  dung_sai_chung: string;
  hinh_dang: string;
  kich_thuoc: string;
  so_be_mat_cnc: number | null;
  dung_sai_chat_nhat: string;
  co_gdt: boolean;
  ma_quy_trinh: string;
  ly_giai_qt: string;
  note: string;
}

// ── Helpers ─────────────────────────────────────────────────

function toStrUi(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return ''; }
  }
  return String(v);
}

function materialUi(vl: unknown): string {
  if (vl == null) return '';
  if (typeof vl === 'string') return vl;
  if (typeof vl === 'object') {
    const m = vl as { ma?: unknown; loai?: unknown };
    const ma = m?.ma != null ? String(m.ma).trim() : '';
    const loai = m?.loai != null ? String(m.loai).trim() : '';
    if (ma && loai) return `${ma} (${loai})`;
    return ma || loai || '';
  }
  return toStrUi(vl);
}

function shapeUi(hd: unknown): string {
  if (hd == null) return '';
  if (typeof hd === 'string') return hd;
  if (typeof hd === 'object') {
    const s = hd as { loai?: unknown; kieu_phoi?: unknown };
    const loai = s?.loai != null ? String(s.loai).trim() : '';
    const kieu = s?.kieu_phoi != null ? String(s.kieu_phoi).trim() : '';
    if (loai && kieu) return `${loai} \u00b7 ${kieu}`;
    return loai || kieu || '';
  }
  return toStrUi(hd);
}

function kichThuocBaoUi(kt: unknown): string {
  if (!kt || typeof kt !== 'object') return '';
  const k = kt as { phi_lon?: unknown; cao_hoac_duong_kinh?: unknown; dai?: unknown; rong?: unknown };
  if (k?.phi_lon != null && k.phi_lon !== '')
    return `\u00d8${k.phi_lon} \u00d7 ${k?.cao_hoac_duong_kinh ?? ''}`.trim();
  if (k?.dai != null && k?.rong != null)
    return `${k.dai}\u00d7${k.rong}\u00d7${k?.cao_hoac_duong_kinh ?? ''}`;
  return '';
}

function maQtLegacyUi(d: Record<string, unknown>): string {
  const mqt = d['ma_quy_trinh'];
  if (mqt != null && String(mqt).trim()) return String(mqt).trim();
  const qt = d['quy_trinh_tong_the'];
  if (!Array.isArray(qt) || !qt.length) return '';
  const last = qt[qt.length - 1];
  if (typeof last === 'string') return last;
  if (last && typeof last === 'object') {
    const obj = last as Record<string, unknown>;
    return String(obj['ma'] ?? obj['ma_quy_trinh'] ?? '').trim();
  }
  return '';
}

function normalizeDrawingDataForUi(raw: unknown): NormalizedDrawingData {
  if (!raw || typeof raw !== 'object') {
    return {
      ma_ban_ve: '', vat_lieu: '', so_luong: 1,
      xu_ly_be_mat: '', xu_ly_nhiet: '', dung_sai_chung: '',
      hinh_dang: '', kich_thuoc: '', so_be_mat_cnc: null,
      dung_sai_chat_nhat: '', co_gdt: false,
      ma_quy_trinh: '', ly_giai_qt: '', note: '',
    };
  }

  const r = raw as Record<string, unknown>;
  const bv = (r['ban_ve'] ?? {}) as Record<string, unknown>;
  const sx = (r['san_xuat'] ?? {}) as Record<string, unknown>;
  const kt = (r['kich_thuoc_bao'] ?? {}) as Record<string, unknown>;
  const xu = (r['xu_ly'] ?? {}) as Record<string, unknown>;
  const sl = Number(sx['so_luong']);

  // Not legacy: flat keys ma_ban_ve, vat_lieu directly on raw
  const isLegacy = r['ban_ve'] !== undefined ||
    (r['vat_lieu'] !== undefined && typeof r['vat_lieu'] === 'object') ||
    r['kich_thuoc_bao'] !== undefined;

  if (!isLegacy) {
    const slN = Number(r['so_luong']);
    return {
      ma_ban_ve: toStrUi(r['ma_ban_ve']),
      vat_lieu: materialUi(r['vat_lieu']),
      so_luong: Number.isFinite(slN) && slN > 0 ? slN : 1,
      xu_ly_be_mat: toStrUi(r['xu_ly_be_mat']),
      xu_ly_nhiet: toStrUi(r['xu_ly_nhiet']),
      dung_sai_chung: toStrUi(r['dung_sai_chung']),
      hinh_dang: shapeUi(r['hinh_dang']),
      kich_thuoc: toStrUi(r['kich_thuoc']),
      so_be_mat_cnc: r['so_be_mat_cnc'] != null && r['so_be_mat_cnc'] !== ''
        ? Number(r['so_be_mat_cnc']) : null,
      dung_sai_chat_nhat: toStrUi(r['dung_sai_chat_nhat']),
      co_gdt: Boolean(r['co_gdt']),
      ma_quy_trinh: toStrUi(r['ma_quy_trinh']),
      ly_giai_qt: toStrUi(r['ly_giai_qt']),
      note: toStrUi(r['note']),
    };
  }

  // Legacy format: nested ban_ve, san_xuat, kich_thuoc_bao
  let xbm = '';
  const xuBeMat = xu['be_mat'];
  if (xuBeMat && Array.isArray(xuBeMat)) {
    xbm = xuBeMat
      .map((b: unknown) => {
        if (b && typeof b === 'object') return String((b as Record<string, unknown>)['ten'] ?? b).trim();
        return String(b).trim();
      })
      .filter(Boolean)
      .join('; ');
  }

  const nguyenCongCnc = r['nguyen_cong_cnc'];
  const soBeMatCnc: number | null =
    r['so_be_mat_cnc'] != null && r['so_be_mat_cnc'] !== ''
      ? Number(r['so_be_mat_cnc'])
      : Array.isArray(nguyenCongCnc) ? nguyenCongCnc.length : null;

  return {
    ma_ban_ve: toStrUi(bv['ma_ban_ve']),
    vat_lieu: materialUi(r['vat_lieu']),
    so_luong: Number.isFinite(sl) && sl > 0 ? sl : 1,
    xu_ly_be_mat: xbm || toStrUi(r['xu_ly_be_mat']),
    xu_ly_nhiet: toStrUi(xu['nhiet'] ?? r['xu_ly_nhiet']),
    dung_sai_chung: toStrUi(sx['tieu_chuan'] ?? r['dung_sai_chung']),
    hinh_dang: shapeUi(r['hinh_dang']),
    kich_thuoc: toStrUi(r['kich_thuoc']) || kichThuocBaoUi(kt),
    so_be_mat_cnc: soBeMatCnc,
    dung_sai_chat_nhat: toStrUi(r['dung_sai_chat_nhat']),
    co_gdt: Boolean(r['co_gdt']),
    ma_quy_trinh: maQtLegacyUi(r),
    ly_giai_qt: toStrUi(r['ly_giai_qt']),
    note: toStrUi(r['note']),
  };
}

/** Convert raw drawing API response → DrawingLine for table display */
export function drawingToLine(r: RawDrawing, indexHint: number): DrawingLine {
  const d = normalizeDrawingDataForUi(r.data || {});

  return {
    id: r.id != null ? Number(r.id) : Date.now() + indexHint,
    page: r.page ?? indexHint + 1,
    fileIndex: r.fileIndex ?? indexHint,
    filename: r.filename || '',
    ma_ban_ve: d.ma_ban_ve || (r.page != null ? `Trang ${r.page}` : ''),
    vat_lieu: d.vat_lieu,
    so_luong: d.so_luong ?? 1,
    xu_ly_be_mat: d.xu_ly_be_mat,
    xu_ly_nhiet: d.xu_ly_nhiet,
    dung_sai_chung: d.dung_sai_chung,
    hinh_dang: d.hinh_dang,
    kich_thuoc: d.kich_thuoc,
    so_be_mat_cnc: d.so_be_mat_cnc,
    dung_sai_chat_nhat: d.dung_sai_chat_nhat,
    co_gdt: d.co_gdt,
    ma_quy_trinh: d.ma_quy_trinh,
    ly_giai_qt: d.ly_giai_qt,
    dung_sai: d.dung_sai_chung,
    note: d.note,
    danh_gia: ((r.data as Record<string, unknown>)?.['danh_gia'] as number) as 0 | 1 | 99 || 0,
    _raw: r.data || {},
  };
}

export function formatKlCell(v: unknown): string {
  if (v == null || v === '') return '\u2014';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return '\u2014';
  return n.toFixed(3);
}
