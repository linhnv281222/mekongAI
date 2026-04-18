/**
 * Parse giá trị từ ngx-mask (separator: nghìn `.`, thập phân `,`) hoặc chuỗi đã drop ký tự (thường dùng `.` thập phân).
 */
export function parseMaskedNumber(
  value: string | number | null | undefined
): number {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  const t = String(value).trim().replace(/\s/g, '');
  if (!t) return NaN;
  if (!t.includes(',') && /^\d*\.?\d*$/.test(t)) {
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : NaN;
  }
  const normalized = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/** Chuỗi bind ngx-mask (decimalMarker `,`) từ số API; rỗng nếu không hợp lệ. */
export function formatNumberForSeparatorMask(
  value: number | string | null | undefined
): string {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}
