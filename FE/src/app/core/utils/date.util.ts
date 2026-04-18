import { format, isValid, parse } from 'date-fns';

/**
 * Parse ngày xuất phiếu từ API.
 * BE trả `invoice_date` dạng lịch `yyyy-MM-dd` (không phải mốc UTC như created_at).
 */
export function parseApiInvoiceDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  const datePart = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const d = parse(datePart, 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : null;
}

export function toDateStr(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return format(date, 'dd/MM/yyyy');
}

export function toDateTimeStr(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return format(date, 'dd/MM/yyyy HH:mm');
}

export function toApiDateStr(date: Date | null): string {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime()))
    return '';
  return format(date, 'yyyy-MM-dd');
}

/** Đầu tháng — cuối tháng (theo giờ local), dùng mặc định khoảng lọc báo cáo. */
export function getCurrentMonthStartEnd(): [Date, Date] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [start, end];
}
